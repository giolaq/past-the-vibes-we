import { emitKeypressEvents } from "node:readline";
import { EMPTY_MODEL_USAGE, type ModelUsage, type ProviderCostSource } from "./model-telemetry.js";
import type { PortResult } from "./port-pipeline.js";
import type { TranscriptEntry } from "./model-transcript.js";

export type TuiOutputMode = "checks" | "model" | "tools" | "all";
export type TuiPhaseStatus = "pending" | "running" | "passed" | "failed";
export type TuiView = "phases" | "messages";

export type TuiPhase = {
  name: string;
  status: TuiPhaseStatus;
  attempts: number;
  summary?: string;
};

export type TuiState = {
  runId: string;
  executor: string;
  evidenceMode: "live" | "recorded";
  seed: string;
  maxTokens?: number;
  usage: ModelUsage;
  providerReportedCostUsd?: number;
  providerReportedCostSource?: ProviderCostSource;
  startedAt: number;
  view: TuiView;
  selected: number;
  selectedEvent: number;
  detailOffset: number;
  followActive: boolean;
  outputMode: TuiOutputMode;
  phases: TuiPhase[];
  events: Map<string, TranscriptEntry[]>;
  notice?: string;
  complete?: boolean;
};

type TuiOptions = {
  runId: string;
  executor: string;
  evidenceMode: "live" | "recorded";
  seed: string;
  maxTokens?: number;
  phases: string[];
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
};

const OUTPUT_MODES: TuiOutputMode[] = ["checks", "model", "tools", "all"];
const CHECK_KINDS = new Set([
  "phase_start",
  "phase_complete",
  "phase_failed",
  "verification_start",
  "verification_result",
  "usage",
  "commit",
  "error",
]);

export function shouldUseTui(cliArgs: string[], stdoutIsTty = process.stdout.isTTY, stderrIsTty = process.stderr.isTTY): boolean {
  return stdoutIsTty === true &&
    stderrIsTty === true &&
    cliArgs.includes("--tui") &&
    !cliArgs.includes("--json") &&
    !cliArgs.includes("--detach") &&
    !cliArgs.includes("--child");
}

export class WorkshopTui {
  readonly state: TuiState;
  private input: NodeJS.ReadStream;
  private output: NodeJS.WriteStream;
  private timer?: NodeJS.Timeout;
  private renderTimer?: NodeJS.Timeout;
  private completeResolver?: () => void;
  private active = false;

  constructor(options: TuiOptions) {
    this.input = options.input ?? process.stdin;
    this.output = options.output ?? process.stderr;
    this.state = {
      runId: options.runId,
      executor: options.executor,
      evidenceMode: options.evidenceMode,
      seed: options.seed,
      maxTokens: options.maxTokens,
      usage: { ...EMPTY_MODEL_USAGE },
      startedAt: Date.now(),
      view: "phases",
      selected: 0,
      selectedEvent: 0,
      detailOffset: 0,
      followActive: true,
      outputMode: "checks",
      phases: options.phases.map((name) => ({ name, status: "pending", attempts: 0 })),
      events: new Map(),
    };
  }

  start(initialPhase?: string): void {
    if (this.active) return;
    this.active = true;
    this.output.write("\u001b[?1049h\u001b[?25l");
    emitKeypressEvents(this.input);
    if (this.input.isTTY && this.input.setRawMode) {
      this.input.setRawMode(true);
      this.input.resume();
      this.input.on("keypress", this.onKeypress);
    }
    this.output.on("resize", this.render);
    if (initialPhase) this.phaseStart(initialPhase);
    this.timer = setInterval(this.render, 1_000);
    this.render();
  }

  transcript = (entry: TranscriptEntry): void => {
    const rows = this.state.events.get(entry.phase) ?? [];
    rows.push(entry);
    this.state.events.set(entry.phase, rows);
    const phase = this.findPhase(entry.phase);
    phase.attempts = Math.max(phase.attempts, entry.attempt);
    if (entry.kind === "phase_start") phase.status = "running";
    if (entry.kind === "phase_complete") phase.status = "passed";
    if (entry.kind === "phase_failed" || entry.kind === "error") phase.status = "failed";
    if (
      this.state.view === "messages" &&
      this.state.followActive &&
      this.state.phases[this.state.selected]?.name === entry.phase
    ) {
      this.selectLatestEvent();
    }
    this.scheduleRender();
  };

  phaseStart = (name: string): void => {
    const phase = this.findPhase(name);
    phase.status = "running";
    if (this.state.followActive) {
      this.state.selected = this.state.phases.indexOf(phase);
      if (this.state.view === "messages") this.selectLatestEvent();
    }
    this.scheduleRender();
  };

  phaseComplete = (phase: PortResult["phases"][number]): void => {
    const row = this.findPhase(phase.name);
    row.status = "passed";
    row.attempts = phase.attempts;
    row.summary = phase.summary;
    this.scheduleRender();
  };

  phasePassed(name: string, summary: string, attempts = 1): void {
    const phase = this.findPhase(name);
    phase.status = "passed";
    phase.attempts = attempts;
    phase.summary = summary;
    this.scheduleRender();
  }

  usage = (usage: ModelUsage, providerReportedCostUsd?: number, providerReportedCostSource?: ProviderCostSource): void => {
    this.state.usage = usage;
    this.state.providerReportedCostUsd = providerReportedCostUsd;
    this.state.providerReportedCostSource = providerReportedCostSource;
    this.scheduleRender();
  };

  notice = (headline: string, failures: string[]): void => {
    this.state.notice = `${headline}: ${failures.join("; ")}`;
    this.scheduleRender();
  };

  fail(message: string): void {
    const phase = this.state.phases.find((item) => item.status === "running");
    if (phase) {
      phase.status = "failed";
      phase.summary = message;
    }
    this.state.notice = message;
    this.render();
  }

  async complete(notice = "Run complete. Browse the phase evidence, then press q."): Promise<void> {
    if (!this.active) return;
    this.state.complete = true;
    this.state.notice = notice;
    this.render();
    await new Promise<void>((resolve) => {
      this.completeResolver = resolve;
    });
  }

  finish(): void {
    this.stop();
  }

  private findPhase(name: string): TuiPhase {
    let phase = this.state.phases.find((item) => item.name === name);
    if (!phase) {
      phase = { name, status: "pending", attempts: 0 };
      this.state.phases.push(phase);
    }
    return phase;
  }

  private onKeypress = (_text: string, key: { name?: string; ctrl?: boolean; shift?: boolean }): void => {
    if (key.ctrl && key.name === "c") {
      this.stop();
      process.kill(process.pid, "SIGINT");
      return;
    }
    if (this.state.complete && key.name === "q") {
      this.stop();
      return;
    }
    if (key.name === "escape" && this.state.view === "messages") {
      this.state.view = "phases";
      this.state.followActive = false;
      this.render();
      return;
    }
    if (key.name === "return" && this.state.view === "phases") {
      this.openMessages();
      return;
    }
    if (key.name === "down" || key.name === "j") this.moveSelection(1);
    if (key.name === "up" || key.name === "k") this.moveSelection(-1);
    if (key.name === "pageup" && this.state.view === "messages") this.scrollDetail(-1);
    if (key.name === "pagedown" && this.state.view === "messages") this.scrollDetail(1);
    if (key.name === "tab" && this.state.view === "messages") this.cycleOutput(key.shift ? -1 : 1);
    if (key.name === "f") this.followActive();
  };

  private moveSelection(delta: number): void {
    if (this.state.view === "messages") {
      const events = this.selectedEvents();
      if (events.length === 0) return;
      this.state.selectedEvent = Math.max(0, Math.min(events.length - 1, this.state.selectedEvent + delta));
      this.state.detailOffset = 0;
      this.state.followActive = false;
      this.render();
      return;
    }
    const count = this.state.phases.length;
    this.state.selected = (this.state.selected + delta + count) % count;
    this.state.followActive = false;
    this.render();
  }

  private cycleOutput(delta: number): void {
    const current = OUTPUT_MODES.indexOf(this.state.outputMode);
    this.state.outputMode = OUTPUT_MODES[(current + delta + OUTPUT_MODES.length) % OUTPUT_MODES.length];
    this.selectLatestEvent();
    this.render();
  }

  private followActive(): void {
    const active = this.state.phases.findIndex((phase) => phase.status === "running");
    if (active >= 0) this.state.selected = active;
    this.state.followActive = true;
    if (this.state.view === "messages") this.selectLatestEvent();
    this.render();
  }

  private openMessages(): void {
    this.state.view = "messages";
    this.state.outputMode = "all";
    this.state.followActive = false;
    this.selectLatestEvent();
    this.render();
  }

  private selectedEvents(): TranscriptEntry[] {
    const phase = this.state.phases[this.state.selected];
    return phase ? filteredEvents(this.state.events.get(phase.name) ?? [], this.state.outputMode) : [];
  }

  private selectLatestEvent(): void {
    this.state.selectedEvent = Math.max(0, this.selectedEvents().length - 1);
    this.state.detailOffset = 0;
  }

  private scrollDetail(direction: -1 | 1): void {
    this.state.detailOffset = Math.max(0, this.state.detailOffset + direction * 8);
    this.render();
  }

  private render = (): void => {
    if (!this.active) return;
    const columns = this.output.columns ?? 100;
    const rows = this.output.rows ?? 32;
    this.output.write(`\u001b[H\u001b[2J${renderWorkshopTui(this.state, columns, rows, true)}`);
  };

  private scheduleRender(): void {
    if (!this.active || this.renderTimer) return;
    this.renderTimer = setTimeout(() => {
      this.renderTimer = undefined;
      this.render();
    }, 80);
  }

  private stop(): void {
    if (!this.active) return;
    this.active = false;
    if (this.timer) clearInterval(this.timer);
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.output.off("resize", this.render);
    this.input.off("keypress", this.onKeypress);
    if (this.input.isTTY && this.input.setRawMode) this.input.setRawMode(false);
    this.output.write("\u001b[?25h\u001b[?1049l");
    const resolve = this.completeResolver;
    this.completeResolver = undefined;
    resolve?.();
  }
}

export function renderWorkshopTui(state: TuiState, columns = 100, rows = 32, color = false): string {
  const selected = state.phases[state.selected] ?? state.phases[0];
  const elapsed = formatElapsed(Date.now() - state.startedAt);
  const title = style("Past the Vibes", "1;36", color);
  const header = [
    `${title}  |  Vega port harness`,
    clip(`run ${state.runId}  executor ${state.executor}  evidence ${state.evidenceMode}  seed ${state.seed}`, columns),
    clip(`tokens ${number(state.usage.totalTokens)} / ${state.maxTokens === undefined ? "unlimited" : number(state.maxTokens)}  turns ${number(state.usage.turns)}  calls ${number(state.usage.calls)}  elapsed ${elapsed}`, columns),
    ...(state.providerReportedCostUsd === undefined ? [] : [
      clip(`${costLabel(state.providerReportedCostSource)} $${state.providerReportedCostUsd.toFixed(4)}`, columns),
    ]),
  ];
  const body = state.view === "messages"
    ? renderMessageView(state, selected, columns, rows - header.length, color)
    : renderPhaseView(state, selected, columns, color);
  return `${[...header, ...body].slice(0, rows).join("\n")}\n`;
}

function renderPhaseView(state: TuiState, selected: TuiPhase | undefined, columns: number, color: boolean): string[] {
  const phaseLines = state.phases.map((phase, index) => {
    const marker = index === state.selected ? ">" : " ";
    const status = phaseStatus(phase.status);
    const attempts = phase.attempts ? `  attempt ${phase.attempts}` : "";
    const raw = `${marker} ${status} ${phase.name.padEnd(24)}${attempts}`;
    return style(clip(raw, columns), phaseColor(phase.status), color);
  });
  const eventCount = selected ? (state.events.get(selected.name)?.length ?? 0) : 0;
  return [
    "",
    style("PHASES", "1", color),
    ...phaseLines,
    "",
    clip(`Selected: ${selected?.name ?? "none"}  |  ${eventCount} recorded event${eventCount === 1 ? "" : "s"}`, columns),
    ...(state.notice ? [style(clip(state.notice, columns), "33", color)] : []),
    "",
    clip(state.complete
      ? "up/down select  Enter messages  q close"
      : "up/down select  Enter messages  f active phase", columns),
  ];
}

function renderMessageView(
  state: TuiState,
  selected: TuiPhase | undefined,
  columns: number,
  availableRows: number,
  color: boolean,
): string[] {
  const events = selected ? filteredEvents(state.events.get(selected.name) ?? [], state.outputMode) : [];
  const selectedIndex = events.length === 0 ? 0 : Math.max(0, Math.min(events.length - 1, state.selectedEvent));
  const selectedEvent = events[selectedIndex];
  const listRows = Math.max(1, Math.min(7, Math.floor((availableRows - 9) / 3)));
  const start = Math.max(0, Math.min(
    selectedIndex - Math.floor(listRows / 2),
    Math.max(0, events.length - listRows),
  ));
  const eventLines = events.slice(start, start + listRows).map((entry, offset) => {
    const index = start + offset;
    const marker = index === selectedIndex ? ">" : " ";
    const raw = `${marker} ${String(index + 1).padStart(3)} ${entry.timestamp.slice(11, 19)} ${transcriptEntryType(entry)}  ${summarizeTranscriptEntry(entry)}`;
    return style(clip(raw, columns), index === selectedIndex ? "36" : "2", color);
  });
  if (eventLines.length === 0) eventLines.push("No matching events for this filter.");
  while (eventLines.length < listRows) eventLines.push("");

  const prefix = [
    "",
    style(`MESSAGES: ${selected?.name ?? "none"}`, "1", color),
    clip(`filter ${state.outputMode}  |  event ${events.length === 0 ? 0 : selectedIndex + 1}/${events.length}`, columns),
    ...eventLines,
    "",
    style(`TYPE: ${selectedEvent ? transcriptEntryType(selectedEvent) : "none"}`, "1", color),
    selectedEvent
      ? clip(`time ${selectedEvent.timestamp}  attempt ${selectedEvent.attempt}  executor ${selectedEvent.executor}`, columns)
      : "No event selected.",
    style("CONTENT", "1", color),
  ];
  const suffix = [
    "",
    clip("up/down event  PgUp/PgDn content  Tab filter  f active  Esc phases", columns),
  ];
  const contentRows = Math.max(1, availableRows - prefix.length - suffix.length);
  const contentLines = wrapText(selectedEvent ? transcriptEntryContent(selectedEvent) : "", Math.max(1, columns));
  const maxOffset = Math.max(0, contentLines.length - contentRows);
  const offset = Math.min(state.detailOffset, maxOffset);
  const visibleContent = contentLines.slice(offset, offset + contentRows);
  if (visibleContent.length === 0) visibleContent.push("No content.");
  return [...prefix, ...visibleContent, ...suffix];
}

export function summarizeTranscriptEntry(entry: TranscriptEntry): string {
  const payload = entry.payload as Record<string, unknown> | undefined;
  if (entry.kind === "phase_start") return `phase started - ${oneLine(payload?.goal)}`;
  if (entry.kind === "phase_complete") return `phase passed - ${oneLine(payload?.summary)}`;
  if (entry.kind === "phase_failed" || entry.kind === "error") return `failed - ${oneLine(entry.payload)}`;
  if (entry.kind === "verification_start") {
    const checks = Array.isArray(payload?.checks) ? payload.checks.length : 0;
    return `running ${checks} check${checks === 1 ? "" : "s"}`;
  }
  if (entry.kind === "verification_result") {
    const failures = Array.isArray(payload?.failures) ? payload.failures.map(oneLine).filter(Boolean) : [];
    return payload?.passed === true ? "checks passed" : `checks failed - ${failures.join("; ")}`;
  }
  if (entry.kind === "usage") {
    const usage = payload?.usage as Partial<ModelUsage> | undefined;
    return `usage recorded - ${number(Number(usage?.totalTokens ?? 0))} tokens, ${number(Number(usage?.turns ?? 0))} turns`;
  }
  if (entry.kind === "commit") return `commit ${oneLine(payload?.hash)} - ${oneLine(payload?.message)}`;
  if (entry.direction === "tool") return `tool - ${toolName(entry.payload) || entry.kind}`;
  if (entry.direction === "to_model") return `model request - ${promptPreview(entry.payload)}`;
  if (entry.direction === "from_model") return `model response - ${responsePreview(entry.payload) || entry.kind}`;
  return `${entry.kind} - ${oneLine(entry.payload)}`;
}

function filteredEvents(events: TranscriptEntry[], mode: TuiOutputMode): TranscriptEntry[] {
  if (mode === "all") return events;
  if (mode === "checks") return events.filter((entry) => CHECK_KINDS.has(entry.kind));
  if (mode === "tools") return events.filter((entry) => entry.direction === "tool" || entry.kind.toLowerCase().includes("tool"));
  return events.filter((entry) => entry.direction === "to_model" || entry.direction === "from_model");
}

function transcriptEntryType(entry: TranscriptEntry): string {
  const payload = entry.payload as {
    role?: unknown;
    message?: { role?: unknown };
    messages?: Array<{ role?: unknown }>;
  } | undefined;
  const lastMessage = Array.isArray(payload?.messages) ? payload.messages.at(-1) : undefined;
  const role = typeof payload?.message?.role === "string"
    ? payload.message.role
    : typeof payload?.role === "string"
      ? payload.role
      : typeof lastMessage?.role === "string"
        ? lastMessage.role
        : undefined;
  return `${entry.direction}/${entry.kind}${role ? ` (${role})` : ""}`;
}

export function transcriptEntryContent(entry: TranscriptEntry): string {
  const payload = entry.payload as Record<string, unknown> | undefined;
  if (!payload) return "";
  if (typeof payload.currentPrompt === "string") return payload.currentPrompt;
  if (typeof payload.prompt === "string") return payload.prompt;
  if (payload.message && typeof payload.message === "object") {
    return messageContent(payload.message as Record<string, unknown>);
  }
  if (Array.isArray(payload.messages)) {
    const last = payload.messages.at(-1);
    return last && typeof last === "object"
      ? messageContent(last as Record<string, unknown>)
      : contentText(last);
  }
  if (payload.structuredOutput !== undefined) return pretty(payload.structuredOutput);
  if (typeof payload.result === "string") return payload.result;
  return pretty(payload);
}

function messageContent(message: Record<string, unknown>): string {
  const role = typeof message.role === "string" ? `[role: ${message.role}]\n` : "";
  return `${role}${contentText(message.content ?? message)}`.trim();
}

function contentText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(contentText).filter(Boolean).join("\n\n");
  if (typeof value !== "object") return String(value);

  const block = value as Record<string, unknown>;
  const type = typeof block.type === "string" ? block.type : undefined;
  if (type === "text" && typeof block.text === "string") return `[text]\n${block.text}`;
  if (type === "thinking" && typeof block.thinking === "string") return `[thinking]\n${block.thinking}`;
  if (type === "tool_use") {
    const name = typeof block.name === "string" ? block.name : "unknown";
    return `[tool_use: ${name}]\n${pretty(block.input)}`;
  }
  if (type === "tool_result") {
    const id = typeof block.tool_use_id === "string" ? block.tool_use_id : "unknown";
    return `[tool_result: ${id}]\n${contentText(block.content)}`;
  }
  if (type === "image") return "[image]";
  if (block.content !== undefined) return `${type ? `[${type}]\n` : ""}${contentText(block.content)}`;
  return pretty(block);
}

function pretty(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function wrapText(value: string, width: number): string[] {
  const lines: string[] = [];
  for (const source of value.replace(/\r/g, "").split("\n")) {
    if (source.length === 0) {
      lines.push("");
      continue;
    }
    for (let offset = 0; offset < source.length; offset += width) {
      lines.push(source.slice(offset, offset + width));
    }
  }
  return lines;
}

function promptPreview(payload: unknown): string {
  const object = payload as Record<string, unknown> | undefined;
  if (!object) return "";
  if (typeof object.currentPrompt === "string") return oneLine(object.currentPrompt);
  if (typeof object.prompt === "string") return oneLine(object.prompt);
  const messages = object.messages;
  if (Array.isArray(messages)) {
    const last = messages.at(-1) as { content?: unknown } | undefined;
    return oneLine(last?.content);
  }
  return oneLine(payload);
}

function responsePreview(payload: unknown): string {
  const object = payload as Record<string, unknown> | undefined;
  if (!object) return "";
  const structured = object.structuredOutput as { summary?: unknown } | undefined;
  if (structured?.summary) return oneLine(structured.summary);
  if (typeof object.result === "string") {
    try {
      const parsed = JSON.parse(object.result) as { summary?: unknown };
      if (parsed.summary) return oneLine(parsed.summary);
    } catch {
      return oneLine(object.result);
    }
  }
  return oneLine(payload);
}

function toolName(payload: unknown): string {
  const serialized = JSON.stringify(payload) ?? "";
  const match = /"(?:name|toolName|tool_name)"\s*:\s*"([^"]+)"/.exec(serialized);
  return match?.[1] ?? "";
}

function oneLine(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
  return text.replace(/\s+/g, " ").trim().slice(0, 180);
}

function phaseStatus(status: TuiPhaseStatus): string {
  if (status === "running") return "[..]";
  if (status === "passed") return "[ok]";
  if (status === "failed") return "[!!]";
  return "[  ]";
}

function phaseColor(status: TuiPhaseStatus): string {
  if (status === "running") return "36";
  if (status === "passed") return "32";
  if (status === "failed") return "31";
  return "2";
}

function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function number(value: number): string {
  return Math.max(0, value).toLocaleString("en-US");
}

function costLabel(source?: ProviderCostSource): string {
  if (source === "recorded") return "recorded provider cost metadata";
  if (source === "mixed") return "mixed recorded/provider cost metadata";
  return "provider-reported cost";
}

function clip(value: string, width: number): string {
  if (value.length <= width) return value;
  return width <= 3 ? value.slice(0, width) : `${value.slice(0, width - 3)}...`;
}

function style(value: string, code: string, enabled: boolean): string {
  return enabled ? `\u001b[${code}m${value}\u001b[0m` : value;
}

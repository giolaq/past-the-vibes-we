import { emitKeypressEvents } from "node:readline";
import type { PortResult } from "./port-pipeline.js";
import type { TranscriptEntry } from "./model-transcript.js";

export type TuiOutputMode = "checks" | "model" | "tools" | "all";
export type TuiPhaseStatus = "pending" | "running" | "passed" | "failed";

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
  budgetUsd: number;
  costUsd: number;
  startedAt: number;
  selected: number;
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
  budgetUsd: number;
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
      budgetUsd: options.budgetUsd,
      costUsd: 0,
      startedAt: Date.now(),
      selected: 0,
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
    if (rows.length > 200) rows.shift();
    this.state.events.set(entry.phase, rows);
    const phase = this.findPhase(entry.phase);
    phase.attempts = Math.max(phase.attempts, entry.attempt);
    if (entry.kind === "phase_start") phase.status = "running";
    if (entry.kind === "phase_complete") phase.status = "passed";
    if (entry.kind === "phase_failed" || entry.kind === "error") phase.status = "failed";
    this.scheduleRender();
  };

  phaseStart = (name: string): void => {
    const phase = this.findPhase(name);
    phase.status = "running";
    if (this.state.followActive) this.state.selected = this.state.phases.indexOf(phase);
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

  cost = (costUsd: number): void => {
    this.state.costUsd = costUsd;
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

  async complete(): Promise<void> {
    if (!this.active) return;
    this.state.complete = true;
    this.state.notice = "Run complete. Browse the phase evidence, then press q or Enter.";
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
    if (this.state.complete && (key.name === "q" || key.name === "return")) {
      this.stop();
      return;
    }
    if (key.name === "down" || key.name === "j") this.moveSelection(1);
    if (key.name === "up" || key.name === "k") this.moveSelection(-1);
    if (key.name === "tab") this.cycleOutput(key.shift ? -1 : 1);
    if (key.name === "f" || key.name === "escape") this.followActive();
  };

  private moveSelection(delta: number): void {
    const count = this.state.phases.length;
    this.state.selected = (this.state.selected + delta + count) % count;
    this.state.followActive = false;
    this.render();
  }

  private cycleOutput(delta: number): void {
    const current = OUTPUT_MODES.indexOf(this.state.outputMode);
    this.state.outputMode = OUTPUT_MODES[(current + delta + OUTPUT_MODES.length) % OUTPUT_MODES.length];
    this.render();
  }

  private followActive(): void {
    const active = this.state.phases.findIndex((phase) => phase.status === "running");
    if (active >= 0) this.state.selected = active;
    this.state.followActive = true;
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
  const phaseLines = state.phases.map((phase, index) => {
    const marker = index === state.selected ? ">" : " ";
    const status = phaseStatus(phase.status);
    const attempts = phase.attempts ? `  attempt ${phase.attempts}` : "";
    const raw = `${marker} ${status} ${phase.name.padEnd(24)}${attempts}`;
    return style(clip(raw, columns), phaseColor(phase.status), color);
  });
  const usedRows = 10 + phaseLines.length;
  const activityRows = Math.max(3, rows - usedRows);
  const events = selected ? filteredEvents(state.events.get(selected.name) ?? [], state.outputMode) : [];
  const activity = events.slice(-activityRows).map((entry) =>
    clip(`${entry.timestamp.slice(11, 19)}  ${summarizeTranscriptEntry(entry)}`, columns),
  );
  if (activity.length === 0) activity.push("No matching activity yet.");

  const lines = [
    `${title}  |  Vega port harness`,
    clip(`run ${state.runId}  executor ${state.executor}  evidence ${state.evidenceMode}  seed ${state.seed}`, columns),
    clip(`cost $${state.costUsd.toFixed(4)} / $${state.budgetUsd.toFixed(2)}  elapsed ${elapsed}`, columns),
    "",
    style("PHASES", "1", color),
    ...phaseLines,
    "",
    style(`OUTPUT: ${state.outputMode}  |  phase: ${selected?.name ?? "none"}`, "1", color),
    ...(state.notice ? [style(clip(state.notice, columns), "33", color)] : []),
    ...activity,
    "",
    clip(state.complete
      ? `up/down select  Tab output  q/Enter close  full log: logs ${state.runId} --phase ${selected?.name ?? "<phase>"}`
      : `up/down select  Tab output  f follow  full log: logs ${state.runId} --phase ${selected?.name ?? "<phase>"}`, columns),
  ];
  return `${lines.slice(0, rows).join("\n")}\n`;
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
  if (entry.kind === "usage") return `usage recorded - $${Number(payload?.costUsd ?? 0).toFixed(4)}`;
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

function clip(value: string, width: number): string {
  if (value.length <= width) return value;
  return width <= 3 ? value.slice(0, width) : `${value.slice(0, width - 3)}...`;
}

function style(value: string, code: string, enabled: boolean): string {
  return enabled ? `\u001b[${code}m${value}\u001b[0m` : value;
}

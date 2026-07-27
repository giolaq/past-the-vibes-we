import { Agent, StructuredOutputError, McpClient, type Tool } from "@strands-agents/sdk";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { join, relative } from "node:path";
import type { ZodTypeAny } from "zod";
import { consumeStream, ModelTranscriptStore, serializable, type TranscriptDirection } from "./model-transcript.js";
import { createModel, defaultModel, type ModelConfig, type RemoteProvider } from "./model-factory.js";
import { PortOutputSchema } from "./port-contract.js";
import { PortRecorder, PortReplay } from "./port-recorder.js";
import { createProjectReadTools } from "./port-tools.js";
import { createSkillsPlugin, injectSkillText, loadSkills } from "./skills.js";

/** messages carries the agent's turn history so the pipeline can reconstruct ADBT provenance. */
export type PortModelResult = { text: string; costUsd: number; messages?: unknown[] };
/**
 * Extra tools/providers for a phase. An McpClient can be passed here (e.g. the ADBT MCP client
 * during analyze/plan); Strands discovers its tools dynamically.
 */
export type ExtraTools = (Tool | McpClient)[];
export type CliMcpServer = { command: string; args: string[]; env?: Record<string, string> };
export type ModelPricing = { inputUsdPerMToken: number; outputUsdPerMToken: number; source: string };
/**
 * What a phase can ask of one model call beyond the prompt:
 * - schema: demand a different structured output (e.g. the feasibility verdict).
 * - extraTools: extra tool providers for this phase (e.g. the ADBT MCP client).
 * - mcp: named MCP servers the Claude CLI may load for this phase.
 * - skills: names of skills to deliver; each executor delivers them its own way.
 */
export type PortCall = { schema?: ZodTypeAny; extraTools?: ExtraTools; mcp?: string[]; skills?: string[]; maxCostUsd?: number; attempt?: number };
export interface PortExecutor { call(phase: string, prompt: string, options?: PortCall): Promise<PortModelResult>; }
export type ExecutorConfig =
  | { kind: "claude-cli"; command: string; model: string; pricing: ModelPricing }
  | { kind: "strands"; model: ModelConfig; pricing: ModelPricing };
export type ExecutorInput = { executor?: string; provider?: string; model?: string; region?: string; command?: string; inputRate?: string; outputRate?: string };

export const READ_ONLY_TOOLS = "Read,Grep,Glob";
const READ_ONLY_TOOL_RULES = ["Read", "Grep", "Glob"];
const BLOCKED_CLAUDE_TOOLS = ["Bash", "Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch"];

export function resolveExecutorConfig(input: ExecutorInput = {}): ExecutorConfig {
  const kind = input.executor ?? process.env.WORKSHOP_EXECUTOR ?? "claude-cli";
  if (kind === "claude-cli") {
    const model = input.model ?? process.env.CLAUDE_MODEL ?? "sonnet";
    return { kind, command: input.command ?? process.env.CLAUDE_PATH ?? "claude", model, pricing: resolvePricing(model, input) };
  }
  if (kind !== "strands") throw new Error(`Unknown executor ${kind}; use claude-cli or strands`);
  const provider = (input.provider ?? process.env.WORKSHOP_PROVIDER ?? "bedrock") as RemoteProvider;
  if (!["bedrock", "openai", "openrouter"].includes(provider)) throw new Error(`Unknown Strands provider ${provider}`);
  const modelId = input.model ?? process.env.WORKSHOP_MODEL ?? defaultModel(provider);
  return { kind, model: { provider, modelId, region: input.region ?? process.env.AWS_REGION }, pricing: resolvePricing(modelId, input) };
}

export function createPortExecutor(options: { appDir: string; outDir: string; replayPath?: string; config?: ExecutorConfig; recordingName?: string; cliMcpServers?: Record<string, CliMcpServer>; transcripts?: ModelTranscriptStore }): PortExecutor {
  if (options.replayPath && !existsSync(options.replayPath)) throw new Error(`Replay recording not found: ${options.replayPath}`);
  const transcripts = options.transcripts ?? new ModelTranscriptStore(options.outDir);
  if (PortReplay.exists(options.replayPath)) return new ReplayPortExecutor(options.replayPath, transcripts);
  const config = options.config ?? resolveExecutorConfig();
  const recordingPath = join(options.outDir, options.recordingName ?? "port-recording.json");
  return config.kind === "strands"
    ? new StrandsPortExecutor(options.appDir, recordingPath, config.model, config.pricing, transcripts)
    : new ClaudeCodePortExecutor(options.appDir, recordingPath, config, options.cliMcpServers ?? {}, transcripts);
}

class ReplayPortExecutor implements PortExecutor {
  private replay: PortReplay;
  constructor(path: string, private transcripts: ModelTranscriptStore) { this.replay = new PortReplay(path); }
  // Skills are model behavior, and replay has no model: a recording cannot follow an
  // instruction it was made before. Checks still run, because checks are code.
  async call(phase: string, prompt = "", options: PortCall = {}): Promise<PortModelResult> {
    const attempt = options.attempt ?? 1;
    const turn = this.replay.next(phase);
    this.transcripts.append(phase, {
      attempt, executor: "replay", direction: "to_model", kind: "replay_request",
      payload: { currentPrompt: prompt, recordedRequest: turn.request },
    });
    const responses = Array.isArray(turn.response) ? turn.response : [turn.response];
    for (const response of responses) {
      this.transcripts.append(phase, {
        attempt, executor: "replay", direction: replayDirection(response), kind: "replay_response",
        payload: response,
      });
    }
    this.transcripts.append(phase, {
      attempt, executor: "replay", direction: "system", kind: "usage",
      payload: { usage: turn.usage, costUsd: turn.costUsd },
    });
    // Recordings written by PortRecorder always carry costUsd; fall back to the same rates the
    // live path uses so a hand-written recording cannot silently under-report.
    return {
      text: responseText(turn.response, phase),
      costUsd: turn.costUsd ?? estimateCost(turn.usage, resolvePricing("sonnet")),
      messages: responses,
    };
  }
}

class StrandsPortExecutor implements PortExecutor {
  private recorder: PortRecorder;
  constructor(private appDir: string, recordingPath: string, private config: ModelConfig, private pricing: ModelPricing, private transcripts: ModelTranscriptStore) { this.recorder = new PortRecorder(recordingPath); }
  async call(phase: string, prompt: string, options: PortCall = {}): Promise<PortModelResult> {
    const attempt = options.attempt ?? 1;
    const outputSchema = options.schema ?? PortOutputSchema;
    // Strands can carry skills as a plugin: the agent sees their descriptions and loads the
    // instructions it decides it needs, instead of every skill body filling the prompt.
    const skills = loadSkills(options.skills ?? []);
    const systemPrompt = `Inspect the guarded app with the read-only tools. When ADBT tools are available, use them to discover and read the Vega migration workflows you need instead of guessing.${skills.length ? " Load the available phase skills before answering." : ""} Return a complete answer through the required schema. Never claim a file or API exists without reading evidence.`;
    const agent = new Agent({
      name: `workshop-${phase}`,
      description: "Inspects a guarded React Native app and proposes a bounded Vega port patch.",
      model: createModel(this.config),
      tools: [...createProjectReadTools(this.appDir), ...(options.extraTools ?? [])],
      plugins: skills.length ? [createSkillsPlugin(skills)] : [],
      structuredOutputSchema: outputSchema,
      systemPrompt,
      printer: false,
    });
    const modelName = `${this.config.provider}:${this.config.modelId}`;
    this.transcripts.append(phase, {
      attempt, executor: "strands", direction: "to_model", kind: "request",
      payload: { model: modelName, systemPrompt, messages: [{ role: "user", content: prompt }], skills: options.skills ?? [], mcp: options.mcp ?? [] },
    });
    let result;
    try {
      result = await consumeStream(
        agent.stream(prompt, {
          cancelSignal: AbortSignal.timeout(10 * 60_000),
          limits: { turns: 8, totalTokens: 40_000 },
        }),
        (event) => {
          const native = serializable(event);
          const type = eventType(native);
          if (type === "beforeModelCallEvent") {
            this.transcripts.append(phase, {
              attempt, executor: "strands", direction: "to_model", kind: "model_request",
              payload: { model: modelName, systemPrompt, messages: serializable(agent.messages) },
            });
          }
          this.transcripts.append(phase, {
            attempt, executor: "strands", direction: strandsDirection(type, native), kind: type || "stream_event",
            payload: native,
          });
        },
      );
    } catch (error) {
      this.transcripts.append(phase, { attempt, executor: "strands", direction: "system", kind: "error", payload: error });
      throw error;
    }
    if (!result.structuredOutput) throw new StructuredOutputError("Strands returned no port output");
    const text = JSON.stringify(outputSchema.parse(result.structuredOutput));
    const raw = result.metrics?.accumulatedUsage;
    const usage = { input_tokens: raw?.inputTokens ?? 0, output_tokens: raw?.outputTokens ?? 0 };
    const costUsd = estimateCost(usage, this.pricing);
    this.transcripts.append(phase, {
      attempt, executor: "strands", direction: "from_model", kind: "result",
      payload: { structuredOutput: serializable(result.structuredOutput), stopReason: result.stopReason, usage, costUsd },
    });
    this.recorder.record({ timestamp: new Date().toISOString(), phase, request: { model: `${this.config.provider}:${this.config.modelId}`, system: "workshop-vega-port", messages: [{ role: "user", content: prompt }] }, response: [{ type: "result", result: text }], usage, costUsd });
    // Return the turn history so the pipeline can reconstruct ADBT provenance from tool calls.
    const messages = agent.messages.map((message) => (typeof (message as { toJSON?: () => unknown }).toJSON === "function" ? (message as { toJSON: () => unknown }).toJSON() : message));
    return { text, costUsd, messages };
  }
}

class ClaudeCodePortExecutor implements PortExecutor {
  private recorder: PortRecorder;
  constructor(private appDir: string, recordingPath: string, private config: Extract<ExecutorConfig, { kind: "claude-cli" }>, private mcpServers: Record<string, CliMcpServer>, private transcripts: ModelTranscriptStore) { this.recorder = new PortRecorder(recordingPath); }
  async call(phase: string, prompt: string, options: PortCall = {}): Promise<PortModelResult> {
    const attempt = options.attempt ?? 1;
    // A CLI subprocess shares no in-process plugin, so the executor sends the skill text itself.
    const withSkills = injectSkillText(prompt, loadSkills(options.skills ?? []));
    const before = projectFingerprint(this.appDir);
    const selectedMcp = Object.fromEntries((options.mcp ?? []).flatMap((name) => this.mcpServers[name] ? [[name, this.mcpServers[name]]] : []));
    this.transcripts.append(phase, {
      attempt, executor: "claude-cli", direction: "to_model", kind: "request",
      payload: { model: this.config.model, system: "workshop-vega-port", messages: [{ role: "user", content: withSkills }], mcpServers: Object.keys(selectedMcp) },
    });
    let result;
    try {
      result = await invokeClaude(
        this.config.command, this.appDir, withSkills, this.config.model, this.config.pricing,
        selectedMcp, options.maxCostUsd,
        (entry) => this.transcripts.append(phase, { attempt, executor: "claude-cli", ...entry }),
      );
      if (projectFingerprint(this.appDir) !== before) throw new Error("Claude Code modified the guarded copy directly; only the validated structured patch may write files");
    } catch (error) {
      this.transcripts.append(phase, { attempt, executor: "claude-cli", direction: "system", kind: "error", payload: error });
      throw error;
    }
    this.recorder.record({ timestamp: new Date().toISOString(), phase, request: { model: `claude-cli:${this.config.model}`, system: "workshop-vega-port", messages: [{ role: "user", content: withSkills }] }, response: result.events, usage: result.usage, costUsd: result.costUsd });
    return { text: result.text, costUsd: result.costUsd, messages: result.events };
  }
}

function responseText(response: unknown, phase: string): string {
  const event = Array.isArray(response) ? response.find((item) => item && typeof item === "object" && "result" in item) as { result?: unknown } : undefined;
  if (typeof event?.result !== "string") throw new Error(`Replay response for ${phase} has no result text`);
  return event.result;
}

function resolvePricing(model: string, input: { inputRate?: string; outputRate?: string } = {}): ModelPricing {
  const inputRate = input.inputRate ?? process.env.WORKSHOP_INPUT_USD_PER_MTOK;
  const outputRate = input.outputRate ?? process.env.WORKSHOP_OUTPUT_USD_PER_MTOK;
  if (Boolean(inputRate) !== Boolean(outputRate)) throw new Error("Set both --input-rate and --output-rate for custom model pricing");
  if (inputRate && outputRate) {
    const inputUsdPerMToken = Number(inputRate);
    const outputUsdPerMToken = Number(outputRate);
    if (!Number.isFinite(inputUsdPerMToken) || !Number.isFinite(outputUsdPerMToken) || inputUsdPerMToken < 0 || outputUsdPerMToken < 0) {
      throw new Error("--input-rate and --output-rate must be non-negative numbers");
    }
    return { inputUsdPerMToken, outputUsdPerMToken, source: "cli" };
  }
  const id = model.toLowerCase();
  if (id.includes("opus")) return { inputUsdPerMToken: 15, outputUsdPerMToken: 75, source: "model table" };
  if (id.includes("haiku")) return { inputUsdPerMToken: 0.8, outputUsdPerMToken: 4, source: "model table" };
  if (id.includes("sonnet")) return { inputUsdPerMToken: 3, outputUsdPerMToken: 15, source: "model table" };
  if (id === "gpt-4.1" || id.includes("/gpt-4.1")) return { inputUsdPerMToken: 2, outputUsdPerMToken: 8, source: "model table" };
  throw new Error(`No pricing is configured for ${model}; pass --input-rate and --output-rate in USD per million tokens`);
}

function estimateCost(usage: { input_tokens: number; output_tokens: number }, pricing: ModelPricing): number {
  return (usage.input_tokens * pricing.inputUsdPerMToken + usage.output_tokens * pricing.outputUsdPerMToken) / 1_000_000;
}

type ClaudeTranscriptEvent = { direction: TranscriptDirection; kind: string; payload: unknown };

function invokeClaude(command: string, cwd: string, prompt: string, model: string, pricing: ModelPricing, mcpServers: Record<string, CliMcpServer>, maxCostUsd?: number, onTranscript?: (entry: ClaudeTranscriptEvent) => void): Promise<{ text: string; costUsd: number; usage: { input_tokens: number; output_tokens: number }; events: unknown[] }> {
  return new Promise((resolve, reject) => {
    const mcpTools = Object.keys(mcpServers).map((name) => `mcp__${name}__*`);
    const cliArgs = [
      "-p", "-", "--tools", READ_ONLY_TOOLS,
      "--allowedTools", ...READ_ONLY_TOOL_RULES, ...mcpTools,
      "--disallowedTools", ...BLOCKED_CLAUDE_TOOLS,
      "--strict-mcp-config", "--mcp-config", JSON.stringify({ mcpServers }),
      "--output-format", "stream-json", "--verbose", "--max-turns", "8",
      "--no-session-persistence", "--model", model,
    ];
    if (maxCostUsd !== undefined && maxCostUsd > 0) cliArgs.push("--max-budget-usd", maxCostUsd.toFixed(4));
    const child = spawn(command, cliArgs, { cwd, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    let buffer = "", stderr = "", text = "", costUsd = 0, usage = { input_tokens: 0, output_tokens: 0 }, timedOut = false;
    const events: unknown[] = [];
    child.stdout.on("data", (chunk) => { buffer += chunk.toString(); const lines = buffer.split("\n"); buffer = lines.pop() ?? ""; lines.forEach(consume); });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      onTranscript?.({ direction: "system", kind: "stderr", payload: text });
    });
    child.stdin.end(prompt);
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, 10 * 60_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      onTranscript?.({ direction: "system", kind: "spawn_error", payload: error });
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      consume(buffer);
      if (timedOut) return reject(new Error(`Claude Code executor timed out after 10 minutes: ${stderr.slice(0, 500)}`));
      if (code !== 0) return reject(new Error(`Claude Code executor exited ${code}: ${stderr.slice(0, 500)}`));
      if (!text) return reject(new Error("Claude Code executor produced no result event"));
      resolve({ text, costUsd: costUsd || estimateCost(usage, pricing), usage, events });
    });
    function consume(line: string) {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line);
        events.push(event);
        onTranscript?.({ direction: claudeDirection(event), kind: eventType(event) || "stream_event", payload: event });
        if (event.type === "result") {
          text = event.result ?? "";
          costUsd = event.total_cost_usd ?? 0;
          usage = { input_tokens: event.usage?.input_tokens ?? 0, output_tokens: event.usage?.output_tokens ?? 0 };
        }
      } catch {
        onTranscript?.({ direction: "system", kind: "raw_stdout", payload: line });
      }
    }
  });
}

function eventType(value: unknown): string {
  return value && typeof value === "object" && "type" in value && typeof value.type === "string" ? value.type : "";
}

function strandsDirection(type: string, value: unknown): TranscriptDirection {
  if (type === "beforeModelCallEvent") return "to_model";
  if (type === "messageAddedEvent" && value && typeof value === "object" && "message" in value) {
    const message = value.message;
    if (message && typeof message === "object" && "role" in message && message.role === "assistant") return "from_model";
    return "to_model";
  }
  if (type.includes("Tool") || type.includes("tool")) return "tool";
  if (type === "modelStreamUpdateEvent" || type === "contentBlockEvent" || type === "modelMessageEvent" || type === "afterModelCallEvent" || type === "agentResultEvent") return "from_model";
  return "system";
}

function claudeDirection(value: unknown): TranscriptDirection {
  const type = eventType(value);
  if (type.includes("tool")) return "tool";
  if (type === "user") return "to_model";
  if (["assistant", "stream_event", "result"].includes(type)) return "from_model";
  return "system";
}

function replayDirection(value: unknown): TranscriptDirection {
  const type = eventType(value);
  if (type.includes("tool")) return "tool";
  if (type === "user") return "to_model";
  if (["assistant", "result", "stream_event"].includes(type)) return "from_model";
  return "system";
}

/** Detects any subprocess write, including one made without a declared Claude tool call. */
function projectFingerprint(root: string): string {
  const hash = createHash("sha256");
  const visit = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      if ([".git", "node_modules", "build"].includes(name)) continue;
      const path = join(dir, name);
      const stat = lstatSync(path);
      hash.update(`${relative(root, path)}:${stat.mode}:${stat.size}:`);
      if (stat.isSymbolicLink()) hash.update(`link:${readlinkSync(path)}`);
      else if (stat.isDirectory()) visit(path);
      else if (stat.isFile()) hash.update(readFileSync(path));
    }
  };
  visit(root);
  return hash.digest("hex");
}

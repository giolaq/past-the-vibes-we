import { Agent, McpClient, type Tool } from "@strands-agents/sdk";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { join, relative } from "node:path";
import { z, type ZodTypeAny } from "zod";
import { consumeStream, ModelTranscriptStore, serializable, type TranscriptDirection } from "./model-transcript.js";
import { createModel, defaultModel, type ModelConfig, type RemoteProvider } from "./model-factory.js";
import { actualClaudeModels, modelMatches, modelUsage, recordedUsage, type ModelTelemetry } from "./model-telemetry.js";
import { PortOutputSchema } from "./port-contract.js";
import { PortRecorder, PortReplay } from "./port-recorder.js";
import { createProjectReadTools } from "./port-tools.js";
import { createSkillsPlugin, injectSkillText, loadSkills } from "./skills.js";

/** messages carries the agent's turn history so the pipeline can reconstruct ADBT provenance. */
export type PortModelResult = ModelTelemetry & { text: string; messages?: unknown[] };
/**
 * Extra tools/providers for a phase. An McpClient can be passed here (e.g. the ADBT MCP client
 * during analyze/plan); Strands discovers its tools dynamically.
 */
export type ExtraTools = (Tool | McpClient)[];
export type CliMcpServer = { command: string; args: string[]; env?: Record<string, string> };
/**
 * What a phase can ask of one model call beyond the prompt:
 * - schema: demand a different structured output (e.g. the feasibility verdict).
 * - extraTools: extra tool providers for this phase (e.g. the ADBT MCP client).
 * - mcp: named MCP servers the Claude CLI may load for this phase.
 * - skills: names of skills to deliver; each executor delivers them its own way.
 */
export type PortCall = { schema?: ZodTypeAny; extraTools?: ExtraTools; mcp?: string[]; skills?: string[]; maxTokens?: number; maxTurns?: number; attempt?: number };
export interface PortExecutor { call(phase: string, prompt: string, options?: PortCall): Promise<PortModelResult>; }
export class PortExecutorError extends Error {
  constructor(message: string, readonly telemetry: ModelTelemetry) {
    super(message);
  }
}
export type ExecutorConfig =
  | { kind: "claude-cli"; command: string; model: string }
  | { kind: "strands"; model: ModelConfig };
export type ExecutorInput = { executor?: string; provider?: string; model?: string; region?: string; command?: string };

export const READ_ONLY_TOOLS = "Read,Grep,Glob";
export const CLAUDE_EMERGENCY_MAX_COST_USD = 10;
const READ_ONLY_TOOL_RULES = ["Read", "Grep", "Glob"];
const BLOCKED_CLAUDE_TOOLS = ["Bash", "Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch"];

export function resolveExecutorConfig(input: ExecutorInput = {}): ExecutorConfig {
  const kind = input.executor ?? process.env.WORKSHOP_EXECUTOR ?? "claude-cli";
  if (kind === "claude-cli") {
    const model = input.model ?? process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6";
    return { kind, command: input.command ?? process.env.CLAUDE_PATH ?? "claude", model };
  }
  if (kind !== "strands") throw new Error(`Unknown executor ${kind}; use claude-cli or strands`);
  const provider = (input.provider ?? process.env.WORKSHOP_PROVIDER ?? "bedrock") as RemoteProvider;
  if (!["bedrock", "openai", "openrouter"].includes(provider)) throw new Error(`Unknown Strands provider ${provider}`);
  const modelId = input.model ?? process.env.WORKSHOP_MODEL ?? defaultModel(provider);
  return { kind, model: { provider, modelId, region: input.region ?? process.env.AWS_REGION } };
}

export function createPortExecutor(options: { appDir: string; outDir: string; replayPath?: string; config?: ExecutorConfig; recordingName?: string; cliMcpServers?: Record<string, CliMcpServer>; transcripts?: ModelTranscriptStore }): PortExecutor {
  if (options.replayPath && !existsSync(options.replayPath)) throw new Error(`Replay recording not found: ${options.replayPath}`);
  const transcripts = options.transcripts ?? new ModelTranscriptStore(options.outDir);
  if (PortReplay.exists(options.replayPath)) return new ReplayPortExecutor(options.replayPath, transcripts);
  const config = options.config ?? resolveExecutorConfig();
  const recordingPath = join(options.outDir, options.recordingName ?? "port-recording.json");
  return config.kind === "strands"
    ? new StrandsPortExecutor(options.appDir, recordingPath, config.model, transcripts)
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
      payload: { usage: recordedUsage(turn.usage), recordedCostUsd: turn.providerReportedCostUsd ?? turn.costUsd, costSource: "recorded" },
    });
    return {
      text: responseText(turn.response, phase),
      usage: recordedUsage(turn.usage),
      providerReportedCostUsd: turn.providerReportedCostUsd ?? turn.costUsd,
      providerReportedCostSource: turn.providerReportedCostUsd !== undefined || turn.costUsd !== undefined ? "recorded" : undefined,
      requestedModel: turn.requestedModel ?? turn.request.model,
      actualModels: turn.actualModels ?? [],
      messages: responses,
    };
  }
}

class StrandsPortExecutor implements PortExecutor {
  private recorder: PortRecorder;
  constructor(private appDir: string, recordingPath: string, private config: ModelConfig, private transcripts: ModelTranscriptStore) { this.recorder = new PortRecorder(recordingPath); }
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
      const limits = {
        ...(options.maxTurns === undefined ? {} : { turns: options.maxTurns }),
        ...(options.maxTokens === undefined ? {} : { totalTokens: options.maxTokens }),
      };
      result = await consumeStream(
        agent.stream(prompt, {
          ...(Object.keys(limits).length ? { limits } : {}),
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
    const raw = result.metrics?.accumulatedUsage;
    const turns = result.metrics?.latestAgentInvocation?.cycles.length ?? result.metrics?.cycleCount ?? 0;
    const usage = modelUsage({
      inputTokens: raw?.inputTokens,
      outputTokens: raw?.outputTokens,
      cacheReadInputTokens: raw?.cacheReadInputTokens,
      cacheWriteInputTokens: raw?.cacheWriteInputTokens,
      calls: 1,
      turns,
    });
    const telemetry = { usage, requestedModel: modelName, actualModels: [modelName] };
    if (!result.structuredOutput) throw new PortExecutorError("Strands returned no port output", telemetry);
    let text: string;
    try {
      text = JSON.stringify(outputSchema.parse(result.structuredOutput));
    } catch (error) {
      throw new PortExecutorError(`Strands returned invalid structured output: ${error instanceof Error ? error.message : String(error)}`, telemetry);
    }
    this.transcripts.append(phase, {
      attempt, executor: "strands", direction: "from_model", kind: "result",
      payload: { structuredOutput: serializable(result.structuredOutput), stopReason: result.stopReason, usage, requestedModel: modelName, actualModels: [modelName] },
    });
    this.recorder.record({ timestamp: new Date().toISOString(), phase, request: { model: modelName, system: "workshop-vega-port", messages: [{ role: "user", content: prompt }] }, response: [{ type: "result", result: text }], usage, requestedModel: modelName, actualModels: [modelName] });
    // Return the turn history so the pipeline can reconstruct ADBT provenance from tool calls.
    const messages = agent.messages.map((message) => (typeof (message as { toJSON?: () => unknown }).toJSON === "function" ? (message as { toJSON: () => unknown }).toJSON() : message));
    return { text, usage, requestedModel: modelName, actualModels: [modelName], messages };
  }
}

class ClaudeCodePortExecutor implements PortExecutor {
  private recorder: PortRecorder;
  constructor(private appDir: string, recordingPath: string, private config: Extract<ExecutorConfig, { kind: "claude-cli" }>, private mcpServers: Record<string, CliMcpServer>, private transcripts: ModelTranscriptStore) { this.recorder = new PortRecorder(recordingPath); }
  async call(phase: string, prompt: string, options: PortCall = {}): Promise<PortModelResult> {
    const attempt = options.attempt ?? 1;
    const outputSchema = options.schema ?? PortOutputSchema;
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
        this.config.command, this.appDir, withSkills, this.config.model,
        selectedMcp, outputSchema, options.maxTurns,
        (entry) => this.transcripts.append(phase, { attempt, executor: "claude-cli", ...entry }),
      );
      if (projectFingerprint(this.appDir) !== before) {
        throw new PortExecutorError(
          "Claude Code modified the guarded copy directly; only the validated structured patch may write files",
          result,
        );
      }
    } catch (error) {
      this.transcripts.append(phase, { attempt, executor: "claude-cli", direction: "system", kind: "error", payload: error });
      throw error;
    }
    this.recorder.record({
      timestamp: new Date().toISOString(), phase,
      request: { model: `claude-cli:${this.config.model}`, system: "workshop-vega-port", messages: [{ role: "user", content: withSkills }] },
      response: result.events, usage: result.usage, providerReportedCostUsd: result.providerReportedCostUsd,
      requestedModel: this.config.model, actualModels: result.actualModels,
    });
    return { text: result.text, usage: result.usage, providerReportedCostUsd: result.providerReportedCostUsd, requestedModel: this.config.model, actualModels: result.actualModels, messages: result.events };
  }
}

function responseText(response: unknown, phase: string): string {
  const event = Array.isArray(response) ? response.find((item) => item && typeof item === "object" && "result" in item) as { result?: unknown } : undefined;
  if (typeof event?.result !== "string") throw new Error(`Replay response for ${phase} has no result text`);
  return event.result;
}

type ClaudeTranscriptEvent = { direction: TranscriptDirection; kind: string; payload: unknown };
type ClaudeResult = ModelTelemetry & { text: string; events: unknown[] };

function invokeClaude(command: string, cwd: string, prompt: string, model: string, mcpServers: Record<string, CliMcpServer>, outputSchema: ZodTypeAny, maxTurns: number | undefined, onTranscript?: (entry: ClaudeTranscriptEvent) => void): Promise<ClaudeResult> {
  return new Promise((resolve, reject) => {
    const mcpTools = Object.keys(mcpServers).map((name) => `mcp__${name}__*`);
    const { $schema: _draft, ...jsonSchema } = z.toJSONSchema(outputSchema);
    const cliArgs = [
      "-p", "-", "--tools", READ_ONLY_TOOLS,
      "--allowedTools", ...READ_ONLY_TOOL_RULES, ...mcpTools,
      "--disallowedTools", ...BLOCKED_CLAUDE_TOOLS,
      "--strict-mcp-config", "--mcp-config", JSON.stringify({ mcpServers }),
      "--output-format", "stream-json", "--verbose",
      ...(maxTurns === undefined ? [] : ["--max-turns", String(maxTurns)]),
      "--no-session-persistence", "--model", model,
      "--json-schema", JSON.stringify(jsonSchema),
      "--max-budget-usd", CLAUDE_EMERGENCY_MAX_COST_USD.toFixed(4),
    ];
    const child = spawn(command, cliArgs, { cwd, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    let buffer = "", stderr = "", text = "", providerReportedCostUsd: number | undefined, usage = modelUsage(), actualModels: string[] = [];
    const events: unknown[] = [];
    child.stdout.on("data", (chunk) => { buffer += chunk.toString(); const lines = buffer.split("\n"); buffer = lines.pop() ?? ""; lines.forEach(consume); });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      onTranscript?.({ direction: "system", kind: "stderr", payload: text });
    });
    child.stdin.end(prompt);
    child.on("error", (error) => {
      onTranscript?.({ direction: "system", kind: "spawn_error", payload: error });
      reject(error);
    });
    child.on("close", (code) => {
      consume(buffer);
      const telemetry = {
        usage,
        providerReportedCostUsd,
        providerReportedCostSource: providerReportedCostUsd === undefined ? undefined : "provider" as const,
        requestedModel: model,
        actualModels,
      };
      if (code !== 0) {
        const result = [...events].reverse().find((event) => event && typeof event === "object" && "type" in event && event.type === "result") as { errors?: unknown[]; terminal_reason?: unknown } | undefined;
        const details = [
          stderr.trim(),
          ...(result?.errors ?? []).map(String),
          result?.terminal_reason ? `terminal reason: ${String(result.terminal_reason)}` : "",
        ].filter(Boolean).join("; ");
        return reject(new PortExecutorError(
          `Claude Code executor exited ${code}: ${details || "no diagnostic was emitted"}`,
          telemetry,
        ));
      }
      if (!text) return reject(new Error("Claude Code executor produced no result event"));
      if (actualModels.length === 0) {
        return reject(new PortExecutorError(
          `Claude Code did not report modelUsage, so the requested model ${model} could not be verified.`,
          telemetry,
        ));
      }
      const unexpected = actualModels.filter((actual) => !modelMatches(model, actual));
      if (unexpected.length) {
        return reject(new PortExecutorError(
          `Claude Code used ${unexpected.join(", ")} instead of requested model ${model}. Select an exact model name from Claude Code's availableModels list.`,
          telemetry,
        ));
      }
      resolve({ text, ...telemetry, events });
    });
    function consume(line: string) {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line);
        events.push(event);
        onTranscript?.({ direction: claudeDirection(event), kind: eventType(event) || "stream_event", payload: event });
        if (event.type === "result") {
          text = event.structured_output === undefined ? event.result ?? "" : JSON.stringify(event.structured_output);
          providerReportedCostUsd = typeof event.total_cost_usd === "number" ? event.total_cost_usd : undefined;
          usage = recordedUsage({ ...event.usage, calls: 1, turns: event.num_turns });
          actualModels = actualClaudeModels(event);
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

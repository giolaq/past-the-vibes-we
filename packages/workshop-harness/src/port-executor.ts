import { Agent, StructuredOutputError, McpClient, type Tool } from "@strands-agents/sdk";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ZodTypeAny } from "zod";
import { createModel, defaultModel, type ModelConfig, type RemoteProvider } from "./model-factory.js";
import { PortOutputSchema } from "./port-contract.js";
import { PortRecorder, PortReplay } from "./port-recorder.js";
import { createProjectReadTools } from "./port-tools.js";

/** messages carries the agent's turn history so the pipeline can reconstruct ADBT provenance. */
export type PortModelResult = { text: string; costUsd: number; messages?: unknown[] };
/**
 * Extra tools/providers for a phase. An McpClient can be passed here (e.g. the ADBT MCP client
 * during analyze/plan); Strands discovers its tools dynamically. Only the Strands executor uses
 * this — replay and the Claude CLI ignore it (the CLI gets ADBT via its own MCP config).
 */
export type ExtraTools = (Tool | McpClient)[];
/**
 * Optional schema lets a phase demand its own structured output (e.g. the feasibility verdict).
 * Optional extraTools give the model additional tool providers for the phase.
 */
export interface PortExecutor { call(phase: string, prompt: string, schema?: ZodTypeAny, extraTools?: ExtraTools): Promise<PortModelResult>; }
export type ExecutorConfig = { kind: "claude-cli"; command: string; model: string } | { kind: "strands"; model: ModelConfig };

/**
 * Claude CLI tool permissions. Port phases run against the guarded copy, where the harness
 * ignores direct writes and applies only the returned patch, so "*" is safe and avoids
 * stalling on an unnamed ADBT MCP tool. Feasibility runs BEFORE the copy exists — it reads
 * the attendee's real app — so it gets read-only tools plus the MCP wildcard.
 */
export const GUARDED_COPY_TOOLS = "*";
export const READ_ONLY_TOOLS = "Read,Grep,Glob,mcp__*";

export function resolveExecutorConfig(input: { executor?: string; provider?: string; model?: string; region?: string; command?: string } = {}): ExecutorConfig {
  const kind = input.executor ?? process.env.WORKSHOP_EXECUTOR ?? "claude-cli";
  if (kind === "claude-cli") return { kind, command: input.command ?? process.env.CLAUDE_PATH ?? "claude", model: input.model ?? process.env.CLAUDE_MODEL ?? "sonnet" };
  if (kind !== "strands") throw new Error(`Unknown executor ${kind}; use claude-cli or strands`);
  const provider = (input.provider ?? process.env.WORKSHOP_PROVIDER ?? "bedrock") as RemoteProvider;
  if (!["bedrock", "openai", "openrouter"].includes(provider)) throw new Error(`Unknown Strands provider ${provider}`);
  return { kind, model: { provider, modelId: input.model ?? process.env.WORKSHOP_MODEL ?? defaultModel(provider), region: input.region ?? process.env.AWS_REGION } };
}

export function createPortExecutor(options: { appDir: string; outDir: string; replayPath?: string; config?: ExecutorConfig; recordingName?: string; allowedTools?: string }): PortExecutor {
  if (options.replayPath && !existsSync(options.replayPath)) throw new Error(`Replay recording not found: ${options.replayPath}`);
  if (PortReplay.exists(options.replayPath)) return new ReplayPortExecutor(options.replayPath);
  const config = options.config ?? resolveExecutorConfig();
  const recordingPath = join(options.outDir, options.recordingName ?? "port-recording.json");
  return config.kind === "strands"
    ? new StrandsPortExecutor(options.appDir, recordingPath, config.model)
    : new ClaudeCodePortExecutor(options.appDir, recordingPath, config, options.allowedTools ?? GUARDED_COPY_TOOLS);
}

class ReplayPortExecutor implements PortExecutor {
  private replay: PortReplay;
  constructor(path: string) { this.replay = new PortReplay(path); }
  async call(phase: string, _prompt?: string, _schema?: ZodTypeAny, _extraTools?: ExtraTools): Promise<PortModelResult> {
    const turn = this.replay.next(phase);
    // Recordings written by PortRecorder always carry costUsd; fall back to the same rates the
    // live path uses so a hand-written recording cannot silently under-report.
    return { text: responseText(turn.response, phase), costUsd: turn.costUsd ?? estimateCost(turn.usage) };
  }
}

class StrandsPortExecutor implements PortExecutor {
  private recorder: PortRecorder;
  constructor(private appDir: string, recordingPath: string, private config: ModelConfig) { this.recorder = new PortRecorder(recordingPath); }
  async call(phase: string, prompt: string, schema?: ZodTypeAny, extraTools?: ExtraTools): Promise<PortModelResult> {
    const outputSchema = schema ?? PortOutputSchema;
    const agent = new Agent({
      name: `workshop-${phase}`,
      description: "Inspects a guarded React Native app and proposes a bounded Vega port patch.",
      model: createModel(this.config),
      tools: [...createProjectReadTools(this.appDir), ...(extraTools ?? [])],
      structuredOutputSchema: outputSchema,
      systemPrompt: "Inspect the guarded app with the read-only tools. When ADBT tools are available, use them to discover and read the Vega migration workflows you need instead of guessing. Return a complete answer through the required schema. Never claim a file or API exists without reading evidence.",
      printer: false,
    });
    const result = await agent.invoke(prompt, {
      cancelSignal: AbortSignal.timeout(10 * 60_000),
      limits: { turns: 8, totalTokens: 40_000 },
    });
    if (!result.structuredOutput) throw new StructuredOutputError("Strands returned no port output");
    const text = JSON.stringify(outputSchema.parse(result.structuredOutput));
    const raw = result.metrics?.accumulatedUsage;
    const usage = { input_tokens: raw?.inputTokens ?? 0, output_tokens: raw?.outputTokens ?? 0 };
    const costUsd = estimateCost(usage);
    this.recorder.record({ timestamp: new Date().toISOString(), phase, request: { model: `${this.config.provider}:${this.config.modelId}`, system: "workshop-vega-port", messages: [{ role: "user", content: prompt }] }, response: [{ type: "result", result: text }], usage, costUsd });
    // Return the turn history so the pipeline can reconstruct ADBT provenance from tool calls.
    const messages = agent.messages.map((message) => (typeof (message as { toJSON?: () => unknown }).toJSON === "function" ? (message as { toJSON: () => unknown }).toJSON() : message));
    return { text, costUsd, messages };
  }
}

class ClaudeCodePortExecutor implements PortExecutor {
  private recorder: PortRecorder;
  constructor(private appDir: string, recordingPath: string, private config: Extract<ExecutorConfig, { kind: "claude-cli" }>, private allowedTools: string) { this.recorder = new PortRecorder(recordingPath); }
  async call(phase: string, prompt: string, _schema?: ZodTypeAny, _extraTools?: ExtraTools): Promise<PortModelResult> {
    const result = await invokeClaude(this.config.command, this.appDir, prompt, this.config.model, this.allowedTools);
    this.recorder.record({ timestamp: new Date().toISOString(), phase, request: { model: `claude-cli:${this.config.model}`, system: "workshop-vega-port", messages: [{ role: "user", content: prompt }] }, response: [{ type: "result", result: result.text }], usage: result.usage, costUsd: result.costUsd });
    return { text: result.text, costUsd: result.costUsd };
  }
}

function responseText(response: unknown, phase: string): string {
  const event = Array.isArray(response) ? response.find((item) => item && typeof item === "object" && "result" in item) as { result?: unknown } : undefined;
  if (typeof event?.result !== "string") throw new Error(`Replay response for ${phase} has no result text`);
  return event.result;
}

const INPUT_USD_PER_MTOK = 3;
const OUTPUT_USD_PER_MTOK = 15;
function estimateCost(usage: { input_tokens: number; output_tokens: number }): number {
  return (usage.input_tokens * INPUT_USD_PER_MTOK + usage.output_tokens * OUTPUT_USD_PER_MTOK) / 1_000_000;
}

function invokeClaude(command: string, cwd: string, prompt: string, model: string, allowedTools: string): Promise<{ text: string; costUsd: number; usage: { input_tokens: number; output_tokens: number } }> {
  return new Promise((resolve, reject) => {
    // allowedTools is "*" for port phases (guarded copy; the harness applies only the returned
    // patch) and read-only for the feasibility call, which runs against the real app. The
    // wildcard keeps ADBT MCP tools usable without naming them and stops a tool call from
    // stalling on an unanswerable permission prompt in non-interactive (-p) mode.
    const child = spawn(command, ["-p", "-", "--allowedTools", allowedTools, "--output-format", "stream-json", "--verbose", "--model", model], { cwd, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    let buffer = "", stderr = "", text = "", costUsd = 0, usage = { input_tokens: 0, output_tokens: 0 }, timedOut = false;
    child.stdout.on("data", (chunk) => { buffer += chunk.toString(); const lines = buffer.split("\n"); buffer = lines.pop() ?? ""; lines.forEach(consume); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.stdin.end(prompt);
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, 10 * 60_000);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      consume(buffer);
      if (timedOut) return reject(new Error(`Claude Code executor timed out after 10 minutes: ${stderr.slice(0, 500)}`));
      if (code !== 0) return reject(new Error(`Claude Code executor exited ${code}: ${stderr.slice(0, 500)}`));
      if (!text) return reject(new Error("Claude Code executor produced no result event"));
      resolve({ text, costUsd, usage });
    });
    function consume(line: string) { try { const event = JSON.parse(line); if (event.type === "result") { text = event.result ?? ""; costUsd = event.total_cost_usd ?? 0; usage = { input_tokens: event.usage?.input_tokens ?? 0, output_tokens: event.usage?.output_tokens ?? 0 }; } } catch {} }
  });
}

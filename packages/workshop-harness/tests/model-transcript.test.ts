import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { consumeStream, ModelTranscriptStore, type TranscriptEntry } from "../src/model-transcript.js";
import { createPortExecutor, PortExecutorError, resolveExecutorConfig } from "../src/port-executor.js";

function entries(path: string): TranscriptEntry[] {
  return readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line) as TranscriptEntry);
}

test("JSONL transcript preserves complete multiline payloads and continues on resume", () => {
  const out = mkdtempSync(join(tmpdir(), "model-transcript-"));
  const prompt = "first line\nsecond line\n" + "x".repeat(20_000);
  new ModelTranscriptStore(out).append("plan", {
    attempt: 1,
    executor: "strands",
    direction: "to_model",
    kind: "request",
    payload: { prompt },
  });
  new ModelTranscriptStore(out).append("plan", {
    attempt: 1,
    executor: "strands",
    direction: "from_model",
    kind: "modelMessageEvent",
    payload: { message: { role: "assistant", content: [{ text: "complete answer" }] } },
  });

  const rows = entries(join(out, "model-logs", "plan.jsonl"));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.sequence), [1, 2]);
  assert.equal((rows[0].payload as { prompt: string }).prompt, prompt, "the prompt was shortened");
  assert.equal(rows.every((row) => row.schemaVersion === 1 && row.phase === "plan"), true);
});

test("stream consumer records every yielded event and keeps the generator result", async () => {
  async function* stream() {
    yield { type: "modelStreamUpdateEvent", event: { delta: { text: "hello" } } };
    yield { type: "toolResultEvent", result: { content: [{ text: "tool output" }] } };
    return { stopReason: "endTurn" };
  }
  const seen: unknown[] = [];
  const result = await consumeStream(stream(), (event) => seen.push(event));
  assert.deepEqual(seen, [
    { type: "modelStreamUpdateEvent", event: { delta: { text: "hello" } } },
    { type: "toolResultEvent", result: { content: [{ text: "tool output" }] } },
  ]);
  assert.deepEqual(result, { stopReason: "endTurn" });
});

test("Claude CLI transcript records stdin prompt, native events, raw output, and stderr", async () => {
  const root = mkdtempSync(join(tmpdir(), "claude transcript with spaces-"));
  const app = join(root, "guarded app");
  const out = join(root, "run");
  const command = join(root, "fake claude");
  mkdirSync(app);
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "fixture" }));
  writeFileSync(command, `#!/usr/bin/env node
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  process.stdout.write("raw diagnostic that is not JSON\\n");
  process.stderr.write("full stderr diagnostic\\n");
  process.stdout.write(JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "complete assistant message" }] } }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "result", result: "rendered fallback", structured_output: { summary: "done", files: {} }, total_cost_usd: 0.0123, usage: { input_tokens: 11, output_tokens: 7 }, num_turns: 2, modelUsage: { "claude-sonnet-4-6": { inputTokens: 11, outputTokens: 7 } } }) + "\\n");
});
`);
  chmodSync(command, 0o755);
  const executor = createPortExecutor({
    appDir: app,
    outDir: out,
    config: resolveExecutorConfig({ command, model: "claude-sonnet-4-6" }),
  });
  const prompt = "Read this fully.\nSecond line.\n" + "z".repeat(10_000);
  const result = await executor.call("port", prompt, { attempt: 2 });
  assert.equal(result.providerReportedCostUsd, 0.0123);
  assert.equal(result.usage.totalTokens, 18);
  assert.equal(result.usage.calls, 1);
  assert.equal(result.usage.turns, 2);
  assert.deepEqual(result.actualModels, ["claude-sonnet-4-6"]);
  assert.deepEqual(JSON.parse(result.text), { summary: "done", files: {} });

  const rows = entries(join(out, "model-logs", "port.jsonl"));
  const request = rows.find((row) => row.kind === "request");
  const assistant = rows.find((row) => row.kind === "assistant");
  assert.equal((((request?.payload as { messages: Array<{ content: string }> }).messages[0]).content), prompt);
  assert.match(JSON.stringify(assistant?.payload), /complete assistant message/);
  assert.equal(rows.some((row) => row.kind === "raw_stdout" && row.payload === "raw diagnostic that is not JSON"), true);
  assert.equal(rows.some((row) => row.kind === "stderr" && String(row.payload).includes("full stderr diagnostic")), true);
  assert.equal(rows.every((row) => row.attempt === 2), true);
});

test("Claude CLI failures retain the terminal reason from the result event", async () => {
  const root = mkdtempSync(join(tmpdir(), "claude terminal reason-"));
  const app = join(root, "app");
  const command = join(root, "fake claude");
  mkdirSync(app);
  writeFileSync(join(app, "package.json"), "{}");
  writeFileSync(command, `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ type: "result", subtype: "error_max_turns", errors: ["Reached maximum number of turns (12)"], terminal_reason: "max_turns", total_cost_usd: 0.25, usage: { input_tokens: 20, output_tokens: 5 }, num_turns: 12, modelUsage: { "claude-sonnet-4-6": { inputTokens: 20, outputTokens: 5 } } }) + "\\n");
process.exitCode = 1;
`);
  chmodSync(command, 0o755);
  const executor = createPortExecutor({
    appDir: app,
    outDir: join(root, "out"),
    config: resolveExecutorConfig({ command, model: "claude-sonnet-4-6" }),
  });
  let error: PortExecutorError | undefined;
  try {
    await executor.call("analyze", "inspect");
  } catch (caught) {
    assert.ok(caught instanceof PortExecutorError);
    error = caught;
  }
  assert.ok(error);
  assert.match(error.message, /Reached maximum number of turns \(12\); terminal reason: max_turns/);
  assert.equal(error.telemetry.providerReportedCostUsd, 0.25);
  assert.equal(error.telemetry.usage.totalTokens, 25);
  assert.equal(error.telemetry.usage.turns, 12);
});

test("Claude CLI rejects a silently routed model", async () => {
  const root = mkdtempSync(join(tmpdir(), "claude model mismatch-"));
  const app = join(root, "app");
  const command = join(root, "fake claude");
  mkdirSync(app);
  writeFileSync(join(app, "package.json"), "{}");
  writeFileSync(command, `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ type: "result", structured_output: { summary: "done", files: {} }, usage: { input_tokens: 10, output_tokens: 5 }, num_turns: 1, modelUsage: { "global.anthropic.claude-opus-4-8-v1:0": { inputTokens: 10, outputTokens: 5 } } }) + "\\n");
`);
  chmodSync(command, 0o755);
  const executor = createPortExecutor({
    appDir: app,
    outDir: join(root, "out"),
    config: resolveExecutorConfig({ command, model: "claude-sonnet-4-6" }),
  });
  await assert.rejects(
    () => executor.call("analyze", "inspect"),
    /used global\.anthropic\.claude-opus-4-8-v1:0 instead of requested model claude-sonnet-4-6/,
  );
});

test("replay transcript names the recorded request and keeps every recorded response", async () => {
  const root = mkdtempSync(join(tmpdir(), "replay-transcript-"));
  const app = join(root, "app");
  const out = join(root, "out");
  mkdirSync(app);
  writeFileSync(join(app, "package.json"), "{}");
  const recording = join(root, "recording.json");
  writeFileSync(recording, JSON.stringify([{
    timestamp: "2026-07-26T00:00:00.000Z",
    phase: "analyze",
    request: { model: "recorded-model", system: "system text", messages: [{ role: "user", content: "recorded prompt" }] },
    response: [
      { type: "assistant", message: { role: "assistant", content: [{ text: "recorded full response" }] } },
      { type: "result", result: "{\"summary\":\"done\",\"files\":{}}" },
    ],
    usage: { input_tokens: 5, output_tokens: 6 },
    costUsd: 0.001,
  }]));
  const executor = createPortExecutor({ appDir: app, outDir: out, replayPath: recording });
  const result = await executor.call("analyze", "current assembled prompt", { attempt: 1 });
  assert.equal(result.providerReportedCostUsd, 0.001);

  const rows = entries(join(out, "model-logs", "analyze.jsonl"));
  assert.match(JSON.stringify(rows.find((row) => row.kind === "replay_request")?.payload), /recorded prompt/);
  assert.match(JSON.stringify(rows.filter((row) => row.kind === "replay_response").map((row) => row.payload)), /recorded full response/);
  assert.equal(rows.find((row) => row.kind === "replay_request")?.direction, "to_model");
});

test("logs --phase returns the canonical JSONL file without changing it", () => {
  const root = mkdtempSync(join(tmpdir(), "logs-command-"));
  const out = join(root, "run-1");
  const store = new ModelTranscriptStore(out);
  store.append("plan", {
    attempt: 1, executor: "harness", direction: "system", kind: "phase_complete",
    payload: { summary: "done" },
  });
  const path = join(import.meta.dirname, "../src/index.ts");
  const stdout = execFileSync(process.execPath, ["--import", "tsx", path, "logs", "run-1", "--phase", "plan"], {
    encoding: "utf8",
    env: { ...process.env, WORKSHOP_OUT: root },
  });
  assert.equal(stdout, readFileSync(store.pathFor("plan"), "utf8"));
  assert.equal((JSON.parse(stdout) as TranscriptEntry).kind, "phase_complete");
});

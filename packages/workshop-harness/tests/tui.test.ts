import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { ModelTranscriptStore, type TranscriptEntry } from "../src/model-transcript.js";
import { renderWorkshopTui, shouldUseTui, summarizeTranscriptEntry, WorkshopTui, type TuiState } from "../src/tui.js";

function entry(input: Partial<TranscriptEntry> & Pick<TranscriptEntry, "direction" | "kind" | "payload">): TranscriptEntry {
  return {
    schemaVersion: 1,
    timestamp: "2026-07-26T12:34:56.000Z",
    sequence: 1,
    phase: "port",
    attempt: 1,
    executor: "harness",
    ...input,
  };
}

function state(events: TranscriptEntry[] = []): TuiState {
  return {
    runId: "workshop",
    executor: "replay",
    evidenceMode: "recorded",
    seed: "workshop-v1",
    maxTokens: 1_000_000,
    usage: { inputTokens: 900, outputTokens: 100, cacheReadInputTokens: 200, cacheWriteInputTokens: 0, totalTokens: 1_200, calls: 2, turns: 5 },
    providerReportedCostUsd: 0.0123,
    providerReportedCostSource: "recorded",
    startedAt: Date.now(),
    view: "phases",
    selected: 1,
    selectedEvent: 0,
    detailOffset: 0,
    followActive: true,
    outputMode: "checks",
    phases: [
      { name: "vega_portability_audit", status: "passed", attempts: 1 },
      { name: "port", status: "running", attempts: 2 },
      { name: "build", status: "pending", attempts: 0 },
    ],
    events: new Map([["port", events]]),
  };
}

test("TUI is only enabled for an attached human terminal", () => {
  assert.equal(shouldUseTui([], true, true), false);
  assert.equal(shouldUseTui(["--tui"], true, true), true);
  assert.equal(shouldUseTui(["--tui", "--json"], true, true), false);
  assert.equal(shouldUseTui(["--tui", "--detach"], true, true), false);
  assert.equal(shouldUseTui(["--tui"], false, true), false);
});

test("dashboard shows phase state, attempt, usage, and controls", () => {
  const output = renderWorkshopTui(state(), 100, 30);
  assert.match(output, /Past the Vibes/);
  assert.match(output, /\[ok\] vega_portability_audit/);
  assert.match(output, /> \[\.\.\] port\s+attempt 2/);
  assert.match(output, /tokens 1,200 \/ 1,000,000  turns 5  calls 2/);
  assert.match(output, /recorded provider cost metadata \$0\.0123/);
  assert.match(output, /evidence recorded/);
  assert.match(output, /up\/down select  Enter messages  f active phase/);
});

test("dashboard shows unlimited when no cumulative token cap was requested", () => {
  const unlimited = state();
  unlimited.maxTokens = undefined;
  assert.match(renderWorkshopTui(unlimited, 100, 30), /tokens 1,200 \/ unlimited/);
});

test("completed dashboard stays reviewable until the attendee closes it", () => {
  const complete = state();
  complete.complete = true;
  const output = renderWorkshopTui(complete, 100, 30);
  assert.match(output, /Enter messages  q close/);
});

test("a resumed dashboard loads activity from every earlier phase", () => {
  const out = mkdtempSync(join(tmpdir(), "tui-resume-"));
  new ModelTranscriptStore(out).append("plan", {
    attempt: 1,
    executor: "claude-cli",
    direction: "to_model",
    kind: "request",
    payload: { prompt: "Create the structured port plan" },
  });
  const tui = new WorkshopTui({
    runId: "workshop",
    executor: "claude-cli",
    evidenceMode: "live",
    seed: "workshop-v1",
    maxTokens: undefined,
    phases: ["analyze", "plan", "port"],
  });
  new ModelTranscriptStore(out).replayExisting(tui.transcript);
  tui.state.selected = 1;
  tui.state.view = "messages";
  tui.state.outputMode = "all";
  tui.state.selectedEvent = 0;

  const output = renderWorkshopTui(tui.state, 100, 30);
  assert.match(output, /TYPE: to_model\/request/);
  assert.match(output, /Create the structured port plan/);
});

test("message browsing retains early exchanges in a long phase", () => {
  const tui = new WorkshopTui({
    runId: "workshop",
    executor: "claude-cli",
    evidenceMode: "live",
    seed: "workshop-v1",
    maxTokens: undefined,
    phases: ["port"],
  });
  tui.transcript(entry({
    direction: "to_model",
    kind: "request",
    payload: { messages: [{ role: "user", content: "Original port request" }] },
  }));
  for (let sequence = 2; sequence <= 250; sequence += 1) {
    tui.transcript(entry({
      sequence,
      direction: "system",
      kind: "system",
      payload: { sequence },
    }));
  }
  tui.state.view = "messages";
  tui.state.outputMode = "all";
  tui.state.selectedEvent = 0;

  const output = renderWorkshopTui(tui.state, 100, 30);
  assert.equal(tui.state.events.get("port")?.length, 250);
  assert.match(output, /TYPE: to_model\/request \(user\)/);
  assert.match(output, /Original port request/);
});

test("Enter opens phase messages and Escape returns to phases", () => {
  const input = new PassThrough() as PassThrough & NodeJS.ReadStream;
  const output = new PassThrough() as PassThrough & NodeJS.WriteStream;
  Object.assign(input, { isTTY: true, setRawMode: () => {} });
  Object.assign(output, { isTTY: true, columns: 100, rows: 30 });
  let written = "";
  output.on("data", (chunk) => written += chunk.toString());
  const tui = new WorkshopTui({
    runId: "workshop",
    executor: "claude-cli",
    evidenceMode: "live",
    seed: "workshop-v1",
    maxTokens: undefined,
    phases: ["analyze", "plan"],
    input,
    output,
  });
  tui.transcript(entry({
    phase: "plan",
    direction: "to_model",
    kind: "request",
    payload: { messages: [{ role: "user", content: "Write the plan" }] },
  }));
  tui.start();
  input.emit("keypress", "", { name: "down" });
  input.emit("keypress", "", { name: "return" });
  assert.equal(tui.state.view, "messages");
  assert.equal(tui.state.selected, 1);
  assert.match(written, /TYPE: to_model\/request \(user\)/);
  assert.match(written, /Write the plan/);

  input.emit("keypress", "", { name: "escape" });
  assert.equal(tui.state.view, "phases");
  assert.match(written, /PHASES/);
  tui.finish();
});

test("q closes the completed alternate screen and restores terminal mode", async () => {
  const input = new PassThrough() as PassThrough & NodeJS.ReadStream;
  const output = new PassThrough() as PassThrough & NodeJS.WriteStream;
  const rawModes: boolean[] = [];
  Object.assign(input, { isTTY: true, setRawMode: (value: boolean) => rawModes.push(value) });
  Object.assign(output, { isTTY: true, columns: 100, rows: 30 });
  let written = "";
  output.on("data", (chunk) => written += chunk.toString());
  const tui = new WorkshopTui({
    runId: "workshop",
    executor: "replay",
    evidenceMode: "recorded",
    seed: "workshop-v1",
    maxTokens: 1_000_000,
    phases: ["analyze", "plan"],
    input,
    output,
  });
  tui.start("analyze");
  const review = tui.complete();
  input.emit("keypress", "q", { name: "q" });
  await review;
  assert.deepEqual(rawModes, [true, false]);
  assert.match(written, /\u001b\[\?1049h/);
  assert.match(written, /\u001b\[\?1049l/);
});

test("checks mode hides model content and shows independent verification", () => {
  const request = entry({
    executor: "strands",
    direction: "to_model",
    kind: "request",
    payload: { messages: [{ role: "user", content: "PRIVATE FULL PROMPT" }] },
  });
  const checks = entry({
    direction: "system",
    kind: "verification_result",
    payload: { passed: false, failures: ["Vega manifest schema is missing"] },
  });
  const checksState = state([request, checks]);
  checksState.view = "messages";
  checksState.selectedEvent = 0;
  const output = renderWorkshopTui(checksState, 100, 30);
  assert.doesNotMatch(output, /PRIVATE FULL PROMPT/);
  assert.match(output, /checks failed - Vega manifest schema is missing/);
});

test("checks mode shows the verified commit", () => {
  const commit = entry({
    direction: "system",
    kind: "commit",
    payload: { hash: "abc12345", message: "workshop(port): add Vega focus" },
  });
  const commitState = state([commit]);
  commitState.view = "messages";
  const output = renderWorkshopTui(commitState, 100, 30);
  assert.match(output, /commit abc12345 - workshop\(port\): add Vega focus/);
});

test("model and tools modes select only their own activity", () => {
  const request = entry({
    executor: "strands",
    direction: "to_model",
    kind: "request",
    payload: { messages: [{ role: "user", content: "Read the guarded app first" }] },
  });
  const tool = entry({
    executor: "strands",
    direction: "tool",
    kind: "toolUseEvent",
    payload: { name: "read_project_file", input: { path: "src/App.tsx" } },
  });
  const modelState = state([request, tool]);
  modelState.view = "messages";
  modelState.outputMode = "model";
  const modelOutput = renderWorkshopTui(modelState, 100, 30);
  assert.match(modelOutput, /model request - Read the guarded app first/);
  assert.doesNotMatch(modelOutput, /read_project_file/);

  modelState.outputMode = "tools";
  const toolOutput = renderWorkshopTui(modelState, 100, 30);
  assert.match(toolOutput, /tool - read_project_file/);
  assert.doesNotMatch(toolOutput, /Read the guarded app first/);
});

test("activity previews are bounded while the canonical transcript stays complete", () => {
  const fullPrompt = `first line ${"x".repeat(2_000)}`;
  const request = entry({
    direction: "to_model",
    kind: "request",
    payload: { messages: [{ content: fullPrompt }] },
  });
  const preview = summarizeTranscriptEntry(request);
  assert.ok(preview.length < 220);
  assert.match(preview, /first line/);

  const seen: TranscriptEntry[] = [];
  const store = new ModelTranscriptStore(mkdtempSync(join(tmpdir(), "tui-transcript-")), (row) => seen.push(row));
  store.append("port", {
    attempt: 1,
    executor: "strands",
    direction: "to_model",
    kind: "request",
    payload: { prompt: fullPrompt },
  });
  assert.equal(((seen[0].payload as { prompt: string }).prompt), fullPrompt);
});

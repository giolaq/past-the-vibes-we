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
    seed: "workshop-v1",
    budgetUsd: 3,
    costUsd: 0.0123,
    startedAt: Date.now(),
    selected: 1,
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

test("dashboard shows phase state, attempt, cost, and controls", () => {
  const output = renderWorkshopTui(state(), 100, 30);
  assert.match(output, /Past the Vibes/);
  assert.match(output, /\[ok\] vega_portability_audit/);
  assert.match(output, /> \[\.\.\] port\s+attempt 2/);
  assert.match(output, /\$0\.0123 \/ \$3\.00/);
  assert.match(output, /up\/down select  Tab output  f follow/);
});

test("completed dashboard stays reviewable until the attendee closes it", () => {
  const complete = state();
  complete.complete = true;
  const output = renderWorkshopTui(complete, 100, 30);
  assert.match(output, /q\/Enter close/);
  assert.match(output, /logs workshop --phase port/);
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
    seed: "workshop-v1",
    budgetUsd: 3,
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
  const output = renderWorkshopTui(state([request, checks]), 100, 30);
  assert.doesNotMatch(output, /PRIVATE FULL PROMPT/);
  assert.match(output, /checks failed - Vega manifest schema is missing/);
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

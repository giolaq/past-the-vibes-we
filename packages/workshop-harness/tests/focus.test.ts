import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { focusedTestIdFromPageSource, readFocusContract } from "../src/platform/focus.js";
import { runFocusTest, startDeviceRun, VegaReplayAdapter, type VegaCapability } from "../src/platform/vega.js";

const SHA = `sha256:${"a".repeat(64)}`;

function pageSource(testId: string): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    result: {
      role: "root",
      children: [
        { attributes: { focused: false, test_id: "other" } },
        { attributes: { focused: true, focusable: true, test_id: testId } },
      ],
    },
  });
}

function ok(stdout = "ok") {
  return { code: 0, stdout, stderr: "", timedOut: false };
}

function focusTurns(): Array<{ capability: VegaCapability; result: ReturnType<typeof ok> }> {
  return [
    { capability: "automation_enable", result: ok() },
    { capability: "page_source", result: ok(pageSource("featured-action")) },
    { capability: "key_press", result: ok() },
    { capability: "page_source", result: ok(pageSource("rail-new-card-signal")) },
    { capability: "key_press", result: ok() },
    { capability: "page_source", result: ok(pageSource("rail-new-card-signal")) },
    { capability: "key_press", result: ok() },
    { capability: "page_source", result: ok(pageSource("rail-new-card-orbit")) },
    { capability: "key_press", result: ok() },
    { capability: "page_source", result: ok(pageSource("rail-new-card-paper")) },
    { capability: "key_press", result: ok() },
    { capability: "page_source", result: ok(pageSource("rail-new-card-paper")) },
    { capability: "key_press", result: ok() },
    { capability: "page_source", result: ok(pageSource("back-button")) },
    { capability: "key_press", result: ok() },
    { capability: "page_source", result: ok(pageSource("rail-new-card-paper")) },
  ];
}

function focusApp(): string {
  const root = mkdtempSync(join(tmpdir(), "workshop-focus-"));
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "port-plan.json"), JSON.stringify({
    schemaVersion: 1,
    briefSha256: SHA,
    target: { platform: "firetv-vega", sdk: "0.23.9221" },
    verticalSlice: "Open details and restore focus.",
    entryScreenId: "home",
    screens: [
      {
        id: "home",
        source: "src/App.tsx",
        purpose: "Browse movies",
        initialFocusId: "featured-action",
        focusableIds: ["featured-action", "rail-new-card-signal", "rail-new-card-orbit", "rail-new-card-paper"],
      },
      {
        id: "details",
        source: "src/App.tsx",
        purpose: "Read details",
        initialFocusId: "back-button",
        focusableIds: ["back-button"],
      },
    ],
    navigation: [
      { fromScreenId: "home", action: "select", toScreenId: "details", focusResult: "Back receives focus." },
      { fromScreenId: "details", action: "back", toScreenId: "home", focusResult: "The originating card regains focus." },
    ],
    preservedBehaviors: [{ id: "open-details", requirement: "Open details and restore focus." }],
    deferredBehaviors: [],
    verification: [{ behaviorId: "open-details", evidence: "VDA key input and focused test ids." }],
    openQuestions: [],
  }, null, 2));
  return root;
}

test("page-source parser reads focused test ids from JSON and nested XML", () => {
  assert.equal(focusedTestIdFromPageSource(pageSource("featured-action")), "featured-action");
  const xml = `<root><node focused="false" test_id="other"/><node focused="true" focusable="true" test_id="back-button"/></root>`;
  const nested = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { value: xml } });
  assert.equal(focusedTestIdFromPageSource(nested), "back-button");
});

test("page-source parser rejects focus without a stable test id", () => {
  const source = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { focused: true, text: "View details" } });
  assert.throws(() => focusedTestIdFromPageSource(source), /add testID/);
});

test("page-source parser reports a Vega runtime error when no control can focus", () => {
  const xml = `<root><app appName="com.workshop.pocketcinema"><text>Uncaught Error</text><text>"com.workshop.pocketcinema.main" has not been registered.</text></app></root>`;
  const source = JSON.stringify({ jsonrpc: "2.0", id: 1, result: xml });
  assert.throws(() => focusedTestIdFromPageSource(source), /has not been registered/);
});

test("approved port plan supplies the focus expectations", () => {
  const contract = readFocusContract(focusApp());
  assert.equal(contract.initialFocusId, "featured-action");
  assert.equal(contract.firstRailFocusId, "rail-new-card-signal");
  assert.equal(contract.detailFocusId, "back-button");
});

test("focus test injects keys and proves every required transition", async () => {
  const app = focusApp();
  const device = startDeviceRun({
    adapter: new VegaReplayAdapter(focusTurns()),
    outDir: `${app}-out`,
    evidenceMode: "replay",
    appId: "com.workshop.pocketcinema.main",
  });
  await runFocusTest(device, app, { timeoutMs: 0, pollIntervalMs: 0, settleMs: 0 });
  const evidence = JSON.parse(readFileSync(join(app, "tv-focus-result.json"), "utf8"));
  assert.equal(evidence.passed, true);
  assert.deepEqual(evidence.transitions, [
    "launch-hero",
    "down-to-first-rail",
    "left-boundary",
    "right",
    "right-boundary",
    "open-details",
    "back-restore",
  ]);
  assert.deepEqual(
    device.steps.filter((step) => step.capability === "key_press").map((step) => step.command.at(-1)),
    ["KEY_DOWN", "KEY_LEFT", "KEY_RIGHT", "KEY_RIGHT", "KEY_RIGHT", "KEY_ENTER", "KEY_BACK"],
  );
  assert.deepEqual(device.blockers, []);
});

test("focus test waits for Automation Toolkit after enabling it", async () => {
  const app = focusApp();
  const turns = focusTurns();
  turns.splice(1, 0, {
    capability: "page_source",
    result: { code: 7, stdout: "", stderr: "curl: (7) Failed to connect to 127.0.0.1 port 8383", timedOut: false },
  });
  const device = startDeviceRun({
    adapter: new VegaReplayAdapter(turns),
    outDir: `${app}-out`,
    evidenceMode: "replay",
    appId: "com.workshop.pocketcinema.main",
  });
  await runFocusTest(device, app, { timeoutMs: 100, pollIntervalMs: 0, settleMs: 0 });
  const evidence = JSON.parse(readFileSync(join(app, "tv-focus-result.json"), "utf8"));
  assert.equal(evidence.passed, true);
  assert.equal(device.steps.filter((step) => step.capability === "page_source").length, 9);
  assert.deepEqual(device.blockers, []);
});

test("focus test removes stale passing evidence and reports observed device focus", async () => {
  const app = focusApp();
  writeFileSync(join(app, "tv-focus-result.json"), JSON.stringify({
    passed: true,
    transitions: ["launch-hero", "down-to-first-rail", "left-boundary", "right-boundary", "open-details", "back-restore"],
  }));
  const turns = focusTurns();
  turns[1] = { capability: "page_source", result: ok(pageSource("wrong-control")) };
  const device = startDeviceRun({
    adapter: new VegaReplayAdapter(turns),
    outDir: `${app}-out`,
    evidenceMode: "replay",
    appId: "com.workshop.pocketcinema.main",
  });
  await runFocusTest(device, app, { timeoutMs: 0, pollIntervalMs: 0, settleMs: 0 });
  const evidence = JSON.parse(readFileSync(join(app, "tv-focus-result.json"), "utf8"));
  assert.equal(evidence.passed, false);
  assert.equal(evidence.observations[0].observed, "wrong-control");
  assert.match(device.blockers.join("\n"), /launch-hero focus check failed/);
});

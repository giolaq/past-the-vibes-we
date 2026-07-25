import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BeeContextProvider } from "../src/context-providers/bee.js";
import { PLACEHOLDER_PIXEL_PNG, VegaAdapter, VegaReplayAdapter, runVegaLifecycle, type VegaCapability } from "../src/platform/vega.js";
import { runProcess } from "../src/process.js";
import { resolveExecutorConfig } from "../src/port-executor.js";

function script(body: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "workshop-bin-")), "fake tool");
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

test("process timeout is bounded", async () => {
  const fake = script("sleep 2");
  const result = await runProcess(fake, [], 20);
  assert.equal(result.timedOut, true);
});

test("Vega adapter owns capability command arrays", () => {
  const adapter = new VegaAdapter("vega");
  assert.deepEqual(adapter.command("build"), ["npm", "run", "build:debug"]);
  assert.deepEqual(adapter.command("install", "app.vpkg"), ["vega", "device", "install-app", "--packagePath", "app.vpkg"]);
  assert.deepEqual(adapter.command("capture", "/tmp/shot.png"), ["vega", "exec", "vda", "shell", "gwsi-tool-screenshooter", "/tmp/shot.png"]);
});

test("Vega adapter executes inside the guarded apps/vega directory", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "guarded-vega-"));
  const fake = script("pwd");
  const previous = process.env.NPM_BIN;
  process.env.NPM_BIN = fake;
  const result = await new VegaAdapter("vega", cwd).execute("build");
  if (previous) process.env.NPM_BIN = previous; else delete process.env.NPM_BIN;
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), realpathSync(cwd));
});

/** The full ten-gate sequence: the launch frame, then the dwell, log, and second frame. */
const LIFECYCLE: VegaCapability[] = ["sdk_version", "device_status", "build", "install", "launch", "capture", "pull", "logs", "capture", "pull"];

function lifecycleTurns(log = "Pocket Cinema started\ninitial focus featured-action") {
  return LIFECYCLE.map((capability) => ({ capability, result: { code: 0, stdout: capability === "sdk_version" ? "Active SDK Version: 0.22.5875" : capability === "logs" ? log : "ok", stderr: "", timedOut: false } }));
}

const PASSING_FOCUS = JSON.stringify({ passed: true, transitions: ["launch-hero", "down-to-first-rail", "left-boundary", "right-boundary", "open-details", "back-restore"] });
const RENDERED_FRAME = readFileSync(join(import.meta.dirname, "../../../workshop/fixtures/vega-lifecycle/launch-frame.png"));

function check(result: { checks: { name: string; passed: boolean; evidence: string }[] }, name: string) {
  const found = result.checks.find((candidate) => candidate.name === name);
  assert.ok(found, `expected a check named "${name}", saw ${result.checks.map((candidate) => candidate.name).join(", ")}`);
  return found;
}

test("Vega lifecycle records every successful gate and evidence file", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-lifecycle-"));
  const app = join(root, "app");
  const vega = join(app, "apps", "vega");
  mkdirSync(vega, { recursive: true });
  writeFileSync(join(app, "tv-focus-result.json"), PASSING_FOCUS);
  const result = await runVegaLifecycle({ adapter: new VegaReplayAdapter(lifecycleTurns(), RENDERED_FRAME), appDir: vega, focusDir: app, outDir: root, evidenceMode: "replay", packagePath: "build/pocket.vpkg", appId: "com.tvbuild.pocketcinema.main" });
  assert.deepEqual(result.steps.map((step) => step.capability), LIFECYCLE);
  assert.equal(result.blockers.length, 0);
  assert.equal(check(result, "focus transition suite").passed, true);
  assert.equal(check(result, "launch screenshot renders content").passed, true);
  assert.equal(check(result, "post-launch screenshot renders content").passed, true);
  assert.equal(check(result, "device log free of crash signatures").passed, true);
  assert.match(check(result, "launch screenshot renders content").evidence, /1280x720/);
  assert.deepEqual(result.screenshots, [join(root, "01-launch.png"), join(root, "02-postlaunch.png")]);
  assert.ok(existsSync(join(root, "01-launch.png")));
  assert.ok(existsSync(join(root, "02-postlaunch.png")));
  assert.match(readFileSync(join(root, "vega-device.log"), "utf8"), /Pocket Cinema started/);
});

test("Vega lifecycle refuses a placeholder screenshot", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-placeholder-"));
  writeFileSync(join(root, "tv-focus-result.json"), PASSING_FOCUS);
  const result = await runVegaLifecycle({ adapter: new VegaReplayAdapter(lifecycleTurns(), PLACEHOLDER_PIXEL_PNG), appDir: root, outDir: root, evidenceMode: "replay", packagePath: "app.vpkg", appId: "app.main" });
  assert.equal(check(result, "launch screenshot renders content").passed, false);
  assert.match(result.blockers.join(" "), /frame is 1x1, smaller than the 640x360 minimum/);
  // The launch frame already failed, so the lifecycle never spends the remaining gates.
  assert.deepEqual(result.steps.map((step) => step.capability), ["sdk_version", "device_status", "build", "install", "launch", "capture", "pull"]);
});

test("Vega lifecycle fails when the device log reports a crash after launch", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-crash-"));
  writeFileSync(join(root, "tv-focus-result.json"), PASSING_FOCUS);
  const log = "PocketCinema: component started\nFATAL EXCEPTION: main\nprocess com.tvbuild.pocketcinema has died";
  const result = await runVegaLifecycle({ adapter: new VegaReplayAdapter(lifecycleTurns(log), RENDERED_FRAME), appDir: root, outDir: root, evidenceMode: "replay", packagePath: "app.vpkg", appId: "app.main" });
  assert.equal(check(result, "device log free of crash signatures").passed, false);
  assert.match(result.blockers.join(" "), /the app crashed after launch: fatal exception: FATAL EXCEPTION: main/);
  // A crash stops the run before the second frame is even requested.
  assert.equal(result.screenshots.length, 1);
});

test("Vega lifecycle waits before reading the log on a live device", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-dwell-"));
  writeFileSync(join(root, "tv-focus-result.json"), PASSING_FOCUS);
  const started = Date.now();
  const result = await runVegaLifecycle({ adapter: new VegaReplayAdapter(lifecycleTurns(), RENDERED_FRAME), appDir: root, outDir: root, evidenceMode: "replay", packagePath: "app.vpkg", appId: "app.main", dwellMs: 120 });
  assert.ok(Date.now() - started >= 120, "the lifecycle returned before the dwell elapsed");
  assert.equal(result.dwellMs, 120);
  assert.match(check(result, "post-launch screenshot renders content").evidence, /captured 120ms after launch/);
});

test("Vega lifecycle asks an optional judge about the post-launch frame", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-judge-"));
  writeFileSync(join(root, "tv-focus-result.json"), PASSING_FOCUS);
  const judged: string[] = [];
  const judge = async (path: string) => { judged.push(path); return { verdict: "not-app" as const, reasoning: "the frame shows a system error dialog" }; };
  const result = await runVegaLifecycle({ adapter: new VegaReplayAdapter(lifecycleTurns(), RENDERED_FRAME), appDir: root, outDir: root, evidenceMode: "replay", packagePath: "app.vpkg", appId: "app.main", judge });
  assert.deepEqual(judged, [join(root, "02-postlaunch.png")]);
  assert.equal(check(result, "screenshot review").passed, false);
  assert.match(result.blockers.join(" "), /screenshot review rejected the frame: the frame shows a system error dialog/);
});

test("Vega lifecycle stops after a failed gate", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-lifecycle-fail-"));
  writeFileSync(join(root, "tv-focus-result.json"), JSON.stringify({ passed: true }));
  const adapter = new VegaReplayAdapter([
    { capability: "sdk_version", result: { code: 0, stdout: "Active SDK Version: 0.22.5875", stderr: "", timedOut: false } },
    { capability: "device_status", result: { code: 2, stdout: "", stderr: "no device", timedOut: false } },
  ]);
  const result = await runVegaLifecycle({ adapter, appDir: root, outDir: root, evidenceMode: "replay", packagePath: "app.vpkg", appId: "app.main" });
  assert.deepEqual(result.steps.map((step) => step.capability), ["sdk_version", "device_status"]);
  assert.match(result.blockers[0], /no device/);
});

test("Vega lifecycle treats an empty successful device list as unavailable", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-no-device-"));
  writeFileSync(join(root, "tv-focus-result.json"), JSON.stringify({ passed: true }));
  writeFileSync(join(root, "vega-device.log"), "stale replay log");
  const adapter = new VegaReplayAdapter([
    { capability: "sdk_version", result: { code: 0, stdout: "0.22.5875", stderr: "", timedOut: false } },
    { capability: "device_status", result: { code: 0, stdout: "List of devices attached\n\n", stderr: "", timedOut: false } },
  ]);
  const result = await runVegaLifecycle({ adapter, appDir: root, outDir: root, evidenceMode: "live", appId: "app.main" });
  assert.deepEqual(result.steps.map((step) => step.capability), ["sdk_version", "device_status"]);
  assert.match(result.blockers[0], /no VDA device/);
  assert.deepEqual(result.logFiles, []);
  assert.equal(existsSync(join(root, "vega-device.log")), false);
});

test("Vega lifecycle rejects a different active SDK", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-sdk-mismatch-"));
  const adapter = new VegaReplayAdapter([
    { capability: "sdk_version", result: { code: 0, stdout: "Active SDK Version: 0.23.0", stderr: "", timedOut: false } },
  ]);
  const result = await runVegaLifecycle({ adapter, appDir: root, outDir: root, evidenceMode: "replay", packagePath: "app.vpkg", appId: "app.main" });
  assert.deepEqual(result.steps.map((step) => step.capability), ["sdk_version"]);
  assert.match(result.blockers[0], /expected 0\.22\.5875/);
});

test("Vega lifecycle rejects incomplete focus evidence", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-focus-incomplete-"));
  writeFileSync(join(root, "tv-focus-result.json"), JSON.stringify({ passed: true, transitions: ["launch-hero"] }));
  const result = await runVegaLifecycle({ adapter: new VegaReplayAdapter(lifecycleTurns(), RENDERED_FRAME), appDir: root, outDir: root, evidenceMode: "replay", packagePath: "app.vpkg", appId: "app.main" });
  assert.equal(check(result, "focus transition suite").passed, false);
  assert.match(result.blockers.at(-1) ?? "", /every required transition/);
});

test("Bee search parses candidates without transcript text", async () => {
  const fake = script('printf \'[{"id":"c1","recordedAt":"2026-01-01","title":"Planning","summary":"TV app"}]\\n\'');
  const rows = await new BeeContextProvider(fake).search("TV");
  assert.deepEqual(rows[0], { id: "c1", recordedAt: "2026-01-01", title: "Planning", summary: "TV app" });
});

test("Bee failure is explicit", async () => {
  const fake = script("echo unavailable >&2; exit 3");
  await assert.rejects(() => new BeeContextProvider(fake).search("TV"), /unavailable/);
});

test("executor config defaults to local Claude Code", () => {
  assert.deepEqual(resolveExecutorConfig({ command: "claude-test", model: "sonnet" }), { kind: "claude-cli", command: "claude-test", model: "sonnet" });
});

test("executor config supports Strands remote providers", () => {
  assert.deepEqual(resolveExecutorConfig({ executor: "strands", provider: "openai", model: "gpt-test" }), { kind: "strands", model: { provider: "openai", modelId: "gpt-test", region: undefined } });
  assert.throws(() => resolveExecutorConfig({ executor: "strands", provider: "unknown" }), /Unknown Strands provider/);
});

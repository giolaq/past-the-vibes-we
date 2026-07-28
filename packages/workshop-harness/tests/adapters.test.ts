import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BeeContextProvider } from "../src/context-providers/bee.js";
import { VegaAdapter, VegaReplayAdapter, buildPackage, checkToolchain, formatLoggingctlSince, installAndLaunch, runVegaLifecycle, startDeviceRun, type VegaCapability, type VegaCommandAdapter } from "../src/platform/vega.js";
import { MAX_CAPTURED_CHARS, runProcess } from "../src/process.js";
import { verifyPort } from "../src/port-verification.js";
import { resolveExecutorConfig } from "../src/port-executor.js";
import { claudeModelAvailability } from "../src/workshop-doctor.js";

function script(body: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "workshop-bin-")), "fake tool");
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

test("process timeout is bounded, and the kill is visible", async () => {
  const fake = script("sleep 2");
  const result = await runProcess(fake, [], 20);
  assert.equal(result.timedOut, true);
  // A signalled process must not be mistaken for a program that chose to exit.
  assert.equal(result.signal, "SIGTERM");
});

test("process output is bounded so one build log cannot fill the prompt", async () => {
  const fake = script("i=0; while [ $i -lt 4000 ]; do echo \"line $i xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\"; i=$((i+1)); done");
  const result = await runProcess(fake, [], 20_000);
  assert.ok(result.stdout.length < MAX_CAPTURED_CHARS + 200, `kept ${result.stdout.length} characters`);
  // Both ends survive: what it was doing, and where it stopped.
  assert.match(result.stdout, /^line 0 /);
  assert.match(result.stdout, /line 3999 /);
  assert.match(result.stdout, /characters elided/);
});

test("Vega page source preserves a complete UI hierarchy beyond the normal log budget", async () => {
  const fake = script("i=0; while [ $i -lt 20000 ]; do printf x; i=$((i+1)); done");
  const result = await new VegaAdapter(fake).execute("page_source");
  assert.equal(result.code, 0);
  assert.equal(result.stdout.length, 20_000);
  assert.doesNotMatch(result.stdout, /characters elided/);
});

test("a failing command check reports the command's own output", async () => {
  const dir = mkdtempSync(join(tmpdir(), "command-check-"));
  const failing = script("echo 'src/App.tsx(12,5): error TS2304: Cannot find name Foo.'; exit 2");
  const [failure] = await verifyPort(dir, [{ type: "command", command: failing, args: [], label: "Vega build" }]);
  assert.match(failure, /Vega build: exited 2/);
  assert.match(failure, /error TS2304: Cannot find name Foo/);
});

test("a command check that times out says so", async () => {
  const dir = mkdtempSync(join(tmpdir(), "command-timeout-"));
  const [failure] = await verifyPort(dir, [{ type: "command", command: script("sleep 5"), args: [], label: "Vega build", timeoutMs: 30 }]);
  assert.match(failure, /Vega build: timed out after 0s/);
});

test("a command check whose binary is missing fails instead of throwing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "command-missing-"));
  const [failure] = await verifyPort(dir, [{ type: "command", command: "/nonexistent/vega", args: [], label: "Vega build" }]);
  assert.match(failure, /could not run \/nonexistent\/vega/);
});

test("Vega adapter owns capability command arrays", () => {
  const adapter = new VegaAdapter("vega");
  assert.deepEqual(adapter.command("dependencies"), ["npm", "install", "--include=dev"]);
  assert.deepEqual(adapter.command("build"), ["npm", "run", "build:debug"]);
  assert.deepEqual(adapter.command("vda_start"), ["vega", "virtual-device", "start", "--gui", "--timeout", "60"]);
  assert.deepEqual(adapter.command("install", "app.vpkg"), ["vega", "device", "install-app", "--packagePath", "app.vpkg"]);
  assert.deepEqual(adapter.command("app_status", "app.main"), ["vega", "device", "is-app-running", "--appName", "app.main"]);
  assert.deepEqual(adapter.command("automation_enable"), ["vega", "exec", "vda", "shell", "touch", "/tmp/automation-toolkit.enable"]);
  assert.deepEqual(adapter.command("key_press", "KEY_DOWN"), ["vega", "exec", "vda", "shell", "inputd-cli", "button_press", "KEY_DOWN"]);
  const pageSource = adapter.command("page_source");
  const escapedRequest = pageSource[pageSource.indexOf("--data") + 1];
  assert.equal(JSON.parse(escapedRequest.replace(/\\{3}([{}"])/g, "$1")).method, "getPageSource");
  assert.match(pageSource.join(" "), /127\.0\.0\.1:8383\/jsonrpc/);
  assert.deepEqual(adapter.command("logs", "com.tvbuild.pocketcinema", "2026-07-26 12:00:00"), [
    "vega", "exec", "vda", "shell", "loggingctl", "log",
    "-v", "com.tvbuild.pocketcinema", "-S", "2026-07-26 12:00:00", "-o", "short_precise",
  ]);
});

test("loggingctl timestamps use its documented whitespace-free format", () => {
  assert.equal(formatLoggingctlSince(new Date("2026-07-28T07:29:16.193Z")), "2026.07.28T07:29:16");
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

test("Vega toolchain starts and verifies a VDA when none is attached", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-auto-start-"));
  const device = startDeviceRun({
    adapter: new VegaReplayAdapter([
      { capability: "sdk_version", result: { code: 0, stdout: "Active SDK Version: 0.23.9221", stderr: "", timedOut: false } },
      { capability: "device_status", result: { code: 0, stdout: "List of devices attached\n\n", stderr: "", timedOut: false } },
      { capability: "vda_start", result: { code: 0, stdout: "Vega Virtual Device started", stderr: "", timedOut: false } },
      { capability: "device_status", result: { code: 0, stdout: "List of devices attached\n\n", stderr: "", timedOut: false } },
      { capability: "device_status", result: { code: 0, stdout: "List of devices attached\nemulator-5554 offline", stderr: "", timedOut: false } },
      { capability: "device_status", result: { code: 0, stdout: "List of devices attached\nemulator-5554 device", stderr: "", timedOut: false } },
      { capability: "device_status", result: { code: 0, stdout: "List of devices attached\nemulator-5554 device", stderr: "", timedOut: false } },
    ]),
    outDir: root,
    evidenceMode: "replay",
  });
  await checkToolchain(device, true, { pollIntervalMs: 0 });
  assert.deepEqual(device.steps.map((step) => step.capability), [
    "sdk_version", "device_status", "vda_start",
    "device_status", "device_status", "device_status", "device_status",
  ]);
  assert.deepEqual(device.blockers, []);
});

test("Vega toolchain times out instead of installing while VDA is still unavailable", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-start-timeout-"));
  const device = startDeviceRun({
    adapter: new VegaReplayAdapter([
      { capability: "sdk_version", result: { code: 0, stdout: "Active SDK Version: 0.23.9221", stderr: "", timedOut: false } },
      { capability: "device_status", result: { code: 0, stdout: "List of devices attached\n\n", stderr: "", timedOut: false } },
      { capability: "vda_start", result: { code: 0, stdout: "Vega Virtual Device started", stderr: "", timedOut: false } },
      { capability: "device_status", result: { code: 0, stdout: "List of devices attached\n\n", stderr: "", timedOut: false } },
    ]),
    outDir: root,
    evidenceMode: "replay",
  });
  await checkToolchain(device, true, { timeoutMs: 0, pollIntervalMs: 0 });
  assert.deepEqual(device.steps.map((step) => step.capability), ["sdk_version", "device_status", "vda_start", "device_status"]);
  assert.match(device.blockers[0], /VDA did not remain attached for 2 checks within 0s/);
});

/** The lifecycle samples process state, then drives the real focus contract. */
const LIFECYCLE_BASE: VegaCapability[] = ["sdk_version", "device_status", "build", "install", "launch", "app_status", "logs", "app_status"];
const FOCUS_LIFECYCLE: VegaCapability[] = [
  "automation_enable", "page_source",
  "key_press", "page_source",
  "key_press", "page_source",
  "key_press", "page_source",
  "key_press", "page_source",
  "key_press", "page_source",
  "key_press", "page_source",
  "key_press", "page_source",
];
const LIFECYCLE: VegaCapability[] = [...LIFECYCLE_BASE, ...FOCUS_LIFECYCLE];

function lifecycleTurns(log = "Pocket Cinema started\ninitial focus featured-action") {
  const base = LIFECYCLE_BASE.map((capability) => ({
    capability,
    result: {
      code: 0,
      stdout: capability === "sdk_version"
        ? "Active SDK Version: 0.23.9221"
        : capability === "device_status"
          ? "List of devices attached\nemulator-5554 device"
          : capability === "logs"
            ? log
            : capability === "app_status"
              ? "com.tvbuild.pocketcinema.main is running on emulator-5554"
            : "ok",
      stderr: "",
      timedOut: false,
    },
  }));
  const pages = [
    "featured-action",
    "rail-new-card-signal",
    "rail-new-card-signal",
    "rail-new-card-orbit",
    "rail-new-card-paper",
    "rail-new-card-paper",
    "back-button",
    "rail-new-card-paper",
  ];
  let page = 0;
  const focus = FOCUS_LIFECYCLE.map((capability) => ({
    capability,
    result: {
      code: 0,
      stdout: capability === "page_source"
        ? JSON.stringify({ jsonrpc: "2.0", id: 1, result: { focused: true, test_id: pages[page++] } })
        : "ok",
      stderr: "",
      timedOut: false,
    },
  }));
  return [...base, ...focus];
}

function writeFocusPlan(root: string): void {
  writeFileSync(join(root, "port-plan.json"), JSON.stringify({
    schemaVersion: 1,
    briefSha256: `sha256:${"a".repeat(64)}`,
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
  }));
}

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
  writeFocusPlan(app);
  const result = await runVegaLifecycle({ adapter: new VegaReplayAdapter(lifecycleTurns()), appDir: vega, focusDir: app, outDir: root, evidenceMode: "replay", packagePath: "build/pocket.vpkg", appId: "com.tvbuild.pocketcinema.main" });
  assert.deepEqual(result.steps.map((step) => step.capability), LIFECYCLE);
  assert.equal(result.blockers.length, 0);
  assert.equal(check(result, "focus transition suite").passed, true);
  assert.equal(check(result, "app is running after launch").passed, true);
  assert.equal(check(result, "device log free of crash signatures").passed, true);
  assert.equal(check(result, "app remains running after dwell").passed, true);
  assert.match(readFileSync(join(root, "vega-device.log"), "utf8"), /Pocket Cinema started/);
});

test("Vega lifecycle refuses an app that is not running immediately after launch", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-not-running-"));
  const turns = lifecycleTurns();
  const initialStatus = turns.find((turn) => turn.capability === "app_status");
  assert.ok(initialStatus);
  initialStatus.result.stdout = "app.main is not running on emulator-5554";
  const result = await runVegaLifecycle({ adapter: new VegaReplayAdapter(turns), appDir: root, outDir: root, evidenceMode: "replay", packagePath: "app.vpkg", appId: "app.main" });
  assert.equal(check(result, "app is running after launch").passed, false);
  assert.match(result.blockers.join(" "), /app is running after launch check failed/);
  assert.deepEqual(result.steps.map((step) => step.capability), LIFECYCLE_BASE);
});

test("Vega lifecycle fails when the device log reports a crash after launch", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-crash-"));
  const log = "PocketCinema: component started\nFATAL EXCEPTION: main\nprocess com.tvbuild.pocketcinema has died";
  const result = await runVegaLifecycle({ adapter: new VegaReplayAdapter(lifecycleTurns(log)), appDir: root, outDir: root, evidenceMode: "replay", packagePath: "app.vpkg", appId: "app.main" });
  assert.equal(check(result, "device log free of crash signatures").passed, false);
  assert.match(result.blockers.join(" "), /the app crashed after launch: fatal exception: FATAL EXCEPTION: main/);
});

test("Vega lifecycle waits before reading the log on a live device", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-dwell-"));
  writeFocusPlan(root);
  const started = Date.now();
  const result = await runVegaLifecycle({ adapter: new VegaReplayAdapter(lifecycleTurns()), appDir: root, outDir: root, evidenceMode: "replay", packagePath: "app.vpkg", appId: "app.main", dwellMs: 120 });
  assert.ok(Date.now() - started >= 120, "the lifecycle returned before the dwell elapsed");
  assert.equal(result.dwellMs, 120);
  assert.match(check(result, "app remains running after dwell").evidence, /after 120ms dwell/);
});

test("Vega lifecycle stops after a failed gate", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-lifecycle-fail-"));
  const adapter = new VegaReplayAdapter([
    { capability: "sdk_version", result: { code: 0, stdout: "Active SDK Version: 0.23.9221", stderr: "", timedOut: false } },
    { capability: "device_status", result: { code: 0, stdout: "List of devices attached\nemulator-5554 device", stderr: "", timedOut: false } },
    { capability: "build", result: { code: 0, stdout: "built", stderr: "", timedOut: false } },
    { capability: "install", result: { code: 2, stdout: "", stderr: "package rejected", timedOut: false } },
  ]);
  const result = await runVegaLifecycle({ adapter, appDir: root, outDir: root, evidenceMode: "replay", packagePath: "app.vpkg", appId: "app.main" });
  assert.deepEqual(result.steps.map((step) => step.capability), ["sdk_version", "device_status", "build", "install"]);
  assert.match(result.blockers[0], /package rejected/);
});

test("a live build rejects a package produced without a Hermes bundle", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-missing-bundle-"));
  const device = startDeviceRun({
    adapter: new VegaReplayAdapter([
      { capability: "dependencies", result: { code: 0, stdout: "installed", stderr: "", timedOut: false } },
      { capability: "build", result: { code: 0, stdout: "packaged manifest", stderr: "", timedOut: false } },
    ]),
    outDir: root,
    evidenceMode: "live",
    packagePath: "build/app.vpkg",
    appId: "app.main",
  });
  await buildPackage(device, root);
  assert.match(device.blockers.join(" "), /build produced no non-empty index\.hermes\.bundle/);
});

test("a live build installs dependencies before invoking the compiler", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-dependencies-"));
  const calls: VegaCapability[] = [];
  const adapter: VegaCommandAdapter = {
    command: (capability) => [capability],
    execute: async (capability) => {
      calls.push(capability);
      if (capability === "build") {
        const bundleDir = join(root, "build", "lib", "rn-bundles", "Debug");
        mkdirSync(bundleDir, { recursive: true });
        writeFileSync(join(bundleDir, "index.hermes.bundle"), "hermes");
      }
      return { code: 0, stdout: "ok", stderr: "", timedOut: false };
    },
  };
  const device = startDeviceRun({
    adapter,
    outDir: root,
    evidenceMode: "live",
    packagePath: "build/app.vpkg",
    appId: "app.main",
  });
  await buildPackage(device, root);
  assert.deepEqual(calls, ["dependencies", "build"]);
  assert.deepEqual(device.steps.map((step) => step.capability), ["dependencies", "build"]);
  assert.deepEqual(device.blockers, []);
});

test("a failed dependency install stops a live build before the compiler", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-dependencies-fail-"));
  const device = startDeviceRun({
    adapter: new VegaReplayAdapter([
      { capability: "dependencies", result: { code: 1, stdout: "", stderr: "package resolution failed", timedOut: false } },
      { capability: "build", result: { code: 0, stdout: "must not run", stderr: "", timedOut: false } },
    ]),
    outDir: root,
    evidenceMode: "live",
    packagePath: "build/app.vpkg",
    appId: "app.main",
  });
  await buildPackage(device, root);
  assert.deepEqual(device.steps.map((step) => step.capability), ["dependencies"]);
  assert.match(device.blockers.join(" "), /dependencies failed: package resolution failed/);
});

test("a live build accepts a fresh non-empty Hermes bundle", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-bundle-"));
  const adapter: VegaCommandAdapter = {
    command: (capability) => [capability],
    execute: async (capability) => {
      if (capability === "build") {
        const bundleDir = join(root, "build", "lib", "rn-bundles", "Debug");
        mkdirSync(bundleDir, { recursive: true });
        writeFileSync(join(bundleDir, "index.hermes.bundle"), "hermes");
      }
      return { code: 0, stdout: "built", stderr: "", timedOut: false };
    },
  };
  const device = startDeviceRun({
    adapter,
    outDir: root,
    evidenceMode: "live",
    packagePath: "build/app.vpkg",
    appId: "app.main",
  });
  await buildPackage(device, root);
  assert.deepEqual(device.steps.map((step) => step.capability), ["dependencies", "build"]);
  assert.deepEqual(device.blockers, []);
});

test("launch reports a process that exits during the dwell with log diagnostics", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-launch-diagnostics-"));
  const device = startDeviceRun({
    adapter: new VegaReplayAdapter([
      { capability: "install", result: { code: 0, stdout: "installed", stderr: "", timedOut: false } },
      { capability: "launch", result: { code: 0, stdout: "launched", stderr: "", timedOut: false } },
      { capability: "app_status", result: { code: 0, stdout: "app.main is running on emulator-5554", stderr: "", timedOut: false } },
      { capability: "logs", result: { code: 0, stdout: "E loader: Invalid component library path\nE loader: Unable to load library for component app.main", stderr: "", timedOut: false } },
      { capability: "app_status", result: { code: 0, stdout: "app.main is not running on emulator-5554", stderr: "", timedOut: false } },
    ]),
    outDir: root,
    evidenceMode: "replay",
    packagePath: "build/app.vpkg",
    appId: "app.main",
    dwellMs: 0,
  });
  await installAndLaunch(device);
  assert.deepEqual(device.steps.map((step) => step.capability), ["install", "launch", "app_status", "logs", "app_status"]);
  assert.match(device.blockers.join("\n"), /Invalid component library path/);
  assert.equal(check(device, "app remains running after dwell").passed, false);
});

test("Vega lifecycle reports a VDA startup failure after an empty device list", async () => {
  const root = mkdtempSync(join(tmpdir(), "vega-no-device-"));
  writeFileSync(join(root, "tv-focus-result.json"), JSON.stringify({ passed: true }));
  writeFileSync(join(root, "vega-device.log"), "stale replay log");
  const adapter = new VegaReplayAdapter([
    { capability: "sdk_version", result: { code: 0, stdout: "0.23.9221", stderr: "", timedOut: false } },
    { capability: "device_status", result: { code: 0, stdout: "List of devices attached\n\n", stderr: "", timedOut: false } },
    { capability: "vda_start", result: { code: 2, stdout: "", stderr: "virtual device image unavailable", timedOut: false } },
  ]);
  const result = await runVegaLifecycle({ adapter, appDir: root, outDir: root, evidenceMode: "live", appId: "app.main" });
  assert.deepEqual(result.steps.map((step) => step.capability), ["sdk_version", "device_status", "vda_start"]);
  assert.match(result.blockers[0], /vda_start failed: virtual device image unavailable/);
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
  assert.match(result.blockers[0], /expected 0\.23\.9221/);
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
  assert.deepEqual(resolveExecutorConfig({ command: "claude-test", model: "claude-sonnet-4-6" }), {
    kind: "claude-cli",
    command: "claude-test",
    model: "claude-sonnet-4-6",
  });
});

test("executor config supports Strands remote providers", () => {
  assert.deepEqual(resolveExecutorConfig({ executor: "strands", provider: "openai", model: "gpt-test" }), {
    kind: "strands",
    model: { provider: "openai", modelId: "gpt-test", region: undefined },
  });
  assert.throws(() => resolveExecutorConfig({ executor: "strands", provider: "unknown" }), /Unknown Strands provider/);
});

test("Claude model validation rejects aliases and names outside an enforced list", () => {
  const settings = join(mkdtempSync(join(tmpdir(), "claude-settings-")), "settings.json");
  writeFileSync(settings, JSON.stringify({ enforceAvailableModels: true, availableModels: ["claude-sonnet-4-6", "claude-opus-4-8"] }));
  assert.equal(claudeModelAvailability("sonnet", settings)?.status, "repair");
  assert.equal(claudeModelAvailability("claude-sonnet-4-6", settings)?.status, "pass");
  assert.equal(claudeModelAvailability("claude-haiku-4-5", settings)?.status, "repair");
});

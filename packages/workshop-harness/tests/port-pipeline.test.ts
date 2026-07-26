import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AdbtContextProvider, AdbtPortContext } from "../src/context-providers/adbt.js";
import { createPortExecutor, resolveExecutorConfig, type PortCall, type PortExecutor, type PortModelResult } from "../src/port-executor.js";
import { PortRecorder, PortReplay } from "../src/port-recorder.js";
import { VegaReplayAdapter, startDeviceRun } from "../src/platform/vega.js";
import { PortBudgetError, phases, runPortPipeline } from "../src/port-pipeline.js";

class FakeExecutor implements PortExecutor {
  calls: { phase: string; prompt: string; skills?: string[] }[] = [];
  constructor(private responses: PortModelResult[]) {}
  async call(phase: string, prompt: string, options?: PortCall): Promise<PortModelResult> {
    this.calls.push({ phase, prompt, skills: options?.skills });
    const result = this.responses.shift();
    if (!result) throw new Error("fake exhausted");
    return result;
  }
}

test("ports three concerns and commits each verified phase", async () => {
  const app = fixtureApp();
  const executor = new FakeExecutor(successResponses());
  const completed: string[] = [];
  const result = await runPortPipeline({
    appDir: app,
    outDir: `${app}-out`,
    findings: [],
    projectContext: "approved",
    seed: "fixed",
    maxCostUsd: 10,
    phaseNames: MODEL_PHASES,
    executor,
    adbt: fakeAdbt(),
    onPhaseComplete: (phase, snapshot) => {
      completed.push(phase.name);
      assert.equal(snapshot.phases.at(-1)?.name, phase.name);
    },
  });
  assert.deepEqual(result.phases.map((phase) => phase.name), ["analyze", "plan", "port"]);
  assert.deepEqual(completed, ["analyze", "plan", "port"]);
  assert.equal(execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: app, encoding: "utf8" }).trim(), "4");
  assert.match(readFileSync(join(app, "src/App.tsx"), "utf8"), /focus-state/);
  // The focus test is written here and executed by the test phase, which needs a device session.
  assert.ok(existsSync(join(app, "tests/verify-tv-focus.ts")));
  assert.equal(result.adbt?.mode, "replay");
  assert.equal(JSON.parse(readFileSync(join(`${app}-out`, "adbt-port-context.json"), "utf8")).targetPlatform, "vega_os");
  // ADBT guidance is injected only into the plan phase (index 1), not analyze (0) or port (2).
  assert.doesNotMatch(executor.calls[0].prompt, /ADBT Vega Port Guidance/);
  assert.match(executor.calls[1].prompt, /port_tv_app_to_vega_fos_rn_app\.md/);
  assert.match(executor.calls[1].prompt, /Do not invent Vega APIs/);
  assert.doesNotMatch(executor.calls[2].prompt, /ADBT Vega Port Guidance/);
});

test("feeds exact verification failure into retry", async () => {
  const app = fixtureApp();
  const executor = new FakeExecutor([response({ "WRONG.md": "no" }), ...successResponses()]);
  const result = await pipeline(app, executor);
  assert.equal(result.phases[0].attempts, 2);
  assert.match(executor.calls[1].prompt, /Portability analysis documented: missing ANALYSIS.md/);
});

test("a retry keeps build output instead of rebuilding from zero", async () => {
  const app = fixtureApp();
  mkdirSync(join(app, "apps", "vega", "build"), { recursive: true });
  writeFileSync(join(app, "apps", "vega", "build", "pocket.vpkg"), "binary");
  mkdirSync(join(app, "node_modules"), { recursive: true });
  writeFileSync(join(app, "node_modules", "installed.txt"), "dependency");
  // Attempt 1 fails, so the harness resets the tree before attempt 2. Untracked source the
  // model wrote goes; the expensive artifacts stay.
  const executor = new FakeExecutor([response({ "WRONG.md": "no" }), ...successResponses()]);
  const result = await pipeline(app, executor);
  assert.equal(result.phases[0].attempts, 2);
  assert.ok(existsSync(join(app, "apps", "vega", "build", "pocket.vpkg")), "the built package was deleted by the retry");
  assert.ok(existsSync(join(app, "node_modules", "installed.txt")), "dependencies were deleted by the retry");
  assert.equal(existsSync(join(app, "WRONG.md")), false, "the rejected attempt's file survived");
});

test("a raised attempt budget loops until the checks pass", async () => {
  const app = fixtureApp();
  // Attempt 1: no ANALYSIS.md at all. Attempt 2: the file exists but lacks the marker —
  // a different failure, so the progress rule lets the loop continue. Attempt 3: green.
  const executor = new FakeExecutor([
    response({ "WRONG.md": "no" }),
    response({ "ANALYSIS.md": "# Analysis without the marker" }),
    ...successResponses(),
  ]);
  const result = await pipeline(app, executor, 10, 5);
  assert.equal(result.phases[0].attempts, 3);
});

test("until-done stops when the same failures repeat", async () => {
  const app = fixtureApp();
  const executor = new FakeExecutor([
    response({ "WRONG.md": "no" }),
    response({ "WRONG.md": "still no" }),
    ...successResponses(),
  ]);
  await assert.rejects(() => pipeline(app, executor, 10, Infinity), /no progress/);
  assert.equal(executor.calls.length, 2);
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: app, encoding: "utf8" }), "");
});

test("budget abort restores a clean generated tree", async () => {
  const app = fixtureApp();
  const executor = new FakeExecutor([{ ...response({ "VEGA_PORT.md": "## TV Flow" }), costUsd: 4 }]);
  await assert.rejects(() => pipeline(app, executor, 3), PortBudgetError);
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: app, encoding: "utf8" }), "");
  assert.throws(() => readFileSync(join(app, "VEGA_PORT.md")));
});

test("runs only the requested phases and leaves the rest for later", async () => {
  const app = fixtureApp();
  const executor = new FakeExecutor(successResponses());
  const result = await runPortPipeline({ appDir: app, outDir: `${app}-out`, findings: [], projectContext: "approved", seed: "fixed", maxCostUsd: 10, phaseNames: ["analyze"], executor, adbt: fakeAdbt() });
  assert.deepEqual(result.phases.map((phase) => phase.name), ["analyze"]);
  assert.equal(executor.calls.length, 1);
  // The guarded copy keeps the import commit plus the one phase that ran.
  assert.equal(execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: app, encoding: "utf8" }).trim(), "2");
});

test("a second pipeline run continues in the same guarded copy", async () => {
  const app = fixtureApp();
  const first = new FakeExecutor(successResponses());
  await runPortPipeline({ appDir: app, outDir: `${app}-out`, findings: [], projectContext: "approved", seed: "fixed", maxCostUsd: 10, phaseNames: ["analyze", "plan"], executor: first, adbt: fakeAdbt() });
  const second = new FakeExecutor(successResponses().slice(2));
  const result = await runPortPipeline({ appDir: app, outDir: `${app}-out`, findings: [], projectContext: "approved", seed: "fixed", maxCostUsd: 10, phaseNames: ["port"], executor: second, adbt: fakeAdbt() });
  assert.deepEqual(result.phases.map((phase) => phase.name), ["port"]);
  // import + analyze + plan + port: git init did not wipe the earlier history.
  assert.equal(execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: app, encoding: "utf8" }).trim(), "4");
  assert.match(readFileSync(join(app, "ANALYSIS.md"), "utf8"), /## Portable/);
});

test("replay serves a partial run the turns it asks for, in order", () => {
  const path = join(mkdtempSync(join(tmpdir(), "port-replay-")), "recording.json");
  writeFileSync(path, JSON.stringify(["analyze", "plan", "plan", "port"].map(recordedTurn)));
  const replay = new PortReplay(path);
  // A resumed run skips the phases it is not executing, and a recorded retry still replays.
  assert.equal(replay.next("plan").phase, "plan");
  assert.equal(replay.next("plan").phase, "plan");
  assert.equal(replay.next("port").phase, "port");
  assert.throws(() => replay.next("plan"), /Replay has no turn left for plan/);
});

test("phases are ordered by the plan, not by the request, and unknown names are named", () => {
  assert.deepEqual(phases(["test", "analyze"]).map((phase) => phase.name), ["analyze", "test"]);
  assert.throws(() => phases(["analyse"]), /Unknown phase analyse; use analyze, plan, port, build, launch, test/);
  assert.throws(() => phases([]), /At least one phase is required/);
});

test("only the device phases ask for a device, and they say so when there is none", async () => {
  const app = fixtureApp();
  const executor = new FakeExecutor(successResponses());
  await pipeline(app, executor);
  const withDevice = phases().filter((phase) => phase.device?.length).map((phase) => phase.name);
  assert.deepEqual(withDevice, ["build", "launch", "test"]);
  await assert.rejects(
    () => runPortPipeline({ appDir: app, outDir: `${app}-out`, findings: [], projectContext: "approved", seed: "fixed", maxCostUsd: 10, phaseNames: ["build"], executor: new FakeExecutor([]), adbt: fakeAdbt() }),
    /build needs a device session/,
  );
});

test("each phase asks its executor for its own skills", async () => {
  const app = fixtureApp();
  const executor = new FakeExecutor(successResponses());
  await pipeline(app, executor);
  assert.deepEqual(executor.calls.map((call) => call.skills), [
    ["amazon-devices-vega-best-practices"],
    ["amazon-devices-vega-focus-management"],
    ["amazon-devices-vega-build-and-run"],
  ]);
  // The plan phase is the one that carries both kinds of knowledge: the focus skill and ADBT.
  assert.equal(phases().filter((phase) => phase.mcp?.includes("adbt")).map((phase) => phase.name).join(","), "plan");
  // The phase instruction reaches the prompt; skill bodies do not — the executor delivers those.
  assert.match(executor.calls[0].prompt, /Instruction: Discovery first/);
});

test("a green build costs no model call, and a failed one becomes the retry's context", async () => {
  const app = fixtureApp();
  writeFileSync(join(app, "apps", "vega", "manifest.toml"), 'schema-version = 1\nid = "fixture.main"\n');
  // The package a successful build would leave behind, so the second attempt can find it.
  mkdirSync(join(app, "apps", "vega", "build", "aarch64-debug"), { recursive: true });
  writeFileSync(join(app, "apps", "vega", "build", "aarch64-debug", "fixture.vpkg"), "binary");
  // Attempt 1: the build fails and the compiler says why. Attempt 2, after the model's patch: green.
  const device = startDeviceRun({
    adapter: new VegaReplayAdapter([
      { capability: "sdk_version", result: ok("0.22.5875") },
      { capability: "build", result: { code: 2, stdout: "src/App.tsx(12,5): error TS2304: Cannot find name 'Rail'.", stderr: "", timedOut: false } },
      { capability: "sdk_version", result: ok("0.22.5875") },
      { capability: "build", result: ok("build-vega completed") },
    ]),
    outDir: `${app}-out`,
    evidenceMode: "replay",
    packagePath: "",
  });
  const executor = new FakeExecutor([response({ "src/App.tsx": "fixed" })]);
  const result = await runPortPipeline({ appDir: app, outDir: `${app}-out`, findings: [], projectContext: "approved", seed: "fixed", maxCostUsd: 10, phaseNames: ["build"], executor, device, adbt: fakeAdbt() });
  assert.equal(result.phases[0].attempts, 1, "the model was called once, after the first build failed");
  // The compiler's own diagnostic reached the prompt — not "the build failed".
  assert.match(executor.calls[0].prompt, /error TS2304: Cannot find name 'Rail'/);
  assert.match(result.phases[0].failures[0].join(" "), /error TS2304/);
  // No package until the build succeeds, and the harness says so rather than guessing.
  assert.match(result.phases[0].failures[0].join(" "), /build produced no \.vpkg package/);
});

test("a build that already passes skips the model entirely", async () => {
  const app = fixtureApp();
  const out = `${app}-out`;
  const device = startDeviceRun({
    adapter: new VegaReplayAdapter([
      { capability: "sdk_version", result: ok("0.22.5875") },
      { capability: "build", result: ok("build-vega completed") },
    ]),
    outDir: out,
    evidenceMode: "replay",
    packagePath: "build/fixture.vpkg",
    appId: "fixture.main",
  });
  const executor = new FakeExecutor([]);
  const result = await runPortPipeline({ appDir: app, outDir: out, findings: [], projectContext: "approved", seed: "fixed", maxCostUsd: 10, phaseNames: ["build"], executor, device, adbt: fakeAdbt() });
  assert.equal(executor.calls.length, 0);
  assert.equal(result.phases[0].attempts, 0);
  assert.match(result.phases[0].summary, /no model call/);
  // Nothing changed, so nothing was committed on top of the import.
  assert.equal(execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: app, encoding: "utf8" }).trim(), "1");
  const transcript = readFileSync(join(out, "model-logs", "build.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(transcript.map((entry) => entry.kind), ["phase_start", "verification_start", "verification_result", "phase_complete"]);
  assert.equal(transcript.at(-1).payload.noModelCall, true);
});

test("a verify-first phase commits deterministic evidence and leaves a clean tree", async () => {
  const app = fixtureApp();
  const evidencePhase = {
    name: "evidence",
    goal: "Produce deterministic evidence.",
    instruction: "No model work.",
    skills: [],
    verifyFirst: true,
    checks: [
      {
        type: "command" as const,
        command: process.execPath,
        args: ["-e", "require('node:fs').writeFileSync('evidence.json', '{\"passed\":true}')"],
        label: "Evidence producer",
      },
      { type: "contains" as const, path: "evidence.json", value: "\"passed\":true", label: "Evidence recorded" },
    ],
  };
  const result = await runPortPipeline({
    appDir: app,
    outDir: `${app}-out`,
    findings: [],
    projectContext: "approved",
    seed: "fixed",
    maxCostUsd: 10,
    plan: [evidencePhase],
    phaseNames: ["evidence"],
    executor: new FakeExecutor([]),
  });
  assert.equal(result.phases[0].attempts, 0);
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: app, encoding: "utf8" }), "");
  assert.equal(execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: app, encoding: "utf8" }).trim(), "2");
  assert.equal(execFileSync("git", ["show", "HEAD:evidence.json"], { cwd: app, encoding: "utf8" }), "{\"passed\":true}");
});

test("a crash on the device is what the launch phase hands back to the model", async () => {
  const app = fixtureApp();
  const device = startDeviceRun({
    // The first launch check runs against the package the build phase produced, so it does not
    // rebuild — only a retry, which carries a fix, does.
    adapter: new VegaReplayAdapter([
      { capability: "sdk_version", result: ok("0.22.5875") },
      { capability: "device_status", result: ok("List of devices attached\nemulator-5554 device") },
      { capability: "install", result: ok("installed") },
      { capability: "launch", result: ok("launched") },
      { capability: "capture", result: ok("saved") },
      { capability: "pull", result: ok("pulled") },
      { capability: "logs", result: ok("PocketCinema: started\nFATAL EXCEPTION: main") },
    ], readFileSync(join(import.meta.dirname, "../../../workshop/fixtures/vega-lifecycle/launch-frame.png"))),
    outDir: `${app}-out`,
    evidenceMode: "replay",
    packagePath: "build/fixture.vpkg",
    appId: "fixture.main",
  });
  const executor = new FakeExecutor([]);
  await assert.rejects(
    () => runPortPipeline({ appDir: app, outDir: `${app}-out`, findings: [], projectContext: "approved", seed: "fixed", maxCostUsd: 10, phaseNames: ["launch"], executor, device, adbt: fakeAdbt() }),
    /fake exhausted/,
  );
  // The model was asked to fix it, and the crash line is what it was given.
  assert.match(executor.calls[0].prompt, /the app crashed after launch: fatal exception: FATAL EXCEPTION: main/);
});

test("rejects model paths outside the guarded app", async () => {
  const app = fixtureApp();
  const executor = new FakeExecutor([response({ "../escape.txt": "bad" })]);
  await assert.rejects(() => pipeline(app, executor), /Unsafe model output path/);
});

test("rejects model writes to environment files", async () => {
  const app = fixtureApp();
  const executor = new FakeExecutor([response({ ".env.local": "SECRET=bad" })]);
  await assert.rejects(() => pipeline(app, executor), /Unsafe model output path/);
});

test("rejects model writes through a symlink inside the guarded app", async () => {
  const app = fixtureApp();
  const outside = mkdtempSync(join(tmpdir(), "port-outside-"));
  symlinkSync(outside, join(app, "linked"));
  const executor = new FakeExecutor([response({ "linked/escaped.txt": "bad" })]);
  await assert.rejects(() => pipeline(app, executor), /Unsafe model output path through symlink/);
  assert.equal(existsSync(join(outside, "escaped.txt")), false);
});

test("Claude gets only read tools plus explicit ADBT MCP, and direct writes are rolled back", async () => {
  const app = fixtureApp();
  const binDir = mkdtempSync(join(tmpdir(), "fake claude with spaces-"));
  const argsPath = join(binDir, "args.txt");
  const fake = join(binDir, "claude");
  const result = JSON.stringify({
    type: "result",
    result: JSON.stringify({ summary: "plan", files: { "VEGA_PORT.md": "## TV Flow\nremote\n## Focus\nhero", "NextSteps.md": "ADBT" } }),
    total_cost_usd: 0.001,
    usage: { input_tokens: 1, output_tokens: 1 },
  });
  writeFileSync(fake, `#!/bin/sh\nprintf '%s\\n' "$@" > '${argsPath}'\nprintf 'bypass' > direct-write.txt\nprintf '%s\\n' '${result}'\n`);
  chmodSync(fake, 0o755);
  const executor = createPortExecutor({
    appDir: app,
    outDir: `${app}-out`,
    config: resolveExecutorConfig({ command: fake, model: "sonnet" }),
    cliMcpServers: { adbt: { command: "npx", args: ["-y", "@amazon-devices/amazon-devices-buildertools-mcp@1.0.5"] } },
  });
  await assert.rejects(() => runPortPipeline({
    appDir: app,
    outDir: `${app}-out`,
    findings: [],
    projectContext: "approved",
    seed: "fixed",
    maxCostUsd: 1,
    phaseNames: ["plan"],
    executor,
    liveMcp: ["adbt"],
  }), /modified the guarded copy directly/);
  assert.equal(existsSync(join(app, "direct-write.txt")), false);
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: app, encoding: "utf8" }), "");
  const cliArgs = readFileSync(argsPath, "utf8").trim().split("\n");
  assert.equal(cliArgs[cliArgs.indexOf("--tools") + 1], "Read,Grep,Glob");
  assert.deepEqual(optionValues(cliArgs, "--allowedTools"), ["Read", "Grep", "Glob", "mcp__adbt__*"]);
  assert.deepEqual(optionValues(cliArgs, "--disallowedTools"), ["Bash", "Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch"]);
  assert.equal(cliArgs.includes("*"), false);
  const mcpConfig = JSON.parse(cliArgs[cliArgs.indexOf("--mcp-config") + 1]);
  assert.deepEqual(mcpConfig.mcpServers.adbt.args, ["-y", "@amazon-devices/amazon-devices-buildertools-mcp@1.0.5"]);
});

test("recording appends turns when a run resumes", () => {
  const path = join(mkdtempSync(join(tmpdir(), "port-recorder-")), "recording.json");
  new PortRecorder(path).record(recordedTurn("analyze"));
  new PortRecorder(path).record(recordedTurn("plan"));
  assert.deepEqual((JSON.parse(readFileSync(path, "utf8")) as Array<{ phase: string }>).map((turn) => turn.phase), ["analyze", "plan"]);
});

/** The three model phases. The device phases need a device session; see the tests below. */
const MODEL_PHASES = ["analyze", "plan", "port"];

function pipeline(appDir: string, executor: PortExecutor, maxCostUsd = 10, maxAttempts?: number) {
  return runPortPipeline({ appDir, outDir: `${appDir}-out`, findings: [], projectContext: "approved", seed: "fixed", maxCostUsd, maxAttempts, phaseNames: MODEL_PHASES, executor, adbt: fakeAdbt() });
}

function fixtureApp(): string {
  const dir = mkdtempSync(join(tmpdir(), "port-pipeline-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture", type: "module", scripts: {} }, null, 2));
  writeFileSync(join(dir, "App.txt"), "original");
  mkdirSync(join(dir, "apps", "vega"), { recursive: true });
  return dir;
}

function ok(stdout: string) {
  return { code: 0, stdout, stderr: "", timedOut: false };
}

function successResponses(): PortModelResult[] {
  return [
    response({ "ANALYSIS.md": "# Analysis\n\n## Portable\nShared RN logic ports to Vega." }),
    response({
      "VEGA_PORT.md": "# Port\n\n## TV Flow\nremote\n\n## Focus\nstarts on the hero",
      "NextSteps.md": "# Next Steps\n\n## ADBT sources\nport_tv_app_to_vega.md\n\nNo unsupported mappings in this fixture.",
    }),
    response({
      "apps/vega/manifest.toml": "schema-version = 1\n[[components.interactive]]",
      "apps/vega/package.json": "{\"name\":\"vega-fixture\",\"scripts\":{\"build:debug\":\"react-native build-vega --build-type Debug\"}}",
      "apps/vega/app.json": "{\"name\":\"fixture.main\"}",
      "apps/vega/metro.config.js": "module.exports = {};",
      "package.json": "{\"type\":\"module\",\"scripts\":{\"vega:build\":\"cd apps/vega && npm run build:debug\"}}",
      "src/tv/focus-state.ts": "export const nextFocus = () => 'paper';",
      "src/App.tsx": "import { nextFocus } from './tv/focus-state';\nexport const app = nextFocus();",
      "tests/verify-tv-focus.ts": "import fs from 'node:fs'; import assert from 'node:assert/strict'; import { nextFocus } from '../src/tv/focus-state.js'; assert.equal(nextFocus(), 'paper'); fs.writeFileSync('tv-focus-result.json', JSON.stringify({ passed: true }, null, 2));",
      "TV_VERIFICATION.md": "Back restores the originating card.",
    }),
  ];
}

function recordedTurn(phase: string) {
  return { timestamp: "2026-01-01T00:00:00.000Z", phase, request: { model: "replay", system: "workshop-vega-port", messages: [] }, response: [{ type: "result", result: "{}" }], usage: { input_tokens: 0, output_tokens: 0 } };
}

function response(files: Record<string, string>): PortModelResult {
  return { text: JSON.stringify({ summary: "fixture phase", files }), costUsd: 0.01 };
}

function optionValues(args: string[], option: string): string[] {
  const start = args.indexOf(option) + 1;
  const end = args.findIndex((arg, index) => index >= start && arg.startsWith("--"));
  return args.slice(start, end < 0 ? undefined : end);
}

function fakeAdbt(): AdbtContextProvider {
  const context: AdbtPortContext = {
    schemaVersion: 1,
    mode: "replay",
    packageName: "@amazon-devices/amazon-devices-buildertools-mcp@1.0.5",
    targetPlatform: "vega_os",
    capturedAt: "2026-07-20T00:00:00.000Z",
    documents: [
      { name: "port_tv_app_to_vega.md", sha256: "router", excerpt: "Route React Native apps through the RN migration workflow." },
      { name: "port_tv_app_to_vega_fos_rn_app.md", sha256: "rn", excerpt: "Preserve portable JS and record unsupported native modules." },
    ],
  };
  return { async load() { return context; } };
}

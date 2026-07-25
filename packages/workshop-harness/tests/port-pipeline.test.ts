import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AdbtContextProvider, AdbtPortContext } from "../src/context-providers/adbt.js";
import type { PortCall, PortExecutor, PortModelResult } from "../src/port-executor.js";
import { PortReplay } from "../src/port-recorder.js";
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
  const result = await pipeline(app, executor);
  assert.deepEqual(result.phases.map((phase) => phase.name), ["analyze", "plan", "build_test"]);
  assert.equal(execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: app, encoding: "utf8" }).trim(), "4");
  assert.match(readFileSync(join(app, "src/App.tsx"), "utf8"), /focus-state/);
  assert.equal(JSON.parse(readFileSync(join(app, "tv-focus-result.json"), "utf8")).passed, true);
  assert.equal(result.adbt?.mode, "replay");
  assert.equal(JSON.parse(readFileSync(join(`${app}-out`, "adbt-port-context.json"), "utf8")).targetPlatform, "vega_os");
  // ADBT guidance is injected only into the plan phase (index 1), not analyze (0) or build_test (2).
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
  const result = await runPortPipeline({ appDir: app, outDir: `${app}-out`, findings: [], projectContext: "approved", seed: "fixed", maxCostUsd: 10, phaseNames: ["build_test"], executor: second, adbt: fakeAdbt() });
  assert.deepEqual(result.phases.map((phase) => phase.name), ["build_test"]);
  // import + analyze + plan + build_test: git init did not wipe the earlier history.
  assert.equal(execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: app, encoding: "utf8" }).trim(), "4");
  assert.match(readFileSync(join(app, "ANALYSIS.md"), "utf8"), /## Portable/);
});

test("replay serves a partial run the turns it asks for, in order", () => {
  const path = join(mkdtempSync(join(tmpdir(), "port-replay-")), "recording.json");
  writeFileSync(path, JSON.stringify(["analyze", "plan", "plan", "build_test"].map(recordedTurn)));
  const replay = new PortReplay(path);
  // A resumed run skips the phases it is not executing, and a recorded retry still replays.
  assert.equal(replay.next("plan").phase, "plan");
  assert.equal(replay.next("plan").phase, "plan");
  assert.equal(replay.next("build_test").phase, "build_test");
  assert.throws(() => replay.next("plan"), /Replay has no turn left for plan/);
});

test("phases are ordered by the plan, not by the request, and unknown names are named", () => {
  assert.deepEqual(phases(["build_test", "analyze"]).map((phase) => phase.name), ["analyze", "build_test"]);
  assert.throws(() => phases(["analyse"]), /Unknown phase analyse; use analyze, plan, build_test/);
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
  // The phase instruction reaches the prompt; skill bodies do not — the executor delivers those.
  assert.match(executor.calls[0].prompt, /Instruction: Discovery first/);
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

function pipeline(appDir: string, executor: PortExecutor, maxCostUsd = 10, maxAttempts?: number) {
  return runPortPipeline({ appDir, outDir: `${appDir}-out`, findings: [], projectContext: "approved", seed: "fixed", maxCostUsd, maxAttempts, executor, adbt: fakeAdbt() });
}

function fixtureApp(): string {
  const dir = mkdtempSync(join(tmpdir(), "port-pipeline-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture", type: "module", scripts: {} }, null, 2));
  writeFileSync(join(dir, "App.txt"), "original");
  return dir;
}

function successResponses(): PortModelResult[] {
  return [
    response({ "ANALYSIS.md": "# Analysis\n\n## Portable\nShared RN logic ports to Vega." }),
    response({
      "VEGA_PORT.md": "# Port\n\n## TV Flow\nremote",
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

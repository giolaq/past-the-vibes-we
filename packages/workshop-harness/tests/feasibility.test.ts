import assert from "node:assert/strict";
import test from "node:test";
import type { AdbtPortContext } from "../src/context-providers/adbt.js";
import type { PortExecutor, PortModelResult } from "../src/port-executor.js";
import { buildFeasibilityPrompt, FEASIBILITY_PHASE, FeasibilityOutputSchema, runFeasibility } from "../src/feasibility.js";
import type { SourceDiscovery } from "../src/source-app.js";

const source: SourceDiscovery = {
  source: "/tmp/app",
  name: "pocket-cinema",
  scripts: {},
  dependencies: ["react-native"],
  hasGit: false,
  ignored: [],
};

const adbt: AdbtPortContext = {
  schemaVersion: 1,
  mode: "replay",
  packageName: "adbt",
  targetPlatform: "vega_os",
  capturedAt: "2026-07-20T00:00:00.000Z",
  documents: [{ name: "port_tv_app_to_vega_fos_rn_app.md", sha256: "hash", excerpt: "## Library Compatibility Check\nRecord unsupported modules." }],
};

class FakeExecutor implements PortExecutor {
  calls: { phase: string; hasSchema: boolean }[] = [];
  constructor(private result: PortModelResult) {}
  async call(phase: string, _prompt: string, schema?: unknown): Promise<PortModelResult> {
    this.calls.push({ phase, hasSchema: Boolean(schema) });
    return this.result;
  }
}

test("feasibility prompt names dependencies and injects the ADBT compatibility guidance", () => {
  const prompt = buildFeasibilityPrompt(source, [], adbt);
  assert.match(prompt, /react-native/);
  assert.match(prompt, /Library Compatibility Check/);
  assert.match(prompt, /Return ONLY JSON/);
});

test("runFeasibility parses the verdict and asks the executor for its own schema", async () => {
  const executor = new FakeExecutor({ text: JSON.stringify({ verdict: "feasible-with-adapters", summary: "ok", dependencies: [{ name: "focus", status: "needs-adapter", reasoning: "isolate" }], sources: ["port_tv_app_to_vega_fos_rn_app.md"] }), costUsd: 0.002 });
  const result = await runFeasibility({ source, findings: [], adbt, executor });
  assert.equal(result.verdict, "feasible-with-adapters");
  assert.equal(result.costUsd, 0.002);
  assert.equal(executor.calls[0].phase, FEASIBILITY_PHASE);
  assert.equal(executor.calls[0].hasSchema, true);
});

test("the feasibility schema rejects an unknown verdict", () => {
  assert.throws(() => FeasibilityOutputSchema.parse({ verdict: "maybe", summary: "x", dependencies: [] }));
});

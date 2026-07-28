import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AdbtPortContext } from "../src/context-providers/adbt.js";
import type { PortExecutor, PortModelResult } from "../src/port-executor.js";
import { buildFeasibilityPrompt, FEASIBILITY_PHASE, FeasibilityOutputSchema, loadFeasibilityResult, runFeasibility } from "../src/feasibility.js";
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
  const prompt = buildFeasibilityPrompt(source, [], adbt, false, "Open details and restore focus to the originating card.");
  assert.match(prompt, /react-native/);
  assert.match(prompt, /Library Compatibility Check/);
  assert.match(prompt, /restore focus to the originating card/);
  assert.match(prompt, /Return ONLY JSON/);
});

test("runFeasibility parses the verdict and asks the executor for its own schema", async () => {
  const executor = new FakeExecutor({
    text: JSON.stringify({ verdict: "feasible-with-adapters", summary: "ok", dependencies: [{ name: "focus", status: "needs-adapter", reasoning: "isolate" }], sources: ["port_tv_app_to_vega_fos_rn_app.md"] }),
    usage: { inputTokens: 20, outputTokens: 5, cacheReadInputTokens: 0, cacheWriteInputTokens: 0, totalTokens: 25, calls: 1, turns: 2 },
    providerReportedCostUsd: 0.002,
    requestedModel: "fixture-model",
    actualModels: ["fixture-model"],
  });
  const result = await runFeasibility({ source, findings: [], adbt, executor });
  assert.equal(result.verdict, "feasible-with-adapters");
  assert.equal(result.usage.totalTokens, 25);
  assert.equal(result.providerReportedCostUsd, 0.002);
  assert.equal(executor.calls[0].phase, FEASIBILITY_PHASE);
  assert.equal(executor.calls[0].hasSchema, true);
});

test("the feasibility schema rejects an unknown verdict", () => {
  assert.throws(() => FeasibilityOutputSchema.parse({ verdict: "maybe", summary: "x", dependencies: [] }));
});

test("loads a validated feasibility result for a resumed run", () => {
  const path = join(mkdtempSync(join(tmpdir(), "feasibility-result-")), "feasibility-report.json");
  writeFileSync(path, JSON.stringify({
    schemaVersion: 1,
    verdict: "feasible",
    summary: "cached",
    dependencies: [],
    sources: ["port.md"],
    usage: { inputTokens: 10, outputTokens: 2, cacheReadInputTokens: 3, cacheWriteInputTokens: 4, calls: 1, turns: 2 },
    providerReportedCostUsd: 0.01,
    providerReportedCostSource: "provider",
    requestedModel: "requested",
    actualModels: ["actual"],
    adbt: {
      schemaVersion: 1,
      mode: "live",
      packageName: "adbt",
      targetPlatform: "vega_os",
      capturedAt: "2026-07-20T00:00:00.000Z",
      documents: [{ name: "port.md", sha256: "a".repeat(64), excerpt: "guidance" }],
    },
  }));
  const result = loadFeasibilityResult(path);
  assert.equal(result?.summary, "cached");
  assert.equal(result?.usage.totalTokens, 19);
  assert.equal(result?.providerReportedCostUsd, 0.01);
  assert.deepEqual(result?.actualModels, ["actual"]);
});

test("does not reuse malformed or provenance-free feasibility results", () => {
  const dir = mkdtempSync(join(tmpdir(), "feasibility-invalid-"));
  const malformed = join(dir, "malformed.json");
  writeFileSync(malformed, "{broken");
  assert.equal(loadFeasibilityResult(malformed), undefined);

  const noDocuments = join(dir, "no-documents.json");
  writeFileSync(noDocuments, JSON.stringify({
    schemaVersion: 1,
    verdict: "feasible",
    summary: "missing provenance",
    dependencies: [],
    sources: [],
    usage: {},
    actualModels: [],
    adbt: {
      schemaVersion: 1,
      mode: "live",
      packageName: "adbt",
      targetPlatform: "vega_os",
      capturedAt: "2026-07-20T00:00:00.000Z",
      documents: [],
    },
  }));
  assert.equal(loadFeasibilityResult(noDocuments), undefined);
});

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRunTelemetry, mergePortResults, mergeVegaResults } from "../src/run-state.js";
import type { PortResult } from "../src/port-pipeline.js";
import type { VegaPlatformResult } from "../src/platform/vega.js";

const phase = (name: string, attempts: number): PortResult["phases"][number] => ({
  name,
  attempts,
  summary: name,
  checks: [],
  failures: [],
});

test("resumed port results retain phases, ADBT evidence, and cumulative telemetry", () => {
  const first: PortResult = {
    phases: [phase("analyze", 1), phase("plan", 2)],
    usage: usage(40, 10, 2, 3),
    providerReportedCostUsd: 0.4,
    providerReportedCostSource: "recorded",
    requestedModels: ["requested-a"],
    actualModels: ["actual-a"],
    adbt: { mode: "live", documents: ["port.md"], evidence: "/out/adbt.json" },
  };
  const second: PortResult = {
    phases: [phase("port", 1)],
    usage: usage(20, 5, 1, 2),
    providerReportedCostUsd: 0.3,
    providerReportedCostSource: "provider",
    requestedModels: ["requested-a"],
    actualModels: ["actual-a"],
  };
  assert.deepEqual(mergePortResults(first, second), {
    phases: [phase("analyze", 1), phase("plan", 2), phase("port", 1)],
    usage: usage(60, 15, 3, 5),
    providerReportedCostUsd: 0.7,
    providerReportedCostSource: "mixed",
    requestedModels: ["requested-a"],
    actualModels: ["actual-a"],
    adbt: first.adbt,
  });
});

test("rerunning one phase replaces its result without inflating the phase count", () => {
  const merged = mergePortResults(
    { phases: [phase("analyze", 1), phase("plan", 1)], usage: usage(10, 2, 1, 1), requestedModels: [], actualModels: [] },
    { phases: [phase("plan", 2)], usage: usage(5, 1, 1, 2), requestedModels: [], actualModels: [] },
  );
  assert.deepEqual(merged.phases, [phase("analyze", 1), phase("plan", 2)]);
  assert.equal(merged.usage.totalTokens, 18);
  assert.equal(merged.usage.calls, 2);
  assert.equal(merged.usage.turns, 3);
});

test("resume uses telemetry recorded after the last completed phase", () => {
  const dir = mkdtempSync(join(tmpdir(), "run-telemetry-"));
  const path = join(dir, "status.json");
  writeFileSync(path, JSON.stringify({
    schemaVersion: 1,
    state: "failed",
    usage: usage(25, 5, 2, 4),
    providerReportedCostUsd: 1.25,
    providerReportedCostSource: "recorded",
    requestedModels: ["requested"],
    actualModels: ["actual"],
  }));
  assert.deepEqual(loadRunTelemetry(path), {
    usage: usage(25, 5, 2, 4),
    providerReportedCostUsd: 1.25,
    providerReportedCostSource: "recorded",
    requestedModels: ["requested"],
    actualModels: ["actual"],
  });
  writeFileSync(path, JSON.stringify({ providerReportedCostUsd: -1 }));
  assert.equal(loadRunTelemetry(path).providerReportedCostUsd, undefined);
  writeFileSync(path, "{broken");
  assert.equal(loadRunTelemetry(path).usage.totalTokens, 0);
});

test("resumed device results retain prior logs and replace checks by name", () => {
  const first = deviceResult({
    steps: [{ capability: "build", command: ["npm"], code: 0, stdout: "", stderr: "" }],
    checks: [{ name: "lifecycle", passed: true, evidence: "old" }],
    logFiles: ["/out/device.log"],
    packagePath: "/out/app.vpkg",
    appId: "app.main",
  });
  const second = deviceResult({
    steps: [{ capability: "launch", command: ["vega"], code: 0, stdout: "", stderr: "" }],
    checks: [{ name: "lifecycle", passed: true, evidence: "new" }, { name: "focus", passed: true, evidence: "ok" }],
    logFiles: [],
    packagePath: "",
    appId: "",
  });
  const merged = mergeVegaResults(first, second);
  assert.deepEqual(merged.steps.map((step) => step.capability), ["build", "launch"]);
  assert.deepEqual(merged.checks.map((check) => [check.name, check.evidence]), [["lifecycle", "new"], ["focus", "ok"]]);
  assert.deepEqual(merged.logFiles, ["/out/device.log"]);
  assert.equal(merged.packagePath, "/out/app.vpkg");
});

function deviceResult(overrides: Partial<VegaPlatformResult>): VegaPlatformResult {
  return {
    schemaVersion: 1,
    evidenceMode: "replay",
    sdkVersion: "0.23.9221",
    adbtPackage: "@amazon-devices/amazon-devices-buildertools-mcp@1.0.5",
    appId: "",
    packagePath: "",
    dwellMs: 0,
    steps: [],
    checks: [],
    logFiles: [],
    blockers: [],
    ...overrides,
  };
}

function usage(inputTokens: number, outputTokens: number, calls: number, turns: number) {
  return {
    inputTokens,
    outputTokens,
    cacheReadInputTokens: 0,
    cacheWriteInputTokens: 0,
    totalTokens: inputTokens + outputTokens,
    calls,
    turns,
  };
}

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRunCost, mergePortResults, mergeVegaResults } from "../src/run-state.js";
import type { PortResult } from "../src/port-pipeline.js";
import type { VegaPlatformResult } from "../src/platform/vega.js";

const phase = (name: string, attempts: number): PortResult["phases"][number] => ({
  name,
  attempts,
  summary: name,
  checks: [],
  failures: [],
});

test("resumed port results retain phases, ADBT evidence, and cumulative cost", () => {
  const first: PortResult = {
    phases: [phase("analyze", 1), phase("plan", 2)],
    costUsd: 0.4,
    adbt: { mode: "live", documents: ["port.md"], evidence: "/out/adbt.json" },
  };
  const second: PortResult = { phases: [phase("port", 1)], costUsd: 0.3 };
  assert.deepEqual(mergePortResults(first, second), {
    phases: [phase("analyze", 1), phase("plan", 2), phase("port", 1)],
    costUsd: 0.7,
    adbt: first.adbt,
  });
});

test("rerunning one phase replaces its result without inflating the phase count", () => {
  const merged = mergePortResults(
    { phases: [phase("analyze", 1), phase("plan", 1)], costUsd: 1 },
    { phases: [phase("plan", 2)], costUsd: 0.5 },
  );
  assert.deepEqual(merged.phases, [phase("analyze", 1), phase("plan", 2)]);
  assert.equal(merged.costUsd, 1.5);
});

test("resume uses spend recorded after the last completed phase", () => {
  const dir = mkdtempSync(join(tmpdir(), "run-cost-"));
  const path = join(dir, "status.json");
  writeFileSync(path, JSON.stringify({ schemaVersion: 1, state: "failed", costUsd: 1.25 }));
  assert.equal(loadRunCost(path), 1.25);
  writeFileSync(path, JSON.stringify({ costUsd: -1 }));
  assert.equal(loadRunCost(path), 0);
  writeFileSync(path, "{broken");
  assert.equal(loadRunCost(path), 0);
});

test("resumed device results retain prior frames and replace checks by name", () => {
  const first = deviceResult({
    steps: [{ capability: "build", command: ["npm"], code: 0, stdout: "", stderr: "" }],
    checks: [{ name: "frame", passed: true, evidence: "old" }],
    screenshots: ["/out/01.png"],
    logFiles: ["/out/device.log"],
    packagePath: "/out/app.vpkg",
    appId: "app.main",
  });
  const second = deviceResult({
    steps: [{ capability: "launch", command: ["vega"], code: 0, stdout: "", stderr: "" }],
    checks: [{ name: "frame", passed: true, evidence: "new" }, { name: "focus", passed: true, evidence: "ok" }],
    screenshots: [],
    logFiles: [],
    packagePath: "",
    appId: "",
  });
  const merged = mergeVegaResults(first, second);
  assert.deepEqual(merged.steps.map((step) => step.capability), ["build", "launch"]);
  assert.deepEqual(merged.checks.map((check) => [check.name, check.evidence]), [["frame", "new"], ["focus", "ok"]]);
  assert.deepEqual(merged.screenshots, ["/out/01.png"]);
  assert.equal(merged.packagePath, "/out/app.vpkg");
});

function deviceResult(overrides: Partial<VegaPlatformResult>): VegaPlatformResult {
  return {
    schemaVersion: 1,
    evidenceMode: "replay",
    sdkVersion: "0.22.5875",
    adbtPackage: "@amazon-devices/amazon-devices-buildertools-mcp@1.0.5",
    appId: "",
    packagePath: "",
    dwellMs: 0,
    steps: [],
    checks: [],
    screenshots: [],
    logFiles: [],
    blockers: [],
    ...overrides,
  };
}

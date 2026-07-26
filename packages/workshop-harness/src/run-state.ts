import { existsSync, readFileSync } from "node:fs";
import type { PortResult } from "./port-pipeline.js";
import type { VegaPlatformResult } from "./platform/vega.js";

export function loadPortResult(path: string): PortResult {
  if (!existsSync(path)) return { phases: [], costUsd: 0 };
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Partial<PortResult>;
    return {
      phases: Array.isArray(value.phases) ? value.phases : [],
      costUsd: typeof value.costUsd === "number" ? value.costUsd : 0,
      adbt: value.adbt,
    };
  } catch {
    return { phases: [], costUsd: 0 };
  }
}

/** Status is written after every model turn, so it may contain spend not yet in port-result. */
export function loadRunCost(path: string): number {
  if (!existsSync(path)) return 0;
  try {
    const value = (JSON.parse(readFileSync(path, "utf8")) as { costUsd?: unknown }).costUsd;
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

/** A resumed run is one audit trail: latest phase result, cumulative cost, retained ADBT evidence. */
export function mergePortResults(previous: PortResult, current: PortResult): PortResult {
  const phases = new Map(previous.phases.map((phase) => [phase.name, phase]));
  for (const phase of current.phases) phases.set(phase.name, phase);
  return {
    phases: [...phases.values()],
    costUsd: previous.costUsd + current.costUsd,
    adbt: current.adbt ?? previous.adbt,
  };
}

export function loadVegaResult(path: string): VegaPlatformResult | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as VegaPlatformResult;
    return value.schemaVersion === 1 ? value : undefined;
  } catch {
    return undefined;
  }
}

export function mergeVegaResults(previous: VegaPlatformResult | undefined, current: VegaPlatformResult): VegaPlatformResult {
  if (!previous) return current;
  const checks = new Map(previous.checks.map((check) => [check.name, check]));
  for (const check of current.checks) checks.set(check.name, check);
  return {
    ...current,
    packagePath: current.packagePath || previous.packagePath,
    appId: current.appId || previous.appId,
    dwellMs: Math.max(previous.dwellMs, current.dwellMs),
    steps: [...previous.steps, ...current.steps],
    checks: [...checks.values()],
    screenshots: [...new Set([...previous.screenshots, ...current.screenshots])],
    logFiles: [...new Set([...previous.logFiles, ...current.logFiles])],
  };
}

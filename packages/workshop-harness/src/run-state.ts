import { existsSync, readFileSync } from "node:fs";
import { addModelUsage, EMPTY_MODEL_USAGE, mergeProviderCostSource, recordedUsage, type ModelUsage, type ProviderCostSource } from "./model-telemetry.js";
import type { PortResult } from "./port-pipeline.js";
import type { VegaPlatformResult } from "./platform/vega.js";

export type RunTelemetry = {
  usage: ModelUsage;
  providerReportedCostUsd?: number;
  providerReportedCostSource?: ProviderCostSource;
  requestedModels: string[];
  actualModels: string[];
};

export function loadPortResult(path: string): PortResult {
  if (!existsSync(path)) return { phases: [], usage: { ...EMPTY_MODEL_USAGE }, requestedModels: [], actualModels: [] };
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Partial<PortResult>;
    return {
      phases: Array.isArray(value.phases) ? value.phases : [],
      usage: recordedUsage(value.usage),
      providerReportedCostUsd: finite(value.providerReportedCostUsd),
      providerReportedCostSource: costSource(value.providerReportedCostSource),
      requestedModels: strings(value.requestedModels),
      actualModels: strings(value.actualModels),
      adbt: value.adbt,
    };
  } catch {
    return { phases: [], usage: { ...EMPTY_MODEL_USAGE }, requestedModels: [], actualModels: [] };
  }
}

/** Status is written after every model call, so it may include usage not yet in port-result. */
export function loadRunTelemetry(path: string): RunTelemetry {
  if (!existsSync(path)) return { usage: { ...EMPTY_MODEL_USAGE }, requestedModels: [], actualModels: [] };
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    return {
      usage: recordedUsage(value.usage),
      providerReportedCostUsd: finite(value.providerReportedCostUsd),
      providerReportedCostSource: costSource(value.providerReportedCostSource),
      requestedModels: strings(value.requestedModels),
      actualModels: strings(value.actualModels),
    };
  } catch {
    return { usage: { ...EMPTY_MODEL_USAGE }, requestedModels: [], actualModels: [] };
  }
}

/** A resumed run is one audit trail: latest phase result, cumulative usage, retained evidence. */
export function mergePortResults(previous: PortResult, current: PortResult): PortResult {
  const phases = new Map(previous.phases.map((phase) => [phase.name, phase]));
  for (const phase of current.phases) phases.set(phase.name, phase);
  return {
    phases: [...phases.values()],
    usage: addModelUsage(previous.usage, current.usage),
    providerReportedCostUsd: addOptional(previous.providerReportedCostUsd, current.providerReportedCostUsd),
    providerReportedCostSource: mergeProviderCostSource(previous.providerReportedCostSource, current.providerReportedCostSource),
    requestedModels: [...new Set([...previous.requestedModels, ...current.requestedModels])],
    actualModels: [...new Set([...previous.actualModels, ...current.actualModels])],
    adbt: current.adbt ?? previous.adbt,
  };
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function costSource(value: unknown): ProviderCostSource | undefined {
  return value === "provider" || value === "recorded" || value === "mixed" ? value : undefined;
}

function addOptional(left?: number, right?: number): number | undefined {
  return left === undefined && right === undefined ? undefined : (left ?? 0) + (right ?? 0);
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
    logFiles: [...new Set([...previous.logFiles, ...current.logFiles])],
  };
}

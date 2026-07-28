import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import type { McpClient } from "@strands-agents/sdk";
import { AdbtPortContextSchema, extractAdbtProvenance, renderAdbtPrompt, type AdbtPortContext } from "./context-providers/adbt.js";
import type { AuditFinding } from "./contracts.js";
import { parseJsonBlock } from "./port-contract.js";
import { recordedUsage, type ModelTelemetry, type ProviderCostSource } from "./model-telemetry.js";
import { PortExecutorError, type PortExecutor } from "./port-executor.js";
import type { SourceDiscovery } from "./source-app.js";

export const FEASIBILITY_PHASE = "vega_portability_audit";

export const FeasibilityOutputSchema = z.object({
  verdict: z.enum(["feasible", "feasible-with-adapters", "blocked"]).describe("Overall port feasibility for the target platform"),
  summary: z.string().min(1).describe("One or two sentences a reviewer reads before approving the plan"),
  dependencies: z
    .array(
      z.object({
        name: z.string().min(1).describe("Dependency or platform concern the audit judged"),
        status: z.enum(["supported", "needs-adapter", "blocking"]).describe("Compatibility status against the ADBT guidance"),
        reasoning: z.string().min(1).describe("Why this status, citing the ADBT compatibility guidance"),
      }),
    )
    .describe("Per-dependency feasibility judgment"),
  sources: z.array(z.string()).default([]).describe("ADBT document names consulted"),
});

export type FeasibilityOutput = z.infer<typeof FeasibilityOutputSchema>;

export type FeasibilityResult = FeasibilityOutput & ModelTelemetry & { adbt?: AdbtPortContext };

/** Load a prior, harness-written feasibility result for a resumed run. */
export function loadFeasibilityResult(path: string): FeasibilityResult | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    if (value.schemaVersion !== 1) return undefined;
    const output = FeasibilityOutputSchema.parse(value);
    const adbt = AdbtPortContextSchema.parse(value.adbt);
    if (adbt.documents.length === 0) return undefined;
    const providerReportedCostSource = costSource(value.providerReportedCostSource);
    return {
      ...output,
      usage: recordedUsage(value.usage),
      providerReportedCostUsd: finite(value.providerReportedCostUsd),
      providerReportedCostSource,
      requestedModel: typeof value.requestedModel === "string" ? value.requestedModel : undefined,
      actualModels: Array.isArray(value.actualModels)
        ? value.actualModels.filter((model): model is string => typeof model === "string")
        : [],
      adbt,
    };
  } catch {
    return undefined;
  }
}

export function buildFeasibilityPrompt(source: SourceDiscovery, findings: AuditFinding[], adbt: AdbtPortContext, liveMcp = false, workshopBrief = ""): string {
  const guidance = liveMcp
    ? "Use the ADBT MCP tools to list and read the Vega React Native porting and library-compatibility guidance before deciding. Do not rely on model memory."
    : renderAdbtPrompt(adbt);
  return `You are judging whether the CURRENT React Native app can be ported to Vega SDK 0.23.9221. Read files before judging. Do not invent Vega support you cannot ground in the ADBT guidance.

Phase: ${FEASIBILITY_PHASE}
Goal: Decide if the port is possible and classify each dependency as supported, needs-adapter, or blocking.

App: ${source.name}
Dependencies (from package.json):
${source.dependencies.map((dependency) => `- ${dependency}`).join("\n") || "- none detected"}

Workshop brief:
${workshopBrief || "No workshop brief was supplied."}

Deterministic portability findings:
${JSON.stringify(findings, null, 2)}

${guidance}

Use the ADBT Library Compatibility guidance to judge each dependency. A dependency with no supported Vega path and no adapter is "blocking". Set verdict to "blocked" only if at least one dependency is blocking and cannot be isolated behind an adapter. Name the ADBT documents you relied on in sources.

Return ONLY JSON: {"verdict":"feasible|feasible-with-adapters|blocked","summary":"...","dependencies":[{"name":"...","status":"supported|needs-adapter|blocking","reasoning":"..."}],"sources":["port_tv_app_to_vega_fos_rn_app.md"]}.`;
}

export async function runFeasibility(options: {
  source: SourceDiscovery;
  findings: AuditFinding[];
  adbt: AdbtPortContext;
  executor: PortExecutor;
  liveMcp?: boolean;
  mcpClient?: McpClient;
  maxTokens?: number;
  maxTurns?: number;
  workshopBrief?: string;
}): Promise<FeasibilityResult> {
  const prompt = buildFeasibilityPrompt(options.source, options.findings, options.adbt, options.liveMcp, options.workshopBrief);
  const model = await options.executor.call(FEASIBILITY_PHASE, prompt, {
    schema: FeasibilityOutputSchema,
    extraTools: options.mcpClient ? [options.mcpClient] : [],
    mcp: options.liveMcp ? ["adbt"] : [],
    maxTokens: options.maxTokens,
    maxTurns: options.maxTurns,
  });
  const provenance = options.liveMcp ? extractAdbtProvenance(model.messages ?? []) : options.adbt;
  if (options.liveMcp && provenance.documents.length === 0) {
    throw new Error("The feasibility agent did not read an ADBT document through MCP");
  }
  let parsed: FeasibilityOutput;
  try {
    parsed = parseJsonBlock(model.text, FeasibilityOutputSchema, "feasibility");
  } catch (error) {
    throw new PortExecutorError(error instanceof Error ? error.message : String(error), model);
  }
  return {
    ...parsed,
    usage: model.usage,
    providerReportedCostUsd: model.providerReportedCostUsd,
    providerReportedCostSource: model.providerReportedCostSource,
    requestedModel: model.requestedModel,
    actualModels: model.actualModels,
    adbt: provenance,
  };
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function costSource(value: unknown): ProviderCostSource | undefined {
  return value === "provider" || value === "recorded" || value === "mixed" ? value : undefined;
}

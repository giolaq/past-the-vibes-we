import { z } from "zod";
import { renderAdbtPrompt, type AdbtPortContext } from "./context-providers/adbt.js";
import type { AuditFinding } from "./contracts.js";
import type { PortExecutor } from "./port-executor.js";
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

export type FeasibilityResult = FeasibilityOutput & { costUsd: number };

export function buildFeasibilityPrompt(source: SourceDiscovery, findings: AuditFinding[], adbt: AdbtPortContext): string {
  return `You are judging whether the CURRENT React Native app can be ported to Vega SDK 0.22.5875. Read files before judging. Do not invent Vega support you cannot ground in the ADBT guidance.

Phase: ${FEASIBILITY_PHASE}
Goal: Decide if the port is possible and classify each dependency as supported, needs-adapter, or blocking.

App: ${source.name}
Dependencies (from package.json):
${source.dependencies.map((dependency) => `- ${dependency}`).join("\n") || "- none detected"}

Deterministic portability findings:
${JSON.stringify(findings, null, 2)}

${renderAdbtPrompt(adbt)}

Use the ADBT Library Compatibility guidance to judge each dependency. A dependency with no supported Vega path and no adapter is "blocking". Set verdict to "blocked" only if at least one dependency is blocking and cannot be isolated behind an adapter. Name the ADBT documents you relied on in sources.

Return ONLY JSON: {"verdict":"feasible|feasible-with-adapters|blocked","summary":"...","dependencies":[{"name":"...","status":"supported|needs-adapter|blocking","reasoning":"..."}],"sources":["port_tv_app_to_vega_fos_rn_app.md"]}.`;
}

export async function runFeasibility(options: {
  source: SourceDiscovery;
  findings: AuditFinding[];
  adbt: AdbtPortContext;
  executor: PortExecutor;
}): Promise<FeasibilityResult> {
  const prompt = buildFeasibilityPrompt(options.source, options.findings, options.adbt);
  const model = await options.executor.call(FEASIBILITY_PHASE, prompt, FeasibilityOutputSchema);
  const parsed = FeasibilityOutputSchema.parse(JSON.parse(model.text.match(/\{[\s\S]*\}/)?.[0] ?? "{}"));
  return { ...parsed, costUsd: model.costUsd };
}

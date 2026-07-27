import { PortOutputSchema, parseJsonBlock } from "./port-contract.js";
import type { PortExecutor } from "./port-executor.js";

export const NAIVE_PHASE = "one_shot_port";

export const NAIVE_PROMPT = `Port this React Native app to Vega TV in one pass.
Inspect the project and return every file you think must change as a complete patch.
Do not ask questions. Do not describe a future plan. Return the patch now.`;

const EXPECTED = [
  { claim: "Vega package boundary", test: (paths: string[]) => paths.some((path) => path.startsWith("apps/vega/")) },
  { claim: "TV focus state", test: (paths: string[]) => paths.some((path) => path.includes("focus")) },
  { claim: "Remote behavior check", test: (paths: string[]) => paths.some((path) => path.includes("test") || path.includes("verify")) },
];

export async function runNaiveProbe(executor: PortExecutor, maxCostUsd = 1) {
  const model = await executor.call(NAIVE_PHASE, NAIVE_PROMPT, { maxCostUsd, attempt: 1 });
  const proposal = parseJsonBlock(model.text, PortOutputSchema, NAIVE_PHASE);
  const paths = Object.keys(proposal.files).sort();
  return {
    proposal,
    costUsd: model.costUsd,
    coverage: EXPECTED.map(({ claim, test }) => ({ claim, proposed: test(paths), proven: false })),
    missingProof: [
      "No ADBT migration document was consulted",
      "No proposed file was applied",
      "No static check or compiler ran",
      "No package was installed or launched",
      "No remote-control behavior was exercised",
    ],
  };
}

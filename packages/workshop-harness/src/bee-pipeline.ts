import { createRequire } from "node:module";
import { BEE_SERVER } from "./context-providers/bee.js";
import { BEE_SPEC_JSON, BEE_SPEC_MD, BeeSpecSchema, beeChecks, type BeeSpec } from "./bee-spec.js";
import { portPhases, type PortPhase } from "./port-pipeline.js";
import { COMMAND_TIMEOUT_MS, type PortCheck } from "./port-verification.js";

/**
 * The Bee pipeline: a conversation becomes working software, with a human between the two.
 *
 * It runs on the same engine as the port — `runPortPipeline` takes the plan — which is the
 * reusability claim of this workshop demonstrated rather than asserted. `build` and `launch` are
 * the port's own phases, reused verbatim: the conversation's changes reach a device through
 * machinery that knows nothing about Bee.
 */
export const BEE_SPEC_PHASE = "bee_spec";
export const BEE_APPLY_PHASE = "bee_apply";

const require = createRequire(import.meta.url);

/** The app's own gates, owned by the harness — never by the spec. */
function appChecks(): PortCheck[] {
  return [
    { type: "command", command: process.execPath, args: [require.resolve("typescript/bin/tsc"), "--noEmit"], label: "App still typechecks", timeoutMs: COMMAND_TIMEOUT_MS },
    { type: "command", command: process.execPath, args: ["--import", require.resolve("tsx"), "--test", "tests/catalog.test.ts"], label: "App's own tests still pass" },
  ];
}

export function beeSpecPhase(): PortPhase {
  return {
    name: BEE_SPEC_PHASE,
    goal: `Find the conversation about the Pocket Cinema mobile app and write down what it asked for, as ${BEE_SPEC_JSON} matching the required shape. The harness renders the human-readable ${BEE_SPEC_MD} from it.`,
    instruction: [
      "Use the Bee tools to find and read the conversation about Pocket Cinema. Then write a spec, not a summary.",
      "Paraphrase every request in your own words and name the conversation it came from. Never quote the transcript: this document gets committed.",
      "Give each request a file assertion that will prove it was implemented — a path that must exist, or a path that must contain a string. Choose something a reviewer would accept as evidence, and nothing you could satisfy trivially.",
      "List anything discussed that you deliberately did not bring across, and why. Personal material, anything unrelated to the app, and anything you could not attribute belong there.",
    ].join(" "),
    skills: [],
    mcp: [BEE_SERVER],
    checks: [{ type: "json_schema", path: BEE_SPEC_JSON, schema: BeeSpecSchema, label: "Spec matches the approved shape" }],
  };
}

/** The apply phase's checks come from the approved spec, plus the app's own gates. */
export function beeApplyPhase(spec: BeeSpec, appDir: string): PortPhase {
  return {
    name: BEE_APPLY_PHASE,
    goal: `Implement every request in the approved ${BEE_SPEC_MD}. Change the React Native app only — do not touch the spec, and do not add anything the spec does not ask for.`,
    instruction: [
      "The spec is the requirement and its checks are the bar. Implement each request in the app's existing style: the catalog in src/catalog.ts, the screens in src/App.tsx, the tests in tests/.",
      "Keep the app's own tests passing and the types clean. If a request needs new catalog data, add it to the catalog rather than hardcoding it in a screen.",
      "Return complete file contents for every file you touch.",
    ].join(" "),
    skills: [],
    verifyFirst: true,
    maxAttempts: 3,
    // The requirement is not editable by the thing being measured against it.
    readOnly: [BEE_SPEC_JSON, BEE_SPEC_MD],
    checks: [...beeChecks(spec, appDir), ...appChecks()],
  };
}

/**
 * The full plan. The spec phase runs alone under `--propose`; everything after it needs the
 * approved spec, so it is only assembled once one exists.
 */
export function beePhases(spec: BeeSpec | null, appDir: string): PortPhase[] {
  const port = portPhases();
  const device = ["build", "launch"].map((name) => port.find((phase) => phase.name === name)!);
  return spec ? [beeSpecPhase(), beeApplyPhase(spec, appDir), ...device] : [beeSpecPhase()];
}

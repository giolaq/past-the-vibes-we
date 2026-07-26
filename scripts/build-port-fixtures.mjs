#!/usr/bin/env node
// Regenerates the key-free recordings for the six-phase pipeline from one source of truth.
//
// A recording is a frozen set of model answers. The phases the harness runs must match the
// phases the recording names, so this script exists to keep them in step: change phases() and
// re-run it rather than hand-editing four JSON files.
//
// It produces:
//   workshop/fixtures/port-recording.json         analyze, plan, port — the happy path
//   workshop/fixtures/vega-lifecycle.json         the device turns those phases request
//   workshop/fixtures/port-retry/                 the same, with one plan check failure to repair
//   workshop/fixtures/build-retry/                the same, with one build failure to repair
//
// The device turns are synthetic: they describe a Vega toolchain this repository cannot run.
// They prove the harness's control flow, never that a device built or launched anything.
//
// Usage: node scripts/build-port-fixtures.mjs
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = join(root, "workshop/fixtures");

const source = JSON.parse(readFileSync(join(fixtures, "port-recording.json"), "utf8"));
// `port` was called `build_test` before the pipeline grew to six phases; accept either so this
// script can regenerate from its own output as well as from the original recording.
const byPhase = (...names) => source.find((turn) => names.includes(turn.phase)) ?? fail(`the source recording has no ${names.join(" or ")} turn`);
const fail = (message) => { throw new Error(message); };
const filesOf = (turn) => JSON.parse(turn.response[0].result).files;
const summaryOf = (turn) => JSON.parse(turn.response[0].result).summary;

function turn(phase, summary, files) {
  return {
    timestamp: "2026-07-20T10:00:00.000Z",
    phase,
    request: { model: "fixture", system: "workshop-vega-port", messages: [] },
    response: [{ type: "result", result: JSON.stringify({ summary, files }) }],
    usage: { input_tokens: 500, output_tokens: 240 },
    costUsd: 0.003,
  };
}

// The plan phase must now document the focus model as well as the flow: the port is a 10-foot
// interface decision before it is a build decision.
const planTurn = byPhase("plan");
const planFiles = filesOf(planTurn);
const FOCUS_SECTION = `
## Focus

Focus starts on the featured action. Down enters the first rail; left and right stop at the rail
boundaries rather than wrapping. Select opens details for the focused card, and Back returns focus
to the card the details were opened from — the transition a screenshot cannot prove.
`;
if (!planFiles["VEGA_PORT.md"].includes("## Focus")) planFiles["VEGA_PORT.md"] += FOCUS_SECTION;

const portFiles = filesOf(byPhase("port", "build_test"));
const portSummary = "Write the Vega package, the shared focus state, and the executable focus test.";

const happy = [
  turn("analyze", summaryOf(byPhase("analyze")), filesOf(byPhase("analyze"))),
  turn("plan", summaryOf(planTurn), planFiles),
  turn("port", portSummary, portFiles),
];

// The device turns, in the order the phases ask for them. build needs the SDK but no target;
// launch needs both, then install, launch, a frame, the log, and a second frame.
const ok = (stdout) => ({ code: 0, stdout, stderr: "", timedOut: false });
const DEVICE_LOG = [
  "00:00:03.114 I PocketCinema: component com.tvbuild.pocketcinema.main started",
  "00:00:03.402 I ReactNativeJS: Running application PocketCinema",
  "00:00:03.688 I PocketCinema: initial focus featured-action",
  "00:00:05.021 I PocketCinema: rail new mounted with 4 cards",
  "00:00:05.244 I PocketCinema: rail slow mounted with 4 cards",
  "00:00:07.910 I PocketCinema: frame rendered, waiting for remote input",
].join("\n") + "\n";

const buildTurns = (build) => [
  { capability: "sdk_version", result: ok("0.22.5875\n") },
  { capability: "build", result: build },
];
const launchTurns = [
  { capability: "sdk_version", result: ok("0.22.5875\n") },
  { capability: "device_status", result: ok("List of devices attached\nemulator-5554 device product:VegaVirtualDevice\n") },
  { capability: "install", result: ok("Installing/Updating pocket-cinema_aarch64.vpkg .. success\n") },
  { capability: "launch", result: ok("Launching app com.tvbuild.pocketcinema.main .. success\n") },
  { capability: "capture", result: ok("Saved /tmp/tv-build-launch.png\n") },
  { capability: "pull", result: ok("Transferred /tmp/tv-build-launch.png\n") },
  { capability: "logs", result: ok(DEVICE_LOG) },
  { capability: "capture", result: ok("Saved /tmp/tv-build-launch.png\n") },
  { capability: "pull", result: ok("Transferred /tmp/tv-build-launch.png\n") },
];

const BUILD_OK = ok("build-vega completed: pocket-cinema_aarch64.vpkg\n");
const BUILD_FAILED = {
  code: 2,
  stdout: [
    "> pocket-cinema@0.0.1 build:debug",
    "> react-native build-vega --build-type Debug",
    "",
    "error: bundling failed:",
    "src/tv/focus-state.ts(18,24): error TS2551: Property 'preferedFocus' does not exist on type 'FocusState'. Did you mean 'preferredFocus'?",
    "src/App.tsx(31,18): error TS2551: Property 'preferedFocus' does not exist on type 'FocusState'.",
  ].join("\n") + "\n",
  stderr: "react-native build-vega exited with code 2\n",
  timedOut: false,
};

function lifecycle(turns, description, screenshot = "vega-lifecycle/launch-frame.png") {
  return {
    schemaVersion: 1,
    description,
    sdkVersion: "0.22.5875",
    adbtPackage: "@amazon-devices/amazon-devices-buildertools-mcp@1.0.5",
    packagePath: "build/aarch64-debug/pocket-cinema_aarch64.vpkg",
    appId: "com.tvbuild.pocketcinema.main",
    screenshot,
    turns,
  };
}

writeFileSync(join(fixtures, "port-recording.json"), `${JSON.stringify(happy, null, 2)}\n`);
writeFileSync(join(fixtures, "vega-lifecycle.json"), `${JSON.stringify(lifecycle([...buildTurns(BUILD_OK), ...launchTurns], "Synthetic device results for the key-free six-phase run. Teaching evidence, not a device certification."), null, 2)}\n`);

// The check-failure demo for lesson 3: the first plan turn documents the Vega replacements and
// stops there, so both plan checks fail; the second turn is the full plan and passes. Generated
// rather than hand-held, because the checks it has to fail live in phases() and move.
const planRetryDir = join(fixtures, "port-retry");
mkdirSync(planRetryDir, { recursive: true });
const shortPlan = {
  ...planFiles,
  "VEGA_PORT.md": planFiles["VEGA_PORT.md"].split("## TV Flow")[0].trimEnd() + "\n",
};
if (shortPlan["VEGA_PORT.md"].includes("## TV Flow") || shortPlan["VEGA_PORT.md"].includes("## Focus")) {
  fail("the short plan turn must omit both sections the plan phase checks for");
}
writeFileSync(join(planRetryDir, "port-recording.json"), `${JSON.stringify([
  happy[0],
  turn("plan", "Map the touch screens onto Vega components.", shortPlan),
  happy[1],
  happy[2],
], null, 2)}\n`);
for (const name of ["adbt-port-context.json", "feasibility-recording.json"]) copyFileSync(join(fixtures, name), join(planRetryDir, name));

// The repair demo: the first build fails on a real-looking type error, the model fixes it, the
// rebuild passes. The model turn only exists because the build failed — verifyFirst means a
// green build never prompts at all.
const retryDir = join(fixtures, "build-retry");
mkdirSync(join(retryDir), { recursive: true });
const fixSummary = "Correct the misspelled focus property the build rejected.";
const fixFiles = {
  "src/tv/focus-state.ts": portFiles["src/tv/focus-state.ts"],
  "src/App.tsx": portFiles["src/App.tsx"],
};
writeFileSync(join(retryDir, "port-recording.json"), `${JSON.stringify([...happy, turn("build", fixSummary, fixFiles)], null, 2)}\n`);
writeFileSync(join(retryDir, "vega-lifecycle.json"), `${JSON.stringify(lifecycle([...buildTurns(BUILD_FAILED), ...buildTurns(BUILD_OK), ...launchTurns], "Synthetic device results where the first build fails and the repaired one passes.", "../vega-lifecycle/launch-frame.png"), null, 2)}\n`);
for (const name of ["adbt-port-context.json", "feasibility-recording.json"]) copyFileSync(join(fixtures, name), join(retryDir, name));

process.stdout.write(`Wrote port-recording.json (${happy.map((t) => t.phase).join(", ")}), vega-lifecycle.json, port-retry/, and build-retry/\n`);

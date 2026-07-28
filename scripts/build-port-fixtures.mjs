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
    providerReportedCostUsd: 0.003,
    requestedModel: "fixture",
    actualModels: ["fixture"],
  };
}

// The plan phase must now document the focus model as well as the flow: the port is a 10-foot
// interface decision before it is a build decision.
const planTurn = byPhase("plan");
const planFiles = filesOf(planTurn);
const structuredPlan = JSON.parse(planFiles["port-plan.json"]);
structuredPlan.screens = [
  {
    id: "home",
    source: "src/App.tsx Home",
    purpose: "Browse the featured title and catalog rails.",
    initialFocusId: "featured-action",
    focusableIds: [
      "featured-action",
      "rail-new-card-signal",
      "rail-new-card-orbit",
      "rail-new-card-paper",
      "rail-new-card-seconds",
      "rail-slow-card-garden",
      "rail-slow-card-lantern",
      "rail-slow-card-frame",
      "rail-slow-card-north",
    ],
  },
  {
    id: "details",
    source: "src/App.tsx Details",
    purpose: "Read the selected title details.",
    initialFocusId: "back-button",
    focusableIds: ["back-button"],
  },
];
structuredPlan.navigation = [
  { fromScreenId: "home", action: "select", toScreenId: "details", focusResult: "The back button receives focus." },
  { fromScreenId: "details", action: "back", toScreenId: "home", focusResult: "The originating card regains focus." },
];
planFiles["port-plan.json"] = `${JSON.stringify(structuredPlan, null, 2)}\n`;
const FOCUS_SECTION = `
## Focus

Focus starts on the featured action. Down enters the first rail; left and right stop at the rail
boundaries rather than wrapping. Select opens details for the focused card, and Back returns focus
to the card the details were opened from — a transition one visual observation cannot prove.
`;
if (!planFiles["VEGA_PORT.md"].includes("## Focus")) planFiles["VEGA_PORT.md"] += FOCUS_SECTION;
planFiles["VEGA_PORT.md"] = planFiles["VEGA_PORT.md"].replace(
  "the transition a screenshot cannot prove",
  "a transition one visual observation cannot prove",
);

const portFiles = filesOf(byPhase("port", "build_test"));
function replaceRequired(text, before, after) {
  if (!text.includes(before)) fail(`recorded App.tsx is missing ${before}`);
  return text.replace(before, after);
}
let appSource = portFiles["src/App.tsx"];
appSource = replaceRequired(
  appSource,
  "<Pressable hasTVPreferredFocus={heroPreferredFocus(focus)}",
  '<Pressable testID="featured-action" hasTVPreferredFocus={heroPreferredFocus(focus)}',
);
appSource = replaceRequired(
  appSource,
  "<ContentCard key={id} movie={movie}",
  "<ContentCard key={id} testID={`rail-${rail.id}-card-${id}`} movie={movie}",
);
appSource = replaceRequired(
  appSource,
  "function ContentCard({ movie, focused, preferred, onFocus, onPress }: { movie: Movie;",
  "function ContentCard({ testID, movie, focused, preferred, onFocus, onPress }: { testID: string; movie: Movie;",
);
appSource = replaceRequired(
  appSource,
  "return <Pressable hasTVPreferredFocus={preferred}",
  "return <Pressable testID={testID} hasTVPreferredFocus={preferred}",
);
appSource = replaceRequired(
  appSource,
  "<Pressable hasTVPreferredFocus onFocus={() => setBackFocused(true)}",
  '<Pressable testID="back-button" hasTVPreferredFocus onFocus={() => setBackFocused(true)}',
);
portFiles["src/App.tsx"] = appSource;
portFiles["tests/verify-tv-focus.ts"] = `import assert from "node:assert/strict";
import { focusItem, heroPreferredFocus, initialFocusState, moveIndex, openFrom, preferredFocus } from "../src/tv/focus-state.js";

let state = initialFocusState;
assert.equal(heroPreferredFocus(state), true, "launch prefers the featured action");
state = focusItem(state, "signal");
assert.equal(state.focusedId, "signal", "Down enters the first rail");
assert.equal(moveIndex(0, -1, 4), 0, "left stops at the first card");
assert.equal(moveIndex(2, 1, 4), 3, "right moves to the next card");
assert.equal(moveIndex(3, 1, 4), 3, "right stops at the last card");
state = openFrom(state, "paper");
assert.equal(preferredFocus(state, "paper"), true, "Back restores the originating card");
`;
portFiles["TV_VERIFICATION.md"] = `# TV Verification Matrix

| Step | Expected | Evidence |
| --- | --- | --- |
| Launch | Featured action receives initial focus | \`launch-hero\` transition |
| Down | Focus enters first rail | \`down-to-first-rail\` transition |
| Left/right | Focus stays within rail boundaries | Boundary transitions |
| Select | Details opens for current card | \`open-details\` transition |
| Back | Home returns with the originating card focused | \`back-restore\` transition |

Run \`tests/verify-tv-focus.ts\` for the host-side state contract.
The test phase relaunches the app, injects D-pad keys with \`inputd-cli\`, reads focused
\`test_id\` values from Automation Toolkit, and writes \`tv-focus-result.json\`.

The host suite cannot replace device evidence. The live lifecycle proves that the package
stayed active and that the VDA reported every expected focus transition. It does not prove
visual styling or rendering.
`;
const portSummary = "Write the Vega package, the shared focus state, and the executable focus test.";

const happy = [
  turn("analyze", summaryOf(byPhase("analyze")), filesOf(byPhase("analyze"))),
  turn("plan", summaryOf(planTurn), planFiles),
  turn("port", portSummary, portFiles),
];

// The device turns, in the order the phases ask for them. build needs the SDK but no target;
// launch needs both, then install, launch, state before and after the dwell, and the device log.
const ok = (stdout) => ({ code: 0, stdout, stderr: "", timedOut: false });
const DEVICE_LOG = [
  "00:00:03.114 I PocketCinema: component com.tvbuild.pocketcinema.main started",
  "00:00:03.402 I ReactNativeJS: Running application PocketCinema",
  "00:00:03.688 I PocketCinema: initial focus featured-action",
  "00:00:05.021 I PocketCinema: rail new mounted with 4 cards",
  "00:00:05.244 I PocketCinema: rail slow mounted with 4 cards",
  "00:00:07.910 I PocketCinema: runtime active, waiting for remote input",
].join("\n") + "\n";

const buildTurns = (build) => [
  { capability: "sdk_version", result: ok("0.23.9221\n") },
  { capability: "build", result: build },
];
const launchTurns = [
  { capability: "sdk_version", result: ok("0.23.9221\n") },
  { capability: "device_status", result: ok("List of devices attached\nemulator-5554 device product:VegaVirtualDevice\n") },
  { capability: "install", result: ok("Installing/Updating pocket-cinema_aarch64.vpkg .. success\n") },
  { capability: "launch", result: ok("Launching app com.tvbuild.pocketcinema.main .. success\n") },
  { capability: "app_status", result: ok("com.tvbuild.pocketcinema.main is running on emulator-5554\n") },
  { capability: "logs", result: ok(DEVICE_LOG) },
  { capability: "app_status", result: ok("com.tvbuild.pocketcinema.main is running on emulator-5554\n") },
];
const focusPage = (testId) => ok(JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  result: { focused: true, focusable: true, test_id: testId },
}));
const focusTurns = [
  { capability: "automation_enable", result: ok("Automation Toolkit enabled\n") },
  { capability: "page_source", result: focusPage("featured-action") },
  { capability: "key_press", result: ok("KEY_DOWN\n") },
  { capability: "page_source", result: focusPage("rail-new-card-signal") },
  { capability: "key_press", result: ok("KEY_LEFT\n") },
  { capability: "page_source", result: focusPage("rail-new-card-signal") },
  { capability: "key_press", result: ok("KEY_RIGHT\n") },
  { capability: "page_source", result: focusPage("rail-new-card-orbit") },
  { capability: "key_press", result: ok("KEY_RIGHT\n") },
  { capability: "page_source", result: focusPage("rail-new-card-paper") },
  { capability: "key_press", result: ok("KEY_RIGHT\n") },
  { capability: "page_source", result: focusPage("rail-new-card-seconds") },
  { capability: "key_press", result: ok("KEY_RIGHT\n") },
  { capability: "page_source", result: focusPage("rail-new-card-seconds") },
  { capability: "key_press", result: ok("KEY_ENTER\n") },
  { capability: "page_source", result: focusPage("back-button") },
  { capability: "key_press", result: ok("KEY_BACK\n") },
  { capability: "page_source", result: focusPage("rail-new-card-seconds") },
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

function lifecycle(turns, description) {
  return {
    schemaVersion: 1,
    description,
    sdkVersion: "0.23.9221",
    adbtPackage: "@amazon-devices/amazon-devices-buildertools-mcp@1.0.5",
    packagePath: "build/aarch64-debug/pocket-cinema_aarch64.vpkg",
    appId: "com.tvbuild.pocketcinema.main",
    turns,
  };
}

writeFileSync(join(fixtures, "port-recording.json"), `${JSON.stringify(happy, null, 2)}\n`);
writeFileSync(join(fixtures, "vega-lifecycle.json"), `${JSON.stringify(lifecycle([...buildTurns(BUILD_OK), ...launchTurns, ...launchTurns, ...focusTurns], "Synthetic device results for the key-free six-phase run. Teaching evidence, not a device certification."), null, 2)}\n`);

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
writeFileSync(join(retryDir, "vega-lifecycle.json"), `${JSON.stringify(lifecycle([...buildTurns(BUILD_FAILED), ...buildTurns(BUILD_OK), ...launchTurns, ...launchTurns, ...focusTurns], "Synthetic device results where the first build fails and the repaired one passes."), null, 2)}\n`);
for (const name of ["adbt-port-context.json", "feasibility-recording.json"]) copyFileSync(join(fixtures, name), join(retryDir, name));

process.stdout.write(`Wrote port-recording.json (${happy.map((t) => t.phase).join(", ")}), vega-lifecycle.json, port-retry/, and build-retry/\n`);

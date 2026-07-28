---
id: test
number: '06'
nav: Test the remote control
time: 25 minutes
title: Inject remote keys and verify focus
lead: Relaunch the app, send remote keys to the VDA, and read the focused test ID after each key. Compare each observed ID with the approved plan.
objective: Run the complete remote-control sequence and inspect the evidence for movement, selection, list boundaries, and Back restoration.
evidence: tv-focus-result.json contains all required focus transitions. Lesson 5 records separate lifecycle evidence.
---

:::welcome Test behavior
The test phase sends remote keys through software.
After each key, it reads the focused control from the VDA user-interface
hierarchy.
:::

## Know the focus contract

The approved `port-plan.json` supplies the expected focus IDs.
A focus ID is the stable `testID` of one React Native control.

| Action | Required result                                             |
| ------ | ----------------------------------------------------------- |
| Start  | The featured action has focus                               |
| Down   | Focus moves to the first rail                               |
| Left   | Focus stays at the left boundary                            |
| Right  | Focus moves across the rail and stops at the right boundary |
| Select | The Details screen opens                                    |
| Back   | Focus returns to the card that opened Details               |

The model cannot change the key sequence or expected IDs during the test.

## How the harness reads focus

Automation Toolkit is a VDA service.
Its `getPageSource` operation returns the user-interface hierarchy.

A focused React Native control appears with:

```json
{
  "focused": true,
  "test_id": "rail-new-card-signal"
}
```

The harness sends keys with `inputd-cli`.
It polls Automation Toolkit until the expected focus appears or the time limit
ends.

## Important harness code

The focus contract comes from the approved plan:

:::snippet packages/workshop-harness/src/platform/focus.ts (simplified)
const plan = PortPlanSchema.parse(readFile("port-plan.json"));
const home = plan.screens.find(
screen => screen.id === plan.entryScreenId,
);

return {
initialFocusId: home.initialFocusId,
firstRailFocusId: home.focusableIds.find(
id => id !== home.initialFocusId,
),
detailFocusId: details.initialFocusId,
homeFocusableIds: home.focusableIds,
};

> look: The approved plan supplies expected values. The model does not supply them during verification.
> :::

The test phase defines the device work:

:::snippet packages/workshop-harness/src/port-pipeline.ts (simplified)
{
name: "test",
mcp: [ADBT_SERVER],
device: ["launch", "focus"],
repairDevice: ["build", "launch", "focus"],
verifyFirst: true,
maxAttempts: 3,
checks: [FOCUS_TEST_CHECK, restorationCheck],
}

> look: A source repair must build, start, and pass the complete focus sequence.
> :::

## Know the test sequence

The phase performs these operations:

1. Runs the host-side focus-state test.
2. Deletes an earlier `tv-focus-result.json`.
3. Starts the app from Home.
4. Enables Automation Toolkit.
5. Reads the initial focused `test_id`.
6. Sends one remote key.
7. Reads focus again.
8. Repeats the operation for every required transition.
9. Writes a new `tv-focus-result.json`.

The first attempt does not rebuild the package.
If a failed focus check causes a source repair, the harness rebuilds and
relaunches before it tests focus again.

## Run the test phase

:::yourturn
Run the focus sequence.
Watch the VDA respond to the injected keys.
Wait for the final focus result.
:::

:::command Run the focus test
yarn tsx src/index.ts run ../../apps/pocket-cinema \
 --phases test --yes --run-id workshop
:::

:::expected
"phasesComplete":["analyze","plan","port","build","launch","test"]
:::

A passing verify-first test can report `attempts: 0`.
The phase calls a model only when the independent checks identify a source
repair.

## Inspect the focus evidence

Open `out/workshop/app/tv-focus-result.json`.

| Field                     | Meaning                                   |
| ------------------------- | ----------------------------------------- |
| `evidenceMode: "live"`    | The VDA supplied the observations         |
| `passed: true`            | Every required transition passed          |
| `transitions`             | Names of passing transitions              |
| `observations[].key`      | Key sent by the harness                   |
| `observations[].expected` | Focus ID from the approved plan           |
| `observations[].observed` | Focused `test_id` from Automation Toolkit |
| `observations[].passed`   | Comparison result                         |

Find these transition names:

```text
launch-hero
down-to-first-rail
left-boundary
right-boundary
open-details
back-restore
```

:::steps

1. Confirm that `evidenceMode` is `live`.
2. Confirm that `passed` is `true`.
3. Read each observation in order.
4. Compare `expected` and `observed`.
5. Find the `right-boundary` observation.
6. Confirm that focus stays on the final card.
7. Find the `open-details` observation.
8. Confirm that the Details screen receives focus.
9. Find the `back-restore` observation.
10. Confirm that focus returns to the originating card.
11. Open `out/workshop/vega-platform-result.json`.
12. Find the Automation Toolkit and key press steps.
    :::

## Compare before and after

Lesson 00 ran `tv-check` on the starting app.
That command reported `tvReady: false`.

Run the same check on the guarded port:

:::command Run the final TV-readiness check
yarn tsx src/index.ts tv-check ../../out/workshop/app
:::

:::expected
"tvReady": true
"failures": []
:::

The same source check now passes.
The live focus result adds device observations that `tv-check` cannot supply.

:::proof
claim: "A remote user can complete the required TV flow"
gate: "The VDA reports the expected focus after start, movement, selection, boundaries, and Back"
evidence: "tv-focus-result.json and tv-check with tvReady:true"
limit: "The UI hierarchy proves focus state, not visual focus styling"
:::

:::knowledge What happened?
The harness took expected focus IDs from the approved plan.
The harness injected keys through the VDA.
Automation Toolkit reported the focused `test_id`.
The harness compared expected and observed focus without model judgment.
:::

:::done
The focus test passes all transitions.
`tv-focus-result.json` records the sequence.
`tv-check` reports `tvReady: true`.

Live Lesson 5 evidence proves process stability on your device.
It does not prove visual rendering.
:::

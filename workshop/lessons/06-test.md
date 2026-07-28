---
id: test
number: "06"
nav: Test the remote
time: 25 minutes
title: Verify the complete focus sequence
lead: The app is active. A focus transition is the change after one remote key. Lifecycle evidence records that the app started and remained active. Now verify the complete remote sequence.
objective: Express TV navigation as observable state transitions. Do not use visual impressions as the only evidence.
evidence: tv-focus-result.json contains all required focus transitions. Lesson 5 records separate lifecycle evidence.
---

:::welcome Test behavior over time
One observation cannot show the complete focus sequence.
The screen can appear correct when focus returns to the wrong card.

This phase starts the app again.
This phase sends remote keys to the VDA.
The phase reads the focused element after each key.
The phase does not use pixels as focus evidence.
:::

## Know the focus contract

The focus contract lists the required focused control after each remote action.

:::raw
<div class="remote" aria-label="TV remote direction pad"><button>↑</button><button>←</button><button class="ok">OK</button><button>→</button><button>↓</button></div>
:::

| Action | Required result |
| --- | --- |
| Start | The featured action has focus |
| Down | Focus moves to the first rail |
| Left or right | Focus stops at the list boundaries |
| Select | The details screen opens for the focused card |
| Back | Focus returns to the same card |

:::flow
Start | Focus the featured action
Down | Enter the first rail
Select | Open the focused details
Back | Restore the same card
:::

:::predict
Which transition can fail when the screen appears correct?
:::

Automation Toolkit is a VDA service that lets the harness inspect the app interface.
JSON-RPC is a structured request-and-response format.
The Automation Toolkit JSON-RPC endpoint accepts requests from the harness.
`getPageSource` returns the user-interface hierarchy.
The hierarchy is a tree of controls, and each control is a node.
A React Native `testID` is exposed in that hierarchy as `test_id`.

D-pad means the directional pad on a TV remote.
Key injection means that the harness sends a remote key through software.
The `inputd-cli` command injects keys into the VDA.

## Follow the live verification loop

The approved `port-plan.json` supplies the expected focus IDs.
A focus ID is the stable name of one focusable control.
An assertion compares the observed focus ID with the expected focus ID.
The harness controls the key sequence and the assertions.
The model cannot replace the key sequence or the assertions.

:::flow
Plan | Read the approved focus IDs
Launch | Start from the Home screen
Observe | Read the focused test_id
Input | Send one remote key
Assert | Compare observed and expected focus
:::

| Order | Harness action | Live Vega evidence |
| --- | --- | --- |
| 1 | Reuse an attached VDA or start one | The device remains attached |
| 2 | Install the package. Start the package again. | The app is running before and after the dwell |
| 3 | Enable Automation Toolkit | The JSON-RPC endpoint accepts `getPageSource` |
| 4 | Find the node where `focused` is `true` | The node exposes a stable React Native `testID` as `test_id` |
| 5 | Send `KEY_DOWN`, `KEY_LEFT`, `KEY_RIGHT`, `KEY_ENTER`, and `KEY_BACK` | `inputd-cli` accepts each key |
| 6 | Read focus after every key | Each observation matches the approved focus ID |

The right-boundary check sends Right until focus stops moving.
The harness sends Right one more time.
The harness makes sure that focus remains on the final card.
After Select opens details, Back must restore that same card.

:::note Automation Toolkit can start after the VDA
The VDA can report that it is ready before the Automation Toolkit endpoint
accepts requests. The harness enables the toolkit.
The harness polls `getPageSource` for a specified time.
Polling means sending the request again until it succeeds or the time limit ends.
:::

:::note Fresh device evidence
The test phase deletes an earlier `tv-focus-result.json` before the test starts.
A stale passing file cannot satisfy a new run.
:::

## Trace Strands in the test phase

The test phase starts with independent focus and device checks.
Strands runs only when the independent checks identify a source repair.

:::snippet packages/workshop-harness/src/port-pipeline.ts (simplified)
{
  name: "test",
  skills: [],
  mcp: [ADBT_SERVER],
  device: ["launch", "focus"],
  repairDevice: ["build", "launch", "focus"],
  verifyFirst: true,
  maxAttempts: 3,
  checks: [FOCUS_TEST_CHECK, restorationCheck],
}
>look: After a repair, the harness rebuilds the app. The harness starts the app before it accepts the focus result.
:::

| Owner | Test action |
| --- | --- |
| Strands | Reads relevant ADBT documents. Proposes a typed repair after failed evidence. |
| ADBT MCP | Supplies current Vega focus guidance. |
| Harness and Vega CLI | Start the app again. Inject D-pad keys. Read focused `test_id` values. Repeat device checks after a repair. |
| Evidence | `tv-focus-result.json`, `TV_VERIFICATION.md`, device evidence, and the test commit |

:::note No model call is a valid result
If all focus and device checks pass, the phase does not call Strands or Claude
Code.
:::

## Run the test phase

:::yourturn
Run the focus contract.
Inspect the transition sequence.
Inspect the Back restoration.
:::

Use the same run ID.
Host-side means that the check runs on your computer without reading the VDA.
A known state means that the app starts from the Home screen before key input.
First, the phase runs the host-side focus-state contract.
Then, the phase starts the app in a known state.
The phase tests the approved plan on the VDA.
Run the command from `packages/workshop-harness`.

This first contract checks the shared focus-state module.

:::note A final repair must rebuild and start again
The first test attempt starts the Lesson 5 package again.
The first test attempt does not rebuild the package.

If the model changes source code after a failed test, the harness does not
accept only the host-side focus contract.
The harness runs this sequence:

`build -> install -> launch -> state -> log scan -> state -> keys -> focused test_id`

A late focus repair can introduce a compile or startup failure.
The test phase passes only after the repaired app compiles and stays active.
:::

:::command Run the focus test
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --phases test --yes --run-id workshop
:::

:::expected
"phasesComplete":["analyze","plan","port","build","launch","test"]
:::

:::note Use your workshop configuration
The command reads the model settings from `../../workshop.config.json`.
:::

## Inspect the focus evidence

From the repository root, open `out/workshop/app/tv-focus-result.json`.
From the harness directory, the same file is
`../../out/workshop/app/tv-focus-result.json`.
Read these fields before you inspect the generated code:
A transition record contains one key, one expected focus ID, and one observed focus ID.
The focus-failure fixture is a prepared example of an incorrect Back transition.

| Field | Evidence meaning |
| --- | --- |
| `evidenceMode: "live"` | The VDA supplied the observations |
| `passed: true` | Every required transition passed in this run |
| `transitions` | The VDA observations include the required transition names |
| `observations[].key` | The harness sent this remote key |
| `observations[].expected` | The focus ID from the approved plan |
| `observations[].observed` | The VDA reported this focused `test_id` |

Look for this sequence:

:::snippet tv-focus-result.json (abbreviated)
KEY_DOWN  -> rail-new-card-signal
KEY_LEFT  -> rail-new-card-signal
KEY_RIGHT -> each card, then the final card again
KEY_ENTER -> back-button
KEY_BACK  -> the card that opened details
>look: Expected and observed must match on every observation.
:::

:::steps
1. Open `out/workshop/app/tv-focus-result.json`.
2. Read the transitions in sequence.
3. Verify that all six transitions are present.
4. Find the `back-restore` transition.
5. Open `workshop/fixtures/focus-failure/README.md`.
6. Read the failed Back example.
7. Open the focus-state module in the guarded app.
8. Find the focus-restoration code.
9. Run `git -C ../../out/workshop/app status --porcelain`.
10. Verify that the result is empty.
11. Find the test-phase commit.
:::

:::note Know the focus API
`hasTVPreferredFocus` defines the preferred initial focus.
`onFocus` and `onBlur` report focus changes.

The workshop uses the React Native TV focus model.
The target platform is Vega.
:::

:::note Know the device evidence
The harness sends keys with `inputd-cli`.
The harness reads the UI hierarchy through Automation Toolkit `getPageSource`.

Every focusable React Native control needs a stable `testID`.
The result proves focus movement and selection, not visual focus styling.
:::

## Compare the starting app and ported app

Lesson 00 ran `tv-check` on the starting app.
The result was `tvReady: false`.

Run the same check on the ported app:

:::command Run the final TV-readiness check
yarn tsx src/index.ts tv-check ../../out/workshop/app
:::

:::expected
"tvReady": true
"failures": []
:::

The same check now passes.
The phase result is the workshop before-and-after evidence.

:::knowledge Why is Back behavior necessary?
Back must restore the user's previous navigation position.
Without restoration, the user loses context.
The screen can look correct while the interaction is incorrect.
:::

:::proof
claim: "A remote user can complete the TV flow"
gate: "The focus test observes start, movement, selection, boundaries, and Back restoration"
evidence: "tv-focus-result.json and tv-check with tvReady:true"
limit: "The UI hierarchy proves focus state, not visual styling"
:::

:::done
The focus test passes all transitions.
`tv-focus-result.json` records the sequence.
`tv-check` reports `tvReady: true`.

Live Lesson 5 evidence proves process stability on your device.
It does not prove visual rendering.
:::

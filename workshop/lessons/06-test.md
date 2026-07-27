---
id: test
number: "06"
nav: Test the remote
time: 25 minutes
title: Verify the complete focus sequence
lead: The app is active. Now verify movement, selection, boundaries, and Back behavior.
objective: Express TV navigation as observable state transitions. Do not use visual impressions as the only evidence.
evidence: tv-focus-result.json contains all focus transitions. The device frames show that the app rendered.
---

:::welcome Test behavior over time
A screenshot shows one moment.
It cannot show the complete focus sequence.

Focus can return to the wrong card.
The screenshot can still look correct.

This phase runs an executable focus test.
The device frames supply separate render evidence.
:::

## Know the focus contract

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
Which transition can look correct in a screenshot but fail for a remote user?
:::

## Run the test phase

Use the same run ID.
The phase runs the focus test from the port phase.
It also reads the frames from the launch phase.

:::command Run the focus test
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor claude-cli --model sonnet \
  --phases test --yes --run-id workshop
:::

:::note Use your selected executor
If you selected Strands, replace only the executor, provider, and model flags.
Use the values from Lesson 00.
:::

## Inspect the focus evidence

:::steps
1. Open `out/workshop/app/tv-focus-result.json`.
2. Read the transitions in sequence.
3. Verify that all six transitions are present.
4. Find the `back-restore` transition.
5. Open `workshop/fixtures/focus-failure/README.md`.
6. Read the failed Back example.
7. Open the focus-state module in the guarded app.
8. Find the focus-restoration code.
9. Run `git -C out/workshop/app status --porcelain`.
10. Verify that the result is empty.
11. Find the test-phase commit.
:::

:::note Know the focus API
`hasTVPreferredFocus` defines the preferred initial focus.
`onFocus` and `onBlur` report focus changes.

The workshop uses the React Native TV focus model.
The target platform is Vega.
:::

:::note Know the limit
The test calls the shared focus module.
It does not send physical key events to the device.

A device-input test requires an additional Vega device capability.
The workshop does not supply this capability.
:::

## Optional screenshot review

The deterministic pixel check verifies image properties.
It cannot identify every incorrect application screen.

If your Strands model supports image input, add one bounded model review:

:::command Add the optional screenshot review
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor strands --provider bedrock \
  --evaluate-screenshot --phases test --yes --run-id workshop
:::

The result appears in `vega-platform-result.json`.
Only a clear `not-app` result blocks the run.
The deterministic pixel check always runs.

## Compare the starting app and ported app

Lesson 00 ran `tv-check` on the starting app.
The result was `tvReady: false`.

Run the same check on the ported app:

:::command Run the final TV-readiness check
yarn --cwd packages/workshop-harness tsx src/index.ts tv-check out/workshop/app
:::

:::expected
"tvReady": true
"failures": []
:::

The same check now passes.
This result is the workshop before-and-after evidence.

:::knowledge Why is Back behavior necessary?
Back must restore the user's previous navigation position.
Without restoration, the user loses context.
The screen can look correct while the interaction is incorrect.
:::

:::proof
claim: "A remote user can complete the TV flow"
gate: "The focus test observes start, movement, selection, boundaries, and Back restoration"
evidence: "tv-focus-result.json and tv-check with tvReady:true"
limit: "The host-side test does not prove physical key delivery"
:::

:::done
The focus test passes all transitions.
`tv-focus-result.json` records the sequence.
`tv-check` reports `tvReady: true`.

Only live Lesson 5 evidence proves that the screenshots came from your device.
:::

:::fallback
If no device is available, run the same focus check in:

`workshop/checkpoints/vega-buildable/app`
:::

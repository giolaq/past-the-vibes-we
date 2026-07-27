---
id: test
number: "06"
nav: Test the remote
time: 25 minutes
title: Test the flow, not one screenshot
lead: The app runs. The last phase asks the question a running app cannot answer by itself — does the remote control actually work.
objective: Express TV navigation as observable state transitions instead of visual impressions.
evidence: tv-focus-result.json records launch, movement, selection, and focus restoration after Back, alongside the device frames.
---

:::welcome The bug a screenshot cannot see
Focus landing on the wrong card looks exactly like focus landing on the right one, in a still image. So the final phase does two things that prove different claims: an executable test walks the focus contract transition by transition, and the device frames show the app was rendering while it did. Neither is sufficient alone, which is the whole point of this lesson.
:::

:::concept What a screenshot cannot show
TV quality is temporal. A screenshot can show where focus is now, but not whether focus moved correctly, respected boundaries, opened the right screen, or returned to the same card.
:::

:::raw
<div class="remote" aria-label="TV remote direction pad"><button>↑</button><button>←</button><button class="ok">OK</button><button>→</button><button>↓</button></div>
:::

| Action | Expected result |
| --- | --- |
| Launch | Featured action has focus |
| Down | Focus enters the first rail |
| Left / right | Focus stops at list boundaries |
| Select | Details opens for the focused card |
| Back | The same card regains focus |

:::flow
Launch | Featured action focused
Down | Enter first rail
Select | Open focused details
Back | Restore the same card
:::

:::predict
Which transition is most likely to pass a screenshot review but fail for a real remote user?
:::

## Run the test phase

:::yourturn
Run phase 6 onto the same run id. It executes the focus test the port phase wrote, and reads the frames the launch phase captured.
:::

:::note Keep your executor choice
The command shows Claude Code. If you selected Strands, replace only
`--executor claude-cli --model sonnet` with your provider and model flags from lesson 0.
:::

:::command Prove the remote contract
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor claude-cli --model sonnet \
  --phases test --yes --run-id workshop
:::

:::steps
1. Open `out/workshop/app/tv-focus-result.json` and read it as a sequence, not a score. Six transitions must be present, including `back-restore`.
2. Open `workshop/fixtures/focus-failure/README.md` and find the failed Back transition — what a broken contract looks like.
3. Trace the focus state and restoration code in the guarded app. One module answers both the app and the test.
4. Run `git -C out/workshop/app status --porcelain`. It is empty: the harness committed the deterministic focus evidence even though this green phase needed no model call.
:::

:::note Where the focus props come from
`hasTVPreferredFocus` and the `onFocus`/`onBlur` handlers are React Native's TV focus model — see [react-native-tvos](https://github.com/react-native-tvos/react-native-tvos) for the general TV story. This workshop targets Vega, not that fork, but the focus model is the same.
:::

:::note The honest limit of this phase
The test drives the focus module, not the device's input system. It proves the contract the app implements; it does not press a physical button. Injecting real remote input needs a device input capability this workshop does not ship — if your image supports it, a new `VegaCapability` is where it plugs in, and the frames you already capture become per-step evidence.
:::

## Optional: ask a model what the screen shows

The pixel gate is deterministic and cheap, and it stops at what pixels can prove. It cannot tell a rendered home screen from a rendered error dialog. If you have a multimodal model configured, add one bounded call:

:::command Add the model review
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor strands --provider bedrock \
  --evaluate-screenshot --phases test --yes --run-id workshop
:::

The verdict lands in `vega-platform-result.json` as `screenshot review`, and only a clear `not-app` blocks the run. Note where authority sits: the model reports what it sees, your harness decides what that means. The deterministic gate runs either way.

## Close the loop you opened in lesson 0

In lesson 0 you ran `tv-check` against the starter app and got `tvReady: false` with the full failure list. Run the same command against the ported copy:

:::command The before/after: same check, ported app
yarn --cwd packages/workshop-harness tsx src/index.ts tv-check out/workshop/app
:::

:::expected
"tvReady": true
"failures": []
:::

Every failure from lesson 0 was produced by the six phases and is now verified mechanically. That pair of outputs is the workshop's before-and-after photo.

:::knowledge Why is Back part of the focus contract?
Returning to a screen without restoring the user's prior focus loses navigation context. The UI may look correct while the remote interaction is broken.
:::

:::proof
claim: "A remote user can complete the TV flow"
gate: "The executable focus contract observes launch, movement, selection, boundaries, and Back restoration"
evidence: "tv-focus-result.json + tv-check tvReady:true"
limit: "This host-side contract proves the shared focus model; only a separate device-input test can prove physical key delivery"
:::

:::done
On either path, the focus check passes the full transition sequence, `tv-focus-result.json` records it, and `tv-check` reports `tvReady: true`. Only a prior lesson 5 result marked `evidenceMode: live` lets you add that the two frames came from your device; replay frames prove the gate and report flow only.
:::

:::fallback
Run the same check in `checkpoints/vega-buildable/app` — no device required.
:::

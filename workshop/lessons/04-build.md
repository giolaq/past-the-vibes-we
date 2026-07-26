---
id: build
number: "04"
nav: Build until it compiles
time: 30 minutes
title: Let the compiler be the judge
lead: Now the check stops being a grep and becomes a real build — and the failure the model gets back is the compiler's own diagnostics.
objective: Run a loop whose pass condition is a produced artifact, and trace real build output into the next prompt.
evidence: A .vpkg exists, and port-result.json records the build failures that were repaired to get it.
---

:::welcome The first check that can't be talked around
Everything up to here could be satisfied by a file containing the right words. A build cannot. It either produces a `.vpkg` or it does not, and when it does not it says exactly why, in a language the model can act on. This lesson is the same loop you already know — propose, verify, retry with the exact failure — with the strongest possible verifier plugged into it.
:::

:::note This lesson needs the Vega SDK {warning}
Phases 4, 5, and 6 run real Vega tooling: SDK `0.22.5875` for this one, and an attached virtual device for the next two. If your setup is incomplete, the recorded fallback at the bottom of this page runs the identical control flow with recorded device results — and says so.
:::

:::concept What changes when the check executes
Three things the earlier phases didn't need. The check runs a process with a 15-minute ceiling instead of reading a file. Its output is bounded before it reaches a prompt — a failing build can print megabytes, and the agent has a 40,000-token budget, so `runProcess` keeps the head and the tail and elides the middle. And the phase checks **before** it prompts: a build that already passes never reaches the model, so a green phase costs nothing.
:::

:::flow
Verify | Run the build first
Fail | Keep the compiler's output
Prompt | Send that exact text
Patch | Write, rebuild, judge again
:::

:::predict
The build fails with a type error in `focus-state.ts`. What is the harness allowed to send the model, and what would be useless to send?
:::

## Run the build phase

:::yourturn
Run phase 4 onto the same run id. If the port phase produced a clean package this passes without calling the model at all — watch for that.
:::

:::command Build the Vega package
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor claude-cli --model sonnet \
  --phases build --yes --run-id workshop
:::

:::steps
1. Read `out/workshop/port-result.json`. If the build phase shows `"attempts": 0` and `already satisfied, no model call`, the package built first time and the phase spent nothing.
2. Find the `.vpkg` under `out/workshop/app/apps/vega/build/`. That file is the phase's pass condition — not a log line saying it worked.
3. Open `out/workshop/vega-platform-result.json` and read the `steps`. Each one records the exact command, its exit code, and its output.
:::

## Watch a broken build get repaired

The recorded fixture forces the interesting case: the first build fails on a misspelled focus property, exactly the way a real one would.

:::command Replay a failing build and its repair
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/build-retry/port-recording.json \
  --platform-replay ../../workshop/fixtures/build-retry/vega-lifecycle.json \
  --yes
:::

:::expected
build needs a fix:
  - build failed: react-native build-vega exited with code 2
src/tv/focus-state.ts(18,24): error TS2551: Property 'preferedFocus' does not exist on type 'FocusState'. Did you mean 'preferredFocus'?
:::

:::steps
1. That diagnostic is what the model receives. Open `prompt()` in `src/port-pipeline.ts` and confirm nothing summarizes or paraphrases it on the way.
2. Open `port-result.json` and find the build phase's `failures` — the rejected attempt is kept, so the repair is auditable after the terminal has scrolled away.
3. Notice what the harness did **not** do: it did not lower the bar. The check is the same build either way.
:::

:::note A retry keeps the build directory
`reset()` reverts the model's files between attempts, but `apps/vega/build` and `node_modules` are excluded from the clean. Rebuilding from zero on every attempt would cost minutes each time and throw away the artifact the retry is trying to fix.
:::

:::knowledge Why does this phase check before it calls the model?
Because most of the time there is nothing to fix. Prompting first would spend a model call to be told the build is fine. Checking first means the loop only pays when something actually failed — and it makes the failure, not the schedule, the reason a model runs.
:::

:::done
`out/<runId>/app/apps/vega/build/` contains a `.vpkg`, and if the build ever failed, `port-result.json` shows the compiler text that fixed it.
:::

:::fallback
Without the Vega SDK, run the recorded lifecycle. It exercises the identical loop against recorded build results, and the run is labeled `evidenceMode: replay` — control flow, not proof that anything compiled:
:::

:::command Fallback: recorded build results
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
  --platform-replay ../../workshop/fixtures/vega-lifecycle.json \
  --phases build --yes --run-id workshop
:::

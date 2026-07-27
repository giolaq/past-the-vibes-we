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
The build fails with `Type 'number' is not assignable to type 'string'`. What exact information
should reach the model, and why is “the build failed, try again” not enough?
:::

## Create the failure, then repair it live

:::yourturn
Inject one known TypeScript fault into the guarded copy, then run the normal build phase. The fault
command refuses to touch your source app. The compiler, not a recording or a lucky model mistake,
starts the retry loop.
:::

:::note Keep your executor choice
The command shows Claude Code. If you selected Strands, replace only
`--executor claude-cli --model sonnet` with your provider and model flags from lesson 0.
:::

:::command Inject the workshop fault into the guarded app
yarn --cwd packages/workshop-harness tsx src/index.ts inject-build-failure workshop --yes
:::

:::expected
"expectedDiagnostic":"Type 'number' is not assignable to type 'string'"
:::

:::command Run the live compiler-repair loop
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor claude-cli --model sonnet \
  --phases build --yes --run-id workshop
:::

:::expected
build needs a fix:
  - build failed: react-native build-vega exited with code 2
src/workshop-build-break.ts(2,14): error TS2322: Type 'number' is not assignable to type 'string'.
:::

:::steps
1. Watch the build fail before the first model call. The phase verifies first, so the error is the reason the model runs.
2. Open `out/workshop/model-logs/build.jsonl`. Find the failed `verification_result`, then the model request containing the same compiler text.
3. Open `out/workshop/port-result.json`. The rejected failure remains beside the passing attempt and its cost.
4. Run `git -C out/workshop/app status --porcelain`: empty. The phase removed the injected file and import, built successfully, and committed the verified repair.
5. Find the `.vpkg` under `out/workshop/app/apps/vega/build/`. That artifact, not the model response, is the pass condition.
:::

:::note Why this demo is deterministic
`inject-build-failure` adds a tiny invalid TypeScript module and commits it only inside
`out/workshop/app`. The build phase also checks that the teaching fault and its import are gone.
Every live provider therefore receives a real compiler failure, while the acceptance bar remains
the normal Vega build plus a clean tree.
:::

:::knowledge Why does this phase check before it calls the model?
Because most of the time there is nothing to fix. Prompting first would spend a model call to be told the build is fine. Checking first means the loop only pays when something actually failed — and it makes the failure, not the schedule, the reason a model runs.
:::

:::proof
claim: "The Vega app builds"
gate: "The real Vega build exits successfully and produces a .vpkg"
evidence: "vega-platform-result.json + apps/vega/build/*.vpkg"
limit: "A package can compile and still crash immediately after launch"
:::

:::done
Live: `out/<runId>/app/apps/vega/build/` contains a `.vpkg`, and `vega-platform-result.json` says `evidenceMode: live`. Replay: the recorded build gate completes and preserves any failure text, but no local `.vpkg` is expected and you make no compile claim.
:::

:::fallback
Without the Vega SDK, use the deterministic recorded repair in a separate run. It demonstrates
failure context and retry control, but it does not produce a local package:
:::

:::command Fallback: recorded compiler repair
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/build-retry/port-recording.json \
  --platform-replay ../../workshop/fixtures/build-retry/vega-lifecycle.json \
  --run-id build-fallback --yes
:::

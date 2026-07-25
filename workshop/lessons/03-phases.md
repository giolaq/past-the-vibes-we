---
id: phases
number: "03"
nav: The loop
time: 30 minutes
title: Close the loop around the model
lead: "Now we let the model change code — inside walls: a guarded copy, a typed patch, a check, one retry carrying the exact failure, and a commit for work that passed."
objective: Trace a requirement through a failed check, a contextual retry, and a committed result.
evidence: The failed check appears in your terminal and in port-result.json, and the second attempt is committed.
---

:::welcome The loop is the harness
Lesson 1 gave us a model call. Lesson 2 gave us a check. This lesson wires them into a cycle, and that cycle is the thing you take home: propose, write, verify, and on failure retry with the exact reason — never with "try again". We run it one phase at a time, so you can watch each part arrive. The model still never writes a file; the harness does, and only after the check agrees.
:::

:::flow
Propose | Model returns a typed patch
Write | Harness writes inside the guarded copy
Verify | Checks run and produce exact failures
Retry | The failure text joins the next prompt
Commit | Only passing work reaches Git
:::

:::predict
The plan phase must document the remote flow. Predict what the check looks for, and what the harness should send back to the model when the first attempt omits it.
:::

## Run one phase

:::yourturn
Run the first phase of the real port and nothing else. `--phases` takes the subset you want, so you can meet the pipeline one piece at a time.
:::

:::command Claude Code CLI
# Claude Code CLI. One phase, on a guarded copy of your app.
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor claude-cli --model sonnet \
  --phases analyze --yes --run-id lesson3
:::

:::command Strands + Bedrock
# Strands + Bedrock
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2 \
  --phases analyze --yes --run-id lesson3
:::

:::steps
1. Open `packages/workshop-harness/out/lesson3/app` — a copy. Run `git status` on `apps/pocket-cinema` and confirm your app never moved.
2. Run `git log --oneline` inside that copy. There are two commits: the imported source, and the phase that passed.
3. Open `ANALYSIS.md` in the copy. That file is the model's patch, written by the harness after the check passed.
:::

:::note Why a copy, and why Git
The guarded copy is where the model's authority ends. Git inside it is not decoration: a failed attempt is reset to the phase's starting commit, so a rejected patch leaves nothing behind. Rollback and record are the same mechanism.
:::

## Watch a check fail and drive a retry

A live model often passes on the first try, which is a bad way to learn what happens when it doesn't. The committed recording forces the interesting case: its first plan attempt writes a plan with the remote-flow section missing.

:::command Replay the failed check and the repair
# The recording's first plan attempt omits the required section.
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-retry/port-recording.json \
  --phases analyze,plan --yes
:::

:::expected
plan attempt 1 failed:
  - TV flow documented: VEGA_PORT.md must contain "## TV Flow"
:::

:::visual
src: assets/retry-terminal.png
alt: Terminal output showing the plan check failing, the failure recorded in port-result.json, and the run completing after the second attempt
label: Actual replay output
caption: "One useful failure. The retry receives evidence — the exact check that failed — not the instruction 'try again'."
:::

## Follow the evidence yourself

:::steps
1. Find the failing check in your terminal output. That text came from `verifyPort()`, the function you read in lesson 2.
2. Open `out/<runId>/port-result.json`. The plan phase records `attempts: 2` and keeps the failures of the rejected attempt.
3. Open `prompt()` in `src/port-pipeline.ts` and find where a previous attempt's failures are appended. That is the same text, on its way back to the model.
4. Open `writeOutput()` in the same file. Every path the model proposes must resolve inside the guarded copy, and `.git`, `node_modules`, and `.env` are refused however they are spelled.
:::

## Stop it, then bring it back

:::yourturn
Long runs die. Rather than hope, stop this one on purpose and continue it — a port that already cost you money should never be repeated from the top.
:::

:::command Resume the same run with the next phase
# Same run id: the guarded copy and its history are reused, not rebuilt.
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor claude-cli --model sonnet \
  --phases plan --yes --run-id lesson3
:::

:::steps
1. Run `git log --oneline` in the copy again. The analyze commit is still there, with plan on top of it.
2. Open `out/lesson3/status.json` and read `phasesComplete`. It remembers both phases, not just this invocation's.
3. Open `out/lesson3/report.md` and find the line saying the source was not copied again.
:::

## The loop cannot run away

One retry is a teaching default, not a law. `--max-attempts N` raises it and `--until-done` removes the cap, and the loop still has three exits — none of which is the model's opinion:

:::steps
1. The checks pass. The verifier decides the phase is done.
2. The attempt budget runs out, or the cost cap trips and the run aborts with a clean tree.
3. The same failures come back twice in a row. No progress, so more attempts only spend money, and the loop stops.
:::

:::knowledge Why pass the exact failure into the retry instead of saying try again?
The exact failure narrows the problem, preserves the original requirement, and makes the retry explainable afterwards. A generic retry buys another guess at the same price.
:::

:::done
You can trace one requirement from a failed check, through the retry that carried it, to a commit — and you resumed a run without repeating a phase you already paid for.
:::

:::fallback
Every command here works on the replay path. Swap the executor flags for `--replay ../../workshop/fixtures/port-recording.json`, or use the retry recording above.
:::

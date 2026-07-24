---
id: verify
number: "02"
nav: Check and retry
time: 20 minutes
title: Turn a failure into a useful retry
lead: Run a mechanical check and send its exact failure into one bounded retry.
objective: Trace a requirement through a failed check, a contextual retry, and a passing result.
evidence: The failed grep message appears in the retry request and the second attempt passes.
---

:::concept Why this step exists
A retry is useful only when it carries new information. The check turns a vague failure into precise context the next attempt can act on.
:::

:::flow
Propose | Plan omits a requirement
Verify | Grep returns an exact failure
Retry | Failure text joins the prompt
Accept | Original check passes
:::

:::predict
The plan phase must document the remote control. Predict what the check greps for, and what happens if the model's first plan omits it.
:::

## Run it against a live model

A live model may pass every check on the first try. To see the retry loop deterministically, use the committed recording — its first plan attempt is missing the required section, so the harness feeds the exact failure back and the second attempt fixes it.

:::command Claude Code CLI
# Claude Code CLI
yarn --cwd packages/mini-harness tsx steps/02-verify-loop/index.ts run \
  steps/02-verify-loop/fixtures/phases.json \
  --executor claude-cli --model sonnet
:::

:::command Strands + Bedrock
# Strands + Bedrock
yarn --cwd packages/mini-harness tsx steps/02-verify-loop/index.ts run \
  steps/02-verify-loop/fixtures/phases.json \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2
:::

## See the retry loop (recording)

:::command Replay the failed check and repair
# Fallback: the committed recording forces the check to fail, then pass
yarn --cwd packages/mini-harness tsx steps/02-verify-loop/index.ts run \
  steps/02-verify-loop/fixtures/phases.json \
  --replay steps/02-verify-loop/fixtures/retry-recording.json
:::

:::expected
Pattern "## Remote Control" not found in out/TV_PORT_PLAN.md
:::

:::visual
src: assets/retry-terminal.png
alt: Terminal output showing the plan verification failure, the same failure used as retry context, and the repaired plan
label: Actual replay output
caption: "The recording forces one useful failure. Notice that the retry receives evidence, not the vague instruction 'try again'."
:::

## Follow the evidence

:::steps
1. Find the failed `grep` check in the output.
2. Open `steps/02-verify-loop/verify.ts` and locate that check.
3. Find the same failure text in the retry request.
4. Open `out/TV_PORT_PLAN.md` and confirm the second attempt adds the remote control section.
:::

## Stretch: loop until the check passes

One retry is a teaching default, not a law. Step 2 takes `--max-attempts`, so the same loop can run until the check goes green:

:::command Loop with a bigger attempt budget (live model)
yarn --cwd packages/mini-harness tsx steps/02-verify-loop/index.ts run \
  steps/02-verify-loop/fixtures/phases.json \
  --executor claude-cli --model sonnet \
  --max-attempts 5
:::

The loop still can't run away, because it has three exits and "done" is never the model's opinion:

:::steps
1. The check passes — the verifier decides the loop is done.
2. The attempt budget runs out.
3. The same failure comes back twice in a row — no progress, so more attempts only spend money. The loop stops instead of retrying the failure the model can't fix.
:::

The complete harness has the same extension: the port command takes `--max-attempts N` or `--until-done`, and its loop answers to the cost cap and the same no-progress rule. (On replay this lesson always ends after one repair — the recording holds exactly two turns.)

:::knowledge Why pass the exact failure into the retry instead of saying try again?
The exact failure narrows the problem, preserves the original requirement, and makes the retry explainable. A generic retry buys another guess.
:::

:::done
You can trace requirement → failed check → retry → passing output.
:::

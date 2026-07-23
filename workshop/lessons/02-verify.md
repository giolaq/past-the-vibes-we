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

## Follow the evidence

:::steps
1. Find the failed `grep` check in the output.
2. Open `steps/02-verify-loop/verify.ts` and locate that check.
3. Find the same failure text in the retry request.
4. Open `out/TV_PORT_PLAN.md` and confirm the second attempt adds the remote control section.
:::

:::knowledge Why pass the exact failure into the retry instead of saying try again?
The exact failure narrows the problem, preserves the original requirement, and makes the retry explainable. A generic retry buys another guess.
:::

:::done
You can trace requirement → failed check → retry → passing output.
:::

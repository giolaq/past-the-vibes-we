---
id: phases
number: "03"
nav: Phases and resume
time: 25 minutes
title: Split the work and resume it
lead: "Long runs fail, so now we make failure survivable: phases for small changes, commits for verified code, checkpoints for run progress."
objective: Explain the different jobs of a phase, a checkpoint, and a Git commit.
evidence: A paused run resumes at focus, while the Git log keeps one commit per completed phase.
---

:::welcome Plan for the run that dies halfway
Long agent runs fail — that's not pessimism, it's Tuesday. So we're going to give the harness three different memories, and the point of this lesson is telling them apart: small phases limit the damage, checkpoints remember how far the run got, and commits preserve code that already passed its checks. You'll stop a run on purpose and bring it back.
:::

:::flow
Analyze | Check and commit
Plan | Check, commit, checkpoint
Pause | Process may stop safely
Resume | Run build_test only
:::

:::predict
The run stops after plan. Which phase should resume next, and which phases must not run again?
:::

## Run it, then stop it on purpose

:::yourturn
Run the phased harness and pause it after the plan phase, so you can look at the checkpoint before anything else happens.
:::

:::command Claude Code CLI
# Claude Code CLI. Stop after the plan phase to inspect the checkpoint.
yarn --cwd packages/mini-harness tsx steps/03-phases/index.ts run \
  steps/03-phases/fixtures/phases.json \
  --executor claude-cli --model sonnet \
  --stop-after plan
:::

:::command Strands + Bedrock
# Strands + Bedrock
yarn --cwd packages/mini-harness tsx steps/03-phases/index.ts run \
  steps/03-phases/fixtures/phases.json \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2 \
  --stop-after plan
:::

:::expected
Paused after plan.
checkpoint.json: { "nextPhase": 2 }
:::

## Look at what it remembered

:::steps
1. Open `out/checkpoint.json`.
2. Use `phases.json` to confirm index 2 is `build_test`.
3. Open the Git log and find commits for analyze and plan.
:::

:::command Resume the same run
# Resume the same run; only build_test runs.
yarn --cwd packages/mini-harness tsx steps/03-phases/index.ts run \
  steps/03-phases/fixtures/phases.json \
  --executor claude-cli --model sonnet \
  --resume
:::

## Now bring it back

:::steps
1. Confirm only build_test ran after resume.
2. Open the final checkpoint and Git log.
3. Explain what progress belongs in the checkpoint and what evidence belongs in Git.
:::

:::knowledge Why keep both a checkpoint and per-phase commits?
The checkpoint tells the engine where to continue. Git records the exact verified code state for each completed phase. They answer different recovery questions.
:::

:::done
After resume, only build_test runs — analyze and plan are not repeated.
:::

:::fallback
If the live model is blocked, use the recording (then resume with --replay ... --resume):
:::

:::command Fallback: replay
# Fallback, then resume with --replay ... --resume
yarn --cwd packages/mini-harness tsx steps/03-phases/index.ts run \
  steps/03-phases/fixtures/phases.json \
  --replay steps/03-phases/fixtures/demo-recording.json \
  --stop-after plan
:::

# 3. Phases, Checkpoints, and Cost

## Goal

Split a larger task into phases and see how the harness resumes without repeating finished work.

## Do this

1. Run the phased example against a live model, pausing after the plan phase:

```sh
# Claude Code CLI (or swap in the Strands + Bedrock flags from earlier lessons)
yarn --cwd packages/mini-harness tsx steps/03-phases/index.ts run \
  steps/03-phases/fixtures/phases.json \
  --executor claude-cli --model sonnet \
  --stop-after plan
```

2. Confirm the command says `Paused after plan`.
3. Open the generated checkpoint. Find the completed phase, next phase, summaries, and cost.
4. Resume from the checkpoint:

```sh
yarn --cwd packages/mini-harness tsx steps/03-phases/index.ts run \
  steps/03-phases/fixtures/phases.json \
  --executor claude-cli --model sonnet \
  --resume
```

5. Open the generated Git log and find one commit for each successful phase. Confirm the first two commits were not repeated.

## Why this matters

Phases limit the size of each change. Checkpoints save run progress. Commits preserve verified code states. Cost remains visible across the run.

## You are done when

The first command stops after `plan`; the second starts at `build_test`; completed phases are not repeated.

## If blocked

If the live model is unavailable, run the same exercise from the committed recording:

```sh
yarn --cwd packages/mini-harness tsx steps/03-phases/index.ts run \
  steps/03-phases/fixtures/phases.json \
  --replay steps/03-phases/fixtures/demo-recording.json \
  --stop-after plan
```

```sh
yarn --cwd packages/mini-harness tsx steps/03-phases/index.ts run \
  steps/03-phases/fixtures/phases.json \
  --replay steps/03-phases/fixtures/demo-recording.json \
  --resume
```

Read `workshop/fixtures/resume/README.md` for the checkpoint details.

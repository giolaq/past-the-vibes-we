# 1. From Prompt to Loop

## Goal

Run the smallest possible agent program against a React Native app, then identify what its output does not prove.

## Do this

1. Run Step 1 against a live model with your chosen executor:

```sh
# Claude Code CLI
yarn --cwd packages/mini-harness tsx steps/01-single-agent/index.ts run \
  steps/01-single-agent/fixtures/phases.json \
  --executor claude-cli --model sonnet
```

```sh
# Strands + Bedrock
yarn --cwd packages/mini-harness tsx steps/01-single-agent/index.ts run \
  steps/01-single-agent/fixtures/phases.json \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2
```

2. Open `steps/01-single-agent/index.ts`.
3. Find where it builds the prompt, gets a response, and writes files.
4. Open the generated `out/ANALYSIS.md` (the `analyze` phase output).
5. Write down three things the model could claim without proving. Examples: the analysis is accurate, the described component really exists, or a part it called "portable" actually runs on TV.

## Why this matters

The toy target is already React Native. Later lessons add verification, skills, Strands, ADBT, and platform work around the same kind of app. The concerns become more platform-specific, while the core loop remains phase, skill, executor, check.

A model response can look good and still be wrong. A harness adds checks, limits, and evidence around the model call.

## You are done when

You can point to the model boundary and name at least three missing checks.

## If blocked

If the live model is unavailable, run the committed recording instead — same exercise, no account:

```sh
yarn --cwd packages/mini-harness tsx steps/01-single-agent/index.ts run \
  steps/01-single-agent/fixtures/phases.json \
  --replay steps/01-single-agent/fixtures/demo-recording.json
```

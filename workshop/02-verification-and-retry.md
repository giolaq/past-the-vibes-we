# 2. Verification and Retry

## Goal

See a check fail, then see the harness send the exact failure into one retry.

## Do this

1. Run it against a live model with your chosen executor:

```sh
# Claude Code CLI
yarn --cwd packages/mini-harness tsx steps/02-verify-loop/index.ts run \
  steps/02-verify-loop/fixtures/phases.json \
  --executor claude-cli --model sonnet
```

```sh
# Strands + Bedrock
yarn --cwd packages/mini-harness tsx steps/02-verify-loop/index.ts run \
  steps/02-verify-loop/fixtures/phases.json \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2
```

A live model may pass every check on the first try. To see the retry loop deterministically, run the committed recording — its first `plan` attempt omits the required section, so the harness feeds the exact failure back and the second attempt fixes it:

```sh
yarn --cwd packages/mini-harness tsx steps/02-verify-loop/index.ts run \
  steps/02-verify-loop/fixtures/phases.json \
  --replay steps/02-verify-loop/fixtures/retry-recording.json
```

2. Find this failed check in the output:

```text
Pattern "## Remote Control" not found in out/TV_PORT_PLAN.md
```

3. Open `steps/02-verify-loop/verify.ts` and find the `file_exists` and `grep` checks.
4. Open `out/TV_PORT_PLAN.md` and confirm the retry added the missing remote control section.
5. Find the same failure text in the retry request.

## Why this matters

The model does not grade its own work. The harness runs an independent check and gives the model useful failure evidence.

## You are done when

You can trace one requirement from check, to failure, to retry, to passing result.

## If blocked

The retry recording (`steps/02-verify-loop/fixtures/retry-recording.json`) is the reliable way to see the failure-then-repair loop, since a live model may pass on the first attempt.

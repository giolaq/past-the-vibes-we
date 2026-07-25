---
id: single-agent
number: "01"
nav: One model call
time: 15 minutes
title: Start with one model call
lead: We start with the smallest thing that works — one model call — and then find out what it can't prove.
objective: Locate the model boundary and distinguish generated output from verified output.
evidence: Three concrete claims that the one-call script cannot prove by itself.
---

:::welcome We start where you already are
Paste your code into a model, get files back, trust them — that's most people's AI workflow today, and it's exactly what this lesson runs. A model can produce plausible files, but plausibility is not evidence. We start with the smallest possible agent so the missing guarantees are easy to see, and every later lesson fills one of them in.
:::

:::note One app from the first minute
Every mini-harness step begins with a reduced Pocket Cinema React Native app and runs the same three phases: analyze → plan → build_test. The later port changes platform concerns, but phase → skill → executor → check stays the same.
:::

:::predict
Before you run it, name one bug that could hide inside the model's analysis that looks complete.
:::

## Run it against a live model

:::yourturn
Pick the executor you set up in lesson 0 and run it — this one calls a real model and writes real files into `out/`. The prompt carries the entire reduced app source, a few KB, so the model analyzes your actual code rather than its memory of apps like it.
:::

:::command Claude Code CLI
# Claude Code CLI
yarn --cwd packages/mini-harness tsx steps/01-single-agent/index.ts run \
  steps/01-single-agent/fixtures/phases.json \
  --executor claude-cli --model sonnet
:::

:::command Strands + Bedrock
# Strands + Bedrock
yarn --cwd packages/mini-harness tsx steps/01-single-agent/index.ts run \
  steps/01-single-agent/fixtures/phases.json \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2
:::

## Now check what it couldn't prove

:::steps
1. Open `steps/01-single-agent/index.ts`.
2. Find where it copies the starter app, builds the prompt (the whole app source goes in via `app-source.ts`), reads the model response, and writes files.
3. Open the generated `out/ANALYSIS.md` (the analyze phase output).
4. Write down three claims that need an independent check — even with the full source in the prompt, nothing proves the analysis is complete, that the portability calls are right, or that a later phase won't invent an API.
:::

:::note Pasting the whole app works — for now
The fixture app fits in a prompt because it is a few KB. A real codebase does not. The complete harness replaces this paste with read-only tools, so the model reads what it needs on demand — that switch is lesson 4's second half.
:::

:::knowledge Why is this an agent script, but not yet a reliable harness?
It has a model call and side effects, but no independent verification, bounded retry, checkpoint, approval gate, or durable evidence.
:::

:::done
You can point to the model boundary and name three missing React Native checks.
:::

:::fallback
If the live model is blocked, run the committed recording instead — same exercise, no account:
:::

:::command Fallback: replay
# Fallback if the live model is blocked
yarn --cwd packages/mini-harness tsx steps/01-single-agent/index.ts run \
  steps/01-single-agent/fixtures/phases.json \
  --replay steps/01-single-agent/fixtures/demo-recording.json
:::

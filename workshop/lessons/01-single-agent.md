---
id: single-agent
number: "01"
nav: One model call
time: 15 minutes
title: Start with one model call
lead: We start with the smallest thing the harness can do — one model call against your real app — and then find out what it can't prove.
objective: Locate the model boundary and tell a generated claim apart from a verified one.
evidence: Three claims in the feasibility verdict that nothing in the run has checked.
---

:::welcome We start where you already are
Paste your code into a model, get an answer back, trust it — that's most people's AI workflow today, and it's exactly what this lesson runs. The harness already has a command that does one model call and nothing else: `plan`. Over the next four hours we'll build everything around it, and each lesson adds one piece. Start by watching what a single call gives you, and what it leaves you holding.
:::

:::note One app, one harness, all four hours
Everything from here runs `packages/workshop-harness` against `apps/pocket-cinema` — the app you checked in lesson 0. The pipeline is `analyze → plan → build_test`, and today you run none of it: `plan` stops before the port begins.
:::

:::predict
The model is about to judge whether Pocket Cinema can be ported to Vega. Before you run it, name one thing that judgment could get wrong in a way that still reads as confident.
:::

## Run one call against your app

:::yourturn
Pick the executor you set up in lesson 0 and run it. This calls a real model, with read-only access to your real app, and writes nothing.
:::

:::command Claude Code CLI
# Claude Code CLI
yarn --cwd packages/workshop-harness tsx src/index.ts plan ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor claude-cli --model sonnet
:::

:::command Strands + Bedrock
# Strands + Bedrock
yarn --cwd packages/workshop-harness tsx src/index.ts plan ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2
:::

:::expected
"verdict": "feasible-with-adapters"
"phases": ["analyze","plan","build_test"]
:::

## Two answers, only one of them checked

Look at the output. It holds two kinds of statement, and telling them apart is the whole point of this lesson.

:::concept findings and feasibility are not the same kind of claim
`findings` comes from `src/portability-audit.ts` — plain TypeScript that reads `package.json` and the project files and reports what it saw. Every entry carries an `evidence` field naming the file it came from. `feasibility` comes from `src/feasibility.ts`, which sends one prompt to a model and gets back a verdict, a per-dependency judgment, and a list of ADBT documents it says it consulted. Both land in the same JSON. One of them was produced by code you can read; the other is a well-written opinion.
:::

:::steps
1. Find `summary` and `findings`. Note that each finding names its `evidence`.
2. Find `feasibility`. Read `verdict`, then read the `reasoning` on each dependency.
3. Find `feasibility.sources` — the ADBT documents the model says it used.
4. Find `costUsd`. That call had a price.
5. Run `git status`. `plan` wrote nothing to your app, and that is deliberate.
:::

## Where the model actually sits

Two small files hold the whole boundary, and both are worth opening now — you'll spend the rest of the workshop adding things around them.

:::steps
1. Open `packages/workshop-harness/src/port-executor.ts` and find the `PortExecutor` interface. It has one method. Every way of calling a model in this workshop — your CLI agent, Strands, a recording — implements that one method.
2. Open `packages/workshop-harness/src/port-contract.ts`. It is twenty lines: a Zod schema saying an answer must be `{summary, files}`, and a helper that pulls JSON out of whatever the model wrapped it in.
3. In `feasibility.ts`, find where that schema is swapped for the feasibility one. A phase can demand its own shape of answer.
:::

:::note Why demand a schema instead of asking for JSON
"Return JSON" is a request. A schema is a contract the code enforces: Strands validates the structured output against it, and the harness refuses an answer that does not match. The model's prose is never parsed by hope.
:::

:::knowledge Why is this a model call, but not yet a harness?
It has a model and a real question, but nothing independent checked the answer, nothing retried it, nothing recorded what changed, and nothing decided what happens if it is wrong.
:::

:::done
You can point at the one method where the model is called, and you have written down three claims in the verdict that nothing in this run has checked.
:::

:::fallback
If the live model is blocked, run the committed recording instead — same exercise, no account:
:::

:::command Fallback: replay
# Fallback if the live model is blocked
yarn --cwd packages/workshop-harness tsx src/index.ts plan ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json
:::

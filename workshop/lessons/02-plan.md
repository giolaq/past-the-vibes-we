---
id: plan
number: "02"
nav: Plan the TV port
time: 30 minutes
title: Decide how this becomes a TV app
lead: "Porting to TV is a design decision before it is a build problem, so this phase gets two kinds of knowledge: a 10-foot interface skill, and Vega's own migration workflows over MCP."
objective: Separate the knowledge a phase needs from the code that runs it, and see where each kind comes from.
evidence: VEGA_PORT.md documents a focus model and a remote flow, and NextSteps.md names the ADBT documents the model read.
---

:::welcome Knowledge is a thing you supply
Phase 1 read the app. Phase 2 decides what it should become — and that decision needs expertise neither you nor the model has by default. A phone app becomes a TV app by answering questions about a remote control: where does focus start, what can it reach, what does Back do. And it becomes a *Vega* app by following Amazon's actual migration guidance rather than a model's memory of it. This lesson is about handing a phase both, and noticing that neither one is code you wrote.
:::

:::concept Two kinds of knowledge, two delivery mechanisms
A **skill** is a Markdown file of domain instructions the executor delivers to the model — here, `amazon-devices-vega-focus-management`, one of ten `amazon-devices-vega-*` skills ADBT installs. **ADBT over MCP** is a live tool the model calls itself: it lists and reads Vega migration documents, and the harness records every read with a SHA-256 hash. One is knowledge you push; the other is knowledge the model pulls. This phase uses both, and the pipeline itself contains neither.
:::

## What a phase carries

Open `phases()` in `src/port-pipeline.ts` and read the `plan` entry. Four different things, kept apart on purpose:

:::raw
<table><thead><tr><th>Field</th><th>What it is</th><th>Who reads it</th></tr></thead><tbody><tr><td><code>goal</code></td><td>What this phase must produce.</td><td>The model, in the prompt.</td></tr><tr><td><code>instruction</code></td><td>The rule this harness writes into the prompt.</td><td>The model, in the prompt.</td></tr><tr><td><code>skills</code></td><td>Names of skill files the executor delivers.</td><td>The model, through its executor.</td></tr><tr><td><code>mcp</code></td><td>Named MCP servers allowed for this phase.</td><td>The selected executor.</td></tr><tr><td><code>checks</code></td><td>Code that decides whether the phase passed.</td><td>The harness, never the model.</td></tr></tbody></table>
:::

:::note The skills are Amazon's, not ours
ADBT ships ten `amazon-devices-vega-*` skills — manifest configuration, focus management, navigation, media playback, performance, build-and-run, and more — versioned and updated by Amazon, installed by lesson 0's `init-context`. The harness names them, one or two per phase, without owning a word of their content. Swapping a phase's expertise is a one-line change. If they are not installed, `src/skills.ts` reports each missing skill and the run continues — and `workshop/fixtures/adbt-skills.json` records their names, hashes, and excerpts so you can still read what they say.
:::

:::include skillDelivery
:::

:::predict
The model is about to decide where focus starts and what Back does. Which of the two knowledge sources should answer that, and which should answer "which Vega API replaces this"?
:::

## Run the plan phase

:::yourturn
Run phase 2 onto the same run id. The guarded copy and its history are reused, so this builds on the analysis you already have.
:::

:::note Keep your executor choice
Run one live block. If you selected Strands with OpenAI or OpenRouter, use the provider and model
flags from lesson 0. The ADBT MCP tools are still supplied by the harness.
:::

:::command Claude Code CLI
# The harness passes the pinned ADBT server through --mcp-config for this call.
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor claude-cli --model sonnet \
  --phases plan --yes --run-id workshop
:::

:::command Strands + Bedrock
# The harness hands the ADBT McpClient to the agent, which calls its tools itself.
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2 \
  --phases plan --yes --run-id workshop
:::

## Read the plan, and where it came from

:::steps
1. Open `out/workshop/app/VEGA_PORT.md`. It must document a `## TV Flow` and a `## Focus` model — the two checks this phase is graded against.
2. Read the focus section as a contract: where focus starts, what the boundaries do, what Back restores. Lesson 6 turns exactly this into an executable test.
3. Open `out/workshop/app/NextSteps.md` for the ADBT sources and anything the model could not map.
4. Open `out/workshop/adbt-port-context.json`. Every document the model read is recorded with a hash — the model chose what to read, and you can still audit it afterwards.
:::

:::knowledge The model picked its own ADBT documents. How does the run stay reproducible?
The harness walks the agent's tool calls after the phase and records each document name, excerpt, and SHA-256 into `adbt-port-context.json`. Replay then reruns from that recorded context with no live MCP server. The model's freedom to choose costs you nothing in auditability.
:::

## Assignment: ship a skill of your own

:::yourturn
Amazon ships its conventions as skills. Now ship one of yours — teach the model a rule your team actually has, then enforce it with a check.
:::

The pairing is the point: the skill carries the knowledge, the check does the enforcement, and they live in different files.

:::steps
1. Create the skill: `mkdir -p ~/.claude/skills/team-open-questions`, then write `SKILL.md` in it with one instruction — for example, "End every document you produce with a section titled ## Open Questions listing what you could not verify." Keep it to a paragraph.
2. In `phases()`, add `team-open-questions` to the `plan` phase's `skills`.
3. In the same phase, add a `contains` check for `VEGA_PORT.md` with the value `## Open Questions`.
4. Run the phase again, live.
:::

:::done
`VEGA_PORT.md` documents a focus model and a TV flow, `adbt-port-context.json` names hashed ADBT documents, and — for the assignment — your own section is there because your skill asked for it and your check insisted on it. Neither is pipeline code.
:::

:::fallback
On the replay path your added check fails on purpose, and that failure is worth reading. The recording was made before your requirement existed, so no recorded answer can satisfy it. Replay honors checks, because checks are code — it cannot honor skills, because no model runs to follow an instruction.
:::

:::command Fallback: replay
# Fallback if the live model or ADBT is blocked
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
  --phases plan --yes --run-id workshop
:::

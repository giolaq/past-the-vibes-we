---
id: skills
number: "04"
nav: Skills and executors
time: 20 minutes
title: Separate knowledge from model access
lead: Skills carry the domain instructions and executors call the model — kept separate, so the pipeline never depends on one provider.
objective: Separate domain knowledge, model execution, tools, and deterministic pipeline control.
evidence: You can point to the file that owns each responsibility in both the mini and complete workshop harnesses.
---

:::concept Four responsibilities
Each piece has one job: skills teach domain knowledge, phase context assembles the task, executors talk to the model, tools expose narrow capabilities, and the pipeline decides when side effects are allowed.
:::

:::predict
Where should a D-pad focus rule live: the executor, a skill, a read tool, or a verification check?
:::

## Run it against a live model

:::command Claude Code CLI
# Claude Code CLI
yarn --cwd packages/mini-harness tsx steps/04-skills/index.ts run \
  steps/04-skills/fixtures/phases.json \
  --executor claude-cli --model sonnet
:::

:::command Strands + Bedrock
# Strands + Bedrock
yarn --cwd packages/mini-harness tsx steps/04-skills/index.ts run \
  steps/04-skills/fixtures/phases.json \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 \
  --region us-west-2
:::

## Map the teaching harness

:::steps
1. Open `phases.json` and find the ADBT skill each phase names: `amazon-devices-vega-best-practices` (analyze), `amazon-devices-vega-focus-management` (plan), `amazon-devices-vega-build-and-run` (build_test).
2. Open one of them in `~/.claude/skills` — a folder with a `SKILL.md`, written and versioned by Amazon, installed by lesson 0's `init-context`.
3. Follow the names through `skills.ts`, `pipeline-engine.ts`, and `executor.ts`.
4. In `model-runtime.ts`, compare `injectSkillText()` with `createSkillsPlugin()`.
5. Compare every module with `packages/mini-harness/ISOMORPHISM.md`.
:::

:::note The skills are Amazon's, not ours
ADBT ships nine `amazon-devices-vega-*` skills — manifest configuration, focus management, navigation, media playback, performance, build-and-run, and more — versioned and updated by Amazon. The harness consumes three of them without owning their content: real TV domain expertise reaches the agent without you writing or maintaining a word of it, and swapping a phase's expertise is a one-line change in `phases.json`. The executor is the same kind of swap point: the workshop ships a Claude Code executor, and the `Executor` interface is where another CLI agent would plug in. If they are not installed, `workshop/fixtures/adbt-skills.json` records their names, hashes, and excerpts.
:::

:::include skillDelivery
:::

<h2>The whole model interaction, in one code block</h2>
      <p>In <code>src/port-executor.ts</code>, the entire live model interaction for one phase is essentially this (the <code>systemPrompt</code> is shortened here — the real one also tells the agent to use the ADBT tools):</p>

:::snippet packages/workshop-harness/src/port-executor.ts (simplified)
const agent = new Agent({
  name: `workshop-${phase}`,
  model: createModel(config),                 // Bedrock / OpenAI / OpenRouter behind one interface
  tools: createProjectReadTools(appDir),      // list/read/search only — no write, no shell
  structuredOutputSchema: PortOutputSchema,   // must return { summary, files }
  systemPrompt: "Inspect with read-only tools. Return a complete patch. Never claim a file or API exists without reading evidence.",
  printer: false,                             // keep stdout clean for JSON
});
const result = await agent.invoke(prompt, {
  cancelSignal: AbortSignal.timeout(10 * 60_000),  // 10-min hard stop
  limits: { turns: 8, totalTokens: 40_000 },       // bounded loop
});
>look: Strands supplies the model-and-tool loop, provider adapters, schema-validated output, turn/token limits, cancellation, and usage metrics. Writing files, verification, Git, cost policy, and ADBT selection stay in the harness.
:::

:::note The tools themselves are guarded hard
In `src/port-tools.ts`, the read tools reject absolute paths, `..` traversal, symlinks, `.git`, `.env`, `node_modules`, binaries, and files over 100&nbsp;KB. Even the read side of the model's authority has walls.
:::

:::include strandsConstructs
:::

:::include fullHarnessStrandsConstructs
:::

<h2>Inspect the complete Strands boundary</h2>

:::steps
1. Open `packages/workshop-harness/src/port-tools.ts` and match each `tool()` field to the first table.
2. Open `port-contract.ts` and find the Zod schema passed as `structuredOutputSchema`.
3. Open `port-executor.ts` and trace `new Agent()` → `invoke()` → `AgentResult`.
4. Follow the result into usage accounting and `port-recorder.ts`.
5. Confirm the workshop port agent has no write or shell tool. Its pipeline owns both.
:::

:::knowledge Why use AgentSkills with Strands but prompt injection with Claude CLI?
Strands can expose skill metadata and let the agent progressively activate instructions through a plugin. The CLI subprocess has no shared in-process plugin, so the executor sends the selected instructions directly in its prompt.
:::

:::raw
<div class="links"><a href="strands-constructs.md">Open the Strands reference</a></div>
:::

:::done
You can trace one React Native phase skill through Claude prompt injection or Strands AgentSkills, then separate both from pipeline controls.
:::

:::fallback
If the live model is blocked, replay shows the same module boundaries without credentials:
:::

:::command Fallback: replay
# Fallback if the live model is blocked
yarn --cwd packages/mini-harness tsx steps/04-skills/index.ts run \
  steps/04-skills/fixtures/phases.json \
  --replay steps/04-skills/fixtures/demo-recording.json
:::

---
id: skills
number: "04"
nav: The parts you swap
time: 30 minutes
title: Separate knowledge from model access
lead: "We separate the parts that keep getting tangled: skills carry domain knowledge, tools expose narrow capabilities, executors call the model, and the pipeline depends on none of them."
objective: Separate domain knowledge, model execution, tools, and deterministic pipeline control.
evidence: A skill you wrote changes what the model produces, and a check you wrote proves it.
---

:::welcome One job per piece
The loop from lesson 3 doesn't change again. What changes is what it knows and who it calls — and this is the lesson where those become things you swap rather than things you rewrite. By the end you'll have taught the model one of your team's rules by adding a file, enforced it with a check, and seen where your own CLI agent would plug in.
:::

:::predict
Where should a D-pad focus rule live: the executor, a skill, a read tool, or a verification check?
:::

## Each phase names the knowledge it wants

Open `phases()` in `src/port-pipeline.ts` and look at one entry. It carries four different things, and keeping them apart is the design:

:::raw
<table><thead><tr><th>Field</th><th>What it is</th><th>Who reads it</th></tr></thead><tbody><tr><td><code>goal</code></td><td>What this phase must produce.</td><td>The model, in the prompt.</td></tr><tr><td><code>instruction</code></td><td>The rule this harness writes into the prompt.</td><td>The model, in the prompt.</td></tr><tr><td><code>skills</code></td><td>Names of skill files the executor delivers.</td><td>The model, through its executor.</td></tr><tr><td><code>checks</code></td><td>Code that decides whether the phase passed.</td><td>The harness, never the model.</td></tr></tbody></table>
:::

:::note The skills are Amazon's, not ours
ADBT ships ten `amazon-devices-vega-*` skills — manifest configuration, focus management, navigation, media playback, performance, build-and-run, and more — versioned and updated by Amazon, installed by lesson 0's `init-context`. The harness names three of them, one per phase, without owning a word of their content: real TV expertise reaches the agent, and swapping a phase's expertise is a one-line change. If they are not installed, `src/skills.ts` reports each missing skill and the run continues — and `workshop/fixtures/adbt-skills.json` records their names, hashes, and excerpts so you can still see what they say.
:::

:::yourturn
Run the plan phase and watch which skill it asks for. The names come from the phase; the delivery is the executor's problem.
:::

:::command Run the phase that uses the focus skill
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor claude-cli --model sonnet \
  --phases analyze,plan --yes
:::

:::include skillDelivery
:::

:::steps
1. Open `src/skills.ts`. It loads `<skills dir>/<name>/SKILL.md`, derives a name and description, and returns a body. Point `WORKSHOP_SKILLS_DIR` at another directory if your agent keeps skills elsewhere.
2. In `src/port-executor.ts`, compare the two delivery paths: `injectSkillText()` for the CLI subprocess, `createSkillsPlugin()` for Strands.
3. Confirm the pipeline never reads a skill file. It passes names; the executor decides how a model receives them.
:::

## Assignment: ship a team skill

:::yourturn
Amazon ships its conventions as skills. Now ship one of yours — teach the model a rule your team actually has, then enforce it with a check.
:::

The pairing is the point: the skill carries the knowledge, the check does the enforcement, and they live in different files on purpose.

:::steps
1. Create the skill: `mkdir -p ~/.claude/skills/team-open-questions`, then write `SKILL.md` in it with one instruction — for example, "End every document you produce with a section titled ## Open Questions listing what you could not verify." Keep it to a paragraph.
2. In `phases()`, add `team-open-questions` to the `plan` phase's `skills`.
3. In the same phase, add a `contains` check for `VEGA_PORT.md` with the value `## Open Questions`.
4. Run the command above again, live. Your skill teaches, your check enforces, and the loop from lesson 3 handles the rest.
:::

:::done
The run passes, `out/<runId>/app/VEGA_PORT.md` ends with your `## Open Questions` section, and you can point at the file that taught the rule and the line that enforced it. Neither one is pipeline code.
:::

:::fallback
On the replay path your check fails on purpose, and that failure is worth reading. Use the retry recording, which holds two plan attempts:
:::

:::command Replay variant: the recording cannot satisfy a new requirement
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-retry/port-recording.json \
  --phases analyze,plan --yes
:::

:::expected
plan failed after 2 attempts: Open questions recorded: VEGA_PORT.md must contain "## Open Questions"
:::

Both recorded answers were written before your requirement existed, so neither can satisfy it. Replay honors checks, because checks are code — it cannot honor skills, because no model runs to follow an instruction. Write that sentence down; it completes the assignment on the replay path.

## The tools the model gets

:::note The read tools are guarded hard
In `src/port-tools.ts` the model gets exactly three capabilities — list, read, search — and they reject absolute paths, `..` traversal, symlinks, `.git`, `.env`, `node_modules`, binaries, and files over 100&nbsp;KB. There is no write tool and no shell. Even the read side of the model's authority has walls.
:::

<h2>The whole model interaction, in one code block</h2>
      <p>In <code>src/port-executor.ts</code>, the entire live model interaction for one phase is essentially this (the <code>systemPrompt</code> is shortened here):</p>

:::snippet packages/workshop-harness/src/port-executor.ts (simplified)
const agent = new Agent({
  name: `workshop-${phase}`,
  model: createModel(config),                 // Bedrock / OpenAI / OpenRouter behind one interface
  tools: createProjectReadTools(appDir),      // list/read/search only — no write, no shell
  plugins: [createSkillsPlugin(skills)],      // the phase's skills, loaded by the agent on demand
  structuredOutputSchema: PortOutputSchema,   // must return { summary, files }
  systemPrompt: "Inspect with read-only tools. Return a complete patch. Never claim a file or API exists without reading evidence.",
  printer: false,                             // keep stdout clean for JSON
});
const result = await agent.invoke(prompt, {
  cancelSignal: AbortSignal.timeout(10 * 60_000),  // 10-min hard stop
  limits: { turns: 8, totalTokens: 40_000 },       // bounded loop
});
>look: Strands supplies the model-and-tool loop, provider adapters, skill delivery, schema-validated output, turn/token limits, cancellation, and usage metrics. Writing files, verification, Git, cost policy, and ADBT selection stay in the harness.
:::

:::include strandsConstructs
:::

:::include fullHarnessStrandsConstructs
:::

:::steps
1. Open `src/port-tools.ts` and match each `tool()` field to the first table.
2. Open `port-contract.ts` and find the Zod schema passed as `structuredOutputSchema`.
3. Open `port-executor.ts` and trace `new Agent()` → `invoke()` → `AgentResult`.
4. Follow the result into usage accounting and `port-recorder.ts`.
5. Confirm the port agent has no write or shell tool. Its pipeline owns both.
:::

## Swap in your own CLI agent

The executor is the same kind of swap point as a skill, and the recipe fits in three steps. Everything lives in `src/port-executor.ts`:

:::steps
1. Implement `PortExecutor` — the one-method interface you met in lesson 1. `call(phase, prompt, options)` returns `{text, costUsd}` where `text` carries the JSON patch. Model it on `ClaudeCodePortExecutor`: spawn your CLI non-interactively with the prompt on stdin and the guarded app as the working directory, deliver `options.skills` however your agent expects them, collect the response, and record each turn with `PortRecorder` so your runs replay like everyone else's.
2. Register it: add a `kind` to `ExecutorConfig`, a branch in `resolveExecutorConfig()` for your `--executor <name>` value, and a branch in `createPortExecutor()`.
3. Keep the contract: the harness applies only the returned typed patch — anything your CLI writes directly to disk is ignored and rolled back — and your agent reaches ADBT through its own MCP config (`init-context` supports Cursor, Cline, Kiro, Copilot, and `other`).
:::

The pipeline, checks, retries, cost cap, and commits never change. That is what "swap the executor" means.

:::knowledge Why use AgentSkills with Strands but prompt injection with the Claude CLI?
Strands can expose skill metadata in-process and let the agent activate the instructions it needs. A CLI subprocess shares no plugin with the harness, so its executor sends the selected instructions directly in the prompt. Same skill file, two delivery paths, one pipeline.
:::

:::raw
<div class="links"><a href="strands-constructs.md">Open the Strands reference</a></div>
:::

:::done
You can name the file that owns each responsibility — knowledge, tools, model access, and control — and you changed the model's behavior without touching the pipeline.
:::

:::fallback
If the live model is blocked, replay shows the same module boundaries without credentials:
:::

:::command Fallback: replay
# Fallback if the live model is blocked
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
  --phases analyze,plan --yes
:::

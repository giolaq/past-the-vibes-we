# 4. Tools, Skills, and Executors

## Goal

Separate domain instructions, system capabilities, and model access.

The domain instructions here are not ours: each phase loads one of Amazon's vendor-maintained ADBT skills, installed by `init-context` in lesson 0 into `~/.claude/skills`. The harness consumes them without owning their content.

## Do this

1. Run Step 4 against a live model with your chosen executor. Live runs read the ADBT skills from `~/.claude/skills`; if you skipped lesson 0's `init-context`, run it now (`npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest init-context --agent claude-code-cli --force`). Replay needs no install.

```sh
# Claude Code CLI
yarn --cwd packages/mini-harness tsx steps/04-skills/index.ts run \
  steps/04-skills/fixtures/phases.json \
  --executor claude-cli --model sonnet
```

```sh
# Strands + Bedrock
yarn --cwd packages/mini-harness tsx steps/04-skills/index.ts run \
  steps/04-skills/fixtures/phases.json \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2
```

2. Open these files in `packages/mini-harness/steps/04-skills/`:

- `packages/mini-harness/steps/04-skills/skills.ts`: loads the ADBT skills a phase names from your agent's skills directory (`~/.claude/skills`, or `MINI_SKILLS_DIR`).
- `packages/mini-harness/steps/04-skills/phase-context.ts`: builds the prompt for that phase.
- `packages/mini-harness/steps/04-skills/executor.ts`: passes the phase prompt and selected skills to replay, Claude Code, or Strands.
- `packages/mini-harness/steps/04-skills/recorder.ts`: records model requests and responses.

3. Open `packages/mini-harness/model-runtime.ts` and trace both delivery paths:
   - Claude CLI calls `injectSkillText()` and receives the full instructions in the prompt.
   - Strands wraps the instructions in `Skill`, registers `AgentSkills` through `plugins`, and lets the agent activate them with the `skills` tool.
4. Compare the teaching modules with the production modules in `packages/mini-harness/ISOMORPHISM.md`.
5. Open the three ADBT skills in `~/.claude/skills` (one per phase): `amazon-devices-vega-best-practices` (analyze), `amazon-devices-vega-focus-management` (plan), and `amazon-devices-vega-build-and-run` (build_test). Each is a folder with a `SKILL.md` — the same artifact shape you would use for your own skills, except these are written and versioned by the platform vendor. If they are not installed, inspect `workshop/fixtures/adbt-skills.json` for their names, hashes, and excerpts instead.

Fallback if the live model is blocked — replay shows the same module boundaries without credentials:

```sh
yarn --cwd packages/mini-harness tsx steps/04-skills/index.ts run \
  steps/04-skills/fixtures/phases.json \
  --replay steps/04-skills/fixtures/demo-recording.json
```

## Read the Strands call from top to bottom

Open `packages/workshop-harness/src/port-executor.ts` and trace this sequence:

1. `new Agent()` creates the model-and-tool loop for one phase.
2. `model` receives a `BedrockModel` or `OpenAIModel` from `model-factory.ts`.
3. `systemPrompt` sets the rules that remain true for the whole invocation.
4. `tools` registers only list, read, and literal search from `port-tools.ts`.
5. Each `tool()` has a name, a model-facing description, a Zod `inputSchema`, and a deterministic `callback`.
6. `structuredOutputSchema` requires the result to match `PortOutputSchema`.
7. `printer: false` keeps Strands' console renderer off so CLI stdout remains valid JSON.
8. `agent.invoke()` starts the run with an external cancellation signal and per-invocation turn and token limits.
9. `AgentResult.structuredOutput` provides the validated patch.
10. `metrics.accumulatedUsage` provides token counts for recording and cost calculation.
11. `StructuredOutputError` turns a missing structured result into an explicit executor failure.

The mini-harness uses the same `Agent`, model providers, `AgentSkills`, `Skill`, `plugins`, `invoke()`, messages, and usage metrics. It reads `AgentResult.lastMessage` because the teaching step still expects raw JSON text. A Strands phase with a selected skill gets three turns so it can activate the skill before returning JSON; a phase without skills stays at one turn.

The complete workshop harness keeps the same executor boundary but adds read-only project tools, structured patch output, token limits, and cost accounting. Open `packages/workshop-harness/src/port-executor.ts` after the small example and trace `Agent` construction, `invoke()`, `AgentResult`, and recording.

Read [the full Strands construct reference](strands-constructs.md) for the MCP path and the exact boundary between SDK, Zod, MCP transport, and harness code.

## Why this matters

A skill explains what matters. A tool performs a narrow action. An executor hides provider-specific model access and chooses the provider's native skill mechanism when one exists. Keeping them separate makes the pipeline easier to test and change.

Because the skills are ADBT's, the pipeline gets vendor-maintained Vega knowledge without owning any of it: swapping a phase's expertise is a one-line change in `phases.json`, and Amazon updates the skill content independently through the ADBT package.

The full workshop port applies the same rule with Strands Agents SDK:

- `packages/workshop-harness/src/port-tools.ts` defines three Zod-typed tools: list, read, and search.
- The tools are scoped to the guarded app. They reject `.env`, `.git`, `node_modules`, absolute paths, and paths outside the app.
- `packages/workshop-harness/src/port-contract.ts` defines the patch schema. Strands validates the model output before the harness sees it.
- `packages/workshop-harness/src/port-executor.ts` limits each phase to eight turns, 40,000 total tokens, and ten minutes.
- The agent has no write or shell tool. `port-pipeline.ts` validates paths, writes files, runs checks, retries once, and commits passing work.

This is the main tool-design rule: give an agent the smallest capability needed for its current concern. Keep irreversible actions in deterministic harness code.

## You are done when

You can show where to change domain knowledge without changing the pipeline, and where to change model providers without changing verification.

## If blocked

Use replay. The architecture is visible without a live model. If the ADBT skills are not installed, `workshop/fixtures/adbt-skills.json` records their names, descriptions, hashes, and excerpts.

---
id: plan
number: "02"
nav: Plan the TV port
time: 30 minutes
title: Define the TV behavior before you write code
lead: Supply TV design rules and current Vega documents. Keep these knowledge sources separate from pipeline code.
objective: Identify the knowledge that a phase needs. Identify how the executor supplies each knowledge source.
evidence: VEGA_PORT.md contains the focus model and TV flow. NextSteps.md identifies the ADBT documents.
---

:::welcome Supply the required knowledge
The analyze phase read the app.
The plan phase defines the required TV behavior.

The phase must define initial focus, movement, selection, and Back behavior.
The phase must also use current Vega migration information.
The model does not have this knowledge by default.
:::

:::concept Use two knowledge sources
A skill is a Markdown file with domain instructions.
The executor supplies selected skills to the model.

ADBT is a live MCP server.
The model uses ADBT tools to find and read Vega documents.
The harness records each document read and its SHA-256 hash.
:::

## Inspect the phase definition

Open the `plan` entry in `phases()` in `src/port-pipeline.ts`.

| Field | Function | Consumer |
| --- | --- | --- |
| `goal` | Defines the required result | Model |
| `instruction` | Defines a phase rule | Model |
| `skills` | Identifies skill files | Executor and model |
| `mcp` | Identifies permitted MCP servers | Executor |
| `checks` | Defines the pass condition | Harness |

Keep these fields separate.
Do not put verification logic in the prompt.

:::note ADBT supplies the Vega skills
ADBT supplies ten `amazon-devices-vega-*` skills.
The skills include focus, navigation, manifest, media, performance, and build instructions.

Lesson 00 installed these skills.
The harness selects the skills for each phase.
The harness does not own the skill content.
:::

:::include skillDelivery
:::

:::predict
Which knowledge source defines the focus behavior?
Which knowledge source identifies the correct Vega API?
:::

## Run the plan phase

Use the same run ID.
The harness reuses the guarded copy and its Git history.

:::command Claude Code CLI
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor claude-cli --model sonnet \
  --phases plan --yes --run-id workshop
:::

:::command Strands with Bedrock
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2 \
  --phases plan --yes --run-id workshop
:::

:::note Use your selected executor
Run one command only.
If you selected OpenAI or OpenRouter, use the flags from Lesson 00.
The harness supplies ADBT MCP to both live executors.
:::

## Inspect the plan

:::steps
1. Open `out/workshop/app/VEGA_PORT.md`.
2. Find the `## TV Flow` section.
3. Find the `## Focus` section.
4. Identify the initial focus target.
5. Identify the list-boundary behavior.
6. Identify the Back behavior.
7. Open `out/workshop/app/NextSteps.md`.
8. Find the ADBT sources.
9. Find each unsupported mapping.
10. Open `out/workshop/adbt-port-context.json`.
11. Find the document names and hashes.
:::

:::knowledge How does the harness record model-selected documents?
The harness reads the ADBT tool history after the phase.
It records each document name, excerpt, and SHA-256 hash.

The recorded fallback uses this stored context.
It does not start a live MCP server.
:::

## Add a team skill

Create one skill that contains a rule from your team.
Then add an independent check for that rule.

:::steps
1. Create `~/.claude/skills/team-open-questions`.
2. Create `SKILL.md` in that directory.
3. Add this instruction: `End each document with a ## Open Questions section.`
4. Add `team-open-questions` to the plan phase `skills`.
5. Add a `contains` check for `## Open Questions`.
6. Run the live plan phase again.
7. Verify that the new section exists.
:::

The skill supplies the instruction.
The check supplies the pass condition.
Keep them in different files.

:::proof
claim: "The plan defines the TV behavior and uses current Vega information"
gate: "The plan contains the TV flow and focus model. The live run records the ADBT documents."
evidence: "VEGA_PORT.md, NextSteps.md, and adbt-port-context.json"
limit: "The plan does not prove that the proposed APIs compile"
:::

:::done
`VEGA_PORT.md` contains the focus model and TV flow.
`adbt-port-context.json` contains the ADBT document records.
Your team skill produces a section that an independent check requires.
:::

:::fallback
The recorded response cannot follow a skill that you added after the recording.
Your new check will fail on the recorded response.
This failure is correct.
Checks run during a recorded fallback, but no model runs.
:::

:::command Recorded fallback
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
  --phases plan --yes --run-id workshop
:::

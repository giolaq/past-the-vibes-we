---
id: plan
number: "02"
nav: Plan the TV port
time: 30 minutes
title: Define and approve the TV behavior before you write code
lead: Supply TV rules and current Vega documents. Validate a structured plan. Approve it before implementation.
objective: Identify the knowledge that a phase needs. Review a typed screen and navigation contract before code changes.
evidence: port-plan.json passes its schema. The human-approved hash is in port-plan-approval.json.
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

The plan phase writes two views of the same decision:

- `port-plan.json` is the machine-checked contract.
- `VEGA_PORT.md` explains the plan to a person.

The JSON contract contains screens, navigation edges, preserved behavior,
deferred behavior, and evidence.
Its schema rejects missing screen references, missing Select behavior, missing
Back behavior, an initial focus target that is not focusable, and preserved
behavior without evidence.

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

:::command Run the plan phase
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --phases plan --yes --run-id workshop
:::

:::note Use your workshop configuration
The command reads the model settings from `../../workshop.config.json`.
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
10. Open `out/workshop/app/port-plan.json`.
11. Compare `screens` with `apps/pocket-cinema/workshop-brief.md`.
12. Verify that `navigation` contains Select and Back.
13. Verify that every `verification` item names a preserved behavior.
14. Read `deferredBehaviors` and `openQuestions`.
15. Open `out/workshop/adbt-port-context.json`.
16. Find the document names and hashes.
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

## Approve the structured plan

Do not approve only because the schema passes.
The schema can verify references and required fields.
It cannot decide if the model selected the correct product flow.

:::steps
1. Compare the screen count with the source app.
2. Compare the vertical slice with `workshop-brief.md`.
3. Trace Select from the entry screen.
4. Trace Back to the originating focus target.
5. Reject invented Vega APIs.
6. Reject a verification item that can pass without its behavior.
7. Continue only when the plan is correct.
:::

:::command Approve the reviewed plan
yarn tsx src/index.ts approve-plan workshop --yes
:::

:::expected
"command": "approve-plan"
"planSha256": "sha256:..."
:::

The command writes `port-plan-approval.json`.
The approval contains the exact plan hash and brief hash.
The `port`, `build`, `launch`, and `test` phases refuse a missing or stale
approval.

:::proof
claim: "The plan defines the TV behavior, uses current Vega information, and has human approval"
gate: "The typed plan validates. A person reviews the product decisions. The live run records the ADBT documents."
evidence: "port-plan.json, port-plan-approval.json, VEGA_PORT.md, NextSteps.md, and adbt-port-context.json"
limit: "The plan does not prove that the proposed APIs compile"
:::

:::done
`port-plan.json` contains the screens, navigation, behavior, and evidence.
`port-plan-approval.json` contains the plan and brief hashes.
`VEGA_PORT.md` contains the focus model and TV flow.
`adbt-port-context.json` contains the ADBT document records.
Your team skill produces a section that an independent check requires.
:::

:::fallback
The recorded response cannot follow a skill that you added after the recording.
Your new check will fail on the recorded response.
This failure is correct.
Checks run during a recorded fallback, but no model runs.
After the recorded plan passes, run the same `approve-plan` command.
:::

:::command Recorded fallback
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --replay ../../workshop/fixtures/port-recording.json \
  --phases plan --yes --run-id workshop
:::

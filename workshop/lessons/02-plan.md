---
id: plan
number: "02"
nav: Plan the TV port
time: 30 minutes
title: Define and approve the TV behavior before you write code
lead: Supply TV rules and current Vega documents. A structured plan is JSON with required fields. A schema checks those fields. A contract is a set of requirements that later phases must follow. Approve the contract before implementation.
objective: Identify the knowledge that a phase needs. Review a typed screen and navigation contract before code changes.
evidence: port-plan.json passes its schema. The human-approved hash is in port-plan-approval.json.
---

:::welcome Supply the required knowledge
The analyze phase read the app.
The plan phase defines the required TV behavior.

The phase must define initial focus, movement, selection, and Back behavior.
The phase must also use current Vega migration information.
The model does not have Vega knowledge by default.
:::

:::concept Use one Vega knowledge source
ADBT is a live MCP server.
The model uses ADBT tools to find and read Vega documents.
The harness records each document read and its SHA-256 hash.

A skill is a Markdown instruction file that an agent can activate for a task.
A skill can carry a team-specific instruction.
The skill does not replace ADBT for Vega knowledge.
:::

## Inspect the phase definition

Open the `plan` entry in `phases()` in `src/port-pipeline.ts`.
A consumer is the component that reads and uses a field.

| Field | Function | Consumer |
| --- | --- | --- |
| `goal` | Defines the required result | Model |
| `instruction` | Defines a phase rule | Model |
| `skills` | Identifies skill files | Executor and model |
| `mcp` | Identifies permitted MCP servers | Executor |
| `checks` | Defines the pass condition | Harness |

Keep these fields separate.
Do not put verification logic in the prompt.

The plan phase writes two views of the same decision.

- `port-plan.json` is the machine-checked contract.
- `VEGA_PORT.md` explains the plan to a person.

The JSON contract contains screens, navigation edges, preserved behavior,
deferred behavior, and evidence.
A navigation edge describes movement from one screen or focus target to another.
Preserved behavior must remain in the port.
Deferred behavior is intentionally outside the current port.
The JSON schema rejects these errors:

- A missing screen reference.
- Missing Select behavior.
- Missing Back behavior.
- An initial focus target that is not focusable.
- Preserved behavior without evidence.

:::note The harness has no built-in Vega template
The default phases use `skills: []`.
The default phases receive ADBT MCP.
The model must read a relevant document.
Manifest fields, dependencies, build commands, and runtime APIs come from the ADBT documents.
:::

## Trace Strands in the plan phase

The plan phase adds the ADBT MCP client to the Strands agent.
The default skill list for the plan phase is empty.

:::snippet packages/workshop-harness/src/port-executor.ts
const agent = new Agent({
  model: createModel(this.config),
  tools: [
    ...createProjectReadTools(this.appDir),
    ...(options.extraTools ?? []),
  ],
  structuredOutputSchema: outputSchema,
  printer: false,
});
>look: `extraTools` contains the ADBT MCP connection. The model discovers Vega knowledge through ADBT tools.
:::

Provenance is a record of where information came from.
ADBT provenance contains document names, excerpts, and hashes.

| Owner | Plan action |
| --- | --- |
| Strands | Lets the model discover ADBT tools. Lets the model call ADBT tools. |
| ADBT MCP | Supplies current Vega planning, focus, and migration documents. |
| Harness | Selects the permitted MCP server. Validates `port-plan.json`. Records ADBT provenance. Requires approval. |
| Evidence | `port-plan.json`, `port-plan-approval.json`, and `adbt-port-context.json` |

:::note Claude CLI path
Claude Code receives the same exact ADBT server version through `--mcp-config`.
The plan schema and approval requirement do not change.
:::

:::predict
Which ADBT documents define the focus behavior?
What evidence proves that the model read the ADBT documents?
:::

## Run the plan phase

Use the same run ID.
The harness reuses the guarded copy and its Git history.

:::yourturn
Run the plan phase in the existing `workshop` run.
Inspect the human-readable plan, the JSON contract, and the ADBT source record.
:::

:::command Run the plan phase
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --phases plan --yes --run-id workshop
:::

:::note Use your workshop configuration
The command reads the model settings from `../../workshop.config.json`.
The harness supplies ADBT MCP to both live executors.
:::

## Inspect the plan

An unsupported mapping is a proposed source-to-Vega mapping that has no supporting ADBT document.

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
12. Verify that `navigation` contains Select.
13. Verify that `navigation` contains Back.
14. Verify that every `verification` item names a preserved behavior.
15. Read `deferredBehaviors`.
16. Read `openQuestions`.
17. Open `out/workshop/adbt-port-context.json`.
18. Find the document names.
19. Find the document hashes.
:::

:::knowledge How does the harness record model-selected documents?
The harness reads the ADBT tool history after the phase.
The harness records each document name.
The harness records each excerpt.
The harness records each SHA-256 hash.
:::

## Add a team skill

Create one skill that contains a rule from your team.
Then, add an independent check for the team rule.

A plugin is an SDK extension.
Strands loads skills through its `AgentSkills` plugin.
The `contains` check passes only when a named file contains the required text.

:::include skillDelivery
:::

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
The schema cannot decide if the model selected the correct product flow.

:::steps
1. Compare the screen count with the source app.
2. Compare the required home-to-details flow with `workshop-brief.md`.
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
The hashes bind the approval to the exact files that you reviewed.
A stale approval has hashes that no longer match the plan or brief.
The `port`, `build`, `launch`, and `test` phases refuse a missing approval.
The phases also refuse a stale approval.

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

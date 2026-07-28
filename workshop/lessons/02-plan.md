---
id: plan
number: '02'
nav: Plan the TV port
time: 30 minutes
title: Define and approve the Plan for TV porting
lead: Convert the app analysis into a structured TV plan. Review focus, Select, and Back behavior before the harness permits source changes.
objective: Run the plan phase, inspect its ADBT sources, and approve the exact plan that later phases must follow.
evidence: port-plan.json passes its schema. The human-approved plan is in port-plan-approval.json.
---

:::welcome Plan before code changes
The analyze phase described the current app.
The plan phase defines the TV version of that app.

The model proposes the plan.
The harness checks the plan structure.
A person approves the product decisions.
:::

## Know the plan input and output

The plan phase receives:

- The guarded app.
- `ANALYSIS.md`.
- `workshop-brief.md`.
- Current Vega documents from ADBT.

The phase writes:

| File                     | Function                                                    |
| ------------------------ | ----------------------------------------------------------- |
| `port-plan.json`         | Machine-checked screens, navigation, behavior, and evidence |
| `VEGA_PORT.md`           | Human-readable TV flow and focus model                      |
| `NextSteps.md`           | ADBT sources, unsupported mappings, and open work           |
| `adbt-port-context.json` | Names, excerpts, and hashes of ADBT documents               |

A navigation edge describes movement between screens or focus targets.
Preserved behavior must remain in the port.
Deferred behavior is outside the current port.

## Important harness code

The plan phase declares its files and checks in `src/port-pipeline.ts`.

:::snippet packages/workshop-harness/src/port-pipeline.ts (simplified)
{
name: "plan",
mcp: [ADBT_SERVER],
checks: [
{ type: "json_schema", path: "port-plan.json",
schema: PortPlanSchema, label: "Structured port plan" },
{ type: "contains", path: "VEGA_PORT.md",
value: "## TV Flow", label: "TV flow documented" },
{ type: "contains", path: "VEGA_PORT.md",
value: "## Focus", label: "Focus model documented" },
{ type: "contains", path: "NextSteps.md",
value: "ADBT", label: "ADBT gaps and sources" },
],
}

> look: The schema checks references and required behavior. The text checks require the human explanation and ADBT source record.
> :::

The schema rejects a missing screen reference.
It also rejects missing Select, Back, initial focus, or evidence mappings.
The schema cannot decide if the selected product flow is correct.

## Run the plan phase

Use the same `workshop` run ID from Lesson 01.

:::yourturn
Run the plan phase.
Wait for the model to read ADBT and write both plan files.
:::

:::command Run the plan phase
yarn tsx src/index.ts run ../../apps/pocket-cinema \
 --phases plan --yes --run-id workshop
:::

The final result has this state:

```json
{
  "state": "awaiting_approval",
  "phasesComplete": ["analyze", "plan"]
}
```

`awaiting_approval` is the correct result.
The plan phase is complete, but code changes are not permitted yet.

## Inspect the proposed plan

:::steps

1. Open `out/workshop/app/port-plan.json`.
2. Compare `screens` with `apps/pocket-cinema/workshop-brief.md`.
3. Find the initial focus ID.
4. Trace the Select action from Home to Details.
5. Trace the Back action from Details to the originating card.
6. Read `preservedBehaviors`.
7. Read `deferredBehaviors`.
8. Read `verification`.
9. Open `out/workshop/app/VEGA_PORT.md`.
10. Find `## TV Flow`.
11. Find `## Focus`.
12. Open `out/workshop/adbt-port-context.json`.
13. Find the ADBT document hashes.
    :::

Reject the plan if it invents a screen, loses Back behavior, or names a Vega
API without an ADBT source.

## Test the approval boundary

Run the port phase before approval:

```sh
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --phases port --yes --run-id workshop
```

Expect `plan_approval_required`.
The harness stops before it calls the port model.

The check is in the command setup:

:::snippet packages/workshop-harness/src/index.ts (simplified)
beforePhase: (phase) => {
if (["port", "build", "launch", "test"].includes(phase.name)) {
assertPortPlanApproved(appDir);
}
},

> look: Every code or device phase checks the approval before the phase starts.
> :::

## Approve the plan

Approve only after you complete the review.

:::command Approve the reviewed plan
yarn tsx src/index.ts approve-plan workshop --yes
:::

:::expected
"command": "approve-plan"
"planSha256": "sha256:..."
:::

The command writes `out/workshop/app/port-plan-approval.json`.
The file contains the plan hash and workshop brief hash.

If either input changes, the approval becomes stale.
The harness then requires a new review and approval.

:::proof
claim: "The TV plan has valid structure, ADBT sources, and human approval"
gate: "The schema passes and the approval hashes match the reviewed plan and brief"
evidence: "port-plan.json, port-plan-approval.json, VEGA_PORT.md, and adbt-port-context.json"
limit: "The plan does not prove that the proposed Vega code will compile"
:::

:::knowledge What happened?
ADBT supplied current Vega information.
The model converted the app requirements into a structured plan.
The harness checked the plan references.
You approved the product decisions.
:::

:::done
`port-plan.json` contains the screens, navigation, behavior, and evidence.
`port-plan-approval.json` contains the plan and brief hashes.
`VEGA_PORT.md` contains the focus model and TV flow.
`adbt-port-context.json` contains the ADBT document records.
:::

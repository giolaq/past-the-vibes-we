---
id: analyze
number: '01'
nav: Analyze the app
time: 25 minutes
title: Analyze the app
lead: We will run the analyze phase in a copy under out/ and inspect the Vega documents that the model reads.
objective: Run the analyze phase and inspect the output.
evidence: An verified ANALYSIS.md file in the out/ directory.
---

:::welcome Start with one model call
First, we will run one model call without the phase controls.
Then, we will run the controlled analyze phase.

Both commands ask a model to inspect the same app.
Only the controlled phase uses ADBT, an independent check, and a Git commit.
:::

## Compare the two paths

The `naive` command asks for one proposed port.
The command saves the model response but does not apply the proposed files.

The analyze phase has a smaller goal.
It reads the app and writes `ANALYSIS.md`.
It does not change app code.

| Path      | Model task                            | Harness control                             |
| --------- | ------------------------------------- | ------------------------------------------- |
| `naive`   | Propose a complete port               | Save the proposal                           |
| `analyze` | Describe the app and portability work | Use ADBT, check the document, and commit it |

## Run the one-call example

Run the command from `packages/workshop-harness`.

:::yourturn
Save one proposed port.
Inspect the missing proof.
Confirm that the source app did not change.
:::

:::command Save one live proposal
yarn tsx src/index.ts naive ../../apps/pocket-cinema \
 --run-id naive-demo --yes
:::

The command flags have these functions:

| Flag or value              | Function                               |
| -------------------------- | -------------------------------------- |
| `../../apps/pocket-cinema` | Selects the source app                 |
| `--run-id naive-demo`      | Writes this run under `out/naive-demo` |
| `--yes`                    | Confirms the live model call           |

Expect the command to write two files:

- `out/naive-demo/naive-proposal.json` contains the proposed files.
- `out/naive-demo/naive-result.json` lists five claims without proof.

:::steps

1. Open `out/naive-demo/naive-proposal.json`.
2. Find one proposed Vega file.
3. Open `out/naive-demo/naive-result.json`.
4. Find the `missingProof` list.
5. Run `git -C ../../apps/pocket-cinema status --short`.
6. Confirm that the command prints no source changes.
   :::

The proposal can contain useful code.
The proposal is still a model claim.
No compiler or device checked it.

## Important harness code

The analyze phase is a TypeScript object in `src/port-pipeline.ts`.

:::snippet packages/workshop-harness/src/port-pipeline.ts (simplified)
{
name: "analyze",
goal: "Read the guarded React Native app and write ANALYSIS.md.",
instruction: "Read ADBT before making Vega portability claims.",
mcp: [ADBT_SERVER],
checks: [{
type: "contains",
path: "ANALYSIS.md",
value: "## Portable",
label: "Portability analysis documented",
}],
}

>look: The phase gives ADBT tools to the model. The independent check requires one section in ANALYSIS.md.
:::

The model can list, read, and search the guarded copy.
The model has no shell tool and no file write tool.
The model returns proposed files in JSON.

The harness validates the JSON and writes the files.
The harness then runs the `contains` check.
The harness commits the files only when the check passes.

## Run the analyze phase

Use run ID `workshop` for the main workshop flow.
Later lessons continue the same run.

:::yourturn
Run the analyze phase.
Wait for the model to inspect the app and read an ADBT document.
Do not start a second analyze command while the first command runs.
:::

:::command Run the analyze phase
yarn tsx src/index.ts run ../../apps/pocket-cinema \
 --phases analyze --yes --run-id workshop
:::

:::expected
"phasesComplete":["analyze"]
:::

The command can take several minutes.
The final JSON reports the model, token use, turns, and completed phases.

To watch the phase from a second terminal, run:

```sh
cd packages/workshop-harness
yarn tsx src/index.ts logs workshop --phase analyze --follow
```

The live transcript shows model requests, ADBT tool operations, checks, and the
phase commit.

## Inspect the result

:::steps

1. Open `out/workshop/app/ANALYSIS.md`.
2. Find the screen and component inventory.
3. Find the `## Portable` section.
4. Find the replacement work.
5. Open `out/workshop/adbt-port-context.json`.
6. Find the ADBT document names and hashes.
7. Open `out/workshop/port-result.json`.
8. Find the analyze attempt and usage values.
9. Run `git -C ../../out/workshop/app log --oneline`.
10. Find the analyze-phase commit.
11. Record three technical claims that the `contains` check did not verify.
    :::

The ADBT context file proves that the model read current Vega documents.
It does not prove that every model conclusion is correct.

:::proof
claim: "The model analyzed the app and identified portable work"
gate: "ANALYSIS.md contains the required portability section"
evidence: "out/workshop/app/ANALYSIS.md, adbt-port-context.json, and the analyze commit"
limit: "The check verifies document structure, not every technical conclusion"
:::

:::knowledge What happened?
The model inspected a guarded copy of Pocket Cinema.
The model used ADBT for Vega information.
The harness wrote and checked `ANALYSIS.md`.
The source app remained unchanged.
:::

:::done
The one-call example changed no source files.
`ANALYSIS.md` exists in the guarded copy.
The harness committed the passing phase.
You recorded three unverified claims.
:::

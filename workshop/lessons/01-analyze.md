---
id: analyze
number: "01"
nav: Analyze the app
time: 25 minutes
title: Run one model call, then add controls
lead: Run one model call without the phase controls. Then identify the claims that the call cannot prove. The guarded copy is the private working copy under out/.
objective: Explain why a patch that appears correct is not a verified result. Identify the boundary between the model and the harness.
evidence: An unverified proposal and a verified ANALYSIS.md file in the guarded copy.
---

:::welcome Start with the weak process
First, ask one model to port the app in one call.
The harness saves the proposal but does not apply it.

Then run one controlled phase.
A schema lists the fields that a response must contain.
A Git commit records an accepted snapshot of the files.
The controlled phase has a schema, a check, and a Git commit.
Compare the two results.
:::

## Run the one-call example

The model receives read-only project tools.
A patch is a proposed set of file changes.
A typed patch uses a JSON response with the required fields.
The model must return a typed patch.

The call does not receive these controls:

- Phase plan
- ADBT MCP server
- Independent checks
- Retry
- Compiler
- Device

:::predict
The proposal can contain a manifest, focus code, and a test.
Does the proposal prove that the port is correct?
Name one claim that you cannot make.
:::

:::yourturn
Run one model call without the controlled phase pipeline.
Inspect its proposal and identify what the call did not prove.
:::

:::command Save one live proposal
yarn tsx src/index.ts naive ../../apps/pocket-cinema \
  --max-tokens 1000000 --run-id naive-demo --yes
:::

:::note Use your workshop configuration
The command reads the model settings from `../../workshop.config.json`.
Do not add MCP to this command.
The `naive` command saves a proposal but does not apply the files.
The `--yes` flag confirms that you want to start the live model call.
The token limit is a generous safety limit for this comparison.
:::

`naive-proposal.json` contains the proposed files.
`naive-result.json` lists the claims that remain unproven.

:::steps
1. Open `out/naive-demo/naive-proposal.json`.
2. Read the proposed files.
3. Open `out/naive-demo/naive-result.json`.
4. Find each `proven: false` value.
5. Read the `missingProof` list.
6. Run `git status` on `apps/pocket-cinema`.
7. Make sure that the source app did not change.
:::

:::concept A good proposal is not evidence
The model can propose good code.
The proposal is still unverified.

Without an independent check, an incorrect result can appear correct.
Independent checks distinguish correct and incorrect results.
:::

## Know the starting app

`apps/pocket-cinema` is a small React Native app.
The app has a featured title, two content rails, and a details screen.

The app has no explicit TV focus behavior.
The app has no Vega package.
Lesson 00 verified these facts with `tv-check`.

The analyze phase will create `ANALYSIS.md`.
This document describes the app structure, dependencies, portable parts, replacement work, and open questions.

:::visual
src: assets/pocket-cinema-android-tv.png
alt: Pocket Cinema home screen on an Android TV emulator
label: Actual Android TV capture
caption: "The app can render on a TV screen. It does not have remote-control focus or a Vega package."
:::

## Know the six phases

:::flow
Analyze | Read the app
Plan | Define the TV port
Port | Write the code
Build | Produce the package
Launch | Start the app
Test | Verify remote behavior
:::

:::concept Know the harness boundary
The model can list, read, and search the guarded copy.
The model has no shell tool.
The model has no write tool.

The model returns a JSON object named `{summary, files}`.
`summary` describes the proposed change.
`files` maps each relative file path to its complete new content.
The harness validates the response.
The harness writes files and runs checks.
The harness retries with the exact failure text.
The harness commits only a passing result.
:::

## Trace Strands in the analyze phase

Open `src/port-executor.ts`.
One phase creates one Strands agent.
The optional token and turn limits from Lesson 00 can bound the model call.

:::snippet packages/workshop-harness/src/port-executor.ts (simplified)
const limits = selectedRunLimits();
const agent = new Agent({
  name: `workshop-${phase}`,
  model: createModel(config),
  tools: [
    ...createProjectReadTools(appDir),
    ...(options.extraTools ?? []),
  ],
  structuredOutputSchema: PortOutputSchema,
  systemPrompt: "Inspect with read-only tools. Return a complete patch.",
  printer: false,
});

const result = await consumeStream(
  agent.stream(prompt, { limits }),
  event => transcripts.append(phase, event),
);
>look: `extraTools` contains the ADBT MCP connection. `limits` contains only limits selected for the run. Strands supplies the model and tool loop. The harness controls writes, checks, Git, and cumulative usage.
:::

| Owner | Analyze action |
| --- | --- |
| Strands | Runs the model and tool loop. Lets the model inspect the guarded copy. Lets the model call ADBT tools. |
| ADBT MCP | Supplies current Vega documents for portability claims. |
| Harness | Permits the MCP server. Validates the typed response. Writes `ANALYSIS.md`. Runs the check. Commits a passing result. |
| Evidence | `ANALYSIS.md`, `model-logs/analyze.jsonl`, and the analyze commit |

:::note Claude CLI path
The snippet runs when `workshop.config.json` selects `strands`.
The Claude CLI executor receives the same prompt and required response fields.
The harness keeps the same write, check, and commit boundary.
:::

:::predict
The analyze phase will report which parts can move to Vega.
Which part can the phase verify mechanically?
Which part remains a model claim?
:::

## Run the analyze phase

Run one command.
Use the executor that you selected in Lesson 00.
The phase writes its accepted files only to `out/workshop/app`.

:::command Run the analyze phase
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --phases analyze --yes --run-id workshop
:::

:::expected
"phasesComplete":["analyze"]
:::

## Inspect the evidence

The import commit is the first snapshot of the copied source app.
The analyze commit is the snapshot accepted after the phase check.
A JSON Lines (JSONL) file stores one JSON event on each line.

:::steps
1. Open `out/workshop/app/ANALYSIS.md`.
2. Find the required portability section.
3. Run `git status` on `apps/pocket-cinema`.
4. Make sure that the source app is unchanged.
5. Run `git log --oneline` in `out/workshop/app`.
6. Find the import commit.
7. Find the analyze-phase commit.
8. Open `out/workshop/port-result.json`.
9. Find the `attempts` value.
10. Open `out/workshop/model-logs/analyze.jsonl`.
11. Find the ADBT document read.
12. Record three claims in `ANALYSIS.md` that no check verified.
:::

:::note Why the harness uses Git
The harness resets a failed attempt to the phase-start commit.
A rejected patch leaves no file changes.
Git supplies rollback and a record of accepted work.
:::

## Compare two executors

Work with a person who used a different executor.
Do not run the phase again.

Compare the first and last events in `model-logs/analyze.jsonl`.

| Changes with the executor | Stays in the harness |
| --- | --- |
| Provider event names | Phase name |
| Token accounting | Prompt and response requirements |
| Claude Code process or Strands `Agent` | Required `{summary, files}` response |
| Tool event format | Write, check, limit, and commit rules |

Changing the executor must not change the pass condition.

:::proof
claim: "The model identified content that can move to Vega"
gate: "ANALYSIS.md exists and contains the required portability section"
evidence: "out/workshop/app/ANALYSIS.md and model-logs/analyze.jsonl"
limit: "This check does not prove that each portability conclusion is correct"
:::

:::knowledge What did this phase prove?
The phase proved that `ANALYSIS.md` has the required structure.
The phase did not prove that the analysis is complete.
The phase did not prove that each technical conclusion is correct.
:::

:::done
The one-call example changed no source files.
`ANALYSIS.md` exists in the guarded copy.
The harness committed the passing phase.
You recorded three unverified claims.
:::

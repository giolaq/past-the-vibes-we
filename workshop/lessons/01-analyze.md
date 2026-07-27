---
id: analyze
number: "01"
nav: Analyze the app
time: 25 minutes
title: Run one model call, then add controls
lead: Run one model call without the phase controls. Then identify the claims that the call cannot prove.
objective: Explain why a plausible patch is not a verified result. Identify the boundary between the model and the harness.
evidence: An unverified proposal and a verified ANALYSIS.md file in the guarded copy.
---

:::welcome Start with the weak process
First, ask one model to port the app in one call.
The harness saves the proposal but does not apply it.

Then run one controlled phase.
The controlled phase has a schema, a check, and a Git commit.
Compare the two results.
:::

## Run the one-call example

The model receives read-only project tools.
The model must return a typed patch.

The call does not receive these controls:

- Phase plan
- TV skill
- ADBT MCP server
- Independent checks
- Retry
- Compiler
- Device

:::predict
The proposal can contain a manifest, focus code, and a test.
Does this prove that the port is correct?
Name one claim that you cannot make.
:::

:::command Save one live proposal
yarn --cwd packages/workshop-harness tsx src/index.ts naive ../../apps/pocket-cinema \
  --executor claude-cli --model sonnet \
  --max-cost 1 --run-id naive-demo --yes
:::

:::note Use your selected executor
If you selected Strands, use the provider and model flags from Lesson 00.
Do not add skills or MCP to this command.
:::

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

Without an independent check, a correct result and a convincing result look the same.
The harness makes these results different.
:::

## Know the starting app

`apps/pocket-cinema` is a small React Native app.
It has a featured title, two content rails, and a details screen.

The app has no explicit TV focus behavior.
It has no Vega package.
Lesson 00 verified these facts with `tv-check`.

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
It has no shell tool.
It has no write tool.

The model returns `{summary, files}`.
The harness validates the response.
The harness writes files and runs checks.
The harness retries with the exact failure text.
The harness commits only a passing result.
:::

## Inspect the Strands agent

Open `src/port-executor.ts`.
One phase creates one bounded Strands agent.

:::snippet packages/workshop-harness/src/port-executor.ts (simplified)
const agent = new Agent({
  name: `workshop-${phase}`,
  model: createModel(config),
  tools: createProjectReadTools(appDir),
  plugins: [createSkillsPlugin(skills)],
  structuredOutputSchema: PortOutputSchema,
  systemPrompt: "Inspect with read-only tools. Return a complete patch.",
  printer: false,
});

const result = await consumeStream(
  agent.stream(prompt, {
    cancelSignal: AbortSignal.timeout(10 * 60_000),
    limits: { turns: 8, totalTokens: 40_000 },
  }),
  event => transcripts.append(phase, event),
);
>look: Strands supplies the agent loop, providers, tools, skills, schema, limits, cancellation, and metrics. The harness controls writes, checks, Git, and costs.
:::

:::predict
The analyze phase will report which parts can move to Vega.
Which part can the phase verify mechanically?
Which part remains a model claim?
:::

## Run the analyze phase

Run one command.
Use the executor that you selected in Lesson 00.

:::command Claude Code CLI
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor claude-cli --model sonnet \
  --phases analyze --yes --run-id workshop
:::

:::command Strands with Bedrock
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2 \
  --phases analyze --yes --run-id workshop
:::

:::expected
"phasesComplete":["analyze"]
:::

## Inspect the evidence

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
10. Record three claims in `ANALYSIS.md` that no check verified.
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
| Token accounting | Prompt contract |
| Claude subprocess or Strands `Agent` | `{summary, files}` schema |
| Skill delivery | Write, check, budget, and commit |

Changing the executor must not change the pass condition.

:::proof
claim: "The model identified content that can move to Vega"
gate: "ANALYSIS.md exists and contains the required portability section"
evidence: "out/workshop/app/ANALYSIS.md and model-logs/analyze.jsonl"
limit: "This check does not prove that each portability conclusion is correct"
:::

:::knowledge What did this phase prove?
The phase proved that `ANALYSIS.md` has the required structure.
It did not prove that the analysis is complete.
It did not prove that each technical conclusion is correct.
:::

:::done
The one-call example changed no source files.
`ANALYSIS.md` exists in the guarded copy.
The harness committed the passing phase.
You recorded three unverified claims.
:::

:::fallback
If the live model fails, use the recorded fallback:
:::

:::command Recorded fallback
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
  --phases analyze --yes --run-id workshop
:::

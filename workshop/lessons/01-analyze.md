---
id: analyze
number: "01"
nav: Analyze the app
time: 25 minutes
title: Meet the app, the harness, and your first agent
lead: We start where the port starts — with an agent that reads your React Native app and writes down what it found.
objective: Build a mental model of the harness and locate the boundary between what the model proposes and what your code does.
evidence: ANALYSIS.md exists in the guarded copy, and you can name three claims in it that nothing has checked.
---

:::welcome The app, the harness, and one agent
Over the next four hours we build a harness that ports a React Native app to Vega TV, one phase at a time. This lesson introduces all three things you need to start: the app we're porting, the shape of the harness around it, and the Strands agent that does the reading. Then we run the first phase for real and look at what it produced.
:::

## The app

`apps/pocket-cinema` is a small React Native app: a featured title, two rails of cards, and a details screen. It runs on a phone. It is not a TV app, and in lesson 0 you proved that mechanically — `tv-check` reported `tvReady: false` with a list of failures. That list is the workshop's to-do list.

:::visual
src: assets/pocket-cinema-android-tv.png
alt: Pocket Cinema home screen running on an Android TV emulator, with a featured title and a horizontal content rail
label: Actual Android TV capture
caption: "The starting point. It renders on a TV screen, but nothing in it answers a remote control — no focus, no Vega package, no way to build."
:::

## The harness, in one diagram

Six phases, each one a model call bounded by code that checks the result:

:::flow
Analyze | Read the app
Plan | Decide the TV port
Port | Write the code
Build | Make it compile
Launch | Make it run
Test | Prove the remote works
:::

:::concept The boundary that makes this a harness
The model can list, read, and search the guarded copy of your app. It has no write tool and no shell. It answers in a fixed shape — `{summary, files}` — and your code decides what happens next: write the files, run the checks, retry with the exact failure, commit what passed, stop when the money runs out. Everything with consequences lives in `src/port-pipeline.ts`. That split is the reason to build a harness instead of prompting a coding agent: you own every write, every check, and every dollar, and every one of them leaves a record.
:::

## How the agent is built

One phase is one bounded agent. This is the whole live model interaction, from `src/port-executor.ts`:

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
const result = await consumeStream(
  agent.stream(prompt, {
    cancelSignal: AbortSignal.timeout(10 * 60_000),  // 10-min hard stop
    limits: { turns: 8, totalTokens: 40_000 },       // bounded loop
  }),
  event => {
    const payload = serializable(event);
    transcripts.append(phase, {
      attempt, executor: "strands",
      direction: strandsDirection(payload.type, payload),
      kind: payload.type, payload,
    });
  },
);
>look: Strands supplies the model-and-tool loop, provider adapters, skill delivery, schema-validated output, turn and token limits, cancellation, and usage metrics. Writing files, verification, Git, cost policy, and ADBT selection stay in the harness.
:::

:::predict
The agent is about to read Pocket Cinema and report what is portable. Name one thing it could get wrong in a way that still reads as confident.
:::

## Run the first phase

:::yourturn
Run phase 1 and nothing else. `--phases` takes the subset you want, so you meet the pipeline one piece at a time.
:::

:::note Use the model you selected in setup
Run one live block, not both. For Strands with OpenAI or OpenRouter, keep the Strands block and
replace its provider and model flags with the pair from lesson 0.
:::

:::command Claude Code CLI
# Claude Code CLI. One phase, on a guarded copy of your app.
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor claude-cli --model sonnet \
  --phases analyze --yes --run-id workshop
:::

:::command Strands + Bedrock
# Strands + Bedrock
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2 \
  --phases analyze --yes --run-id workshop
:::

:::expected
"phasesComplete":["analyze"]
:::

## Look at what it produced

:::steps
1. Open `out/workshop/app/ANALYSIS.md` — the model's answer, written by the harness after the check passed.
2. Run `git status` on `apps/pocket-cinema`. Your app never moved: the harness copied it first, and everything happens in the copy.
3. Run `git log --oneline` inside `out/workshop/app`. Two commits: the imported source, and the phase that passed.
4. Open `out/workshop/port-result.json` and find the phase's `attempts` and the checks it cleared.
5. Write down three claims in `ANALYSIS.md` that nothing in this run has verified.
:::

:::note Why a copy, and why Git
The guarded copy is where the model's authority ends. Git inside it is not decoration: a failed attempt is reset to the phase's starting commit, so a rejected patch leaves nothing behind. Rollback and record are the same mechanism, and you will watch it work in lesson 3.
:::

:::knowledge What has this phase actually proved?
That a file exists and contains a required section. Nothing has checked whether the analysis is complete, whether its portability calls are right, or whether a later phase will invent an API. Every phase that follows closes one of those gaps.
:::

:::done
`ANALYSIS.md` exists in the guarded copy, `apps/pocket-cinema` is untouched, and you have three unverified claims written down.
:::

:::fallback
If the live model is blocked, run the committed recording instead — same exercise, no account:
:::

:::command Fallback: replay
# Fallback if the live model is blocked
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
  --phases analyze --yes --run-id workshop
:::

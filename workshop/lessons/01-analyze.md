---
id: analyze
number: "01"
nav: Analyze the app
time: 25 minutes
title: First ask once, then build the boundary
lead: Start with the tempting one-shot port. It may look excellent. Then inspect the five things it cannot prove and add the first controlled phase.
objective: Explain why a plausible patch is not a verified result, then locate the boundary between what the model proposes and what your code does.
evidence: A saved one-shot proposal that changed nothing, followed by a checked ANALYSIS.md in the guarded copy.
---

:::welcome Begin with the shortcut
The fastest way to understand a harness is to remove it. First ask one model to port the whole app in one call. We save its patch but apply nothing. Then we put the first boundary back: one phase, one structured result, one check, one commit. The difference between those two runs is the workshop.
:::

## The tempting one-shot version

This call still gets read-only project tools and a typed patch because we refuse to give a live
model direct write access. It gets no phase plan, TV skill, ADBT MCP server, verification, retry,
compiler, or device. That is close to how “just ask the agent” feels in practice.

:::predict
If the proposal contains a Vega manifest, focus code, and a test, has the port succeeded? Name the
first claim you would still refuse to make.
:::

:::command Save one live proposal; apply nothing
yarn --cwd packages/workshop-harness tsx src/index.ts naive ../../apps/pocket-cinema \
  --executor claude-cli --model sonnet \
  --max-cost 1 --run-id naive-demo --yes
:::

:::note Using Strands
Replace `--executor claude-cli --model sonnet` with the provider and model flags you chose in
lesson 0. This probe works through either executor and deliberately supplies neither skills nor MCP.
:::

:::steps
1. Open `out/naive-demo/naive-proposal.json`. It can be detailed, coherent, and still unproved.
2. Open `out/naive-demo/naive-result.json`. Every coverage row says `proven: false`, including rows the model proposed.
3. Read `missingProof`: no ADBT source, no applied patch, no compiler, no device, no remote behavior.
4. Run `git status` on `apps/pocket-cinema`. The anti-demo changed nothing outside its guarded copy.
5. Keep the proposal open. At the end of lesson 6, compare its claims with the evidence the full harness retained.
:::

:::concept The defect is the process, not necessarily the code
The model may produce good code. That does not repair the missing contract around it. Without an
independent observer, “correct” and “convincing” look identical. A harness does not assume the
model will fail; it makes success distinguishable from confidence.
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
The controlled agent is about to report what is portable. Which part of its answer can the first
phase check mechanically, and which part remains only a claim?
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

## Same harness, different executor

Pair with someone who chose a different live path. Do not rerun the phase. Compare the first and
last events in your two `model-logs/analyze.jsonl` files.

| Changes with the executor | Stays owned by the harness |
| --- | --- |
| Provider event names and token accounting | Phase name and prompt contract |
| Claude subprocess versus Strands `Agent` | `{summary, files}` schema |
| Skill delivery mechanism | Guarded write, check, budget, commit |

The executor is an adapter. If changing providers also changes what “passed” means, the boundary is
in the wrong place.

:::proof
claim: "I understand what can move to Vega"
gate: "ANALYSIS.md exists and contains the required portability section"
evidence: "out/workshop/app/ANALYSIS.md + model-logs/analyze.jsonl"
limit: "The first gate proves structure, not that every portability conclusion is correct"
:::

:::knowledge What has this phase actually proved?
That a file exists and contains a required section. Nothing has checked whether the analysis is complete, whether its portability calls are right, or whether a later phase will invent an API. Every phase that follows closes one of those gaps.
:::

:::done
The one-shot proposal changed nothing, `ANALYSIS.md` exists in the guarded copy, the source app is untouched, and you have three unverified claims written down.
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

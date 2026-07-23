---
id: plan
number: "06"
nav: Plan and port
time: 35 minutes
title: Inspect first, then change a guarded copy
lead: Review the scope, checks, ADBT context, seed, and cost before approving a port — the run edits a guarded copy, and your source app stays untouched.
objective: Follow the complete port boundary from plan approval to a checked, committed app copy.
evidence: The report links approved ADBT context, a typed patch, check results, cost, and Git commits.
---

:::concept The production loop
The plan is the human approval boundary. During analyze and plan the model calls ADBT over MCP itself to gather Vega knowledge. Strands proposes a typed patch from read-only project tools. The harness records every ADBT read, applies the patch, checks it, retries once, and commits only verified work.
:::

:::flow
ADBT MCP | Model reads workflows
Record | Hash each read
Model | Propose a typed patch
Checks | Write, commit, or retry
:::

:::concept Your source is never touched
Before anything runs, the harness copies your app into `out/<runId>/app/` and runs `git init` inside that copy. Everything the model proposes is written <em>there</em>. Your real `apps/pocket-cinema/` is read once and never modified. The `<runId>` is a fresh directory per run, so runs never clobber each other — and the harness makes a Git commit per passing phase, so if phase 3 explodes, phases 1 and 2 are already committed and safe.
:::

<h2>The three phases of a port</h2>
      <p>The port is a fixed sequence of three phases that mirror the mini-harness exactly: <strong>analyze → plan → build_test</strong>. Each is a model phase that ends in a mechanical check; two of them draw on ADBT. Source of truth: <code>src/index.ts</code> (the <code>phases: [...]</code> array) and <code>src/port-pipeline.ts</code> (the <code>phases()</code> function).</p>

:::snippet The phase order — packages/workshop-harness/src/port-pipeline.ts
analyze  ->  plan  ->  build_test
(model +      (model +    (model + executable focus test
 feasibility   live ADBT)  + mandatory device screenshot)
 via ADBT)
>look: Open `src/port-pipeline.ts` and read `phases()`. Each name below maps to one entry.
:::

:::phase 1
name: analyze
tags:
  - {label: model, kind: model}
  - {label: ADBT feasibility, kind: adbt}
rows:
  Does: >-
    Reads the guarded app and writes `ANALYSIS.md` describing its screens, components, data, and what is portable to Vega TV. Alongside it, during the `plan` command — before any phase runs — a deterministic dependency inventory (`auditSource`) plus a bounded model+ADBT step judge whether the port is even possible.
  Check: >-
    `ANALYSIS.md` must contain `## Portable`.
  Feasibility gate: >-
    The model returns a verdict — `feasible`, `feasible-with-adapters`, or `blocked`. A `blocked` verdict stops the run with exit code 5 <em>before</em> any build budget is spent.
  Inspect: >-
    `out/<runId>/app/ANALYSIS.md`, `feasibility-report.json`, and the deterministic inventory in `portability-report.json`.
  Code: >-
    `src/port-pipeline.ts`, `src/feasibility.ts`, `src/portability-audit.ts`
:::

:::phase 2
name: plan
tags:
  - {label: model, kind: model}
  - {label: live ADBT, kind: adbt}
rows:
  Goal: >-
    Plan the Vega TV port: preserved product behavior, Vega replacements, and the exact remote flow.
  ADBT step: >-
    The harness hands the ADBT `McpClient` to the Strands agent; Strands lists ADBT's tools dynamically and the model calls them itself — `list_documents` to discover Vega workflows, then `read_document` to read the ones it judges relevant. The harness pre-picks nothing; after the phase it reconstructs the reads from the agent's messages and hashes them into `adbt-port-context.json`. (The claude-cli executor reaches ADBT through its own MCP config set up by `init-context`.)
  Skill injected: >-
    Use the ADBT tools to discover and read the Vega migration workflows you need. Keep facts and assumptions separate, port one vertical slice, record gaps instead of inventing APIs.
  Checks: >-
    `VEGA_PORT.md` contains `## TV Flow`; `NextSteps.md` contains `ADBT` (names its sources).
  Inspect: >-
    `out/<runId>/app/VEGA_PORT.md`, `NextSteps.md`, `adbt-port-context.json`, and the commit `workshop(plan): ...`.
:::

:::phase 3
name: build_test
tags:
  - {label: model, kind: model}
  - {label: executable test}
  - {label: device screenshot, kind: adbt}
rows:
  Goal: >-
    Build the `apps/vega` package from the SDK shape, wire the remote-only home→details flow, and prove it.
  Build checks: >-
    manifest `schema-version = 1` and `[[components.interactive]]`; `package.json` has `build-vega`; `app.json` and `metro.config.js` exist; root `package.json` has `vega:build`; `src/tv/focus-state.ts` exists; `src/App.tsx` imports `./tv/focus-state`.
  Test checks: >-
    A real command runs — `node --import tsx tests/verify-tv-focus.ts` must exit 0. Back must return focus to the <em>originating card</em>, verified by a script, not a human eyeball. `tv-focus-result.json` shows `"passed": true`; `TV_VERIFICATION.md` contains `originating card`.
  Screenshot (mandatory): >-
    The phase then runs the Vega device lifecycle: two pre-gates (SDK version, device status), then build → install → launch → logs → capture → pull — the eight gates lesson 8 inspects. <strong>The run fails unless a launch screenshot is produced.</strong> Replay uses `--platform-replay` to stay key-free; live runs against a real VDA.
  Inspect: >-
    `out/<runId>/01-launch.png`, `vega-platform-result.json`, `tv-focus-result.json`, and the commit `workshop(build_test): ...`.
  Code: >-
    `src/port-pipeline.ts`, `src/platform/vega.ts`
:::

:::note Screenshot is now a mandatory gate {warning}
The device screenshot is a required pass criterion of `build_test`. Two consequences: a device (or its `--platform-replay` fixture) is now mandatory for a green run, and on the current VDA image the live screenshot tool segfaults, so the <em>live</em> screenshot can't be produced until that tooling is fixed. The key-free replay path stays green via `--platform-replay ../../workshop/fixtures/vega-lifecycle.json`.
:::

<h2>Every phase is built from the same prompt template</h2>
      <p>You don't need to guess what the model sees. Every phase prompt is assembled by one function — <code>prompt()</code> in <code>src/port-pipeline.ts</code> — from the same slots. The model is told the exact checks it will be graded against, a failed attempt gets the verbatim failure text fed back in, and the output contract is strict JSON.</p>

:::snippet The universal prompt template — src/port-pipeline.ts, prompt()
You are porting the CURRENT guarded React Native app to Vega SDK 0.22.5875.
Read existing files before proposing edits. Preserve unrelated work.

Phase: <name>
Goal: <one sentence>
Skill: <domain instruction for this phase>
Creative seed: workshop-v1

Approved context:
<project memory, or "No approved project context.">

Portability findings:
<the JSON from phase 2's audit>

[ ONLY on plan: the ADBT guidance block, with SHA-256 hashes ]

Required checks:
<each check listed verbatim, so the model knows the bar it must clear>

[ ONLY on a retry: "Previous attempt failed:\n<exact failure lines>\nFix these." ]

Return ONLY JSON: {"summary":"...","files":{"relative/path":"complete contents"}}.
>look: This exact string is built in `src/port-pipeline.ts`. Every live model turn — the prompt sent and the raw text returned — is recorded to `out/<runId>/port-recording.json`. That file is your audit trail: `request.messages[0].content` is the prompt, `response[].result` is the model's answer.
:::

:::predict
The model now calls ADBT over MCP itself. What has to be recorded for the run to stay reproducible and auditable?
:::

:::command Plan the Pocket Cinema port
yarn --cwd packages/workshop-harness tsx src/index.ts plan ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --seed workshop-v1 --max-cost 3 --json
:::

## Review the plan before approval

:::steps
1. Confirm the source app and target flow.
2. Read the deterministic portability findings and the model's feasibility verdict.
3. Confirm the feasibility verdict is not <code>blocked</code> — a blocked verdict stops the run at exit code 5 before any build budget.
4. Check that ADBT is assigned to <code>analyze</code> (feasibility) and <code>plan</code>.
5. Check the three-phase plan (analyze → plan → build_test), fixed seed, and $3 cap.
6. Notice that build_test folds in the device screenshot lifecycle from lesson 8.
:::

## Run the port against a live model

Approve and run with a real model. On the Claude CLI path the model reaches ADBT through the MCP config you set up in lesson 0; on the Strands path the harness hands it the ADBT client. `build_test` needs an attached VDA to capture the launch screenshot.

:::command Claude Code CLI
# Claude Code CLI. The model drives ADBT via the CLI's MCP config (init-context).
# build_test needs an attached VDA to capture the launch screenshot.
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor claude-cli --model sonnet \
  --yes --seed workshop-v1 --max-cost 3 --json
:::

:::command Strands + Bedrock
# Strands + Bedrock. The harness hands the ADBT McpClient to the agent.
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2 \
  --yes --seed workshop-v1 --max-cost 3 --json
:::

## Build an evidence chain

:::steps
1. Copy the <code>runId</code> from the output.
2. Open <code>out/&lt;runId&gt;/adbt-port-context.json</code> and find the workflow names and hashes the model read.
3. Open <code>port-result.json</code> and confirm <code>adbt.mode: live</code>.
4. Open <code>app/NextSteps.md</code> and find ADBT sources and unsupported mappings.
5. Inspect the guarded app, report, and Git log.
6. Confirm <code>apps/pocket-cinema</code> is unchanged.
:::

<p>This chain is the observability you built the harness for: the prompts, the document reads, the cost, and the commits of the whole run are on disk, inspectable by anyone, without asking the model what it did.</p>

:::knowledge The model fetches ADBT docs itself now. How does the run stay auditable and reproducible?
The harness reconstructs every ADBT read from the agent's messages after the phase — document name, excerpt, and a SHA-256 hash into `adbt-port-context.json`. So even though the model chose what to read, there is an exact, hashed record of the knowledge it used — and replay can rerun from that recorded context with no live MCP server.
:::

:::fallback
If a live model, ADBT, or VDA is unavailable, run the fully recorded path — same phases and evidence contract, no credentials:
:::

:::command Fallback: replay
# Fallback if a live model, ADBT, or VDA is unavailable.
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
  --platform-replay ../../workshop/fixtures/vega-lifecycle.json \
  --yes --seed workshop-v1 --max-cost 3 --json
:::

<h2>Worked example: real prompt in, real output out</h2>
      <p>This is captured from an actual live run (<code>c9fc9e58</code>, real Claude model, live ADBT over MCP). It shows the ADBT-driven planning and the generated Vega package. (This capture predates the model-driven-MCP change: it used harness injection. Today the model calls ADBT's <code>read_document</code> tool itself, but the recorded provenance below — document names and SHA-256 hashes — is exactly what the harness now reconstructs from the model's tool calls.)</p>
      <h3>What the model read from ADBT</h3>
      <p>The harness records every document the model fetched, with a hash, into <code>adbt-port-context.json</code>. Recorded provenance from this run:</p>

:::snippet adbt-port-context.json (recorded reads, excerpt)
## ADBT Vega Port Guidance

Mode: live
Sources:
- port_tv_app_to_vega.md (sha256: 5dcf0e6f8a5b6a62d688562c46a9f22f414715c1b792ecdaf92bc0e8016214ea)
- port_tv_app_to_vega_fos_rn_app.md (sha256: 2f67d9dc1133a52e9873513c3d66a2c0a2ca090a0d90284e1bb54e3f825f5607)

### port_tv_app_to_vega.md
## Purpose
Entry point for all FOS-to-Vega app migrations. This workflow determines what the
user wants to convert, runs shared prerequisites (SDK check, device detection), then
dispatches to the appropriate conversion-specific orchestrator.
...

Use these ADBT sources for Vega-specific decisions. Do not invent Vega APIs.
Write unsupported or uncertain mappings to NextSteps.md and name the ADBT documents consulted.
>look: Why hashes? So the exact knowledge the model was given is provable and reproducible later. Find it in `out/<runId>/adbt-port-context.json`.
:::

<h3>Out of <code>build_test</code> — what came out</h3>
      <p>The model returned a multi-file patch. Several build_test checks <code>grep</code> the generated manifest — and it contains exactly the strings they look for:</p>

:::snippet Generated apps/vega/manifest.toml
schema-version = 1

[package]
title = "Pocket Cinema"
id = "com.pocketcinema.app"

[[components.interactive]]
id = "com.pocketcinema.app.main"
runtime-module = "@pocket-cinema/rn"
launch-type = "singleton"
:::

<p>Also worth reading: the <code>NextSteps.md</code> the model wrote back in the <em>plan</em> phase. It didn't have full MCP doc access in that session, and instead of bluffing, it said so:</p>

:::snippet Generated NextSteps.md (excerpt) — the model admitting uncertainty
## Unverified against SDK docs (MCP doc access not granted)

The buildertools MCP read_document / list_documents calls were denied in this
session, so the items below rely on the Vega skill summaries and the ADBT
workflows above. They MUST be confirmed against the named KB documents before
relying on them — they are not invented APIs presented as fact.

1. Manifest schema — verify field names and the [[components.interactive]] shape.
2. App icon asset — vega_app_manifest.md requires a 512x512 PNG.
3. Build CLI — confirm the exact Kepler/Vega build invocation.
>look: The skill told the model to record gaps instead of inventing APIs, and this is what that looks like in output. The plan-phase check `NextSteps.md contains "ADBT"` passed, so the plan committed; the later build_test phase then had to clear all 11 of its own checks before it committed too.
:::

:::note What the worked example shows
The model produces large, well-structured artifacts — and it also wraps JSON in prose and admits uncertainty. The harness doesn't read any of that as truth: it extracts the JSON, writes it to the guarded copy, and runs mechanical grep/file_exists checks. Only passing work is committed.
:::

<h2>How ADBT connects during the port</h2>

:::command Check the native ADBT MCP path
yarn --cwd packages/workshop-harness tsx src/index.ts doctor --adbt-live --json
:::

:::include mcpConstructs
:::

:::note Two executor paths
Strands: the harness passes the ADBT `McpClient` into the agent's tools and the model calls ADBT itself. Claude CLI: the CLI reaches ADBT through the MCP config from `init-context`. Either way the harness reconstructs and hashes what was read.
:::

:::done
You can trace each MCP construct from connection through the model's own tool calls, a typed proposal, checks, a verified commit, and the final report.
:::

:::fallback
A live port stops with exit 3 when ADBT is unavailable; it never continues with unsupported assumptions. Use the recorded ADBT context via the replay fallback above.
:::

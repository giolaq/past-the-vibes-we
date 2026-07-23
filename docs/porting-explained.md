# How the Vega Port Works

Written for a React Native developer who has never touched an "agent harness," an LLM tool, or MCP. No prior AI knowledge assumed. Every claim here maps to real code in this repo and to a real run we executed (`e5ec5311`).

---

## 0. The one-paragraph version

We took a small React Native app (Pocket Cinema) and ported one screen flow to run on Vega, Amazon's TV OS. We did not do it by hand, and we did not just ask an AI "please port this app." Instead we built a **harness** on Strands Agents SDK: a plain TypeScript program that runs a fixed pipeline of steps, lets an AI model *propose* code inside tight walls, and keeps for itself every dangerous or irreversible action — writing files, running checks, committing to git, spending money, talking to the device.

If you remember one sentence: **the model is a contractor with read-only access; the harness is the foreman who checks the work and signs off.**

---

## 1. Vocabulary, translated for a React Native dev

You already know these concepts under different names — here's the dictionary.

| Term | What it actually is | Your mental model |
|---|---|---|
| **LLM / model** | A program that turns text-in into text-out. Given a prompt, it returns a guess. Claude is one. | A very well-read intern who writes plausible code but never runs it |
| **Prompt** | The text you send the model | The Jira ticket + all context you paste in |
| **Agent** | A model wired to a loop where it can call functions ("tools"), see the result, and decide what to do next | An intern who can also grep your repo before answering, several times |
| **Tool** | A named function you expose to the model, with a typed signature. The model can *request* a call; your code runs it and returns the result | A locked-down CLI you hand the intern: `read_file`, `list_files`, nothing else |
| **Structured output** | Forcing the model to answer as JSON matching a schema, not free prose | A required PR template the intern cannot deviate from |
| **MCP (Model Context Protocol)** | A standard wire protocol so a program can start another program as a "server" and call its tools over stdin/stdout | Like starting a language server (LSP) and asking it questions, but for arbitrary tools |
| **ADBT** | Amazon Device Build Tools, exposed here as an MCP server. It serves Vega migration know-how as documents | An internal wiki you can query programmatically |
| **Skill** | A block of domain instructions ("how to do TV focus") kept separate from code | A runbook you paste into the ticket for one specific task |
| **Harness** | The deterministic TypeScript program orchestrating all of the above | Your CI pipeline, if CI could also call an intern mid-step |
| **Replay** | Running the pipeline against *recorded* model answers instead of a live model | Fixtures / VCR cassettes for network calls |
| **VDA** | Vega Virtual Device — an emulator for the TV OS | Android emulator, but for Vega |

The most important row is the first one: an LLM generates plausible text, and plausible is not the same as correct. Everything the harness does closes that gap.

---

## 2. Why a harness at all? (the problem it solves)

Say you ask a smart intern to port an RN app to Vega, and they hand you 24,000 characters of new files. Questions you cannot answer by reading it:

- Does it compile?
- Did it invent a Vega API that does not exist?
- Does the TV remote actually move focus correctly, or does it just *look* right?
- Did it touch files it shouldn't?
- How much did this cost, and can I reproduce it?

A raw model call gives you output and zero answers to those. A harness wraps the model call in machinery that answers all of them, every time, mechanically. That is the whole point of this repo.

This project teaches it in two sizes:

- **`packages/mini-harness/`** — the idea in ~40-line files you can read in one sitting. Lessons 1–4. Deliberately incomplete so the missing pieces are visible.
- **`packages/workshop-harness/`** — the production-shaped version that did the real Vega port. Lessons 5–9. This document is about this one.

They share the same skeleton. `packages/mini-harness/ISOMORPHISM.md` maps one to the other file by file.

---

## 3. The cast: who is allowed to do what

This is the security model:

```
ADBT (MCP server)  --->  supplies approved Vega knowledge   ---+
                                                               |
guarded app copy   --->  read-only tools (list/read/search) --+--> Strands Agent --> proposes a typed patch {summary, files}
                                                               |
                                                               v
     HARNESS: validate paths -> write files -> run checks -> retry once -> git commit -> enforce cost -> write report
```

- **The model (via Strands Agent)** can only: list files, read files, search files — all inside one guarded copy of the app. It has **no write tool and no shell**. It returns a JSON patch. That is the ceiling of its power. (`src/port-tools.ts`, `src/port-executor.ts`)
- **ADBT** supplies platform knowledge. During `analyze` and `plan` the harness hands the ADBT `McpClient` to the Strands agent (`tools: [...projectTools, adbtClient]`); Strands discovers ADBT's tools (`list_documents`, `read_document`, `search_documentation`) dynamically and the model calls them itself. The harness does not pre-pick documents. Afterward it reconstructs which docs the model read from the agent's messages and hashes each into `adbt-port-context.json`. The model still has no write tool and no shell. (`src/context-providers/adbt.ts`)
- **The harness** owns everything with consequences: writing to disk, running verification, committing to git, the cost cap, retries, and the final report. (`src/port-pipeline.ts`)

The strictness has a reason: a model with a write tool or a shell can corrupt your repo on one confident wrong guess. Keeping irreversible actions in deterministic code means the worst a bad answer can do is *fail a check and get rejected*.

---

## 4. The guarded copy: your source is never touched

Before anything runs, the harness copies your app into `packages/workshop-harness/out/<runId>/app/` and does `git init` inside that copy (`src/port-pipeline.ts` → `initializeGit`). Everything the model proposes is written there. Your real `apps/pocket-cinema/` is read once and never modified.

We verified this live: after the whole port, `git status apps/pocket-cinema/` was clean. The `<runId>` (e.g. `e5ec5311`) is a fresh directory per run, so runs never clobber each other.

Inside that copy, the harness makes a git commit **per passing phase**. That commit is the recovery mechanism, not decoration. If phase 3 explodes, phases 1 and 2 are already committed and safe.

---

## 5. The pipeline: every phase, in order

The port is a fixed sequence of **three phases** — the same shape as the mini-harness (`analyze → plan → build_test`). Each is a model phase that ends in a mechanical check; two draw on ADBT. Source of truth: `src/index.ts` (`phases: [...]`) and `src/port-pipeline.ts` (`phases()`).

```
analyze  ->  plan  ->  build_test
(model +      (model +   (model + executable focus test
 feasibility   live ADBT)  + mandatory device screenshot)
 via ADBT)
```

Before the pipeline runs, `source_discovery` copies your RN app into the guarded `out/<runId>/app` and records provenance (`src/source-app.ts`) — your real app is read once and never modified. Below, for each phase: what it does, what the model is asked, what is checked, and what file to open to see the result.

### Phase 1 — `analyze` (model + ADBT feasibility)
**Does:** The model reads the guarded app and writes `ANALYSIS.md` describing its screens, components, data, and what is portable to Vega TV. Alongside it, at `plan` time, `auditSource()` (`src/portability-audit.ts`) builds a deterministic dependency inventory (plain string-matching over `package.json`, no model), and `runFeasibility()` (`src/feasibility.ts`) hands that inventory plus ADBT's Library Compatibility guidance to a bounded model, which returns a **feasibility verdict**: `feasible`, `feasible-with-adapters`, or `blocked`, with a per-dependency status (`supported` / `needs-adapter` / `blocking`).
**Check (`port-verification.ts`):** `ANALYSIS.md` must contain `## Portable`.
**Gate:** if the verdict is `blocked`, the harness stops with exit code 5 (`port_infeasible`) — *before* spending any build budget. It fails fast rather than porting something that cannot land.
**Runs at:** feasibility runs at `plan` time, so the verdict is part of the plan you approve. The live path calls the model + ADBT MCP; the key-free replay path reads recorded fixtures (`feasibility-recording.json`, `adbt-port-context.json`) so it needs no model, account, or network.
**Inspect:** `out/<runId>/app/ANALYSIS.md`, `out/<runId>/feasibility-report.json` (the verdict), and `out/<runId>/portability-report.json` (the inventory).

### Phase 2 — `plan` (model + model-driven ADBT over MCP)
This is where the model combines its own reasoning with Amazon's platform knowledge, and here the model, not the harness, drives ADBT.

**2a. The harness hands the ADBT `McpClient` to the agent** (`createAdbtMcpClient` in `src/context-providers/adbt.ts`). This follows the standard Strands MCP pattern — you pass the client into `Agent({ tools: [...] })` and Strands discovers its tools dynamically. For a live run:
1. `createAdbtMcpClient` builds a Strands `McpClient` over `StdioClientTransport`, starting the pinned ADBT package as a child process.
2. The pipeline puts that client in the agent's `tools` for the `plan` phase. Strands calls the server's `listTools` for us — the harness never hardcodes tool names.
3. The **model** decides what to fetch: it calls ADBT's own `list_documents` to discover the Vega workflows, then `read_document` (or `search_documentation`) for whichever ones it judges relevant. The harness pre-selects nothing.
4. When the phase ends the pipeline disconnects the client and calls `extractAdbtProvenance(agent.messages)`: it walks the model's tool calls, finds each ADBT read, pairs it with its result, and hashes it into `out/<runId>/adbt-port-context.json` with `mode: "live"`.

The model chose what to read, so the reconstructed audit trail is the only proof of what knowledge it actually used. Hashing it keeps the run provable and reproducible even though nothing was pre-picked. (The harness no longer sits between the model and each call, so provenance comes from the message history, not a live wrapper.)

**2b. The model writes the migration plan.** Using what it read, it returns `VEGA_PORT.md` (preserved behavior, Vega replacements, the exact remote flow), and the harness records the ADBT sources it consulted in `NextSteps.md`. The instruction is blunt: *Use the ADBT tools to discover and read the workflows you need. Do not invent Vega APIs. Write unsupported mappings to NextSteps.md.*
**Skill injected:** use the ADBT tools to discover and read the workflows you need, keep facts and assumptions separate, port one vertical slice, record gaps instead of inventing APIs.
**Checks:**
- `VEGA_PORT.md` contains `## TV Flow`
- `NextSteps.md` contains `ADBT` (names its sources)

**Inspect:** `out/<runId>/adbt-port-context.json`, `VEGA_PORT.md`, `NextSteps.md`, and the commit `workshop(plan): ...`.

This phase forces the model to *plan in writing*, grounded in real Amazon migration docs, before any Vega code is written.

### Phase 3 — `build_test` (model + executable test + mandatory device screenshot)
**Goal:** Build the `apps/vega` package from the SDK shape, wire the remote-only home→details flow, and prove it — first with an executable focus test, then with a real device screenshot.
**Skill injected:** preserve portable JS/TSX, start from the Vega template shape, use one focus-state module from both the app and the verifier; verify launch, movement boundaries, details, back, and restoration.
**Build checks:**
- `apps/vega/manifest.toml` contains `schema-version = 1` and `[[components.interactive]]`
- `apps/vega/package.json` contains `build-vega`
- `apps/vega/app.json` and `apps/vega/metro.config.js` exist
- root `package.json` contains a `vega:build` script
- `src/tv/focus-state.ts` exists and `src/App.tsx` imports `./tv/focus-state`

**Test checks — the focus check is special:**
- **A real command runs:** `node --import tsx tests/verify-tv-focus.ts` must exit 0. This executes a focus-transition test against the ported code. Back must return focus to the *originating card*, verified by a script, not a human eyeball.
- `tv-focus-result.json` contains `"passed": true`
- `TV_VERIFICATION.md` contains `originating card`

**Screenshot (mandatory):** the phase then runs the Vega device lifecycle (`src/platform/vega.ts`) — `sdk_version → device_status → build → install → launch → logs → capture → pull`. **The run fails unless a launch screenshot is produced.** The key-free replay path supplies it via `--platform-replay ../../workshop/fixtures/vega-lifecycle.json`; a live run captures it from an attached VDA. Each gate records the exact command, exit code, and output, labeled `replay` or `live`.

**Inspect:** the new `out/<runId>/app/apps/vega/` package, `tv-focus-result.json`, `out/<runId>/01-launch.png`, `vega-platform-result.json`, and the commit `workshop(build_test): ...`.

> **Two caveats about the mandatory screenshot.** Making the screenshot a required pass criterion means a device (or its `--platform-replay` fixture) is now mandatory for a green run — the key-free path stays green through the fixture. And on the current VDA image the live screenshot tool segfaults (see §6 and `workshop/live-rehearsal.md`), so the *live* screenshot cannot be produced until that device tooling is fixed.

---

## 6. What actually happened in our real run

We ran this end to end; here's what happened, including the failures. (These runs were captured under the earlier six-phase pipeline, before the collapse to `analyze → plan → build_test`. The phase names below are the historical ones; the mapping is `source_discovery`/`vega_portability_audit` → `analyze`, `tv_product_spec` → `plan`, `vega_port`/`tv_behavior` → `build_test`.)

### The live port that succeeded (`e5ec5311`)
A prior live-ADBT port completed all phases: `source_discovery → vega_portability_audit → tv_product_spec → vega_port → tv_behavior`, with `adbt.mode: live`, four git commits in the guarded app, and `tv-focus-result.json` passing.

### The live ports that failed (and why that's fine)
We also tried two fresh fully-live ports (real Claude model + live ADBT):
- One died on `tv_behavior`, one on `vega_port`, both with `Claude Code executor exited 255`.
- Root cause: the CLI subprocess was flaky on the long, heavy phases (large tool-using turns under a pricier model your org forces). Also the default `sonnet` was silently swapped to Opus 4.8 by org policy, which burned budget faster.
- **The harness handled both correctly:** `state: failed`, only verified phases committed, the guarded app rolled back with `git reset --hard`, and the source app never touched. A failed run left no mess to clean up.

### Running the port on the Vega device (the 8-gate lifecycle)
We ran `vega-run e5ec5311` live against a running VDA. Results:

| Gate | Result | Proof |
|---|---|---|
| sdk_version | PASS | SDK 0.22.5875 |
| device_status | PASS | VDA attached |
| **build** | PASS | Real `.vpkg` built for aarch64/armv7/x86_64, manifest validated, 8.6 MB |
| **install** | PASS | `Installing '/tmp/pocket-cinema_aarch64.vpkg' ...success` |
| **launch** | PASS | `Sending: pkg://com.tvbuild.pocketcinema.main` — the app launched on device |
| **logs** | PASS | device logs collected |
| capture | FAIL (139) | every screenshot binary on this VDA image is broken (`gwsi-tool-screenshooter` segfaults; `screenshooter` can't allocate the framebuffer; `ScreenCapture` hangs) |
| pull | not reached | depends on capture |

**The ported app built, installed, and launched on a real Vega virtual device.** The only failure was the device's own screenshot tooling — nothing to do with the port or the harness. The repo's own `live-rehearsal.md` already documents this exact VDA limitation.

Two side-quests along the way, both environmental, both instructive:
- First live lifecycle attempt failed at `logs` with `vda: more than one device/emulator` — an Android emulator and the Vega device were both attached. Killing the Android emulator fixed it. Lesson: device tooling needs an unambiguous target.
- Restarting the VDA did not fix the screenshot segfault, confirming it's an image bug, not a transient.

Because `capture` failed, the harness reported the whole lifecycle as `state: failed` and did not stamp `evidenceMode: live` as complete. It won't certify a device run without a real screenshot.

---

## 7. The two delivery mechanisms for skills (an AI detail worth knowing)

A "skill" is just domain instructions. How it reaches the model depends on the executor:

- **Claude CLI executor:** the harness appends the full skill text straight into the prompt (`injectSkillText`). The subprocess has no plugin system, so it's brute-force text injection.
- **Strands executor:** the skill becomes a Strands `Skill` object registered via an `AgentSkills` plugin; the model *activates* it through a `skills` tool when it decides it needs it (progressive disclosure). A phase with a skill gets extra turns to discover → activate → answer.
- **Replay:** no model runs at all; a recorded answer is returned. Same pipeline, zero cost, no keys.

Same knowledge, three delivery paths, identical JSON contract out. That interchangeability is why the entire workshop can run offline with recordings.

---

## 8. The Strands SDK pieces, concretely

Strands is the TypeScript agent runtime; in `src/port-executor.ts` the whole model interaction is:

```ts
const agent = new Agent({
  name: `workshop-${phase}`,
  model: createModel(config),                 // Bedrock / OpenAI / OpenRouter behind one interface
  tools: createProjectReadTools(appDir),      // list/read/search only — no write, no shell
  structuredOutputSchema: PortOutputSchema,   // must return { summary, files }
  systemPrompt: "Inspect with read-only tools. Return a complete patch. Never claim a file or API exists without reading evidence.",
  printer: false,                             // keep stdout clean for JSON
});
const result = await agent.invoke(prompt, {
  cancelSignal: AbortSignal.timeout(10 * 60_000),  // 10-min hard stop
  limits: { turns: 8, totalTokens: 40_000 },       // bounded loop
});
```

The SDK handles the loop, the providers, the schema validation, and the limits. Writing files, verification, git, cost policy, and ADBT selection stay in the harness. The tools themselves (`src/port-tools.ts`) are locked down: they reject absolute paths, `..` traversal, symlinks, `.git`, `.env`, `node_modules`, binaries, and files over 100 KB.

---

## 9. Replay vs live, and why replay exists

Every phase can run against a recording instead of a live model (`--replay`) and against recorded ADBT context instead of a live MCP call. Replay is the default workshop path because:

- It needs no API key, no model account, no network, no device — anyone can run the whole thing.
- It is deterministic: same inputs, same output, every time.
- The recording format is identical to what a live run produces, so a live run's output becomes tomorrow's replay fixture.

You reach for live only to prove the real thing works (real model reasoning, real ADBT docs, real device). We did both today.

---

## 10. Taking it to your own domain

The pattern transfers to any workflow: keep `plan → context → run → check → retry → checkpoint → report`, and swap the TV skill and Vega commands for yours. The "take it home" lesson walks through it.

The retry is also where you extend the harness toward "loop until the port is done": `--max-attempts N` (or `--until-done`) replaces the single retry with a convergence loop. It stays safe because "done" is the verifier's verdict, the cost cap still throws, and the loop stops early when the same failures repeat — retrying a failure the model cannot fix only spends budget. Never move this iteration inside the model's own turn loop: the harness-level loop has a mechanical check between every attempt, which is what makes it converge instead of run away.

---

## Appendix: files to open, mapped to concepts

| Concept | File |
|---|---|
| CLI entry, commands (`plan`, `run`, `vega-run`) | `packages/workshop-harness/src/index.ts` |
| The phase plan + retry/verify/commit loop | `packages/workshop-harness/src/port-pipeline.ts` |
| The model interaction (Strands Agent, invoke, limits) | `packages/workshop-harness/src/port-executor.ts` |
| Read-only guarded tools (list/read/search) | `packages/workshop-harness/src/port-tools.ts` |
| Required output shape `{summary, files}` | `packages/workshop-harness/src/port-contract.ts` |
| Mechanical checks (`file_exists`, `contains`, `command`) | `packages/workshop-harness/src/port-verification.ts` |
| ADBT+model feasibility verdict (the audit's "is this possible?") | `packages/workshop-harness/src/feasibility.ts` |
| ADBT over MCP (connect, list, read, hash, disconnect) | `packages/workshop-harness/src/context-providers/adbt.ts` |
| Guarded copy + provenance | `packages/workshop-harness/src/source-app.ts` |
| The 8-gate Vega device lifecycle | `packages/workshop-harness/src/platform/vega.ts` |
| The 3 domain skills | `packages/workshop-harness/skills/*/SKILL.md` |
| Mini ↔ production file map | `packages/mini-harness/ISOMORPHISM.md` |
| The device-screenshot limitation we hit | `workshop/live-rehearsal.md` |

---

## Appendix B: Worked example — real prompt in, real output out

This is the actual input and output captured from live run `c9fc9e58` (real Claude model, live ADBT over MCP), under the earlier six-phase pipeline. It shows the ADBT-injected planning (then called `tv_product_spec`/`vega_port`, now folded into `plan` and `build_test`) so the mechanics are unchanged even though the phase names moved.

Every model turn is recorded to `out/<runId>/port-recording.json`: the exact prompt sent (`request.messages[0].content`), the raw text the model returned (`response[].result`), and token usage. That file is the audit trail. What follows is that file, made readable.

Every phase prompt is assembled by `prompt()` in `src/port-pipeline.ts` from the same slots — lesson 6 shows the template in full. The model is told the exact checks it will be graded against, a failed attempt gets the verbatim failure text fed back in, and the output contract is strict JSON.

### Phase `tv_product_spec` — prompt (1,684 chars)

```
You are porting the CURRENT guarded React Native app to Vega SDK 0.22.5875. Read existing files before proposing edits. Preserve unrelated work.

Phase: tv_product_spec
Goal: Write a concise migration document describing the current app, preserved product behavior, Vega replacements, and the exact remote flow.
Skill: Discovery first. Keep facts and assumptions separate. Port one vertical slice.
Creative seed: workshop-v1

Approved context:
## Approved Project Context

No approved project context.

Portability findings:
[
  { "area": "framework",     "classification": "portable", "evidence": "package.json",
    "recommendation": "Keep shared React Native product logic." },
  { "area": "navigation",    "classification": "manual",   "evidence": "No navigation dependency detected",
    "recommendation": "Define remote navigation, back, and focus restoration explicitly." },
  { "area": "product_scope", "classification": "portable", "evidence": ".../workshop-brief.md",
    "recommendation": "Choose one bounded screen or flow before execution." },
  { "area": "focus",         "classification": "replace",  "evidence": "Behavioral audit required",
    "recommendation": "Add initial focus, directional movement, focus styling, back, and restoration checks." }
]

Required checks:
- TV flow documented: VEGA_PORT.md contains ## TV Flow

Return ONLY JSON: {"summary":"short commit summary","files":{"relative/path":"complete file contents"}}. Paths are relative to the app root. Do not include .git, node_modules, .env, absolute paths, or files outside the app.
```

### Phase `tv_product_spec` — output (8,071 chars)

The model returned a leading sentence of prose, then a ```` ```json ```` fence, then the object. The harness's `text.match(/\{[\s\S]*\}/)` grabs the first `{...}`, so it parsed fine — but this is exactly the fragility the workshop warns about. Parsed result:

- **summary:** `Add VEGA_PORT.md migration plan for porting Pocket Cinema to Vega SDK 0.22.5875`
- **files:** `VEGA_PORT.md` (one file)

Excerpt of the generated `VEGA_PORT.md`, showing it separated **facts** from **labeled assumptions** (the discovery-first skill at work) and caught the double-underscore package names:

```markdown
## Vega Replacements

| Area | Today | Vega replacement |
|---|---|---|
| Navigation | `useState` view swap in `App.tsx` | `@amazon-devices/react-navigation__native` + `@amazon-devices/react-navigation__native-stack` (~7.0.0). **Note the double underscore.** Standard `@react-navigation/*` packages do not work on Vega. |
| Focus styling | none | `onFocus`/`onBlur` applying a physical change (border + scale), not color/opacity alone. |

**Assumptions (verify before coding):**
- The exact Vega manifest schema for SDK 0.22.5875 is unverified here. Confirm before coding.

## TV Flow
1. Launch — app opens on Home, initial focus on the hero "View details" button.
...
7. Focus restoration — on Back, focus returns to the originating card, not the hero.
   This is the flow's key acceptance criterion.
```

**Check result:** `VEGA_PORT.md` contains `## TV Flow` → PASS → committed as `workshop(tv_product_spec): ...`.

### Phase `vega_port` — prompt (16,809 chars)

Same template, but the prompt is ~10x larger because at character 1518 the **live ADBT documents are injected**, hashes and all. This is the mechanism that lets the model make Vega decisions without guessing. The injected block begins:

```
## ADBT Vega Port Guidance

Mode: live
Sources:
- port_tv_app_to_vega.md (sha256: 5dcf0e6f8a5b6a62d688562c46a9f22f414715c1b792ecdaf92bc0e8016214ea)
- port_tv_app_to_vega_fos_rn_app.md (sha256: 2f67d9dc1133a52e9873513c3d66a2c0a2ca090a0d90284e1bb54e3f825f5607)

### port_tv_app_to_vega.md
## Purpose
Entry point for all FOS-to-Vega app migrations. This workflow determines what the user
wants to convert, runs shared prerequisites (SDK check, device detection), then dispatches
to the appropriate conversion-specific orchestrator.
| Conversion | Input | Output | Orchestrator |
...
```

followed by the second workflow document, then the instruction: *"Use these ADBT sources for Vega-specific decisions. Do not invent Vega APIs. Write unsupported or uncertain mappings to NextSteps.md and name the ADBT documents consulted."* The 8 required checks are listed verbatim after that.

### Phase `vega_port` — output (23,779 chars)

- **summary:** `Create apps/vega VegaScript package boundary porting Pocket Cinema home-to-details flow (navigator + D-Pad focus + originating-card restoration); isolate focus state into portable src/tv/focus-state.ts, keep shared catalog/tests, flag unverified Vega schema/CLI gaps in NextSteps.md`
- **files (13):** `src/tv/focus-state.ts`, `tests/focus-state.test.ts`, `apps/vega/manifest.toml`, `apps/vega/package.json`, `apps/vega/app.json`, `apps/vega/index.js`, `apps/vega/metro.config.js`, `apps/vega/babel.config.js`, `apps/vega/tsconfig.json`, `apps/vega/src/App.tsx`, `apps/vega/README.md`, `package.json`, `NextSteps.md`

The generated `apps/vega/manifest.toml` — the file three of the checks grep — contains exactly the strings they look for:

```toml
schema-version = 1

[package]
title = "Pocket Cinema"
id = "com.pocketcinema.app"

[[components.interactive]]
id = "com.pocketcinema.app.main"
runtime-module = "@pocket-cinema/rn"
launch-type = "singleton"
```

The part worth reading closely is what the model wrote into `NextSteps.md`. It didn't have full MCP document access in that session, and instead of bluffing, it said so:

```markdown
## Unverified against SDK docs (MCP doc access not granted)

The buildertools MCP read_document / list_documents calls were denied in this
session, so the items below rely on the Vega skill summaries and the ADBT
workflows above. They MUST be confirmed against the named KB documents before
relying on them — they are not invented APIs presented as fact.

1. Manifest schema — verify field names and the [[components.interactive]] shape
   for SDK 0.22.5875 against vega_app_manifest.md. ... are placeholders.
2. App icon asset — vega_app_manifest.md requires a 512x512 PNG ... add before packaging.
3. Build CLI — confirm the exact Kepler/Vega build invocation ...
```

The skill told the model to record unsupported gaps instead of inventing APIs, and it did: it flagged its own uncertainty in a machine-checkable file rather than presenting a guess as fact. The check `NextSteps.md contains "ADBT"` passed, all 8 checks passed, and the phase committed as `workshop(vega_port): ...`.

### What the worked example shows

The model produced large, well-structured artifacts — a migration doc and a 13-file package. It also wrapped JSON in prose (`tv_product_spec`) and admitted uncertainty (`vega_port`). The harness read none of that as truth: it extracted the JSON, wrote the files to the guarded copy, and ran mechanical `grep`/`file_exists` checks. Only passing work got committed.

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

There is one implementation: **`packages/workshop-harness/`**, the pipeline that did the real Vega port. The workshop teaches it by building it up rather than by reimplementing it in miniature — lessons 1–4 add one element at a time (`plan` is one model call, `tv-check` is the checks alone, `--phases` runs part of the pipeline), and lessons 5–9 run it whole. This document is about that pipeline.

---

## 3. The cast: who is allowed to do what

This is the security model:

```
ADBT (MCP server)  --->  supplies approved Vega knowledge   ---+
                                                               |
guarded app copy   --->  read-only tools (list/read/search) --+--> selected agent --> proposes a typed patch {summary, files}
                                                               |
                                                               v
     HARNESS: validate paths -> write files -> run checks -> retry once -> git commit -> enforce cost -> write report
```

- **The model** can only list, read, and search files inside one guarded copy. It has **no write tool and no shell**. It returns a JSON patch. The Claude subprocess is also fingerprinted before and after each call; a direct mutation is rejected and rolled back. (`src/port-tools.ts`, `src/port-executor.ts`)
- **ADBT** supplies platform knowledge through MCP in both live paths. Strands receives an in-process `McpClient`; Claude Code receives the same pinned stdio server through `--mcp-config`. The model chooses which ADBT tools and documents to use. The harness hashes the reads into `adbt-port-context.json`, and a live ADBT phase fails if no document read is present. (`src/context-providers/adbt.ts`)
- **The harness** owns everything with consequences: writing to disk, running verification, committing to git, the cost cap, retries, and the final report. (`src/port-pipeline.ts`)

The strictness has a reason: a model with a write tool or a shell can corrupt your repo on one confident wrong guess. Keeping irreversible actions in deterministic code means the worst a bad answer can do is *fail a check and get rejected*.

---

## 4. The guarded copy: your source is never touched

Before anything runs, the harness copies your app into `out/<runId>/app/` and does `git init` inside that copy (`src/port-pipeline.ts` → `initializeGit`). Everything the model proposes is written there. The feasibility model reads a separate disposable copy. Your real `apps/pocket-cinema/` is never passed to a write-capable process.

We verified this live: after the whole port, `git status apps/pocket-cinema/` was clean. The `<runId>` (e.g. `e5ec5311`) is a fresh directory per run, so runs never clobber each other.

Inside that copy, the harness makes a git commit **per passing phase**. That commit is the recovery mechanism, not decoration. If phase 3 explodes, phases 1 and 2 are already committed and safe.

---

## 5. The pipeline: every phase, in order

The port is a sequence of **six phases**. The first three ask a model to write something and check the result against files; the last three check by executing — a compiler, a device, and a remote-control contract. Source of truth: `phases()` in `src/port-pipeline.ts` — `--phases build,launch` runs a subset of it, and the CLI derives its reported phase list from the same function.

```
analyze  ->  plan   ->  port   ->  build   ->  launch  ->  test
(model)     (model +   (model)    (loop:     (loop:      (focus test
            focus                  compiler   device      + frames)
            skill +                decides)   decides)
            live ADBT)
```

Three properties belong to the last three phases and to nothing before them:

- **They check before they prompt** (`verifyFirst`). A build that already passes never reaches the model, so a green phase costs nothing. The failure that provokes a fix is recorded before the model sees it.
- **Their failure text is the tool's own output.** `runProcess` bounds it — head and tail with the middle elided — because a failing build can print megabytes into a 40,000-token budget.
- **Their retries keep the build directory.** `reset()` excludes `build`, `node_modules`, and `*.vpkg` from its clean, so a retry does not rebuild from zero or delete the artifact it is repairing.

Before the pipeline runs, `source_discovery` copies your RN app into the guarded `out/<runId>/app` and records provenance (`src/source-app.ts`) — your real app is read once and never modified. Below, for each phase: what it does, what the model is asked, what is checked, and what file to open to see the result.

### Phase 1 — `analyze` (model + ADBT feasibility)
**Does:** The model reads the guarded app and writes `ANALYSIS.md` describing its screens, components, data, and what is portable to Vega TV. Alongside it, at `plan` time, `auditSource()` (`src/portability-audit.ts`) builds a deterministic dependency inventory (plain string-matching over `package.json`, no model), and `runFeasibility()` (`src/feasibility.ts`) hands that inventory plus ADBT's Library Compatibility guidance to a bounded model, which returns a **feasibility verdict**: `feasible`, `feasible-with-adapters`, or `blocked`, with a per-dependency status (`supported` / `needs-adapter` / `blocking`).
**Check (`port-verification.ts`):** `ANALYSIS.md` must contain `## Portable`.
**Gate:** if the verdict is `blocked`, the harness stops with exit code 5 (`port_infeasible`) — *before* spending any build budget. It fails fast rather than porting something that cannot land.
**Runs at:** feasibility runs at `plan` time, so the verdict is part of the plan you approve. The live path calls the model + ADBT MCP; the key-free replay path reads recorded fixtures (`feasibility-recording.json`, `adbt-port-context.json`) so it needs no model, account, or network.
**Inspect:** `out/<runId>/app/ANALYSIS.md`, `out/<runId>/feasibility-report.json` (the verdict), and `out/<runId>/portability-report.json` (the inventory).

### Phase 2 — `plan` (model + model-driven ADBT over MCP)
This is where the model combines its own reasoning with Amazon's platform knowledge, and here the model, not the harness, drives ADBT.

**2a. The harness supplies pinned ADBT MCP to the selected executor** (`src/context-providers/adbt.ts`). For a live run:
1. Strands gets `createAdbtMcpClient()` in `Agent({ tools: [...] })`; Claude Code gets `createAdbtCliMcpServer()` in an explicit `--mcp-config`.
2. The selected agent discovers ADBT's tools. Claude also receives `--strict-mcp-config`, so unrelated user MCP servers are not loaded.
3. The **model** decides what to fetch: it calls ADBT's own `list_documents` to discover the Vega workflows, then `read_document` (or `search_documentation`) for whichever ones it judges relevant. The harness pre-selects nothing.
4. When the phase ends, `extractAdbtProvenance()` normalizes Strands messages or Claude stream events, pairs each read with its result, and hashes it into `out/<runId>/adbt-port-context.json`.

The model chose what to read, so the reconstructed audit trail is the only proof of what knowledge it actually used. Hashing it keeps the run provable and reproducible even though nothing was pre-picked. (The harness no longer sits between the model and each call, so provenance comes from the message history, not a live wrapper.)

**2b. The model writes the migration plan.** Using what it read, it returns `VEGA_PORT.md` (preserved behavior, Vega replacements, the exact remote flow), and the harness records the ADBT sources it consulted in `NextSteps.md`. The instruction is blunt: *Use the ADBT tools to discover and read the workflows you need. Do not invent Vega APIs. Write unsupported mappings to NextSteps.md.*
**Phase context:** the focus-management skill supplies TV interaction guidance. The phase prompt separately tells the agent to use ADBT MCP to discover current Vega workflows, keep facts and assumptions separate, port one vertical slice, and record gaps instead of inventing APIs.
**Checks:**
- `VEGA_PORT.md` contains `## TV Flow`
- `VEGA_PORT.md` contains `## Focus`
- `NextSteps.md` contains `ADBT` (names its sources)

**Inspect:** `out/<runId>/adbt-port-context.json`, `VEGA_PORT.md`, `NextSteps.md`, and the commit `workshop(plan): ...`.

This phase forces the model to *plan in writing*, grounded in real Amazon migration docs, before any Vega code is written.

### Phase 3 — `port` (model writes the code)
**Goal:** Write the port the plan describes — the `apps/vega` package from the SDK shape, the shared focus-state module, the remote-only home→details flow, and the executable focus test that will judge it in phase 6.
**Skill:** `amazon-devices-vega-build-and-run`.
**Checks (nine):** `apps/vega/manifest.toml` contains `schema-version = 1` and `[[components.interactive]]`; `apps/vega/package.json` contains `build-vega`; `apps/vega/app.json` and `apps/vega/metro.config.js` exist; root `package.json` contains `vega:build`; `src/tv/focus-state.ts` exists; `src/App.tsx` imports `./tv/focus-state`; `tests/verify-tv-focus.ts` exists.
**Inspect:** `out/<runId>/app/apps/vega/`, `src/tv/focus-state.ts`, and the commit `workshop(port): ...`.

### Phase 4 — `build` (loop; the compiler decides)
**Goal:** Produce a `.vpkg`. **Device stage:** `build` — `checkToolchain` (SDK only; no attached device required) then `buildPackage`, which runs `npm run build:debug` in `apps/vega` with a 15-minute ceiling and locates the package with `findVpkg`.
**Check:** the package exists. Nothing else counts, and no file assertion can substitute.
**On failure:** the compiler's own diagnostics — both streams, bounded — become the next prompt. Up to five attempts, stopped early by the cost cap or by the same failure repeating.
**Inspect:** `out/<runId>/app/apps/vega/build/`, and the `steps` in `vega-platform-result.json`.

### Phase 5 — `launch` (loop; the device decides)
**Goal:** Install, launch, and prove the app is still running. **Device stages:** `build` then `launch` — `checkToolchain` (device required), `installAndLaunch`: install, launch, capture the launch frame, dwell five seconds, query logs for this package since launch, capture a second frame.
**Checks:** `scanDeviceLog` (`src/platform/device-log.ts`) refuses `FATAL`, `SIGSEGV`, `has died`, ANR, and unhandled JS exceptions, reporting the matching line. `evaluateScreenshot` (`src/platform/screenshot.ts`) decodes each pulled PNG and refuses a frame under 640x360, one flat colour, or pinned black or white. The second frame is the liveness proof — a process that died on startup cannot produce it.
**Rebuilds when it has a fix:** the first check runs against the package phase 4 produced; a retry, which carries a patch, rebuilds first so what runs is what the model wrote.
**Inspect:** `01-launch.png`, `02-postlaunch.png`, `vega-device.log`, and the named checks in `vega-platform-result.json`.

### Phase 6 — `test` (the remote-control contract)
**Goal:** Prove the transitions. **Checks:** `node --import tsx tests/verify-tv-focus.ts` must exit 0 — Back must return focus to the *originating card*, verified by a script, not an eyeball; `tv-focus-result.json` contains `"passed": true`; `TV_VERIFICATION.md` contains `originating card`. **Device stages:** `review` (the optional multimodal verdict, only with `--evaluate-screenshot`) and `focus`, which requires all six named transitions.
**The honest limit:** the test drives the focus module, not the device's input system. It proves the contract the app implements; it does not press a button. Injecting real remote input needs a device input capability the harness does not ship.
**Inspect:** `tv-focus-result.json`, both frames, and `vega-platform-result.json`.

> **What the device phases require, and what replay proves.** Phase 4 needs Vega SDK `0.22.5875`; phase 5 also needs an attached VDA. Phase 6 runs the host focus contract and reuses prior frames. `--platform-replay` keeps every phase runnable, but `evidenceMode: replay` proves only the control flow and gates. It does not prove that a package compiled or a device launched. The current verified live boundary is recorded in `workshop/live-rehearsal.md`.

---

## 6. What has actually been verified live

Keep the evidence statement short and current:

- The pinned ADBT server connected over stdio MCP, exposed the expected document tools, and produced hashed replay context.
- Vega SDK `0.22.5875` built the checkpoint app and produced `.vpkg` files.
- In the recorded rehearsal environment, VDA did not remain attached. Install, launch, filtered logs, dwell, and real Vega screenshots therefore remain unverified live.
- The committed lifecycle fixture and unit tests prove the gate behavior, including crash and blank-frame failures. They do not certify a device.

Do not combine these bullets into “the full live pipeline passed.” Update `workshop/live-rehearsal.md` after a real device session clears every gate.

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
const result = await consumeStream(
  agent.stream(prompt, {
    cancelSignal: AbortSignal.timeout(10 * 60_000),  // 10-min hard stop
    limits: { turns: 8, totalTokens: 40_000 },       // bounded loop
  }),
  event => appendNativeEvent(event),                 // tail-ready while it runs
);
```

The SDK handles the loop, providers, schema validation, limits, and native stream events. The
harness appends those events to the phase transcript and retains the generator's final result.
Writing files, verification, Git, cost policy, the ADBT connection, and provenance stay in the
harness; the model chooses which ADBT documents to read. The project tools
(`src/port-tools.ts`) are locked down: they reject absolute paths, `..` traversal, symlinks,
`.git`, `.env`, `node_modules`, binaries, and files over 100 KB.

---

## 9. Replay vs live, and why replay exists

Every phase can run against a recording instead of a live model (`--replay`) and against recorded ADBT context instead of a live MCP call. Replay is the default workshop path because:

- It needs no API key, no model account, no network, no device — anyone can run the whole thing.
- It is deterministic: same inputs, same output, every time.
- The recording format is identical to what a live run produces, so a live run's output becomes tomorrow's replay fixture.

Reach for live only to prove the real thing works: model reasoning, current ADBT documents, a real build, or a real device. State which boundary you actually crossed.

---

## 10. A second pipeline on the same engine (the optional Bee run)

The reusability claim is easy to assert and harder to demonstrate, so the optional Bee lesson demonstrates it: `runPortPipeline` takes a plan, and `bee-run` hands it a different one. A conversation about the app becomes code that runs on the device, and `build` and `launch` are the port's own phases, reused unchanged.

```
bee-run <app> --propose         bee_spec   Bee over MCP -> bee-spec.json + BEE_SPEC.md, no code
                                        ↓  a human reads and approves
bee-run <app> --apply --yes      bee_apply  the approved spec becomes code
                                 build      the .vpkg          (the port's phase)
                                 launch     on the VDA         (the port's phase)
```

Three design points are the reason it is in the workshop at all:

- **The acceptance criteria are approved before the code exists.** Each request in the spec carries the file assertion that will prove it, so `bee_apply` passes a bar a human set beforehand. A model that writes code and then judges it is grading its own work.
- **The spec is a paraphrase with source ids, never a transcript.** `BEE_SPEC.md` is rendered by the harness from the validated JSON, so the prose a human approves cannot disagree with what gets built. Durable provenance in `bee-context.json` is a tool name, a conversation id, and a SHA-256 — deliberately unlike ADBT's, whose excerpts are vendor documentation and safe to keep. The local `model-logs/bee_spec.jsonl` still contains the complete model exchange, including conversation text. It is gitignored and must be deleted or scrubbed before a run directory is shared.
- **Model-authored checks are declarative only.** Spec checks are `file_exists` and `contains`; `command` is rejected by the schema. And `bee_apply` declares the spec read-only, so a patch cannot pass by rewriting the requirement.

The Bee MCP path needs an account and `bee login`, both outside the harness, so the recorded path (`workshop/fixtures/bee-run/`) is the normal one. That recording is hash-verified on load: an edited transcript stops the run instead of reaching the model.

---

## 11. Taking it to your own domain

The pattern transfers to any workflow: keep `plan → context → run → check → retry → checkpoint → report`, and swap the TV skill and Vega commands for yours. The "take it home" lesson walks through it.

The retry is also where you extend the harness toward "loop until the port is done": `--max-attempts N` (or `--until-done`) replaces the single retry with a convergence loop. It stays safe because "done" is the verifier's verdict, the cost cap still throws, and the loop stops early when the same failures repeat — retrying a failure the model cannot fix only spends budget. Never move this iteration inside the model's own turn loop: the harness-level loop has a mechanical check between every attempt, which is what makes it converge instead of run away.

---

## Appendix: files to open, mapped to concepts

| Concept | File |
|---|---|
| CLI entry, commands (`plan`, `run`, `vega-run`, `bee-run`) | `packages/workshop-harness/src/index.ts` |
| The phase plan + retry/verify/commit loop | `packages/workshop-harness/src/port-pipeline.ts` |
| The model interaction (Strands Agent, stream, limits) | `packages/workshop-harness/src/port-executor.ts` |
| Tail-ready per-phase model transcripts | `packages/workshop-harness/src/model-transcript.ts` |
| Read-only guarded tools (list/read/search) | `packages/workshop-harness/src/port-tools.ts` |
| Required output shape `{summary, files}` | `packages/workshop-harness/src/port-contract.ts` |
| Mechanical checks (`file_exists`, `contains`, `json_schema`, `command`) | `packages/workshop-harness/src/port-verification.ts` |
| ADBT+model feasibility verdict (the audit's "is this possible?") | `packages/workshop-harness/src/feasibility.ts` |
| ADBT over MCP (connect, list, read, hash, disconnect) | `packages/workshop-harness/src/context-providers/adbt.ts` |
| Guarded copy + provenance | `packages/workshop-harness/src/source-app.ts` |
| The Vega device stages | `packages/workshop-harness/src/platform/vega.ts` |
| The second pipeline, same engine | `packages/workshop-harness/src/bee-pipeline.ts` |
| The approved spec contract and its guards | `packages/workshop-harness/src/bee-spec.ts` |
| Bee over MCP, and durable hash-only provenance | `packages/workshop-harness/src/context-providers/bee.ts` |
| The 3 domain skills | `packages/workshop-harness/skills/*/SKILL.md` |
| The device-screenshot limitation we hit | `workshop/live-rehearsal.md` |

---

## Appendix B: Worked example — real prompt in, real output out

This is historical input and output from live run `c9fc9e58`, under an earlier pipeline. That version injected preloaded ADBT text into the prompt. The current pipeline instead lets both Strands and Claude call ADBT through MCP and reconstructs provenance from tool events. Keep this appendix as an evolution example, not as the current request shape.

The current harness has two related artifacts:

- `out/<runId>/model-logs/<phase>.jsonl` is the live audit trail. It is appended while the
  phase runs and keeps the complete request, native Strands or Claude stream events, tool
  traffic, usage, verification result, and phase outcome. A resumed phase continues the same
  sequence.
- `out/<runId>/port-recording.json` is the compact replay cassette. It keeps enough request,
  result, usage, and cost data to run the workshop again without a model.

Read a transcript with `logs <runId> --phase <name>` or follow it with `--follow`. The files
can contain source excerpts and tool results, so they remain under the gitignored `out/`
directory and must be reviewed before sharing.

What follows is historical input and output made readable from the earlier recording.

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

In the earlier implementation, the prompt was roughly 10x larger because the harness injected whole ADBT documents. The current implementation replaces this block with MCP tools and records only the documents the model actually reads. The historical injected block began:

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

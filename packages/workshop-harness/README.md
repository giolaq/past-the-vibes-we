# Workshop Harness

This package is used in the **Past the Vibes** workshop. It inspects a React Native app, copies it into a safe run directory, applies three small TV changes, verifies each change, and hands the result to Vega tools.

It never edits the source app — generated work goes to `out/<runId>/app` at the repository root. Run every command below from the repository root.

## What happens during a port

Before the pipeline, `source_discovery` copies the app into a guarded directory without Git history, dependencies, builds, caches, or environment files. The port itself then has six phases:

1. `analyze` reads the guarded app and writes `ANALYSIS.md`. A deterministic dependency inventory plus a model+ADBT feasibility verdict decide whether the port is possible; a `blocked` verdict stops the run at exit `5`.
2. `plan` gives the model the ADBT read tools so it discovers and reads the Vega workflows itself, then writes `VEGA_PORT.md` (the flow to preserve and Vega replacements) plus `NextSteps.md` (ADBT sources and unsupported work).
3. `port` creates the Vega package boundary, focus adapter, and executable remote-navigation check.
4. `build` runs the real Vega build and gives compiler failures back to the model.
5. `launch` installs the package, starts it, captures a frame, waits five seconds, scans the device log, and captures a second frame.
6. `test` runs the remote-navigation contract and checks focus restoration after Back.

For each phase, `src/port-pipeline.ts` saves the current commit, assembles the prompt, asks an executor for a `PortOutputSchema` proposal, validates every path, writes the files, checks the cost cap, and runs phase-specific checks. Passing work gets one Git commit. Failed checks cause a retry from the clean phase-start commit with the exact failure text — once by default; `--max-attempts N` or `--until-done` raise the budget, still governed by the cost cap and stopped early when the same failures repeat with no progress. When the attempts run out, the harness restores the clean state and stops the run.

The model can inspect and propose, but it cannot write files or run shell commands. Device evidence is a mandatory gate in `launch` and `test`: the run fails unless the app is still running after the dwell and both captured frames pass the pixel gate (at least 640x360, more than one flat colour, not pinned black or white). The recorded fallback exercises those gates with `--platform-replay`, but cannot make a device claim.

## How Strands is used

[Strands Agents SDK](https://github.com/strands-agents/harness-sdk) is AWS's open-source agent runtime and the in-process engine for `--executor strands`. This package pins TypeScript SDK `1.10.0`. It supplies model providers behind one interface (Bedrock, OpenAI, OpenRouter), the agent loop, Zod-typed tools, schema-enforced structured output, native stream events, a native MCP client, limits, cancellation, and metrics.

The port agent receives three tools from `src/port-tools.ts`: list project files, read one project file, and search project text. All three are read-only and limited to the guarded app. `src/port-contract.ts` defines the validated patch result. The agent is limited to eight turns, 40,000 total tokens, and ten minutes per phase.

The harness owns writes, checks, retries, Git commits, the cost cap, replay, and reports. The model never receives a shell or file-write tool.

## Install and test

```sh
yarn setup
yarn verify
yarn doctor
```

Set `WORKSHOP_OUT` to move run directories somewhere other than `out/`.

`openai` and `@opentelemetry/api` appear in `dependencies` only because they are peer dependencies of `@strands-agents/sdk`; no workshop code imports them directly.

## Bring your own CLI agent

The harness ships two live executors (Claude Code CLI and in-process Strands). Adding your own CLI agent takes three steps, all in `src/port-executor.ts`:

1. Implement `PortExecutor` — one `call(phase, prompt)` method returning `{text, costUsd}` with the JSON patch in `text`. Model it on `ClaudeCodePortExecutor`: spawn your CLI non-interactively with the prompt on stdin and the guarded app as cwd, and record turns with `PortRecorder` so replay keeps working.
2. Register it: a new `kind` in `ExecutorConfig`, a branch in `resolveExecutorConfig()` for your `--executor <name>` value, and a branch in `createPortExecutor()`.
3. Keep the contract: only the returned typed patch is applied — direct writes by your CLI are detected and rolled back — and pass the pinned ADBT stdio server explicitly to the CLI subprocess. Do not depend on a user's global MCP settings.

## Run the port

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts plan ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --seed workshop-v1 --max-cost 3 --json
```

Read the plan. Then run the port against a live model (pick your executor). `build`, `launch`, and `test` need the Vega SDK; `launch` and `test` also need an attached VDA:

```sh
# Claude Code CLI (the harness starts ADBT MCP; see "ADBT during the port" below)
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor claude-cli --model sonnet \
  --yes --seed workshop-v1 --max-cost 3 --json

# Strands + Bedrock (harness hands the ADBT McpClient to the agent)
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2 \
  --yes --seed workshop-v1 --max-cost 3 --json
```

Recovery command if a live model, ADBT, or VDA blocks one exercise — the fully recorded path (`adbt.mode` will be `replay`):

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
  --platform-replay ../../workshop/fixtures/vega-lifecycle.json \
  --yes --seed workshop-v1 --max-cost 3 --json
```

Copy the returned `runId`. Inspect:

- `out/<runId>/feasibility-report.json` for the feasibility verdict;
- `out/<runId>/portability-report.json` for what can move to Vega;
- `out/<runId>/port-result.json` for phases, checks, retries, and cumulative cost;
- `out/<runId>/model-logs/<phase>.jsonl` for the complete prompt, native model events, tool calls and results, usage, verification, and phase outcome;
- `out/<runId>/adbt-port-context.json` for the ADBT workflows the model read during `analyze` and `plan`, with hashes;
- `out/<runId>/app/NextSteps.md` for ADBT sources and unsupported mappings;
- `out/<runId>/01-launch.png` and `02-postlaunch.png` for the launch and test evidence frames;
- `out/<runId>/app` for the generated app copy and phase commits.

## Read or tail a model transcript

Each phase owns one append-only JSONL file. Every line has `schemaVersion`, `timestamp`,
`sequence`, `phase`, `attempt`, `executor`, `direction`, `kind`, and the complete native
`payload`. JSONL keeps each event atomic while the run is active and works for Strands,
Claude Code, and replay.

```sh
# Read the complete transcript after a phase
yarn --cwd packages/workshop-harness tsx src/index.ts logs <runId> --phase plan

# Follow it while the model and its tools are working
yarn --cwd packages/workshop-harness tsx src/index.ts logs <runId> --phase plan --follow

# Or use standard Unix tools
tail -f out/<runId>/model-logs/plan.jsonl | jq .
```

Strands records every native stream event, including full model requests, model deltas,
completed messages, tool calls, and tool results. Claude records every `stream-json` event plus
raw stdout and stderr. A phase that skips the model still records its checks and outcome.
Resumed runs append with increasing sequence numbers.

For the optional screenshot review, the transcript stores the full text plus the image path,
byte count, and SHA-256. It does not duplicate the PNG as a large JSON integer array; the
content-addressed image remains beside the transcript.

These files can contain prompts, source excerpts, and tool results. They live under the
gitignored `out/` directory. Review them before sharing; do not commit them unchanged.

## ADBT during the port

ADBT is runtime context the model gathers itself, not setup the harness pre-picks. How the model reaches ADBT depends on the executor:

**Strands (live)** — the harness builds the ADBT `McpClient` (`createAdbtMcpClient`) and passes it straight into the agent's `tools`, the standard Strands MCP pattern. Strands discovers the server's tools dynamically; the model calls them:

```text
harness: Agent({ tools: [...projectTools, adbtClient] })   // Strands lists ADBT tools itself
model:   list_documents(WORKFLOW, vega_os)
         -> read_document(<whichever workflows it judges relevant>)
harness: extractAdbtProvenance(agent.messages) -> hash each read -> adbt-port-context.json
         -> disconnect the client
```

The harness never hardcodes tool names or pre-selects documents. Because the model chooses what to read, the hashed record reconstructed from the message history is the run's proof of the knowledge it used.

**Claude Code CLI (live)** — the harness starts the same pinned ADBT stdio server for each phase and passes it through Claude Code's explicit `--mcp-config` contract with `--strict-mcp-config`. Claude receives only `Read`, `Grep`, `Glob`, and `mcp__adbt__*`; shell, write, web, and notebook tools are denied. This makes the workshop independent of global Claude MCP settings and gives Claude the same runtime ADBT capability as Strands.

`init-context` is still useful for installing Amazon's `amazon-devices-vega-*` skills. It is not how either live executor connects to ADBT MCP:

```sh
npx -y @amazon-devices/amazon-devices-buildertools-mcp@1.0.5 init-context --agent claude-code-cli --force
npx -y @amazon-devices/amazon-devices-buildertools-mcp@1.0.5 check-status --agent claude-code-cli
```

For both live executors, the harness reconstructs ADBT tool calls from the model history and fails a phase that was required to consult ADBT but read no document. Direct model writes are rejected by a before/after project fingerprint and the app is restored to the phase-start commit.

The recorded fallback automatically loads `fixtures/adbt-port-context.json`. Maintainers can call ADBT live while keeping a recorded model response by adding `--adbt-live`:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
  --adbt-live --yes --seed workshop-v1 --max-cost 3 --json
```

A fully live model run calls ADBT automatically. If ADBT cannot supply the workflows, the harness stops with exit `3`; it does not let the port continue from unsupported assumptions.

## Choose a model executor

Use local Claude Code:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts run <app> \
  --executor claude-cli --model sonnet --yes --json
```

Use a remote model through Strands Agents SDK:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts run <app> \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 \
  --region us-west-2 --yes --json
```

Strands supports `bedrock`, `openai`, and `openrouter`; configure the provider credentials before running `doctor`.

If an external service blocks one exercise, use its recorded fallback:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts run <app> --replay <recording.json> --yes --json
```

Recorded output proves the pipeline contract and retry behavior. It is not evidence from your selected model, toolchain, or device.

## Vega handoff

Use the run id from the port:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts vega-run <runId> --plan --json
# Read the plan before choosing replay or live execution.
```

The workshop pins ADBT `1.0.5` and Vega SDK `0.22.5875`. The live lifecycle checks the SDK and device, builds a `.vpkg`, installs it, launches it, captures and pulls a launch frame, waits five seconds, reads the device log, captures and pulls a second frame, and records the focus-check result. It fails on a crash signature in the log or a frame that does not look rendered. Add `--evaluate-screenshot` (Strands executor only) to also ask a multimodal model what the frame shows.

Use the key-free lifecycle in the workshop:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts vega-run <runId> \
  --platform-replay ../../workshop/fixtures/vega-lifecycle.json \
  --yes --json
```

The report marks this as replay evidence. It tests the harness contract, not a Vega device. For a live run, start VDA in a system terminal and keep it open:

```sh
vega virtual-device start --gui
```

In a second terminal, require `running: true` and a non-empty device list before continuing:

```sh
vega virtual-device status
vega exec vda devices -l
```

Then install the generated app's pinned dependencies and run the live lifecycle:

```sh
npm --prefix out/<runId>/app/apps/vega install
yarn --cwd packages/workshop-harness tsx src/index.ts vega-run <runId> --yes --json
```

An empty VDA device list stops the lifecycle even if the command exits `0`. A live claim requires install, launch, a crash-free device log after the dwell, two pulled frames that pass the pixel gate, and `evidenceMode: "live"`.

See the [workshop guide](../../workshop/README.md) for the full attendee flow.

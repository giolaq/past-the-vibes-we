# Workshop Harness

This package is used in the **Past the Vibes** workshop. It inspects a React Native app, copies it into a safe run directory, applies three small TV changes, verifies each change, and hands the result to Vega tools.

It never edits the source app. Generated work goes to `packages/workshop-harness/out/<runId>/app`. Run every command below from the repository root.

## What happens during a port

Before the pipeline, `source_discovery` copies the app into a guarded directory without Git history, dependencies, builds, caches, or environment files. The port itself then has three phases:

1. `analyze` reads the guarded app and writes `ANALYSIS.md`. A deterministic dependency inventory plus a model+ADBT feasibility verdict decide whether the port is possible; a `blocked` verdict stops the run at exit `5`.
2. `plan` gives the model the ADBT read tools so it discovers and reads the Vega workflows itself, then writes `VEGA_PORT.md` (the flow to preserve and Vega replacements) plus `NextSteps.md` (ADBT sources and unsupported work).
3. `build_test` creates the Vega package boundary and focus adapter, runs an executable remote-navigation check, then runs the Vega device lifecycle and captures a launch screenshot.

For each phase, `src/port-pipeline.ts` saves the current commit, assembles the prompt, asks an executor for a `PortOutputSchema` proposal, validates every path, writes the files, checks the cost cap, and runs phase-specific checks. Passing work gets one Git commit. Failed checks cause one retry from the clean phase-start commit with the exact failure text. A second failure restores the clean state and stops the run.

The model can inspect and propose. It cannot write files or run shell commands. The device screenshot is a mandatory gate in `build_test`: the run fails unless a launch screenshot is produced, so the key-free path supplies it with `--platform-replay`.

## How Strands is used

[Strands Agents SDK](https://github.com/strands-agents/harness-sdk) is the in-process agent runtime for `--executor strands`. This package pins TypeScript SDK `1.10.0`. It supplies model providers, the agent loop, Zod-typed tools, structured output, MCP, limits, cancellation, and metrics.

The port agent receives three tools from `src/port-tools.ts`: list project files, read one project file, and search project text. All three are read-only and limited to the guarded app. `src/port-contract.ts` defines the validated patch result. The agent is limited to eight turns, 40,000 total tokens, and ten minutes per phase.

The harness owns writes, checks, retries, Git commits, the cost cap, replay, and reports. The model never receives a shell or file-write tool.

## Install and test

```sh
yarn setup
yarn verify
yarn doctor
```

`openai` and `@opentelemetry/api` appear in `dependencies` only because they are peer dependencies of `@strands-agents/sdk`; no workshop code imports them directly.

## Run the port

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts plan ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --seed workshop-v1 --max-cost 3 --json
```

Read the plan. Then run the port against a live model (pick your executor). `build_test` needs an attached VDA to capture the launch screenshot:

```sh
# Claude Code CLI (ADBT via init-context; see "ADBT during the port" below)
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

Fallback if a live model, ADBT, or VDA is unavailable — the fully recorded path (`adbt.mode` will be `replay`):

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
  --platform-replay ../../workshop/fixtures/vega-lifecycle.json \
  --yes --seed workshop-v1 --max-cost 3 --json
```

Copy the returned `runId`. Inspect:

- `packages/workshop-harness/out/<runId>/feasibility-report.json` for the feasibility verdict;
- `packages/workshop-harness/out/<runId>/portability-report.json` for what can move to Vega;
- `packages/workshop-harness/out/<runId>/port-result.json` for phases, checks, retries, and cost;
- `packages/workshop-harness/out/<runId>/adbt-port-context.json` for the ADBT workflows the model read during `analyze` and `plan`, with hashes;
- `packages/workshop-harness/out/<runId>/app/NextSteps.md` for ADBT sources and unsupported mappings;
- `packages/workshop-harness/out/<runId>/01-launch.png` for the build_test launch screenshot;
- `packages/workshop-harness/out/<runId>/app` for the generated app copy and phase commits.

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

**Claude Code CLI** — the CLI has its own MCP client, so ADBT is registered with it once, up front, using Amazon's installer (see below). The harness invokes the CLI with `--allowedTools "*"` so whatever ADBT tools `init-context` configured are permitted without stalling on a permission prompt in non-interactive mode; the CLI owns the connection. The harness still ignores any file the model writes directly — only the returned typed patch is applied, verified, and committed.

Set up ADBT for the CLI (run in a real system terminal; it completes silently):

```sh
npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest init-context --agent claude-code-cli
npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest check-status --agent claude-code-cli
```

The normal replay command automatically loads `fixtures/adbt-port-context.json`. To call ADBT for real while keeping the model response key-free, add `--adbt-live`:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
  --adbt-live --yes --seed workshop-v1 --max-cost 3 --json
```

A fully live model run calls ADBT automatically. If ADBT cannot supply the workflows, the harness stops with exit `3`; it does not let the port continue from unsupported assumptions.

## Choose a model executor

Replay is the workshop default because it needs no account:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts run <app> --replay <recording.json> --yes --json
```

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

Strands supports `bedrock`, `openai`, and `openrouter`. Configure the provider credentials before running `doctor`.

## Vega handoff

Use the run id from the port:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts vega-run <runId> --plan --json
# Read the plan before choosing replay or live execution.
```

The workshop pins ADBT `1.0.5` and Vega SDK `0.22.5875`. The live lifecycle checks the SDK and device, builds a `.vpkg`, installs it, launches it, captures logs, takes a screenshot, pulls the screenshot, and records the focus-check result.

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
npm --prefix packages/workshop-harness/out/<runId>/app/apps/vega install
yarn --cwd packages/workshop-harness tsx src/index.ts vega-run <runId> --yes --json
```

An empty VDA device list stops the lifecycle even if the command exits `0`. A live claim requires install, launch, device logs, a pulled screenshot, and `evidenceMode: "live"`.

See the [workshop guide](../../workshop/README.md) for the full attendee flow.

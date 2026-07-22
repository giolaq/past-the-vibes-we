# Workshop Harness

This package is used in the **Past the Vibes** workshop. It inspects a React Native app, copies it into a safe run directory, applies three small TV changes, verifies each change, and hands the result to Vega tools.

It never edits the source app. Generated work goes to `packages/workshop-harness/out/<runId>/app`. Run every command below from the repository root.

## What happens during a port

Before the pipeline, `source_discovery` copies the app into a guarded directory without Git history, dependencies, builds, caches, or environment files. The port itself then has three phases:

1. `analyze` reads the guarded app and writes `ANALYSIS.md`. A deterministic dependency inventory plus a model+ADBT feasibility verdict decide whether the port is possible; a `blocked` verdict stops the run at exit `5`.
2. `plan` loads two selected ADBT workflows and writes `VEGA_PORT.md` (the flow to preserve and Vega replacements) plus `NextSteps.md` (ADBT sources and unsupported work).
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

## Run the key-free workshop path

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts plan ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --seed workshop-v1 --max-cost 3 --json
```

Read the plan. Then run the recorded port:

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
- `packages/workshop-harness/out/<runId>/adbt-port-context.json` for the ADBT workflows injected into the `plan` phase;
- `packages/workshop-harness/out/<runId>/app/NextSteps.md` for ADBT sources and unsupported mappings;
- `packages/workshop-harness/out/<runId>/01-launch.png` for the build_test launch screenshot;
- `packages/workshop-harness/out/<runId>/app` for the generated app copy and phase commits.

## ADBT during the port

ADBT is runtime context for the harness, not only setup for the final device command. During `analyze` (feasibility) and `plan`, a live run starts the pinned package as a stdio MCP server through Strands `McpClient`:

```text
connect -> discover tools
  -> list_documents(WORKFLOW, vega_os)
  -> read_document(port_tv_app_to_vega.md)
  -> read_document(port_tv_app_to_vega_fos_rn_app.md)
  -> inject context into the plan phase
  -> save names, excerpts, and hashes
  -> disconnect
```

The provider requires those two tool names and always disconnects in `finally`. It does not run `init-context` or change Claude configuration.

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

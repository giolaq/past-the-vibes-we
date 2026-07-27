# Workshop Harness

This package is the coding harness for the **Past the Vibes** workshop.

It copies a React Native app into a guarded run directory. It plans and applies
a Vega port. It checks every phase. It does not edit the source app.

Run the commands in this file from the repository root.

## Port Sequence

Source discovery copies the app to:

```text
out/<runId>/app
```

The copy excludes Git history, dependencies, builds, caches, and environment
files.

The pipeline has six phases:

1. `analyze` writes `ANALYSIS.md`. A dependency inventory and a model verdict
   decide if the port can continue.
2. `plan` lets the model read ADBT through MCP. It writes `VEGA_PORT.md` and
   `NextSteps.md`.
3. `port` creates the Vega package, focus adapter, and remote check.
4. `build` runs the Vega build. It gives compiler failures to the model.
5. `launch` installs and starts the app. It checks two frames and the device
   log.
6. `test` runs the remote navigation and focus restoration contract.

For each model phase, the pipeline:

1. Saves the current commit.
2. Assembles the phase prompt.
3. Requests a typed `PortOutputSchema` result.
4. Validates all proposed paths.
5. Writes the files.
6. Checks the cumulative cost.
7. Runs phase checks.
8. Commits passed work.

A failed check returns the exact failure text to the model. The retry starts
from the clean phase commit. The default is one retry.

Use `--max-attempts N` to set a fixed attempt limit. Use `--until-done` to
continue until checks pass or another limit stops the phase. The cost limit
always applies. Repeated failures with no progress stop early.

The model has read-only project tools. It has no shell or write tool.

## Strands Agents SDK

The `strands` executor uses Strands Agents SDK `1.10.0`.

Strands supplies:

- A common model interface for Bedrock, OpenAI, and OpenRouter.
- Zod-typed tools.
- Structured output.
- Stream events.
- MCP support.
- Turn and token limits.
- Cancellation.
- Token metrics.

The port agent can:

- List project files.
- Read one project file.
- Search project text.

All tools are limited to the guarded app.

The harness supplies:

- Phase order.
- Writes.
- Verification.
- Retry policy.
- Git commits.
- Cost control.
- Reports.

Read `workshop/strands-constructs.md` for each SDK construct.

## Install and Test

```sh
yarn setup
yarn verify
yarn doctor
```

Set `WORKSHOP_OUT` to use a different output directory.

The package lists `openai` and `@opentelemetry/api` because Strands declares
them as peer dependencies. Workshop code does not import them directly.

## Select an Executor

### Claude Code CLI

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts run <app> \
  --executor claude-cli --model sonnet --yes --json
```

### Strands with Bedrock

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts run <app> \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 \
  --region us-west-2 --yes --json
```

Strands also supports `openai` and `openrouter`. Configure the provider
credential before you run `doctor`.

## Inspect the Plan

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts plan ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --seed workshop-v1 --max-cost 3 --json
```

Read the phases and cost limit. Then run the selected live executor.

### Claude Code

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor claude-cli --model sonnet \
  --yes --seed workshop-v1 --max-cost 3 --json
```

### Strands with Bedrock

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2 \
  --yes --seed workshop-v1 --max-cost 3 --json
```

## Inspect a Run

Keep the returned `runId`. Inspect these files:

| Path | Evidence |
| --- | --- |
| `out/<runId>/feasibility-report.json` | Feasibility result |
| `out/<runId>/portability-report.json` | Portability findings |
| `out/<runId>/port-result.json` | Phases, checks, retries, and cost |
| `out/<runId>/model-logs/<phase>.jsonl` | Complete model transcript |
| `out/<runId>/adbt-port-context.json` | ADBT document sources and hashes |
| `out/<runId>/app/NextSteps.md` | Unsupported work |
| `out/<runId>/01-launch.png` | First device frame |
| `out/<runId>/02-postlaunch.png` | Second device frame |
| `out/<runId>/app` | Generated app and phase commits |

Read one transcript:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts logs <runId> --phase plan
```

Follow a live transcript:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts logs <runId> --phase plan --follow
```

Each JSONL record includes its schema version, time, sequence, phase, attempt,
executor, direction, kind, and payload.

The transcript can contain prompts, source excerpts, and tool results. Review
it before you share it.

## ADBT MCP

ADBT supplies current Vega documents while the model runs.

### Strands Path

The harness creates an ADBT `McpClient`. It registers the client as an agent
tool source. The model calls the discovered tools.

```text
Agent({ tools: [...projectTools, adbtClient] })
  -> list_documents(...)
  -> read_document(...)
  -> extractAdbtProvenance(...)
  -> adbt-port-context.json
```

The harness records and hashes each document that the model reads.

### Claude Code Path

The harness starts the same pinned ADBT server. It gives Claude Code an
explicit `--mcp-config` and `--strict-mcp-config`.

Claude can use:

- `Read`
- `Grep`
- `Glob`
- `mcp__adbt__*`

Claude cannot use shell, write, web, or notebook tools.

Both live paths fail with exit code 3 if a required phase reads no ADBT
document.

`init-context` installs optional Amazon Vega skills. It does not create the
runtime MCP connection:

```sh
npx -y @amazon-devices/amazon-devices-buildertools-mcp@1.0.5 init-context --agent claude-code-cli --force
npx -y @amazon-devices/amazon-devices-buildertools-mcp@1.0.5 check-status --agent claude-code-cli
```

## Vega Device Lifecycle

Use the run ID from the port:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts vega-run <runId> --plan --json
```

Read the plan before you continue.

The live lifecycle:

1. Checks Vega SDK `0.22.5875`.
2. Checks the attached VDA target.
3. Builds the `.vpkg`.
4. Installs the package.
5. Starts the app.
6. Captures the first frame.
7. Waits five seconds.
8. Scans the device log.
9. Captures the second frame.
10. Runs the focus check.

The command fails if the log has a crash signature. It also fails if a frame
is too small, flat, black, or white.

Start VDA in a dedicated terminal:

```sh
vega virtual-device start --gui
```

Check the device in a second terminal:

```sh
vega virtual-device status
vega exec vda devices -l
```

Require `running: true` and a non-empty device list.

Install the pinned app dependencies. Then run the lifecycle:

```sh
npm --prefix out/<runId>/app/apps/vega install
yarn --cwd packages/workshop-harness tsx src/index.ts vega-run <runId> --yes --json
```

A live claim requires:

- Successful install.
- Successful start.
- No crash after the wait.
- Two valid device frames.
- `evidenceMode: "live"`.

## Recorded Recovery

Use this only if a model, ADBT, SDK, or device blocks the exercise:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
  --platform-replay ../../workshop/fixtures/vega-lifecycle.json \
  --yes --seed workshop-v1 --max-cost 3 --json
```

Recorded data tests the pipeline contract. It does not prove live model or
device behavior.

## Teaching Commands

Lesson 1 uses one model call without the normal control loop:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts naive ../../apps/pocket-cinema \
  --executor claude-cli --model sonnet \
  --max-cost 1 --run-id naive-demo --yes
```

This command saves a proposal. It does not apply, build, start, or test it.

Lesson 4 injects a compiler error only in the guarded copy:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts inject-build-failure workshop --yes
```

The normal `build` phase must remove the fault and pass the Vega build.

Lesson 7 shows the complete run in a TUI:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor claude-cli --model sonnet \
  --seed workshop-v1 --max-cost 3 --yes --run-id final-dashboard --tui
```

The TUI filters visible events. The JSONL transcript remains the complete
record.

## Add a CLI Executor

Edit `src/port-executor.ts`.

1. Implement `PortExecutor.call(phase, prompt)`.
2. Send the prompt through standard input.
3. Run the CLI in the guarded app directory.
4. Return `{text, costUsd}`.
5. Record turns with `PortRecorder`.
6. Add the executor kind to `ExecutorConfig`.
7. Add it to `resolveExecutorConfig()`.
8. Add it to `createPortExecutor()`.
9. Give the CLI the pinned ADBT MCP server.
10. Keep the returned typed patch as the only write path.

The fingerprint check rejects direct model writes and restores the phase-start
commit.

Read the [workshop guide](../../workshop/README.md) for the attendee sequence.

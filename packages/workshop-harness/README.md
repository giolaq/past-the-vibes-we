# Workshop Harness

This package is the coding harness for the **Past the Vibes** workshop.

It copies a React Native app into a guarded run directory. It plans and applies
a Vega port. It checks every phase. It does not edit the source app.

Complete setup from the repository root. Then change directory once:

```sh
yarn setup
yarn verify
cd packages/workshop-harness
```

Run the remaining commands in this file from `packages/workshop-harness`.

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
2. `plan` lets the model read ADBT through MCP. It writes the typed
   `port-plan.json`, `VEGA_PORT.md`, and `NextSteps.md`. A person approves the
   exact plan before implementation.
3. `port` creates the Vega package, focus adapter, and remote check.
4. `build` installs the guarded Vega package dependencies, then runs the Vega
   build. On failure, it gives the compiler diagnostics and ADBT MCP to the
   repair model.
5. `launch` starts a VDA when none is attached, installs and starts the app,
   samples running state before and after a dwell, and scans the device log. A
   failed launch repair receives ADBT MCP.
6. `test` relaunches the app, injects D-pad keys with `inputd-cli`, reads the
   focused `test_id` through Automation Toolkit, and verifies navigation and
   focus restoration against the approved plan.

If the test phase repairs source code, it rebuilds, installs, starts, scans the
log, samples running state again, and reruns focus checks. A late repair cannot
pass only the host-side test.

For each model phase, the pipeline:

1. Saves the current commit.
2. Assembles the phase prompt.
3. Requests a typed `PortOutputSchema` result.
4. Validates all proposed paths.
5. Writes the files.
6. Checks cumulative token usage.
7. Runs phase checks.
8. Commits passed work.

A failed check returns the exact failure text to the model. The retry starts
from the clean phase commit. Build and device repairs then reapply the typed
candidate from earlier attempts so sequential fixes accumulate. A final phase
failure still rolls back the whole candidate. Each phase declares its retry
limit; ordinary model phases permit one retry, while build and device phases
permit more.

Use `--max-attempts N` to override every phase with a fixed attempt limit. Use
`--until-done` to continue until checks pass or another limit stops the phase.
The token limit always applies. Repeated failures with no progress stop early.

The model has read-only project tools. It has no shell or write tool.

## Product Input

The existing app directory is the product input. The required
`workshop-brief.md` states the bounded port goal, required flow, constraints,
and verification.

The harness supplies the brief to feasibility and phase prompts. It records the
brief hash and source fingerprint in `out/<runId>/run-spec.json`.
Keep the source app unchanged while the run ID is active. Start a new run ID
after an app or brief change.

`workshop.config.json` selects model execution. Flags set the phase, seed,
token and turn limits, and run ID. ADBT supplies current Vega documents. The
workshop does not use separate content, brand, or design input files.

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
- Token and turn controls.
- Optional provider-reported cost telemetry.
- Reports.

Read `workshop/strands-constructs.md` for each SDK construct.

## Check the Environment

```sh
yarn tsx src/index.ts doctor --json
```

Set `WORKSHOP_OUT` to use a different output directory.

The package lists `openai` and `@opentelemetry/api` because Strands declares
them as peer dependencies. Workshop code does not import them directly.

## Configure the Model

Edit `../../workshop.config.json`. The harness loads this file automatically.

For Claude Code CLI:

```json
{
  "executor": "claude-cli",
  "model": "claude-sonnet-4-6"
}
```

Use an exact Claude model name, not `sonnet`, `opus`, or `haiku`. On managed
installations, choose a name from `~/.claude/settings.json` `availableModels`.
`doctor` validates an enforced list, and each live call compares the requested
name with Claude Code's reported `modelUsage`.

For Strands with Amazon Bedrock:

```json
{
  "executor": "strands",
  "provider": "bedrock",
  "model": "anthropic.claude-3-5-sonnet-20241022-v2:0",
  "region": "us-west-2"
}
```

Strands also supports `openai` and `openrouter`. Configure the provider
credential before you run `doctor`. Do not put credentials in this file.
Command-line model options remain available as temporary overrides.
Any provider-supported model may be selected by its exact ID.

The primary controls are an optional cumulative token limit and optional
per-call turns. Model calls have no elapsed-time timeout. Without
`--max-tokens`, the harness records cumulative usage but does not stop on it.
When a limit is set, Strands receives the remaining token allowance for each
call. Claude Code reports usage after a call, so a single Claude call can cross
the configured limit; the harness records that usage and stops before another
call.
The Claude subprocess retains a fixed `$10` emergency ceiling. The harness
does not estimate dollars or stop a run based on calculated cost. It passes
through provider-reported cost when present and labels replay cost as recorded
metadata.

## Audit Feasibility

```sh
yarn tsx src/index.ts plan ../../apps/pocket-cinema \
  --seed workshop-v1 --max-tokens 1000000 --json
```

Read the brief, dependency verdict, phases, token limit, and turn limit.

## Plan and Approve the Port

Run the analysis and plan phases:

```sh
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --phases analyze,plan --yes --seed workshop-v1 \
  --max-tokens 1000000 --run-id workshop --json
yarn tsx src/index.ts approve-plan workshop --yes
```

The plan schema checks screen references, Select and Back transitions,
preserved behavior, and evidence mappings. Human review checks that these are
the correct product decisions.

The approval binds the exact plan bytes to the brief hash. `port`, `build`,
`launch`, and `test` refuse a missing or stale approval.

## Inspect a Run

Keep the returned `runId`. Inspect these files:

| Path | Evidence |
| --- | --- |
| `out/<runId>/feasibility-report.json` | Feasibility result |
| `out/<runId>/portability-report.json` | Portability findings |
| `out/<runId>/run-spec.json` | Source fingerprint, brief hash, phases, seed, and limits |
| `out/<runId>/port-result.json` | Phases, checks, retries, usage, and model names |
| `out/<runId>/model-logs/<phase>.jsonl` | Complete model transcript |
| `out/<runId>/adbt-port-context.json` | ADBT document sources and hashes |
| `out/<runId>/app/NextSteps.md` | Unsupported work |
| `out/<runId>/app/port-plan.json` | Structured screen, navigation, behavior, and evidence contract |
| `out/<runId>/app/port-plan-approval.json` | Human-approved plan and brief hashes |
| `out/<runId>/vega-device.log` | Filtered device log since launch |
| `out/<runId>/vega-platform-result.json` | Device commands, running-state checks, and blockers |
| `out/<runId>/app` | Generated app and phase commits |

Read one transcript:

```sh
yarn tsx src/index.ts logs <runId> --phase plan
```

Follow a live transcript:

```sh
yarn tsx src/index.ts logs <runId> --phase plan --follow
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

Every default phase delegates Vega knowledge to ADBT MCP and fails if its live
model call reads no ADBT document. The harness does not inject a Vega scaffold
or select local Vega skills. Skill support remains available for optional
team-specific instructions.

## Vega Device Lifecycle

Use the run ID from the port:

```sh
yarn tsx src/index.ts vega-run <runId> --plan --json
```

Read the plan before you continue.

The live lifecycle:

1. Checks Vega SDK `0.23.9221`.
2. Checks for an attached VDA target.
3. Starts the VDA and checks again when no target is attached.
4. Installs the guarded Vega package dependencies.
5. Builds the `.vpkg`.
6. Installs the package.
7. Starts the app.
8. Confirms that the app reports running.
9. Waits five seconds.
10. Scans the device log.
11. Confirms that the app still reports running.
12. Enables Automation Toolkit.
13. Injects Down, Left, Right, Select, and Back keys.
14. Reads the focused `test_id` after each transition.

The command fails if either running-state sample is false, if a device command
fails, or if the log has a crash signature.

To troubleshoot VDA startup manually:

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
npm --prefix ../../out/<runId>/app/apps/vega install
yarn tsx src/index.ts vega-run <runId> --yes --json
```

A live claim requires:

- Successful install.
- Successful start.
- Running state immediately after start.
- No crash after the wait.
- Running state after the wait.
- Every required focus transition observed from the VDA UI hierarchy.
- `evidenceMode: "live"`.

This proves lifecycle stability and remote focus behavior. It does not prove
visual styling or pixel-level rendering.

## Recorded Recovery

Use this only if a model, ADBT, SDK, or device blocks the exercise:

```sh
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --replay ../../workshop/fixtures/port-recording.json \
  --phases analyze,plan --yes --seed workshop-v1 \
  --max-tokens 1000000 --run-id recorded
yarn tsx src/index.ts approve-plan recorded --yes
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --replay ../../workshop/fixtures/port-recording.json \
  --platform-replay ../../workshop/fixtures/vega-lifecycle.json \
  --phases port,build,launch,test --yes --seed workshop-v1 \
  --max-tokens 1000000 --run-id recorded --json
```

Recorded data tests the pipeline contract. It does not prove live model or
device behavior.

## Teaching Commands

Lesson 1 uses one model call without the normal control loop:

```sh
yarn tsx src/index.ts naive ../../apps/pocket-cinema \
  --max-tokens 1000000 --run-id naive-demo --yes
```

This command saves a proposal. It does not apply, build, start, or test it.

Lesson 4 injects a compiler error only in the guarded copy:

```sh
yarn tsx src/index.ts inject-build-failure workshop --yes
```

The normal `build` phase must remove the fault and pass the Vega build.

Lesson 7 shows the complete run in a TUI:

```sh
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --phases analyze,plan --seed workshop-v1 \
  --max-tokens 1000000 --yes --run-id final-dashboard --tui
yarn tsx src/index.ts approve-plan final-dashboard --yes
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --phases port,build,launch,test \
  --seed workshop-v1 --max-tokens 1000000 --yes --run-id final-dashboard --tui
```

Close the first TUI after it reports that plan approval is required. The
resumed TUI loads analyze and plan events before it follows the remaining
phases. Use Up and Down to select a phase, then Enter to open its messages.
The message view shows each event type and content. Use Up and Down to select
an event, PageUp and PageDown to scroll its content, Tab to change the event
filter, and Escape to return to the phase list. Press `q` to close a completed
TUI. The JSONL transcript remains the complete record.

## Add a CLI Executor

Edit `src/port-executor.ts`.

1. Implement `PortExecutor.call(phase, prompt)`.
2. Send the prompt through standard input.
3. Run the CLI in the guarded app directory.
4. Return `{text, usage, requestedModel, actualModels}` and include
   `providerReportedCostUsd` only when the provider supplies it.
5. Record turns with `PortRecorder`.
6. Add the executor kind to `ExecutorConfig`.
7. Add it to `resolveExecutorConfig()`.
8. Add it to `createPortExecutor()`.
9. Give the CLI the pinned ADBT MCP server.
10. Keep the returned typed patch as the only write path.

The fingerprint check rejects direct model writes and restores the phase-start
commit.

Read the [workshop guide](../../workshop/README.md) for the attendee sequence.

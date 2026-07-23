# 6. Adapt Your React Native App

## Goal

Inspect an app, review the plan, and change only a guarded copy.

Use Pocket Cinema unless your own app already runs and passes the setup checks.

## What the port command actually does

The port is a pipeline, not one large prompt. It separates inspection, platform knowledge, model proposals, file writes, and verification so each part can be reviewed.

| Phase | Owner | What happens | Evidence |
| --- | --- | --- | --- |
| `analyze` | Model + ADBT + harness | Reads the guarded app and writes `ANALYSIS.md`. A deterministic dependency inventory plus a model+ADBT feasibility verdict judge whether the port is possible. | `ANALYSIS.md`, `feasibility-report.json`, `portability-report.json`, and a verified commit |
| `plan` | ADBT + model + harness | The model reads the Vega workflows it needs from ADBT, describes the flow to preserve and Vega replacements, and records unsupported mappings. | `VEGA_PORT.md`, `NextSteps.md`, ADBT evidence, and a verified commit |
| `build_test` | Model + Vega adapter + harness | Creates the Vega package boundary, connects the shared focus state, runs the executable remote-navigation check, then builds, launches, and captures a device screenshot. | Vega package files, `tv-focus-result.json`, `TV_VERIFICATION.md`, `01-launch.png`, and a verified commit |

Before the pipeline, `source_discovery` copies the app into a guarded directory (no model). The feasibility part of `analyze` runs at `plan` time, so its verdict is in the plan you approve. `build_test` folds in the Vega device lifecycle from lesson 8: the run fails unless a launch screenshot is produced.

## Before any model call

`plan` discovers and audits the source without writing to it. It shows the target SDK, selected executor, portability findings, approved project context, ADBT mode, phase order, creative seed, and cost cap.

After you approve with `--yes`, `run` creates `out/<runId>/app`. It copies the source while excluding `.git`, dependencies, build output, caches, and environment files. The harness initializes a new Git repository in that guarded copy. The original app remains untouched.

## Inside each edit phase

Every edit phase follows the same bounded loop:

1. Save the guarded app's current Git commit.
2. Assemble a prompt from the phase goal, its domain rule, the fixed seed, approved project context, portability findings, and exact checks.
3. For `analyze` and `plan`, give the model the ADBT read tools so it can fetch Vega workflows itself; record each read with a hash.
4. Ask the selected executor for a typed proposal: a short summary and complete contents for relative file paths.
5. Validate the response with `PortOutputSchema`.
6. Reject absolute paths, path traversal, `.git`, `node_modules`, and environment files.
7. Let the harness write the proposed files. The model has no write or shell tool.
8. Add the model turn's cost to the run total. If it exceeds the cap, restore the phase start and abort.
9. Run the phase's mechanical checks.
10. If checks pass, commit the phase. If they fail, reset to the phase-start commit and retry once with the exact failure text.
11. If the retry also fails, reset again and stop with exit code `2`. Failed work does not remain in the guarded app.

## What changes between executors

| Executor | How it inspects the app | How output is constrained |
| --- | --- | --- |
| Replay | Uses the next recorded response for the named phase. | The same schema, path checks, verification, retry, and commit logic still run. |
| Claude Code | Receives the prompt over stdin with only `Read`, `Glob`, and `Grep`. | It returns stream JSON; the harness extracts the result and usage. |
| Strands | Creates an `Agent` with typed list, read, and search tools scoped to the guarded app. | `structuredOutputSchema` requires `PortOutputSchema`; turns, tokens, and time are bounded. |

Changing the executor does not change the pipeline's authority. The harness always owns writes, checks, retries, budgets, commits, and reports.

## Why ADBT appears in `analyze` and `plan`

The `analyze` phase needs current Vega compatibility guidance to judge feasibility, and `plan` needs current migration workflows to describe the port. `build_test` already has a concrete focus contract and the plan to work from, so it does not query ADBT.

In a live Strands run the harness builds the ADBT `McpClient` and passes it into the agent's tools; Strands discovers ADBT's tools dynamically and the model calls `list_documents`, then `read_document` for whichever workflows it needs — the harness pre-selects nothing. After the phase the harness reconstructs those reads from the agent's messages and saves each with a SHA-256 hash to `adbt-port-context.json`. If ADBT is unavailable the run stops with exit code `3` instead of letting the model invent Vega APIs. (The Claude Code CLI reaches ADBT through its own MCP config from `init-context`; replay reads a recorded `adbt-port-context.json`.)

## What each phase must prove

`analyze` must create `ANALYSIS.md` with a `## Portable` section, and its feasibility verdict must not be `blocked` (a blocked verdict stops the run at exit code `5`).

`plan` must create `VEGA_PORT.md` with a `## TV Flow` section and `NextSteps.md` naming its ADBT sources.

`build_test` must create the Vega manifest and interactive component, the Vega build script, app registration, Metro boundary, and focus-state adapter; connect the app to the shared focus-state module; run the executable focus-transition check and write a passing `tv-focus-result.json`; document focus restoration after Back; and produce a launch screenshot from the Vega lifecycle. These checks prove the expected package shape and remote behavior.

## Do this

1. Create a read-only plan:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts plan ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --seed workshop-v1 --max-cost 3 --json
```

2. Before running, check the source path, target flow, portability findings, the feasibility verdict, the three-phase sequence (`analyze`, `plan`, `build_test`), seed, and cost cap.
3. Approve and run the port against a live model. Pick your executor. On the Claude CLI path the model reaches ADBT through the MCP config you set up in lesson 0; on the Strands path the harness hands it the ADBT client. `build_test` needs an attached VDA to capture the launch screenshot:

```sh
# Claude Code CLI
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor claude-cli --model sonnet \
  --yes --seed workshop-v1 --max-cost 3 --json
```

```sh
# Strands + Bedrock
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2 \
  --yes --seed workshop-v1 --max-cost 3 --json
```

4. Copy the `runId` from the output. You will use it in the Vega lesson.
5. Open `out/<runId>/feasibility-report.json`. Read the feasibility verdict, then open `out/<runId>/portability-report.json` and separate portable, replace, manual, and out-of-scope findings.
6. Open `out/<runId>/adbt-port-context.json`. Find the ADBT workflows the model read, their excerpts, and hashes.
7. Open `out/<runId>/port-result.json`. Confirm `adbt.mode` is `live`, review phase attempts and cost, and check that the context belongs to the `plan` phase.
8. Open `out/<runId>/app/NextSteps.md`. Find the ADBT sources and the section for unsupported mappings.
9. Inspect `out/<runId>/app`, `report.md`, and the guarded app's Git log. Match one commit to each passing phase.
10. Check that `apps/pocket-cinema` is still clean and unchanged.

## How ADBT connects during the port

Trace the MCP lifecycle in `src/context-providers/adbt.ts`:

1. `createAdbtMcpClient` builds a Strands `McpClient` with `applicationName`, `applicationVersion`, and a `StdioClientTransport` (from the MCP SDK) that starts pinned ADBT `1.0.5`.
2. The pipeline passes that client into the agent's `tools` for `analyze` and `plan`. Strands calls `listTools()` for us — the harness never hardcodes tool names.
3. The model calls ADBT's own tools (`list_documents`, then `read_document` / `search_documentation`) to fetch the Vega workflows it decides it needs.
4. After the phase the harness calls `extractAdbtProvenance(agent.messages)`, pairs each read with its result, hashes it into `adbt-port-context.json`, and disconnects the client.

The model drives ADBT, but not without limits. The ADBT `McpClient` is only in the agent's tools during `analyze` and `plan`, and the harness reconstructs every read from the message history and hashes it, so a run remains reproducible from `adbt-port-context.json` even though the model chose what to fetch. Replay reruns from that recorded context with no live server.

See [Strands Constructs Used in This Workshop](strands-constructs.md) for the complete agent, tool, structured-output, invocation, metrics, and MCP reference.

## Why this matters

The harness reads first, lets the model fetch current Vega migration workflows from ADBT during `analyze` and `plan`, records and hashes every read, and edits a copy. The model executor can change without losing the platform guidance.

## You are done when

You have the `runId`, ADBT evidence names the migration workflows the model read, all three phases (`analyze`, `plan`, `build_test`) have verified commits, `tv-focus-result.json` passes, `build_test` produced a launch screenshot, and the source app is unchanged. Lesson 8 revisits that same Vega lifecycle to inspect the device evidence.

## If blocked

If a live model, ADBT, or VDA is unavailable, run the fully recorded path — same phases and evidence contract, no credentials (in this mode `adbt.mode` is `replay`):

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
  --platform-replay ../../workshop/fixtures/vega-lifecycle.json \
  --yes --seed workshop-v1 --max-cost 3 --json
```

Use Pocket Cinema and `checkpoints/audit-complete/`. Do not spend more than 10 minutes adapting a different app during the workshop.

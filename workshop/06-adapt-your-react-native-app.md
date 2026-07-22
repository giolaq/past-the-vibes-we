# 6. Adapt Your React Native App

## Goal

Inspect an app, review the plan, and change only a guarded copy.

Use Pocket Cinema unless your own app already runs and passes the setup checks.

## What the port command actually does

The port is a pipeline, not one large prompt. It separates inspection, platform knowledge, model proposals, file writes, and verification so each part can be reviewed.

| Phase | Owner | What happens | Evidence |
| --- | --- | --- | --- |
| `analyze` | Model + ADBT + harness | Reads the guarded app and writes `ANALYSIS.md`. A deterministic dependency inventory plus a model+ADBT feasibility verdict judge whether the port is possible. | `ANALYSIS.md`, `feasibility-report.json`, `portability-report.json`, and a verified commit |
| `plan` | ADBT + model + harness | Loads two approved Vega workflows, describes the flow to preserve and Vega replacements, and records unsupported mappings. | `VEGA_PORT.md`, `NextSteps.md`, ADBT evidence, and a verified commit |
| `build_test` | Model + Vega adapter + harness | Creates the Vega package boundary, connects the shared focus state, runs the executable remote-navigation check, then builds, launches, and captures a device screenshot. | Vega package files, `tv-focus-result.json`, `TV_VERIFICATION.md`, `01-launch.png`, and a verified commit |

Before the pipeline, `source_discovery` copies the app into a guarded directory (no model). The feasibility part of `analyze` runs at `plan` time, so its verdict is in the plan you approve. `build_test` folds in the Vega device lifecycle from lesson 8: the run fails unless a launch screenshot is produced.

## Before any model call

`plan` discovers and audits the source without writing to it. It shows the target SDK, selected executor, portability findings, approved project context, ADBT mode, phase order, creative seed, and cost cap.

After you approve with `--yes`, `run` creates `out/<runId>/app`. It copies the source while excluding `.git`, dependencies, build output, caches, and environment files. The harness initializes a new Git repository in that guarded copy. The original app remains untouched.

## Inside each edit phase

Every edit phase follows the same bounded loop:

1. Save the guarded app's current Git commit.
2. Assemble a prompt from the phase goal, its domain rule, the fixed seed, approved project context, portability findings, and exact checks.
3. For `plan` only, load the selected ADBT workflows and add their relevant excerpts and hashes.
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

The harness starts pinned ADBT as an MCP server, confirms that `list_documents` and `read_document` exist, lists Vega workflow documents, and reads only:

- `port_tv_app_to_vega.md`;
- `port_tv_app_to_vega_fos_rn_app.md`.

It keeps the relevant sections, computes a SHA-256 hash for each excerpt, saves the context, injects it into the `plan` prompt, and disconnects in `finally`. If live ADBT cannot provide this evidence, the run stops with exit code `3` instead of letting the model invent Vega APIs.

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
3. Run the key-free port. The harness automatically loads the recorded ADBT context beside the model recording, and `build_test` replays the Vega lifecycle so it can produce a launch screenshot without a device:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
  --platform-replay ../../workshop/fixtures/vega-lifecycle.json \
  --yes --seed workshop-v1 --max-cost 3 --json
```

4. Copy the `runId` from the output. You will use it in the Vega lesson.
5. Open `out/<runId>/feasibility-report.json`. Read the feasibility verdict, then open `out/<runId>/portability-report.json` and separate portable, replace, manual, and out-of-scope findings.
6. Open `out/<runId>/adbt-port-context.json`. Find the two ADBT workflows, selected excerpts, and hashes.
7. Open `out/<runId>/port-result.json`. Confirm `adbt.mode` is `replay`, review phase attempts and cost, and check that the context belongs to the `plan` phase.
8. Open `out/<runId>/app/NextSteps.md`. Find the ADBT sources and the section for unsupported mappings.
9. Inspect `out/<runId>/app`, `report.md`, and the guarded app's Git log. Match one commit to each passing phase.
10. Check that `apps/pocket-cinema` is still clean and unchanged.

## Optional: call ADBT MCP live without a model account

Check the native MCP connection, then run the same port with `--adbt-live`. The model output still comes from the recording, but the harness starts pinned ADBT `1.0.5` over stdio during the `analyze` feasibility check and the `plan` phase:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts doctor --replay --adbt-live --json
```

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
  --platform-replay ../../workshop/fixtures/vega-lifecycle.json \
  --adbt-live --yes --seed workshop-v1 --max-cost 3 --json
```

Open that run's `adbt-port-context.json`. Its `mode` is `live`. A fully live Claude Code or Strands run uses the same ADBT provider automatically.

Trace the MCP lifecycle in `src/context-providers/adbt.ts`:

1. Create Strands `McpClient` with `applicationName`, `applicationVersion`, and a transport.
2. Use `StdioClientTransport` from the MCP SDK to start pinned ADBT. The transport is not part of Strands.
3. Call `listTools()`. It connects lazily and returns executable MCP tool objects.
4. Require `list_documents` and `read_document` by name.
5. Call `callTool(tool, args, { signal })` with JSON-compatible arguments and a timeout signal.
6. List Vega `WORKFLOW` documents before reading anything.
7. Read only the two approved port workflows.
8. Save names, excerpts, and hashes, then call `disconnect()` in `finally`.

`JSONValue` is the Strands type used to keep MCP arguments and results JSON-compatible. The native `AbortSignal` and MCP SDK stdio transport are passed into Strands; they are not Strands constructs themselves.

ADBT is not handed to the model as an unrestricted tool box. The harness chooses the documents and injects their recorded context only into the `plan` phase. This gives replay a stable input and keeps crash or performance tools out of a migration phase that does not need them.

See [Strands Constructs Used in This Workshop](strands-constructs.md) for the complete agent, tool, structured-output, invocation, metrics, and MCP reference.

## Why this matters

The harness reads first, asks ADBT MCP for current Vega migration workflows, injects only that platform context into the `plan` phase, and edits a copy. The model executor can change without losing the platform guidance.

## You are done when

You have the `runId`, ADBT evidence names the two migration workflows, all three phases (`analyze`, `plan`, `build_test`) have verified commits, `tv-focus-result.json` passes, `build_test` produced a launch screenshot, and the source app is unchanged. Lesson 8 revisits that same Vega lifecycle to inspect the device evidence.

## If blocked

Use Pocket Cinema and `checkpoints/audit-complete/`. Do not spend more than 10 minutes adapting a different app during the workshop.

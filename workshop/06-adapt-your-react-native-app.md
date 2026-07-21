# 6. Adapt Your React Native App

## Goal

Inspect an app, review the plan, and change only a guarded copy.

Use Pocket Cinema unless your own app already runs and passes the setup checks.

## What the port command actually does

The port is a pipeline, not one large prompt. It separates inspection, platform knowledge, model proposals, file writes, and verification so each part can be reviewed.

| Stage | Owner | What happens | Evidence |
| --- | --- | --- | --- |
| `source_discovery` | Harness | Reads `package.json`, scripts, dependencies, and Git state. | Source details in `portability-report.json` |
| `vega_portability_audit` | Harness | Classifies reusable React Native code, navigation, native dependencies, focus work, and out-of-scope services. | Findings and recommendations in `portability-report.json` |
| `tv_product_spec` | Model + harness | Describes the flow to preserve before changing code. | `VEGA_PORT.md` and a verified commit |
| `vega_port` | ADBT + model + harness | Loads two approved Vega workflows, proposes the Vega package boundary, and records unsupported mappings. | Generated Vega package files, `NextSteps.md`, ADBT evidence, and a verified commit |
| `tv_behavior` | Model + harness | Connects the shared focus state to the app and adds an executable remote-navigation check. | `tv-focus-result.json`, `TV_VERIFICATION.md`, and a verified commit |
| `production_vega_run` | Vega adapter, lesson 8 | Builds, installs, launches, collects logs, and captures device evidence. It does not run during this lesson. | `vega-run-result.json` |

The first two stages are deterministic. The next three are model-assisted edit phases. The last stage is a separate platform lifecycle, so a successful port does not claim that a device run happened.

## Before any model call

`plan` discovers and audits the source without writing to it. It shows the target SDK, selected executor, portability findings, approved project context, ADBT mode, phase order, creative seed, and cost cap.

After you approve with `--yes`, `run` creates `out/<runId>/app`. It copies the source while excluding `.git`, dependencies, build output, caches, and environment files. The harness initializes a new Git repository in that guarded copy. The original app remains untouched.

## Inside each edit phase

Every edit phase follows the same bounded loop:

1. Save the guarded app's current Git commit.
2. Assemble a prompt from the phase goal, its domain rule, the fixed seed, approved project context, portability findings, and exact checks.
3. For `vega_port` only, load the selected ADBT workflows and add their relevant excerpts and hashes.
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

## Why ADBT appears only in `vega_port`

The product-spec phase does not need platform APIs, and the behavior phase already has a concrete focus contract. Only `vega_port` needs current Vega migration guidance.

The harness starts pinned ADBT as an MCP server, confirms that `list_documents` and `read_document` exist, lists Vega workflow documents, and reads only:

- `port_tv_app_to_vega.md`;
- `port_tv_app_to_vega_fos_rn_app.md`.

It keeps the relevant sections, computes a SHA-256 hash for each excerpt, saves the context, injects it into `vega_port`, and disconnects in `finally`. If live ADBT cannot provide this evidence, the run stops with exit code `3` instead of letting the model invent Vega APIs.

## What each phase must prove

`tv_product_spec` must create `VEGA_PORT.md` with a `## TV Flow` section.

`vega_port` must create the Vega manifest and interactive component, the Vega build script, app registration, Metro boundary, focus-state adapter, and `NextSteps.md` with ADBT sources. These checks prove the expected package shape; they do not replace a real Vega build.

`tv_behavior` must connect the app to the shared focus-state module, run the executable focus-transition check, write a passing `tv-focus-result.json`, and document focus restoration after Back.

## Do this

1. Create a read-only plan:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts plan ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --seed workshop-v1 --max-cost 3 --json
```

2. Before running, check the source path, target flow, portability findings, full phase sequence, seed, and cost cap.
3. Run the key-free port. The harness automatically loads the recorded ADBT context beside the model recording:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
  --yes --seed workshop-v1 --max-cost 3 --json
```

4. Copy the `runId` from the output. You will use it in the Vega lesson.
5. Open `out/<runId>/portability-report.json`. Separate portable, replace, manual, and out-of-scope findings.
6. Open `out/<runId>/adbt-port-context.json`. Find the two ADBT workflows, selected excerpts, and hashes.
7. Open `out/<runId>/port-result.json`. Confirm `adbt.mode` is `replay`, review phase attempts and cost, and check that the context belongs to `vega_port`.
8. Open `out/<runId>/app/NextSteps.md`. Find the ADBT sources and the section for unsupported mappings.
9. Inspect `out/<runId>/app`, `report.md`, and the guarded app's Git log. Match one commit to each passing edit phase.
10. Check that `apps/pocket-cinema` is still clean and unchanged.

## Optional: call ADBT MCP live without a model account

Check the native MCP connection, then run the same port with `--adbt-live`. The model output still comes from the recording, but the harness starts pinned ADBT `1.0.5` over stdio before `vega_port`:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts doctor --replay --adbt-live --json
```

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
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

ADBT is not handed to the model as an unrestricted tool box. The harness chooses the documents and injects their recorded context only into `vega_port`. This gives replay a stable input and keeps crash or performance tools out of a migration phase that does not need them.

See [Strands Constructs Used in This Workshop](strands-constructs.md) for the complete agent, tool, structured-output, invocation, metrics, and MCP reference.

## Why this matters

The harness reads first, asks ADBT MCP for current Vega migration workflows, injects only that platform context into `vega_port`, and edits a copy. The model executor can change without losing the platform guidance.

## You are done when

You have the `runId`, ADBT evidence names the two migration workflows, all five pre-Vega stages are complete, the three edit phases have verified commits, `tv-focus-result.json` passes, and the source app is unchanged. The sixth planned stage is the Vega lifecycle in lesson 8.

## If blocked

Use Pocket Cinema and `checkpoints/audit-complete/`. Do not spend more than 10 minutes adapting a different app during the workshop.

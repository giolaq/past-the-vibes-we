---
id: port
number: "03"
nav: Write the port
time: 30 minutes
title: Write the code and verify each requirement
lead: The port phase changes the app. Nine independent checks control the phase commit.
objective: Inspect the checks for a code change. Observe how exact failure text causes a useful retry.
evidence: The guarded copy contains a Vega package and focus module. Git records the passing phase.
---

:::welcome Use checks for code changes
The first two phases produced documents.
The port phase produces code.

The phase creates a Vega package.
The phase creates a shared focus-state module.
The phase creates an executable focus test.
An executable test is a program that returns pass or fail.

A wrong result can now change application behavior.
Read the checks before you accept the result.
:::

:::concept The verification engine is small
The verification engine is the TypeScript code that runs the independent checks.
`src/port-verification.ts` defines four check types:

- `file_exists` checks that a required file exists.
- `contains` checks that a file contains required text.
- `json_schema` checks that JSON has the required fields and value types.
- `command` runs a program and requires a successful exit.

`verifyPort()` runs each check and collects the failure text.
The port phase has nine checks.
The checks cover the manifest, build scripts, app configuration, focus module, wiring, and test.
:::

:::predict
The model can write a Vega manifest that appears correct.
A static check reads files without running the Vega compiler.
Which static checks can accept the manifest even if Vega rejects it?
:::

## Trace Strands in the port phase

Strands returns a typed patch.
The harness controls every operation that changes the guarded copy.
One attempt is one model proposal followed by the phase checks.

:::snippet packages/workshop-harness/src/port-pipeline.ts (simplified)
const model = await options.executor.call(
  phase.name,
  prompt(phase, options, failures),
  { mcp: phase.mcp, attempt },
);
const output = parseJsonBlock(model.text, PortOutputSchema, phase.name);
writeOutput(options.appDir, output.files, phase.readOnly);
failures = await verify(phase, options, deviceMark, true, attempt);
if (failures.length === 0) break;
>look: The executor proposes files. The harness parses, writes, and verifies them.
:::

| Owner | Port action |
| --- | --- |
| Strands | Uses read-only project tools. Uses ADBT MCP. Returns `{summary, files}`. |
| ADBT MCP | Supplies the Vega migration, manifest, dependency, and build guidance selected by the model. |
| Harness | Rejects unsafe paths. Protects the approved plan. Records ADBT provenance. Writes complete files. Runs nine checks. Commits the result. |
| Evidence | `port-result.json`, `model-logs/port.jsonl`, and the port commit |

:::note Claude CLI path
The Claude CLI executor implements the same `PortExecutor.call()` interface.
This TypeScript interface requires each executor to support the same call operation.
The Claude CLI executor cannot bypass `writeOutput()` or the independent checks.
:::

## Run the port phase

Use the same run ID and executor.
The port phase checks `port-plan-approval.json` before it calls the model.
The port phase refuses a missing approval.
The port phase refuses a plan that changed after approval.

:::yourturn
Run the code-writing phase against the approved plan.
Inspect the generated Vega package, shared focus code, and phase commit.
:::

:::command Run the port phase
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --phases port --yes --run-id workshop
:::

:::note Use your workshop configuration
The command reads the model settings from `../../workshop.config.json`.
The port phase supplies ADBT MCP and requires a document read.
:::

:::note The plan is read-only
The port model can read `port-plan.json`.
The port model cannot change `port-plan.json` or `port-plan-approval.json`.

The approved plan defines success.
The implementation cannot change the approved requirements.
:::

## Inspect the files and commit

`apps/vega` is the target Vega package directory.
`manifest.toml` declares the Vega package.
`package.json` declares JavaScript dependencies and scripts.
`app.json` identifies the React Native app.
`metro.config.js` configures the Metro JavaScript bundler.

:::steps
1. Open `out/workshop/app/apps/vega/`.
2. Find `manifest.toml`.
3. Find `package.json`.
4. Find `app.json`.
5. Find `metro.config.js`.
6. Open `src/tv/focus-state.ts`.
7. Find the focus-state import in `src/App.tsx`.
8. Find the focus-state import in `tests/verify-tv-focus.ts`.
9. Run `git log --oneline` in the guarded copy.
10. Find the port-phase commit.
:::

The app and test use the same focus module.
The shared module supports the Lesson 6 test.

## Inspect the recorded events

The model transcript is the ordered record of requests, responses, tools, checks, and commits.
The phase writes `out/workshop/model-logs/port.jsonl`.
Each line contains one complete event.
An event has a type, sequence number, and payload.
The payload is the event content.
The sequence number records event order.

:::command Read the port transcript
yarn tsx src/index.ts logs workshop --phase port
:::

:::steps
1. Find the `request` event.
2. Read the complete phase prompt.
3. Find the model response events.
4. Find `verification_result`.
5. Find `commit`.
6. Find `phase_complete`.
7. Verify that the `sequence` values increase.
:::

Strands and Claude Code use different native event names.
Native means that the event keeps the original executor format.
The transcript keeps the native event payloads.

Use `--follow` to read a live phase in a second terminal.
The option waits for new events and prints them as they arrive.

The transcript can contain prompts, source text, and tool results.
Keep the transcript in the ignored `out/` directory.
Review the transcript before you share the transcript.

## Know the retry limits

When a check fails, the next model request contains the exact failure.
The default permits one retry.
`--max-attempts N` sets a different limit.
Replace `N` with a positive number.
`--until-done` removes the attempt limit.

A configured cumulative token limit still applies.
The harness also stops after the same failure occurs twice.
The repeated failure is the no-progress stop condition.
The model cannot decide to continue the loop.

## Add one requirement

Add a requirement for focus restoration documentation.
A mechanical requirement has a check that software can run without human judgment.

:::yourturn
Add one mechanical requirement to the verification code.
Prove that the requirement rejects the starting app and accepts the prepared port.
:::

:::steps
1. Open `tvReadyChecks()` in `src/port-verification.ts`.
2. Add a `contains` check for `TV_VERIFICATION.md`.
3. Use `originating card` as the required value.
4. Use `Focus restoration documented` as the label.
5. Run `tv-check` on `apps/pocket-cinema`.
6. Verify that the new check fails.
7. Run `tv-check` on `workshop/checkpoints/vega-buildable/app`.
8. Verify that the new check passes.
9. Add one mechanical requirement from your project.
:::

:::command Run the same checks on two apps
yarn tsx src/index.ts tv-check ../../apps/pocket-cinema
yarn tsx src/index.ts tv-check ../../workshop/checkpoints/vega-buildable/app
:::

Use the strongest applicable check type:

| Check type | What it proves |
| --- | --- |
| `file_exists` | A file exists |
| `contains` | A required decision is present |
| `json_schema` | Structured data has the required shape |
| `command` | A program completed successfully |

:::knowledge Why does the model not verify its own work?
A model report is another generated claim.
An independent check runs without model agreement.
The independent check gives the same result for the same files.
:::

:::proof
claim: "The port code satisfies the declared requirements"
gate: "Nine static, schema, and executable checks pass before the commit"
evidence: "port-result.json, model-logs/port.jsonl, and git log"
limit: "Static checks can accept a manifest that the Vega compiler rejects"
:::

:::done
The guarded copy contains the Vega package and focus module.
Nine checks pass.
Git contains the port-phase commit.
Your added rule fails on the starter app and passes on the ported app.
:::

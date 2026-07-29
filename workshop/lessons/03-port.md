---
id: port
number: '03'
nav: The Porting
time: 30 minutes
title: Run the porting and inspect the result
lead: We will apply the approved plan while the harness controls writes, checks, retries, and the phase commit.
objective: Run the port phase. Inspect the generated Vega package, focus code, check result, model transcript, and Git commit.
evidence: The guarded copy contains a Vega package and focus module.
---

:::welcome Change code inside the harness boundary
The first two phases produced documents.
Now, we will use the port phase to produce application code.

The model will propose files.
The harness will apply the model response and check the result.
:::

## Know what the phase creates

The port phase follows the approved `port-plan.json`.
It creates these main parts:

| Path                       | Function                                                      |
| -------------------------- | ------------------------------------------------------------- |
| `apps/vega/`               | Vega package, manifest, build configuration, and dependencies |
| `src/tv/focus-state.ts`    | Shared focus state for the app and tests                      |
| `src/App.tsx`              | TV focus IDs and remote behavior                              |
| `tests/verify-tv-focus.ts` | Host-side focus contract                                      |
| `TV_VERIFICATION.md`       | Required focus and Back behavior                              |

Every focusable control needs a stable React Native `testID`.
Lesson 06 reads these IDs from the VDA.

## Important harness code

The port loop is in `src/port-pipeline.ts`.

:::snippet packages/workshop-harness/src/port-pipeline.ts (simplified)
const model = await executor.call(
phase.name,
prompt(phase, failures),
{ mcp: phase.mcp, attempt },
);

const output = parseJsonBlock(model.text, PortOutputSchema, phase.name);
writeOutput(appDir, output.files, phase.readOnly);
failures = await verify(phase);

if (failures.length === 0) {
commitAll(appDir, `workshop(${phase.name}): ${output.summary}`);
}

>look: The model proposes complete files. The harness parses, writes, checks, and commits them.
:::

The port phase runs ten checks.

| Check group  | What it checks                                                                     |
| ------------ | ---------------------------------------------------------------------------------- |
| Vega package | Manifest schema, interactive component, app registration, Metro, and build scripts |
| TV code      | Shared focus module, app wiring, and stable `testID` values                        |
| Test code    | Executable host-side focus check                                                   |

If a check fails, the next model request contains the exact failure text.
The harness resets a failed attempt before it applies the next proposal.

## Run the port phase

Use the approved `workshop` run.

:::yourturn
Run the code-writing phase.
Watch for a failed check and retry.
Wait for the final `run_complete` event.
:::

:::command Run the port phase
yarn tsx src/index.ts run ../../apps/pocket-cinema \
 --phases port --yes --run-id workshop
:::

The phase can take several minutes.
The model reads the approved plan, project files, and ADBT documents.

A passing final result contains:

```json
{
  "state": "complete",
  "phasesComplete": ["analyze", "plan", "port"]
}
```

If a check fails, the terminal prints:

```text
port attempt 1 failed:
  - <exact check failure>
```

This message means that the harness rejected the first proposal.
The next attempt receives the same failure text.

## Inspect the generated files

:::steps

1. Open `out/workshop/app/apps/vega/manifest.toml`.
2. Find `schema-version = 1`.
3. Find `[[components.interactive]]`.
4. Open `out/workshop/app/apps/vega/package.json`.
5. Find the Vega build command.
6. Open `out/workshop/app/src/tv/focus-state.ts`.
7. Open `out/workshop/app/src/App.tsx`.
8. Find the focus-state import.
9. Find the stable `testID` values.
10. Open `out/workshop/app/tests/verify-tv-focus.ts`.
    :::

## Inspect the checks and commit

Open the phase result:

```sh
node -e 'const r=require("../../out/workshop/port-result.json"); console.log({phase:r.phases.find(p=>p.name==="port"),usage:r.usage})'
```

Read the `attempts`, `failures`, `checks`, and usage values.

Then, inspect the guarded Git history:

```sh
git -C ../../out/workshop/app log --oneline
git -C ../../out/workshop/app status --short
```

The log must contain a `workshop(port)` commit.
The status command must print no uncommitted files.

## Inspect the model messages

Read the port transcript:

:::command Read the port transcript
yarn tsx src/index.ts logs workshop --phase port
:::

Find these event types:

1. `request`
2. ADBT tool operations
3. Model response events
4. `verification_result`
5. `commit`
6. `phase_complete`

The transcript is the complete phase record.
The TUI in Lesson 07 provides a shorter view of the same events.

:::proof
claim: "The port files satisfy the declared source checks"
gate: "Ten file, text, schema, and command checks pass before the commit"
evidence: "port-result.json, model-logs/port.jsonl, generated files, and the port commit"
limit: "Source checks do not prove that the Vega compiler accepts the package"
:::

:::knowledge What happened?
The model proposed a Vega package and TV focus code.
The harness protected the approved plan.
The harness applied only safe relative paths.
The harness committed the files after all port checks passed.
:::

:::done
The guarded copy contains the Vega package and focus module.
Ten checks pass.
Git contains the port-phase commit.
The guarded Git working tree is clean.
:::

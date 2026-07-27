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
It creates a shared focus-state module.
It also creates an executable focus test.

A wrong result can now change application behavior.
Read the checks before you accept the result.
:::

:::concept The verification engine is small
`src/port-verification.ts` defines four check types:

- `file_exists`
- `contains`
- `json_schema`
- `command`

`verifyPort()` runs each check and collects the failure text.
The port phase has nine checks.
The checks cover the manifest, build scripts, app configuration, focus module, wiring, and test.
:::

:::predict
The model can write a plausible Vega manifest.
Which static checks can accept the manifest even if Vega rejects it?
:::

## Run the port phase

Use the same run ID and executor.

:::command Run the port phase
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --phases port --yes --run-id workshop
:::

:::note Use your workshop configuration
The command reads the model settings from `../../workshop.config.json`.
:::

## Inspect the files and commit

:::steps
1. Open `out/workshop/app/apps/vega/`.
2. Find `manifest.toml`.
3. Find `package.json`.
4. Find `app.json`.
5. Find `metro.config.js`.
6. Open `src/tv/focus-state.ts`.
7. Find its import in `src/App.tsx`.
8. Find its import in `tests/verify-tv-focus.ts`.
9. Run `git log --oneline` in the guarded copy.
10. Find the port-phase commit.
:::

The app and test use the same focus module.
This shared module makes the Lesson 6 test useful.

## Inspect the model transcript

The phase writes `out/workshop/model-logs/port.jsonl`.
Each line contains one complete event.

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
The transcript keeps the native event payloads.

Use `--follow` to read a live phase in a second terminal.
You can also run:

```sh
tail -f ../../out/workshop/model-logs/port.jsonl | jq .
```

The transcript can contain prompts, source text, and tool results.
Keep the transcript in the ignored `out/` directory.
Review it before you share it.

## Observe a failed check and retry

The committed recording contains one failed plan attempt.
Use it to inspect exact retry context.

:::command Run the retry example
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-retry/port-recording.json \
  --phases analyze,plan --yes
:::

:::expected
plan attempt 1 failed:
  - TV flow documented: VEGA_PORT.md must contain "## TV Flow"
  - Focus model documented: VEGA_PORT.md must contain "## Focus"
:::

:::visual
src: assets/retry-terminal.png
alt: Terminal output with a failed check and a passing retry
label: Actual recorded command output
caption: "The harness adds two exact failures to the second request. It does not use a general retry instruction."
:::

:::steps
1. Find the two failed checks in the terminal.
2. Open `out/<runId>/port-result.json`.
3. Find `attempts: 2`.
4. Find the rejected failures.
5. Open `out/<runId>/model-logs/plan.jsonl`.
6. Find the first `verification_result`.
7. Find the second model request.
8. Verify that both events contain the same failure text.
9. Open `prompt()` in `src/port-pipeline.ts`.
10. Find the code that adds the previous failures.
11. Open `writeOutput()`.
12. Find the protected-path rules.
:::

:::note The retry loop has limits
The default permits one retry.
`--max-attempts N` sets a different limit.
`--until-done` removes the attempt limit.

The cost limit still applies.
The harness also stops after the same failure occurs twice.
The model cannot decide to continue the loop.
:::

## Add one requirement

Add a requirement for focus restoration documentation.

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
It gives the same result for the same files.
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

:::fallback
Add this recorded model option:

`--replay ../../workshop/fixtures/port-recording.json`
:::

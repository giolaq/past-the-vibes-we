# Agent Runbook

Use this file to test the workshop without credentials or hardware.

This runbook uses recorded data. It is not the attendee learning path. Attendees
use the live path in `lessons/00-welcome.md`.

If you maintain this repository, use the root `AGENTS.md` instead.

## Rules

1. Use the recorded fallback.
2. Follow the lessons in order.
3. Do not start a live model, ADBT, Vega, or Bee command.
4. Create `out/agent-report.md`.
5. Do not commit the report.

For each lesson, record:

- The command that you ran.
- The evidence that you inspected.
- The result of the completion check.
- Your answer to the knowledge check.

## Setup

Run these commands from the repository root:

```sh
corepack enable
yarn setup
yarn verify
yarn doctor
```

Continue when `yarn verify` passes. Continue when `yarn doctor` reports
`state: ready`. Optional model, ADBT, Vega, and Bee checks can remain
unavailable.

Record the initial TV check:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts tv-check ../../apps/pocket-cinema
```

Expect `tvReady: false`. Record the failure list. This is the initial evidence.

## Lesson Evidence

### Lesson 1: Analyze

- Run the recorded `analyze` command.
- Confirm `phasesComplete: ["analyze"]`.
- Confirm `out/<runId>/app/ANALYSIS.md` exists.
- Confirm `apps/pocket-cinema` did not change.
- Record three analysis claims that no check has proved.

### Lesson 2: Plan

- Run the recorded `plan` command.
- Confirm `VEGA_PORT.md` contains `## TV Flow`.
- Confirm `VEGA_PORT.md` contains `## Focus`.
- Confirm `adbt-port-context.json` names hashed ADBT documents.
- State which knowledge came from the focus skill.
- State which knowledge came from ADBT.

### Lesson 3: Port

- Run the recorded `port` command.
- Confirm `apps/vega/` exists.
- Confirm `src/tv/focus-state.ts` exists.
- Confirm the phase created a commit after nine checks.
- Inspect `model-logs/port.jsonl`.
- Find the request, response, check result, and phase result.

Run the retry example:

- Use `workshop/fixtures/port-retry/port-recording.json`.
- Run phases `analyze,plan`.
- Confirm attempt 1 names the missing `## TV Flow` and `## Focus` sections.
- Confirm `port-result.json` records two attempts.
- Confirm attempt 2 receives the two failures.

### Lesson 4: Build

- Run the `build-retry` recorded fallback.
- Find compiler error `TS2551` in the retry request.
- Confirm the model runs once.
- Confirm `launch` and `test` pass with `attempts: 0`.
- State why a green check does not need a model call.

### Lesson 5: Launch

- Run the recorded platform lifecycle.
- Confirm install, launch, dwell, log scan, and both frames pass.
- Add `FATAL EXCEPTION: main` to a copy of the recording.
- Confirm the command fails with exit code 2 and names that line.
- Remove the screenshot line from another copy.
- Confirm the command fails with exit code 2 and reports `frame is 1x1`.
- State that these tests prove control flow. They do not prove device behavior.

### Lesson 6: Test

- Confirm `tv-focus-result.json` contains `"passed": true`.
- Confirm all six transitions are present.
- Run `tv-check` on the ported app.
- Confirm `tvReady: true`.
- Compare this result with the initial `tvReady: false` result.

### Lesson 7: Control

- Run the complete recorded fallback without `--tui`.
- Inspect `out/final-dashboard/model-logs/`.
- Complete `workshop/worksheet.md`.
- Add one false-positive attack.
- Strengthen the weak check.

### Appendix A1: Bee

This lesson is optional. Use synthetic data. An automated test agent cannot
give user consent.

- Run `bee-run --propose`.
- Confirm `BEE_SPEC.md` and `bee-spec.json` exist.
- Confirm no source file changed.
- Run `bee-run --apply --yes`.
- Confirm `bee_spec`, `bee_apply`, `build`, and `launch` complete.

## Completion

Finish when `out/agent-report.md` covers setup and lessons 1 through 7. Include
all evidence and all knowledge-check answers. Appendix A1 is optional.

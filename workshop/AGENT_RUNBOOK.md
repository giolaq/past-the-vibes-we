# Agent Runbook: Taking This Workshop Autonomously

This file is for an automated test agent asked to verify the workshop repository without human credentials or hardware. It intentionally uses recordings and is not the attendee learning path. Human attendees follow the live executor flow in `lessons/00-welcome.md`. If you are an agent asked to maintain or modify this repository instead, follow `AGENTS.md` at the repository root and ignore this file.

## Rules

1. Take the replay lane. Every lesson has a `--replay` fallback that needs no model account, API key, ADBT install, Vega SDK, or device. Do not attempt live-model, `init-context`, Bedrock, or VDA steps: they need human terminals, credentials, or hardware.
2. Follow the lessons in order. The Markdown files in `workshop/lessons/` are the source of truth for both commands and website content. `workshop/workshop.js` contains navigation only.
3. Produce a completion report. Create `out/agent-report.md` at the repository root (the `out/` directory is gitignored — do not commit the report). For each lesson, record: the command you ran, the evidence you verified, your answer to the lesson's "You are done when" statement, and your answer to that lesson's knowledge check. The report is the workshop's learning outcome; the artifacts alone are not.

## Setup

From the repository root:

```sh
corepack enable
yarn setup
yarn verify
yarn doctor
```

Proceed when `yarn verify` passes and `yarn doctor` reports `state: ready`. Model, ADBT, Vega, and Bee checks marked `optional` are expected in replay mode. Also run `yarn --cwd packages/workshop-harness tsx src/index.ts tv-check ../../apps/pocket-cinema` and record `tvReady: false` with its failure list — the workshop's "before" evidence.

## Lesson sequence and evidence

Run each lesson's replay command from its "If blocked" or fallback section, then verify the evidence below before moving on.

| Lesson | File | Evidence to verify and record |
| --- | --- | --- |
| 1 | `workshop/lessons/01-analyze.md` | The replay `--phases analyze` run reports `phasesComplete: ["analyze"]` and `out/<runId>/app/ANALYSIS.md` exists. Confirm `apps/pocket-cinema` is unchanged (`git status`). Report three claims in the analysis that nothing in the run has checked. |
| 2 | `workshop/lessons/02-plan.md` | `--phases plan` produces `VEGA_PORT.md` containing both `## TV Flow` and `## Focus`, and `adbt-port-context.json` names hashed ADBT documents. Report which knowledge each check came from: the focus skill or the ADBT workflows. |
| 3 | `workshop/lessons/03-port.md` | `--phases port` produces `apps/vega/` and `src/tv/focus-state.ts`, committed after nine checks. Confirm `model-logs/port.jsonl` contains the complete request, response, verification result, and phase outcome. Then run the retry replay (`workshop/fixtures/port-retry/port-recording.json`, `--phases analyze,plan`): it must print `plan attempt 1 failed:` naming the missing `## TV Flow` and `## Focus`, `port-result.json` must record `attempts: 2`, and attempt 2's transcript request must contain those exact failures. |
| 4 | `workshop/lessons/04-build.md` | The build-retry replay (`workshop/fixtures/build-retry/`) prints `build needs a fix:` carrying the compiler's `TS2551` line, then completes. Report that the model was called once, and that `launch` and `test` then passed with `attempts: 0` — a green check costs no model call. |
| 5 | `workshop/lessons/05-launch.md` | The recorded lifecycle passes install, launch, dwell, log scan, and both frames. Then run the lesson's break-it steps: a copy of the fixture with `FATAL EXCEPTION: main` in the `logs` turn must fail naming that line, and a copy without its `screenshot` line must fail on `frame is 1x1`. Both exit 2. State that this proves control flow, not device behavior. |
| 6 | `workshop/lessons/06-test.md` | `tv-focus-result.json` shows `"passed": true` with all six transitions, and `tv-check` on the ported app reports `tvReady: true` — the "after" to setup's "before". |
| 7 | `workshop/lessons/07-finish.md` | Run the complete recorded fallback without `--tui`, then inspect `out/final-dashboard/model-logs/` directly. Complete `workshop/worksheet.md` for a domain of your choice, including the false-positive attack and strengthened check. |
| A1 | `workshop/lessons/A1-bee.md` | Optional. Use the synthetic recording because an automated test agent cannot provide consent. `bee-run --propose` must write `BEE_SPEC.md` and `bee-spec.json` and change no source. Then `--apply --yes` must finish with `phasesComplete: ["bee_spec","bee_apply","build","launch"]`. |

## You are done when

`out/agent-report.md` covers setup plus lessons 1–7, every core evidence row above is verified, and every knowledge-check answer is written in your own words. Appendix A1 is optional.

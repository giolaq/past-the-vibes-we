# Agent Runbook: Taking This Workshop Autonomously

This file is for an AI agent asked to complete the workshop itself. If you are an agent asked to maintain or modify this repository instead, follow `AGENTS.md` at the repository root and ignore this file.

## Rules

1. Take the replay lane. Every lesson has a `--replay` fallback that needs no model account, API key, ADBT install, Vega SDK, or device. Do not attempt live-model, `init-context`, Bedrock, or VDA steps: they need human terminals, credentials, or hardware.
2. Follow the lessons in order. The Markdown lessons in `workshop/` are the source of truth for commands. `workshop/workshop.js` holds extra site-only material — the prediction prompts, knowledge checks, and the lesson 6 worked example — read it alongside each lesson.
3. Produce a completion report. Create `out/agent-report.md` at the repository root (the `out/` directory is gitignored — do not commit the report). For each lesson, record: the command you ran, the evidence you verified, your answer to the lesson's "You are done when" statement, and your answer to that lesson's knowledge check from `workshop/workshop.js`. The report is the workshop's learning outcome; the artifacts alone are not.

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
| 1 | `workshop/lessons/01-single-agent.md` | The replay `plan` reports a feasibility `verdict` and a `findings` list. Report three claims in the verdict that nothing in the run has checked, and confirm `git status` shows `apps/pocket-cinema` untouched. |
| 2 | `workshop/lessons/02-verify.md` | `tv-check` reports `tvReady: false` on `apps/pocket-cinema` and `tvReady: true` on `workshop/checkpoints/vega-buildable/app`. Then add the assignment's `contains` check for `TV_VERIFICATION.md` to `tvReadyChecks()` and run both again: it must fail on the starter and pass on the checkpoint. Report which of the three check shapes you used and why. No model is required. |
| 3 | `workshop/lessons/03-phases.md` | The retry replay (`--phases analyze,plan` with `workshop/fixtures/port-retry/port-recording.json`) prints `plan attempt 1 failed:` naming the missing `## TV Flow`, then completes; `port-result.json` records `attempts: 2` and the rejected failures. Then run `--phases analyze --run-id lesson3` followed by `--phases plan --run-id lesson3` and report that the second run adds one commit without repeating the first. |
| 4 | `workshop/lessons/04-skills.md` | The replay run completes. ADBT skills are not installed in your environment: inspect `workshop/fixtures/adbt-skills.json` and report which skill each phase names, and which file owns skills, prompts, executors, and checks. Then run the assignment's replay variant (own skill + `## Open Questions` check added to the plan phase, replayed against `workshop/fixtures/port-retry/port-recording.json`): it must end with `plan failed after 2 attempts`; report which artifact replay honors (the check) and which it cannot (the skill). |
| 5 | `workshop/lessons/05-memory.md` | `/tmp/past-the-vibes-pocket-cinema-inputs/PROJECT_CONTEXT.md` exists, every entry names a source, and the committed fixture is unchanged. |
| 6 | `workshop/lessons/06-plan.md` | The replay port reports `run_complete` with phases `analyze`, `plan`, `build_test`. Record the `runId`. Confirm `apps/pocket-cinema` is unchanged (`git status`). |
| 7 | `workshop/lessons/07-tv.md` | `tv-focus-result.json` in the lesson 6 run output (or in `workshop/checkpoints/vega-buildable/app`) shows `"passed": true` with the full transition list. Run `tv-check` against that app and record `tvReady: true` — the "after" to setup's "before". |
| 8 | `workshop/lessons/08-vega.md` | `vega-run` with `--platform-replay` passes all ten gates and reports `evidenceMode: replay`. In `checks`, report the four device claims and their evidence. Then run the lesson's break-it note: a copy of the fixture without its `screenshot` line must fail on `frame is 1x1`, and a copy with `FATAL EXCEPTION: main` in the `logs` turn must fail naming that line. State explicitly that all of this proves control flow, not device behavior. |
| 9 | `workshop/lessons/09-bee.md` | Skip. It is optional and requires live Bee access and human consent. Note the skip and the reason in the report. |
| 10 | `workshop/lessons/10-finish.md` | Answer `workshop/worksheet.md` in the report for a domain of your choice: phases, one mechanical check per phase, approval point, budget, and retained evidence. |

## You are done when

`out/agent-report.md` covers setup plus lessons 1–10, every evidence row above is verified, and every knowledge-check answer is written in your own words.

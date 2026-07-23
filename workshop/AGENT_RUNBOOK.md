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

Proceed when `yarn verify` passes and `yarn doctor` reports `state: ready`. Model, ADBT, Vega, and Bee checks marked `optional` are expected in replay mode.

## Lesson sequence and evidence

Run each lesson's replay command from its "If blocked" or fallback section, then verify the evidence below before moving on.

| Lesson | File | Evidence to verify and record |
| --- | --- | --- |
| 1 | `workshop/01-from-prompt-to-loop.md` | `packages/mini-harness/out/ANALYSIS.md` exists. Report three claims the one-call script cannot prove. |
| 2 | `workshop/02-verification-and-retry.md` | Output shows `Pattern "## Remote Control" not found in out/TV_PORT_PLAN.md`, then a successful repair. Report the requirement → failed check → retry → pass trace. |
| 3 | `workshop/03-phases-checkpoints-and-cost.md` | After the stop-after command, `packages/mini-harness/out/checkpoint.json` has `"nextPhase": 2`. After resume, only `build_test` ran. |
| 4 | `workshop/04-tools-skills-and-executors.md` | The replay run completes. ADBT skills are not installed in your environment: inspect `workshop/fixtures/adbt-skills.json` and report which skill maps to which phase, and which file owns skills, prompts, executors, and checks. |
| 5 | `workshop/05-project-memory.md` | `/tmp/past-the-vibes-pocket-cinema-inputs/PROJECT_CONTEXT.md` exists, every entry names a source, and the committed fixture is unchanged. |
| 6 | `workshop/06-adapt-your-react-native-app.md` | The replay port reports `run_complete` with phases `analyze`, `plan`, `build_test`. Record the `runId`. Confirm `apps/pocket-cinema` is unchanged (`git status`). |
| 7 | `workshop/07-tv-as-the-stress-test.md` | `tv-focus-result.json` in the lesson 6 run output (or in `workshop/checkpoints/vega-buildable/app`) shows `"passed": true` with the full transition list. |
| 8 | `workshop/08-vega-platform-adapter.md` | `vega-run` with `--platform-replay` passes all eight gates and reports `evidenceMode: replay`. State explicitly that this proves control flow, not device behavior. |
| 9 | `workshop/09-bee-context-agent.md` | Skip. It is optional and requires live Bee access and human consent. Note the skip and the reason in the report. |
| 10 | `workshop/10-take-it-home.md` | Answer `workshop/worksheet.md` in the report for a domain of your choice: phases, one mechanical check per phase, approval point, budget, and retained evidence. |

## You are done when

`out/agent-report.md` covers setup plus lessons 1–10, every evidence row above is verified, and every knowledge-check answer is written in your own words.

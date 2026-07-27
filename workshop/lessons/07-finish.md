---
id: finish
number: "07"
nav: Build your own
time: 30 minutes
title: Control the complete pipeline and design a new harness
lead: Use the TUI to inspect one complete run. Then design and test a small harness for another engineering task.
objective: Read a complete run as one system. Design a harness with phases, independent checks, limits, and evidence.
evidence: A reviewed six-phase run and a team worksheet with an improved check.
---

:::raw
<div class="takeaway"><code>plan -> context -> run -> check -> retry -> checkpoint -> report</code></div>
:::

:::welcome Use the complete system
The earlier lessons presented one control at a time.
This lesson presents the complete pipeline.

First, use the TUI to inspect all six phases.
Then design a harness for another engineering task.

TV and Vega are the example.
The controlled pipeline is the reusable result.
:::

## Run the complete pipeline

The TUI displays the existing pipeline state.
It does not run a second pipeline.
It does not replace the JSONL transcripts.

:::command Prepare and run the complete approved pipeline
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --phases analyze,plan --seed workshop-v1 \
  --max-cost 3 --yes --run-id final-dashboard
yarn tsx src/index.ts approve-plan final-dashboard --yes
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --phases port,build,launch,test \
  --seed workshop-v1 --max-cost 3 --yes \
  --run-id final-dashboard --tui
:::

:::note Use your workshop configuration
The command reads the model settings from `../../workshop.config.json`.
Do not change the run ID, seed, cost limit, or phase controls.
:::

| Key | Function |
| --- | --- |
| Up or Down | Select a phase |
| `Tab` | Select checks, model events, tools, or all events |
| `f` | Select the active phase |
| `q` or `Enter` | Close the completed TUI |

## Inspect the TUI

:::steps
1. Read the executor, provider, and model in the header.
2. Verify that the header reports `evidence live`.
3. Read the seed and cost limit.
4. Select the `checks` view.
5. Find one independent check.
6. Find one commit event.
7. Select the `plan` phase.
8. Select the `model` view.
9. Find the model request and response.
10. Select the `tools` view.
11. Find the ADBT document operations.
12. Select the `build` phase.
13. Find the compiler evidence.
14. Select the `launch` phase.
15. Find the device evidence.
16. Close the TUI.
17. Open `out/final-dashboard/model-logs/`.
:::

:::concept The TUI controls the view
`src/tui.ts` reads the existing run state.
It shows a short activity list.
The JSONL files keep the complete event data.

The operator can reduce visible detail.
The harness does not delete evidence.
:::

:::knowledge Why does the workshop add the TUI at the end?
You must first know the meaning of each signal.
The TUI is useful after you understand checks, retries, costs, tools, and device evidence.
:::

:::fallback
If a live dependency fails, run:

`yarn tsx src/index.ts run ../../apps/pocket-cinema --replay ../../workshop/fixtures/port-recording.json --phases analyze,plan --seed workshop-v1 --max-cost 3 --yes --run-id final-dashboard`

`yarn tsx src/index.ts approve-plan final-dashboard --yes`

`yarn tsx src/index.ts run ../../apps/pocket-cinema --replay ../../workshop/fixtures/port-recording.json --platform-replay ../../workshop/fixtures/vega-lifecycle.json --phases port,build,launch,test --seed workshop-v1 --max-cost 3 --yes --run-id final-dashboard --tui`

The recorded TUI has no live ADBT tool events.
Report `evidence recorded`.
:::

## Complete the evidence table

| Claim | Strongest evidence |
| --- | --- |
| The model inspected the app | Source inventory and explicit unknowns |
| The plan used Vega knowledge | Live ADBT operations and document hashes |
| The code met the requirements | Independent checks and a phase commit |
| The package compiled | Vega build and `.vpkg` file |
| The app stayed active | Wait period, device log, and two frames |
| The TV flow worked | Executable focus-transition result |

The evidence becomes stronger near the user behavior.
The last row still has a limit.
It does not prove physical key delivery.

## Complete the team exercise

Form a team of two or three people.
Select one task:

:::raw
<div class="grid"><article><h3>Gradle upgrade</h3><p>Upgrade one Android module. Keep a passing debug build.</p></article><article><h3>Accessibility repair</h3><p>Repair labels and focus order on one screen.</p></article><article><h3>API migration</h3><p>Replace one deprecated client API. Do not change server behavior.</p></article><article><h3>Flaky test repair</h3><p>Repair one test. Prove that repeated runs pass.</p></article></div>
:::

:::steps
1. During minutes 0 to 2, write one required result.
2. Write three non-goals.
3. During minutes 2 to 5, define no more than three phases.
4. Give each phase one independent check.
5. During minutes 5 to 7, identify the knowledge source.
6. Identify the human approval point.
7. Set the retry limit.
8. Set the no-progress rule.
9. Set the cost limit.
10. During minutes 7 to 9, exchange worksheets with another team.
11. Find one false positive in the other design.
12. During minutes 9 to 10, improve one check.
13. Prepare a 30-second report.
14. State the claim, evidence, and remaining limit.
:::

:::proof
claim: "The harness pattern applies to a task outside TV development"
gate: "Another team can find a false positive and improve the evidence without changing the model"
evidence: "workshop/worksheet.md"
limit: "The worksheet defines a prototype. It does not prove production readiness."
:::

:::knowledge What is the minimum useful harness?
Select one repeatable task.
Use a short phase sequence.
Supply one necessary knowledge source.
Add one independent check to each phase.
Set a retry limit and cost limit.
Write a report.
:::

:::done
You can explain the complete run from the TUI.
Another team can read your worksheet.
The team can identify the pass, retry, and stop conditions.
:::

:::raw
<div class="links"><a href="worksheet.md">Open the worksheet</a><a href="troubleshooting.md">Troubleshooting</a><a href="instructor-guide.md">Instructor guide</a><button data-go-module="bee">Appendix: Bee pipeline</button></div>
:::

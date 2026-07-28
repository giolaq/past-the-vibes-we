---
id: finish
number: "07"
nav: Build your own
time: 30 minutes
title: Control the complete pipeline and design a new harness
lead: Use the terminal user interface (TUI) to inspect one complete run. The TUI is an interactive dashboard in your terminal. Then design and test a small harness for another engineering task.
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
Then, design a harness for another engineering task.

TV and Vega are the example.
The controlled pipeline is the reusable result.
:::

## Run the complete pipeline

The TUI displays the existing pipeline state.
The TUI does not run a second pipeline.
The TUI does not replace the JSONL transcripts.
An interactive terminal accepts keyboard input while a command runs.
The `--tui` flag opens the dashboard only in an interactive terminal.
Run the commands in order.
Wait for each command before you continue to the next command.

:::yourturn
Run the complete six-phase pipeline with the TUI.
Open the messages for each phase and find the strongest evidence.
:::

:::command Prepare and run the complete approved pipeline
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --phases analyze,plan --seed workshop-v1 \
  --max-tokens 1000000 --yes --run-id final-dashboard --tui
yarn tsx src/index.ts approve-plan final-dashboard --yes
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --phases port,build,launch,test \
  --seed workshop-v1 --max-tokens 1000000 --yes \
  --run-id final-dashboard --tui
:::

:::note Use your workshop configuration
The command reads the model settings from `../../workshop.config.json`.
Do not change the run ID, seed, token limit, or phase controls.
:::

The first dashboard stops after plan.
When the dashboard reports that plan approval is required, close the dashboard.
Press `q` to close the dashboard.
Review the plan.
Approve the plan.

The second dashboard loads the earlier analyze and plan events.
The second dashboard then follows port, build, launch, and test.

A model call is one request from the harness to a model.
The TUI header shows the run ID, executor, provider, model, seed, token usage, turns, and model calls.
`evidence live` means that the current model and Vega device produced the evidence.

| Key | Function |
| --- | --- |
| Up or Down | Select a phase |
| `Enter` | Open the selected phase's messages |
| Up or Down in messages | Select an event |
| `PageUp` or `PageDown` | Scroll the selected event's content |
| `Tab` in messages | Select checks, model events, tools, or all events |
| `Escape` | Return to the phase list |
| `f` | Select the active phase |
| `q` | Close the completed TUI |

## Inspect the TUI

:::steps
1. Read the executor in the header.
2. Read the provider in the header.
3. Read the model in the header.
4. Verify that the header reports `evidence live`.
5. Read the seed.
6. Read the token limit.
7. Read the turns value.
8. Read the calls value.
9. Select the `plan` phase.
10. Press `Enter`.
11. Read the type of one model event.
12. Read the content of the model event.
13. Press `Tab` to select the tools filter.
14. Find the ADBT document operations.
15. Press `Escape` to return to the phase list.
16. Open the `port` messages.
17. Select the checks filter.
18. Find one independent check.
19. Find one commit event.
20. Return to the phase list.
21. Open the `build` messages.
22. Find the compiler evidence.
23. Return to the phase list.
24. Open the `launch` messages.
25. Find the device evidence.
26. Press `Escape`.
27. Press `q` to close the completed TUI.
28. Open `out/final-dashboard/model-logs/`.
:::

:::concept The TUI controls the view
`src/tui.ts` reads the existing run state.
The TUI opens each phase as a list of events with named types.
The JSONL files keep the complete event data.

You can use filters to reduce the visible detail.
The harness does not delete evidence.
:::

:::knowledge Why does the workshop add the TUI at the end?
You must first know the meaning of each signal.
The TUI is useful after you understand checks, retries, usage, tools, and device evidence.
:::

## Complete the evidence table

| Claim | Strongest evidence |
| --- | --- |
| The model inspected the app | Source inventory and explicit unknowns |
| The plan used Vega knowledge | Live ADBT operations and document hashes |
| The code met the requirements | Independent checks and a phase commit |
| The package compiled | Vega build and `.vpkg` file |
| The app stayed active | Wait period, device log, and two running-state samples |
| The TV flow worked | Executable focus-transition result |

The evidence becomes stronger near the user behavior.
The focus-transition result has a limit.
The focus-transition result does not prove visual focus styling.

## Complete the team exercise

Form a team of two or three people.
A non-goal is work that the harness must not do.
A false positive occurs when a check passes an incorrect result.
A prototype demonstrates a design but is not ready for production use.
Select one task:

:::yourturn
Design a small harness for one task.
Ask another team to find a false positive in your checks.
:::

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
9. Set the cumulative token limit.
10. Set the per-call turn limit.
11. During minutes 7 to 9, exchange worksheets with another team.
12. Find one false positive in the other design.
13. During minutes 9 to 10, improve one check.
14. Prepare a 30-second report.
15. State the claim, evidence, and remaining limit.
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
Set retry, token, and turn limits.
Write a report.
:::

:::done
You can explain the complete run from the TUI.
Another team can read your worksheet.
The team can identify the pass, retry, and stop conditions.
:::

:::raw
<div class="links"><a href="worksheet.md">Open the worksheet</a><a href="troubleshooting.md">Troubleshooting</a><a href="editing-guide.md">Edit the workshop</a><a href="instructor-guide.md">Instructor guide</a><button data-go-module="bee">Challenge: Bee phase</button></div>
:::

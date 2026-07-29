---
id: finish
number: '07'
nav: A complete run
time: 30 minutes
title: Inspect every phase in the terminal user interface
lead: We will run the complete pipeline with the terminal user interface and connect each phase summary to the saved evidence.
objective: Use the terminal user interface to inspect phase state, model events, tools, checks, commits, usage, and device evidence.
evidence: A reviewed six-phase run.
---

:::raw

<div class="takeaway"><code>plan -> context -> run -> check -> retry -> report</code></div>
:::

:::welcome Read the complete pipeline
The earlier lessons ran one phase at a time.
In this lesson, we will run the same six phases as one complete workflow.

We will use the terminal user interface (TUI) to see phase state and recent
events.
The JSONL transcripts will remain the complete record.
:::

## Know when the TUI appears

The TUI opens only when all these conditions are true:

- The command includes `--tui`.
- The command runs in an interactive terminal.
- Standard output and standard error are attached to that terminal.
- The command does not include `--json` or `--detach`.

The `approve-plan` command does not open the TUI.
The first run stops after plan so that you can review and approve it.

## Important harness code

`src/tui.ts` checks the terminal before it opens the dashboard.

:::snippet packages/workshop-harness/src/tui.ts (simplified)
return stdoutIsTty === true &&
stderrIsTty === true &&
args.includes("--tui") &&
!args.includes("--json") &&
!args.includes("--detach");

>look: A redirected or non-interactive command prints normal JSON instead of the TUI.
:::

The TUI also controls the two views:

:::snippet packages/workshop-harness/src/tui.ts (simplified)
if (key.name === "return" && state.view === "phases") {
openMessages();
}

if (key.name === "escape" && state.view === "messages") {
state.view = "phases";
}

>look: Enter opens the selected phase. Escape returns to the phase list.
:::

## Run analyze and plan

Use a new run ID so that you can watch every phase.

:::yourturn
Start the first dashboard.
Watch analyze and plan.
Close the dashboard when it requests plan approval.
:::

:::command Run analyze and plan with the TUI
yarn tsx src/index.ts run ../../apps/pocket-cinema \
 --phases analyze,plan --seed workshop-v1 \
 --yes --run-id final-dashboard --tui
:::

The dashboard shows a `feasibility` preflight before the six port phases.
The preflight checks whether the source app and its dependencies can continue.
The dashboard then shows `analyze` and `plan` as passed.
The later phases remain pending.
The run ends in `awaiting_approval`.
The completed dashboard remains open for review.

Press `q` to close it.
Then, open `out/final-dashboard/app/port-plan.json`.
Review the plan as you did in Lesson 02.

Approve the plan:

```sh
yarn tsx src/index.ts approve-plan final-dashboard --yes
```

## Run the remaining phases

:::yourturn
Start the second dashboard.
Confirm that it loads analyze and plan from the earlier run.
Watch port, build, launch, and test.
:::

:::command Run port through test with the TUI
yarn tsx src/index.ts run ../../apps/pocket-cinema \
 --phases port,build,launch,test \
 --seed workshop-v1 --yes \
 --run-id final-dashboard --tui
:::

The dashboard can remain on one phase for several minutes.
This does not mean that the process stopped.
The selected phase can be waiting for a model, compiler, VDA, dwell, or focus
poll.

The header shows:

- Run ID
- Executor and model
- Evidence mode
- Seed
- Token usage
- Turns
- Model calls
- Provider cost when the provider reports it

## Use the TUI controls

| Key                    | Function                                          |
| ---------------------- | ------------------------------------------------- |
| Up or Down             | Select a phase or event                           |
| `Enter`                | Open messages for the selected phase              |
| `Escape`               | Return to the phase list                          |
| `Tab`                  | Select checks, model events, tools, or all events |
| `PageUp` or `PageDown` | Scroll the selected event                         |
| `f`                    | Follow the active phase                           |
| `q`                    | Close a completed dashboard                       |

## Connect the TUI to saved evidence

The TUI is a view.
It does not replace the evidence files.

| Claim                         | Saved evidence                           |
| ----------------------------- | ---------------------------------------- |
| The model inspected the app   | `app/ANALYSIS.md` and analyze transcript |
| The plan used Vega documents  | `adbt-port-context.json`                 |
| The code passed source checks | `port-result.json` and phase commit      |
| The package compiled          | `.vpkg` and `vega-platform-result.json`  |
| The app stayed active         | `vega-device.log` and state checks       |
| The remote flow worked        | `app/tv-focus-result.json`               |

Open `out/final-dashboard/model-logs/`.
Each phase has one JSONL transcript.
The TUI reads these events and keeps the full files unchanged.

## Design a small harness

The TV port is one use of the harness pattern.
Use `workshop/worksheet.md` to define a smaller engineering workflow.

:::yourturn
Select one task.
Define no more than three phases.
Give each phase one independent check.
:::

:::knowledge What happened?
The TUI combined phase state and transcript events in one terminal view.
The saved files remained the evidence source.
:::

:::done
You can explain the complete run from the TUI.
:::

:::raw

<div class="links"><a href="worksheet.md">Open the worksheet</a><a href="troubleshooting.md">Troubleshooting</a><a href="editing-guide.md">Edit the workshop</a><a href="instructor-guide.md">Instructor guide</a><button data-go-module="bee">Challenge: Bee conversation</button><button data-go-module="mcp-server">Challenge: build an MCP server</button></div>
:::

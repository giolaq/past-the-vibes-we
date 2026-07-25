---
id: finish
number: "10"
nav: Build your own
time: 15 minutes
title: Design one harness for your work
lead: "Last stretch, and it's yours: keep the pipeline, swap the TV skill, Vega commands, and D-pad checks for your own domain."
objective: Draft the smallest useful harness for one task in your own engineering domain.
evidence: A worksheet names the phases, checks, approval point, budget, and evidence the run must retain.
---

:::raw
<div class="takeaway"><code>plan → context → run → check → retry → checkpoint → report</code></div>
:::

:::welcome Now take it home
You've built the loop and watched it hold. The last thing to do is point it at work you actually care about, so this lesson is a worksheet rather than a command — you design the harness and we'll help you check it. The reusable idea is a bounded workflow that gives a model strong context, limits its authority, checks each result, and leaves evidence another developer can inspect. TV and Vega are the example, not the point. What you keep is the control and the observability you saw in lesson 6: authority stays in your code, and every run leaves prompts, reads, costs, and commits you can audit.
:::

## Draft your harness

:::yourturn
This one has no command to copy. Design your own harness on the worksheet, and we'll come round to help you check it.
:::

:::steps
1. Open `worksheet.md`.
2. Name one outcome that can finish in one session.
3. Choose the fewest useful phases.
4. Give every phase one independent, mechanical check.
5. Define the approval point, cost limit, stop conditions, and saved evidence.
6. Name your replacement for the TV skill, the ADBT MCP server, the Vega adapter, the D-pad check — and, if you use a different CLI agent, the executor.
:::

:::knowledge What is the smallest useful first version of your harness?
One repeatable task, a short phase sequence, one strong prior, one independent check per phase, a bounded retry, and a report. Add tools only when a proven gap needs them.
:::

:::done
Another developer can follow your worksheet, inspect the evidence, and knows when the harness must stop.
:::

:::raw
<div class="links"><a href="worksheet.md">Open the worksheet</a><a href="troubleshooting.md">Troubleshooting</a><a href="instructor-guide.md">Instructor guide</a></div>
:::

---
id: finish
number: "10"
nav: Build your own
time: 15 minutes
title: Design one harness for your work
lead: Keep the pipeline and replace the TV skill, Vega commands, and D-pad checks with your domain.
objective: Draft the smallest useful harness for one task in your own engineering domain.
evidence: A worksheet names the phases, checks, approval point, budget, and evidence the run must retain.
---

:::raw
<div class="takeaway"><code>plan → context → run → check → retry → checkpoint → report</code></div>
:::

:::concept Transfer the pattern
The reusable idea is a bounded workflow that gives a model strong context, limits its authority, checks each result, and leaves evidence another developer can inspect. TV and Vega are the example, not the point.
:::

## Draft your harness

:::steps
1. Open `worksheet.md`.
2. Name one outcome that can finish in one session.
3. Choose the fewest useful phases.
4. Give every phase one independent, mechanical check.
5. Define the approval point, cost limit, stop conditions, and saved evidence.
6. Name your replacement for the TV skill, Vega adapter, and D-pad check.
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

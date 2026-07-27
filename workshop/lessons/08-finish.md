---
id: finish
number: "08"
nav: Build your own
time: 20 minutes
title: Control the whole pipeline, then design your own
lead: "You learned the parts one at a time. Now operate the whole pipeline from one small dashboard, then reuse the pattern for your own domain."
objective: Read one complete run as a system, then draft the smallest useful harness for one task in your own engineering domain.
evidence: A reviewed six-phase run and a worksheet naming the phases, checks, approval point, budget, and evidence your harness must retain.
---

:::raw
<div class="takeaway"><code>plan → context → run → check → retry → checkpoint → report</code></div>
:::

:::welcome Now take it home
You've built the loop and inspected each part separately. This final lesson changes scale: first use one dashboard to see the preflight and all six phases as a single controlled run, then point the same design at work you actually care about. The reusable idea is a bounded workflow that gives a model strong context, limits its authority, checks each result, and leaves evidence another developer can inspect. TV and Vega are the example, not the point.
:::

## See the complete harness

The earlier lessons use plain output on purpose. You were learning one check, retry, or device
gate at a time. Now add `--tui` to open the operator view. The TUI does not run a second
pipeline and it does not replace the logs. It renders the same phase callbacks, cost tally, and
append-only transcripts you already inspected.

:::yourturn
Run the complete pipeline with the live executor you used in the earlier lessons. When it finishes, keep the dashboard open and inspect at
least one model phase and one device phase before you close it.
:::

:::command Run all phases in the final dashboard
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor claude-cli --model sonnet \
  --seed workshop-v1 --max-cost 3 --yes \
  --run-id final-dashboard --tui
:::

:::note Using Strands
Replace `--executor claude-cli --model sonnet` with the provider and model flags you selected in
lesson 0. Do not change the run id, seed, budget, or phase controls.
:::

:::raw
<table><thead><tr><th>Key</th><th>What it changes</th></tr></thead><tbody><tr><td><code>↑</code> / <code>↓</code></td><td>Select a phase. The run keeps going.</td></tr><tr><td><code>Tab</code></td><td>Cycle the visible activity: checks, model, tools, or all.</td></tr><tr><td><code>f</code></td><td>Return to the phase that is currently running.</td></tr><tr><td><code>q</code> or <code>Enter</code></td><td>Close the dashboard after the run completes.</td></tr></tbody></table>
:::

:::steps
1. Start in `checks`. Watch acceptance stay separate from model output.
2. Select `plan`, press `Tab` until `model` appears, and find its request and response.
3. Select `plan` and switch to `tools`. Find the ADBT document list/read calls made through MCP. This is the context the model chose at runtime, not text hidden in the prompt.
4. Select `build`, `launch`, or `test`. These phases are decided by the platform adapter and checks, not by a model saying the app works.
5. Press `q` or `Enter`. Open `out/final-dashboard/model-logs/` if you need a complete payload; the dashboard only controls what is visible on screen.
:::

:::concept Control the view, not the evidence
`src/tui.ts` is a small adapter over existing run state. It keeps at most a short activity preview
on screen and filters that preview by concern. The canonical JSONL files remain complete. This
is the safe observability pattern: a human gets a calm operator view without losing the detailed
record needed for debugging or audit.
:::

:::knowledge Why introduce the TUI only after the phase lessons?
An overview is useful after you know what each signal means. Earlier it would hide the checks,
retry context, and device evidence behind a convenient screen. Here it helps you control a system
you already understand.
:::

:::fallback
If a live model, SDK, or VDA blocks this final run, use the command below to learn the dashboard.
It shows the same phases and checks, but its model and platform evidence is recorded:

`yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema --inputs ../../workshop/fixtures/pocket-cinema-inputs --replay ../../workshop/fixtures/port-recording.json --platform-replay ../../workshop/fixtures/vega-lifecycle.json --seed workshop-v1 --max-cost 3 --yes --run-id final-dashboard --tui`

In that fallback, the `plan` tools view is empty because recorded ADBT context replaces live MCP calls. Say that explicitly when you report what you inspected.
:::

## Draft your harness

:::yourturn
Design your own harness on the worksheet, and we'll come round to help you check it.
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
You can use the final dashboard to explain the complete TV port, and another developer can follow
your worksheet, inspect the evidence, and knows when your own harness must stop.
:::

:::raw
<div class="links"><a href="worksheet.md">Open the worksheet</a><a href="troubleshooting.md">Troubleshooting</a><a href="instructor-guide.md">Instructor guide</a></div>
:::

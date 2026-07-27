---
id: finish
number: "07"
nav: Build your own
time: 30 minutes
title: Control the whole pipeline, then design one as a team
lead: "You learned each signal separately. Now operate the full live pipeline from one dashboard, complete the trust board, and defend a harness design for another domain."
objective: Read one complete run as a system, then design and challenge the smallest useful harness for one task in your own engineering domain.
evidence: A reviewed six-phase live run and a team worksheet naming phases, independent checks, approval, budget, and retained evidence.
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
1. Read the header: exact executor/provider/model, `evidence live`, seed, elapsed time, and cost against the cap.
2. Start in `checks`. Watch acceptance stay separate from model output and find the commit event created only after a phase passes.
3. Select `plan`, press `Tab` until `model` appears, and find its request and response.
4. Select `plan` and switch to `tools`. Find the ADBT document list/read calls made through MCP. This is context the model chose at runtime, not text hidden in the prompt.
5. Select `build`, `launch`, or `test`. These phases are decided by the platform adapter and checks, not by a model saying the app works.
6. Press `q` or `Enter`. Open `out/final-dashboard/model-logs/` if you need the complete payload; the dashboard controls visibility, not evidence retention.
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

## Complete the trust board

| Claim | Strongest proof you used |
| --- | --- |
| The model understood the app | Source inventory plus explicit unknowns |
| The plan used current Vega knowledge | Live ADBT tool calls and document hashes |
| The code met the declared contract | Independent checks and a phase commit |
| The package compiled | Vega build and the `.vpkg` artifact |
| The app stayed alive | Dwell, filtered device log, and two frames |
| The TV flow worked | Executable focus-transition result |

The strength increases down the table because the observer gets closer to user behavior. The final
row is still honest about its boundary: it tests the shared focus model, not physical key delivery.

## Ten-minute team challenge

:::yourturn
Form a team of two or three. Design the smallest useful harness for one task, then give the design
to another team to attack. You are not pitching features; you are defending the proof.
:::

:::raw
<div class="grid"><article><h3>Gradle upgrade</h3><p>Upgrade one Android module and retain a passing debug build.</p></article><article><h3>Accessibility repair</h3><p>Find and fix one screen's labeled controls and focus order.</p></article><article><h3>API migration</h3><p>Replace one deprecated client API without changing server behavior.</p></article><article><h3>Flaky test repair</h3><p>Diagnose one test, change the smallest cause, and prove repeatability.</p></article></div>
:::

:::steps
1. **Minute 0–2:** choose one domain card or one real task. Write one outcome and three explicit non-goals.
2. **Minute 2–5:** choose at most three phases. Give each phase one observer that is not the model.
3. **Minute 5–7:** name the knowledge source, approval point, retry limit, no-progress rule, and cost cap.
4. **Minute 7–9:** swap worksheets. The other team finds one false positive: how could all checks pass while the outcome is still wrong?
5. **Minute 9–10:** strengthen one check, then prepare a 30-second explanation: claim, proof, remaining limit.
6. Two teams share. The room votes only on whether the proof matches the claim.
:::

:::proof
claim: "This harness pattern transfers beyond TV"
gate: "Another team can identify the phases, attack a false positive, and strengthen the evidence without changing the model"
evidence: "workshop/worksheet.md"
limit: "A paper design is ready for a prototype, not a production claim"
:::

:::knowledge What is the smallest useful first version of your harness?
One repeatable task, a short phase sequence, one strong prior, one independent check per phase, a bounded retry, and a report. Add tools only when a proven gap needs them.
:::

:::done
You can explain the complete TV port from the dashboard, and another team can read your worksheet,
challenge its checks, and tell exactly when your harness passes, retries, or stops.
:::

:::raw
<div class="links"><a href="worksheet.md">Open the worksheet</a><a href="troubleshooting.md">Troubleshooting</a><a href="instructor-guide.md">Instructor guide</a><button data-go-module="bee">Appendix: Bee pipeline</button></div>
:::

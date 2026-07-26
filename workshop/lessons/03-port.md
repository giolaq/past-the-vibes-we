---
id: port
number: "03"
nav: Write the port
time: 30 minutes
title: Let it write the code, then decide whether to keep it
lead: "This is the phase that changes the app — so it is also the phase where checks stop being a formality: nine of them, and a retry that carries the exact failure."
objective: Read the checks that gate a real code change, and watch a failed one drive a useful retry.
evidence: The guarded copy has a Vega package and a shared focus module, committed only after nine checks passed.
---

:::welcome Where a check earns its keep
The first two phases produced documents. This one produces code: a Vega package, a focus-state module both the app and the test import, and the test itself. A wrong answer here is expensive, so this is where you should look hard at what decides whether an answer is accepted. That decision is fifty lines of TypeScript, and by the end of this lesson you will have read all of it.
:::

:::concept A check is a value, not a clever function
`src/port-verification.ts` defines `PortCheck` as four shapes: a file must exist, a file must contain a string, JSON must match a schema, or a command must exit 0. `verifyPort()` walks the list and collects failure text. That is the whole verification engine. The `port` phase carries nine of them — the Vega manifest's schema line and interactive component, the build script, the app and Metro config, the root build script, the focus module, the App wiring, and the focus test itself.
:::

:::predict
The model is about to write a Vega package from scratch. Which of the nine checks would still pass if it invented a plausible manifest that Vega cannot actually load?
:::

## Run the port phase

:::yourturn
Run phase 3 onto the same run id, then read what it wrote before you read whether it passed.
:::

:::command Claude Code CLI
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor claude-cli --model sonnet \
  --phases port --yes --run-id workshop
:::

:::steps
1. Open `out/workshop/app/apps/vega/` — a new package: `manifest.toml`, `package.json`, `app.json`, `metro.config.js`.
2. Open `src/tv/focus-state.ts`. One module holds the focus rules, and both `src/App.tsx` and `tests/verify-tv-focus.ts` import it. That shared module is what makes lesson 6's test meaningful.
3. Run `git log --oneline` in the copy. Three phases, three commits, in order.
:::

## Read the whole model exchange

The phase also writes `out/workshop/model-logs/port.jsonl`. This is the live audit trail, not a
summary written after the fact. Each line is one complete event with its phase, attempt,
executor, direction, kind, and native payload.

:::command Read the port transcript
yarn --cwd packages/workshop-harness tsx src/index.ts logs workshop --phase port
:::

:::steps
1. Find `kind: "request"` or `kind: "replay_request"`. Its payload contains the complete prompt the phase assembled.
2. Find the model response. Strands uses native events such as `modelMessageEvent` and `toolResultEvent`; Claude uses its native `assistant`, `stream_event`, and `result` records.
3. Find `verification_result`, then `phase_complete`. The model conversation and the independent decision about it are in one ordered file.
4. Check `sequence`. A resumed phase appends to the same file; it does not erase the earlier attempt.
:::

For a live run, add `--follow` in a second terminal while the phase is active. You can also use
`tail -f out/workshop/model-logs/port.jsonl | jq .`. The payload is intentionally complete, so it
can contain prompts, source excerpts, and tool results. Keep it under the gitignored `out/`
directory and review it before sharing.

## Watch a check fail and drive a retry

A live model often passes on the first try, which is a bad way to learn what happens when it doesn't. The committed recording forces the interesting case: its first plan attempt omits a required section.

:::command Replay the failed check and the repair
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-retry/port-recording.json \
  --phases analyze,plan --yes
:::

:::expected
plan attempt 1 failed:
  - TV flow documented: VEGA_PORT.md must contain "## TV Flow"
  - Focus model documented: VEGA_PORT.md must contain "## Focus"
:::

:::visual
src: assets/retry-terminal.png
alt: Terminal output showing a check failing, the failure recorded in port-result.json, and the run completing after the second attempt
label: Captured replay output
caption: "This image is rendered from the real key-free command output committed in workshop/assets/retry-terminal.txt. Two useful failures become the retry context, not the instruction 'try again'."
:::

:::steps
1. Find both failed checks in your terminal. That text came from `verifyPort()`.
2. Open `out/<runId>/port-result.json`. The phase records `attempts: 2` and keeps the failures of the rejected attempt.
3. Open `out/<runId>/model-logs/plan.jsonl`. Find attempt 1's `verification_result`, then attempt 2's request. The same failure text is visible in both places.
4. Open `prompt()` in `src/port-pipeline.ts` and find where a previous attempt's failures are appended.
5. Open `writeOutput()` in the same file. Every path must resolve inside the guarded copy; `.git`, `node_modules`, `.env`, `..`, absolute paths, and symlink traversal are refused.
:::

:::note The loop cannot run away
One retry is a default, not a law — `--max-attempts N` raises it and `--until-done` removes the cap. The loop still has three exits, and none of them is the model's opinion: the checks pass, the attempt or cost budget runs out, or the same failure comes back twice in a row and the harness stops rather than paying for another identical guess.
:::

## Assignment: add a rule of your own

:::yourturn
A reviewer asks for something the current checks don't cover: the port must document how Back restores focus. Make the harness enforce it.
:::

:::steps
1. In `tvReadyChecks()` in `src/port-verification.ts`, add a `contains` check for `TV_VERIFICATION.md` with the value `originating card` and the label `Focus restoration documented`.
2. Run `tv-check` on `apps/pocket-cinema` — your rule appears in the failure list.
3. Run it on `workshop/checkpoints/vega-buildable/app` — your rule passes, because the ported app documents exactly that.
4. Now write one that is yours. Keep it mechanical: something a string or an exit code can settle.
:::

:::command The same checks, run standalone
yarn --cwd packages/workshop-harness tsx src/index.ts tv-check ../../apps/pocket-cinema
yarn --cwd packages/workshop-harness tsx src/index.ts tv-check ../../workshop/checkpoints/vega-buildable/app
:::

:::note Choose the shape that proves the most
`file_exists` proves a file arrived. `contains` proves a decision was written down. `json_schema` proves machine-readable structure. `command` proves behavior, because something ran. Reach for the strongest shape the requirement allows — the next lesson is where a weak check would cost you.
:::

:::knowledge Why keep the check in code instead of asking the model to confirm its own work?
A model reporting on its own work is another generated claim. A check runs whether the model is honest, confused, or absent, and it returns the same answer every time.
:::

:::done
The guarded copy holds a Vega package and a shared focus module, committed after nine checks passed, and `tv-check` reports your added rule as a failure on the starter app and a pass on the ported one.
:::

:::fallback
Every command here works on the replay path — swap the executor flags for `--replay ../../workshop/fixtures/port-recording.json`.
:::

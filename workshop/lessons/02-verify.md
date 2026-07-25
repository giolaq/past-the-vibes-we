---
id: verify
number: "02"
nav: Checks you own
time: 25 minutes
title: Write the check that decides
lead: "Lesson 1 left us holding an unverified opinion. The fix is not a better prompt: it's a check, and a check is just code you own."
objective: Read the mechanical definition of TV-ready and extend it with your own rule.
evidence: A check you wrote fails on the starter app and passes on the ported one.
---

:::welcome The smallest fix for lesson 1's problem
In lesson 0 you ran `tv-check` against Pocket Cinema and it came back `tvReady: false` with a list of failures. Nothing about that list came from a model. It came from a file, and today we open it. By the end of this lesson you will have changed what this workshop means by "TV-ready" — and you'll have done it without a model, a device, or a single dollar.
:::

:::concept A check is a value, not a clever function
`src/port-verification.ts` is fifty lines. `PortCheck` is three shapes: a file must exist, a file must contain a string, or a command must exit 0. `tvReadyChecks()` returns a list of them, and `verifyPort()` walks the list and collects failure text. That is the whole verification engine. The third shape is the sharp one — it runs a real command, which is how the focus test gets executed rather than described.
:::

:::predict
The starter app fails every TV-readiness check. Which of the three shapes would you use to prove the ported app's remote navigation actually works, rather than merely exists?
:::

## Read the file that decided

:::yourturn
Open the checks, then run them against both ends of the workshop — the app we start from and the app we're going to produce.
:::

:::steps
1. Open `packages/workshop-harness/src/port-verification.ts` and read `tvReadyChecks()`.
2. Match each entry to a line in the failure list you saw in lesson 0.
3. Find `FOCUS_TEST_CHECK`. It is a `command` check, and `build_test` uses the same constant — the phase gate and `tv-check` cannot disagree about how the focus test runs.
:::

:::command Red: the app we start from
yarn --cwd packages/workshop-harness tsx src/index.ts tv-check ../../apps/pocket-cinema
:::

:::command Green: the app we are going to produce
yarn --cwd packages/workshop-harness tsx src/index.ts tv-check ../../workshop/checkpoints/vega-buildable/app
:::

:::expected
"tvReady": true
"failures": []
:::

## Assignment: add a rule of your own

:::yourturn
A reviewer asks for something the current checks don't cover: the port must document how Back restores focus. Make the harness enforce it.
:::

The pairing is the point. A skill would tell the model to write that document; a check decides whether it did. They live in different files, and this one is yours.

:::steps
1. In `tvReadyChecks()`, add a `contains` check for `TV_VERIFICATION.md` with the value `originating card` and the label `Focus restoration documented`.
2. Run `tv-check` on `apps/pocket-cinema` again. Your rule appears in the failure list.
3. Run it on `workshop/checkpoints/vega-buildable/app`. Your rule passes, because the ported app documents exactly that.
4. Now write one that is yours: a rule your team would actually want. Keep it mechanical — something a string or an exit code can settle.
:::

:::note Choose the shape that proves the most
`file_exists` proves a file arrived. `contains` proves a decision was written down. `command` proves behavior, because something ran. Reach for the strongest shape the requirement allows — lesson 3 is where a weak check starts costing you.
:::

:::knowledge Why keep the check in code instead of asking the model to self-report?
A model reporting on its own work is another generated claim. A check runs whether the model is honest, confused, or absent — and it returns the same answer every time.
:::

:::done
`tv-check` reports your new rule as a failure on `apps/pocket-cinema` and as a pass on the ported checkpoint, and you can say which of the three shapes you chose and why.
:::

:::fallback
This lesson needs no model, no credentials, and no device. If everything else in your setup is broken, this one still runs.
:::

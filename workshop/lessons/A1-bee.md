---
id: bee
number: 'A1'
nav: 'Challenge: Bee phase'
time: 40 minutes
title: 'Challenge: modify the app from a Bee conversation'
lead: Use one consented Bee conversation as product input. Create and review a specification before a second phase can change the app.
objective: Run the Bee specification and apply phases. Protect private conversation text and keep approval separate from implementation.
evidence: BEE_SPEC.md contains source IDs and paraphrases. The app passes the approved checks and device phases.
---

:::welcome Add a conversation-driven phase
The main TV port is complete.
This challenge uses the same harness engine with a different phase plan.

Bee is a wearable personal AI that captures conversations.
The Bee CLI lets the harness search and read your Bee data through MCP.
:::

:::note Consent is required {warning}
Use a live conversation only when every speaker permits this use.
Do not use production secrets, protected customer data, or unrelated personal
information.
:::

## Know the challenge flow

The conversation is private context.
It is not the approved requirement.

:::flow
Search | Find the consented conversation
Specify | Paraphrase requests and define file checks
Review | Check scope, sources, exclusions, and evidence
Apply | Change the guarded app
Verify | Run approved checks, app tests, build, and launch
:::

The flow adds two phases:

| Phase       | Input                                  | Output                                     |
| ----------- | -------------------------------------- | ------------------------------------------ |
| `bee_spec`  | Bee MCP and guarded app                | `bee-spec.json` and rendered `BEE_SPEC.md` |
| `bee_apply` | Approved specification and guarded app | App source changes                         |

The harness then reuses the normal `build` and `launch` phases.

## Important harness code

The Bee pipeline uses the same `runPortPipeline` engine as the TV port.

:::snippet packages/workshop-harness/src/bee-pipeline.ts (simplified)
export function beePhases(spec, appDir) {
const port = portPhases();
const device = ["build", "launch"].map(
name => port.find(phase => phase.name === name),
);

return spec
? [beeSpecPhase(), beeApplyPhase(spec, appDir), ...device]
: [beeSpecPhase()];
}

> look: The Bee plan changes. The phase engine, build phase, and launch phase stay the same.
> :::

The apply phase protects the reviewed specification:

:::snippet packages/workshop-harness/src/bee-pipeline.ts (simplified)
{
name: "bee_apply",
verifyFirst: true,
maxAttempts: 3,
readOnly: ["bee-spec.json", "BEE_SPEC.md"],
checks: [
...approvedRequestChecks,
typecheck,
appTests,
],
}

> look: The implementation cannot edit the requirement or its acceptance checks.
> :::

The specification can define only `file_exists` and `contains` checks.
It cannot define a shell command.
Every check path must stay inside the guarded app.

## Prepare Bee CLI

Read the [Bee CLI repository](https://github.com/bee-computer/bee-cli).
Install the current Bee mobile app.

Enable Developer Mode in the Bee app:

1. Open Settings.
2. Find the app version.
3. Tap the app version five times.

Install and authenticate the CLI:

:::command Install and authenticate Bee CLI
npm install -g @beeai/cli
bee version
bee login
bee status
:::

Search for the Pocket Cinema discussion:

:::command Find the Pocket Cinema conversation
bee search --query "Pocket Cinema" \
 --filter conversations --limit 5 --json
:::

Record the selected conversation ID in private notes.
Do not add the search JSON to the repository.

The harness starts `bee mcp serve` for the specification phase.
Do not start a second MCP server.

## Configure the live model

The live Bee path uses Strands.
Set `"executor": "strands"` in `workshop.config.json`.
Configure Bedrock, OpenAI, or OpenRouter as described in Lesson 00.

The Vega SDK and VDA must remain available.
The apply command runs the normal build and launch checks.

## Create the specification

`--propose` runs only `bee_spec`.
The model searches Bee, reads the selected conversation, and returns
`bee-spec.json`.

The harness validates the JSON.
The harness renders `BEE_SPEC.md`.
The model does not write the Markdown review document.

:::yourturn
Run the specification phase.
Review the paraphrases, sources, exclusions, and file checks.
:::

:::command Create the Bee specification
yarn tsx src/index.ts bee-run ../../apps/pocket-cinema \
 --propose --run-id bee
:::

:::expected
"event":"bee_spec_ready"
"phasesComplete":["bee_spec"]
:::

## Inspect and approve the specification

Open `out/bee/app/BEE_SPEC.md`.

:::steps

1. Find each requested app change.
2. Confirm that each request is a paraphrase.
3. Find the source conversation ID.
4. Confirm that the request has one specific file check.
5. Read `Deliberately excluded`.
6. Confirm that personal and unrelated information is excluded.
7. Open `out/bee/bee-context.json`.
8. Confirm that it contains IDs and hashes.
9. Confirm that it contains no conversation text.
10. Run `git -C ../../out/bee/app diff --name-only HEAD~2 HEAD`.
11. Confirm that the result contains only specification files.
    :::

Reject the specification when a request was only an idea, a check can pass
without the change, or a path points outside the app.

The model transcript can contain conversation text.
Treat `out/bee/model-logs/bee_spec.jsonl` as private data.

## Apply the approved request

`--apply --yes` confirms your review and runs:

```text
bee_apply -> build -> launch
```

The approved file checks fail before implementation.
The failure text tells the apply model what it must change.
The phase also requires `tsc --noEmit` and the app tests.

:::yourturn
Apply the reviewed request.
Wait for the app checks, Vega build, and VDA launch.
:::

:::command Apply, build, and start
yarn tsx src/index.ts bee-run ../../apps/pocket-cinema \
 --apply --yes --run-id bee
:::

:::expected
"event":"bee_apply_complete"
"phasesComplete":["bee_spec","bee_apply","build","launch"]
:::

## Inspect the result

:::steps

1. Open `out/bee/bee-result.json`.
2. Find the `bee_apply` phase.
3. Find each request ID in the check labels.
4. Find the source conversation ID.
5. Inspect the committed app source change.
6. Confirm that `bee-spec.json` did not change.
7. Confirm that `BEE_SPEC.md` did not change.
8. Confirm that the type check passed.
9. Confirm that the app tests passed.
10. Confirm that the Vega build passed.
11. Confirm that the launch state checks passed.
    :::

## Use the prepared conversation when necessary

If you do not have Bee access or consent, use the prepared conversation.
This path proves the phase controls.
It does not prove a live Bee connection.

Create the prepared specification:

```sh
yarn tsx src/index.ts bee-run ../../apps/pocket-cinema \
  --replay ../../workshop/fixtures/bee-run/port-recording.json \
  --propose --run-id bee
```

Review `out/bee/app/BEE_SPEC.md`.
Then, apply the prepared request:

```sh
yarn tsx src/index.ts bee-run ../../apps/pocket-cinema \
  --replay ../../workshop/fixtures/bee-run/port-recording.json \
  --platform-replay ../../workshop/fixtures/vega-lifecycle.json \
  --apply --yes --run-id bee
```

`out/bee/vega-platform-result.json` has `evidenceMode: replay`.
Do not report it as a live Bee or live device result.

:::proof
claim: "A consented Bee conversation can produce a bounded app change"
gate: "The approved request checks, app checks, build, and launch pass"
evidence: "BEE_SPEC.md, bee-context.json, bee-result.json, and phase commits"
limit: "A live Bee claim requires an authenticated read of a consented conversation"
:::

:::knowledge What happened?
The Bee conversation supplied private context.
The harness produced a review document without transcript text.
You approved the request before the model changed the app.
The apply phase could not change its specification or checks.
:::

:::done
Git contains the approved `BEE_SPEC.md`.
Each request contains a source ID.
The excluded list contains private and unapproved content.
`bee-result.json` reports passing apply, build, and launch phases.
:::

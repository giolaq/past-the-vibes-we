---
id: bee
number: "A1"
nav: "Challenge: Bee phase"
time: 40 minutes
title: "Challenge: modify the app from a Bee conversation"
lead: Bee is a wearable personal AI that captures conversations. Use one conversation as private input. BEE_SPEC.md is the request review document. A source ID identifies the conversation. A paraphrase restates a request without its exact words.
objective: Run phases that read Bee data. Protect private data. Approve each request before the phases change the app.
evidence: BEE_SPEC.md contains source IDs and paraphrases. The app passes the approved checks and device phases.
---

:::welcome Build from a conversation without committing it
The six-phase TV port is complete.
This challenge adds a source of product requirements.

The Bee CLI is a command-line tool that searches your Bee data and exposes it to agents through MCP.
A consented conversation is a conversation that every speaker permits you to use.
Use the Bee CLI to find a consented conversation about Pocket Cinema.
The Bee phases apply approved requests to the app.
:::

:::note Consent is a prerequisite
Get consent from every speaker before you use a live conversation.
Use your own Bee account and your own app discussion.

If you do not have consent or account access, run the recorded fallback.
A recorded fallback uses prepared model and platform results instead of live services.
:::

## Read the challenge brief

Record or select one Bee conversation.
Make sure that the conversation contains:

- One explicit Pocket Cinema change.
- One detail that makes the change testable.
- One idea that the speakers deliberately defer.
- No production secrets or protected customer data.

The approved request must change the guarded app.
The app checks, build, and launch must pass.

:::flow
Bee | Find the product conversation
Spec | Paraphrase requests and define checks
Review | Approve scope before code changes
Apply | Modify the guarded app
Verify | Run app checks, build, and launch
:::

:::predict
Which information must not become an app requirement?
:::

## Know the two new phases

This challenge adds two phases to the harness plan.
The `bee_apply` phase changes the app.
The `bee_spec` phase produces the approved input for `bee_apply`.

A specification is a structured statement of requested changes and checks.
Authority is permission to read data, change files, or decide whether work passes.
An assertion is a check about a file and its required content.
Acceptance criteria are the checks that the completed change must pass.
Provenance records where source information came from.
An app-owned check is a test maintained with the app, not a check proposed by the conversation.

| Phase | Input | Authority | Output |
| --- | --- | --- | --- |
| `bee_spec` | Bee MCP tools from `bee-cli` | Reads conversations and proposes a typed specification | `bee-spec.json` |
| Human review | Rendered specification | Accepts or rejects requests and checks | Approved `BEE_SPEC.md` |
| `bee_apply` | Approved specification and guarded app | Proposes app files only | A typed app patch |
| `build`, `launch` | Modified app | Vega compiler and VDA | Device evidence |

The harness renders `BEE_SPEC.md` from validated JSON.
The model does not write the review document.
The `bee_apply` phase cannot edit either specification file.

:::snippet packages/workshop-harness/src/bee-pipeline.ts (challenge contract)
bee_spec -> human review -> bee_apply -> build -> launch

bee_spec:
  MCP: bee
  output: bee-spec.json

bee_apply:
  readOnly: [bee-spec.json, BEE_SPEC.md]
  checks: approved file assertions + app-owned checks
>look: The conversation is context. The approved specification is the requirement.
:::

## Keep the authority narrow

Use these rules:

| Rule | Reason |
| --- | --- |
| Permit only `file_exists` and `contains` checks | A conversation must not specify a shell command |
| Keep each check path inside the guarded app | Approval must not give access outside the app |
| Let the harness render `BEE_SPEC.md` | The reviewed text and the validated JSON must agree |
| Make both specification files read-only for `bee_apply` | The implementation must not change its acceptance criteria |
| Store source IDs and hashes in provenance | The report identifies the source without transcript text |
| Keep TypeScript and app tests under harness control | The model must not grade its own patch |

:::note Protect private data
`bee-context.json` contains conversation references and hashes.
`bee-context.json` does not contain conversation text.

`out/bee/model-logs/bee_spec.jsonl` can contain conversation text.
Git ignores the `out/` directory.
Before you share a run directory, remove private data.
:::

## Set up bee-cli

Read the [bee-cli repository](https://github.com/bee-computer/bee-cli).
Install the current Bee mobile app.
Developer Mode is a Bee app setting that permits CLI access.
In Settings, tap the app version five times to enable Developer Mode.
Keep the Vega SDK and VDA from Lessons 4 and 5 available for the final checks.

:::yourturn
Install `bee-cli`.
Authenticate with Bee.
Find the consented conversation.
:::

:::command Install and authenticate bee-cli
npm install -g @beeai/cli
bee version
bee login
bee status
:::

Search for the app discussion.
Use a query that identifies the conversation.
Do not use a person's name in the query.

:::command Find the Pocket Cinema conversation
bee search --query "Pocket Cinema" \
  --filter conversations --limit 5 --json
:::

Do not put the JSON in a source file.
Record the selected conversation ID in your private notes.

:::note The harness starts the MCP server
Standard input and standard output (stdio) connect two processes through text streams.
JSON-RPC is a structured request-and-response format.
The harness launches `bee mcp serve` over stdio for the `bee_spec` phase.
Do not start the server in a second terminal.

Complete authentication before you start the harness.
:::

## Run the specification phase

The live Bee path uses Strands.
Set `"executor": "strands"` and the provider settings in
`../../workshop.config.json`.
The `--propose` option reads Bee data and creates the specification.
It does not change app source files.

:::yourturn
Run the new specification phase.
Compare the phase requests with the conversation.
Compare the phase checks with the conversation.
:::

:::command Create the Bee specification
yarn tsx src/index.ts bee-run ../../apps/pocket-cinema \
  --propose
:::

:::expected
"event":"bee_spec_ready"
"phasesComplete":["bee_spec"]
:::

Before you change source code, inspect the phase result:

:::steps
1. Open `out/bee/app/BEE_SPEC.md`.
2. Find the selected conversation ID.
3. Confirm that every request is a paraphrase.
4. Confirm that the deferred idea is in `Deliberately excluded`.
5. Confirm that unrelated or personal material is excluded.
6. Check that every request has a specific file assertion.
7. Reject any command check.
8. Open `out/bee/bee-context.json`.
9. Confirm that `bee-context.json` contains references and hashes but no transcript.
10. Run `git -C ../../out/bee/app diff --name-only HEAD~2 HEAD`.
11. Confirm that no app source file changed during `bee_spec`.
:::

The Git `diff --name-only` command lists changed file paths without file content.

:::knowledge Why does the harness store a hash?
A hash identifies the source content.
A hash also detects a later change.
The durable report does not need the private conversation text.

The local model transcript can contain the complete exchange.
Treat the local model transcript as private data.
:::

## Approve or reject the specification

Do not approve the specification based only on appearance.
Compare the specification with the consented conversation.

Reject the proposal when:

- A request was only an idea or question.
- A private detail appears in the product scope.
- A check can pass without implementing the behavior.
- A check points outside the app.
- The expected app change is missing.

The `--apply --yes` command records your approval.
The `--apply` option applies the approved specification.
The `--yes` option confirms the approval without another prompt.

## Run the app-modifying phase

:::yourturn
Apply the approved request.
Trace the conversation ID to the source patch.
Trace the conversation ID to the independent checks.
:::

:::command Apply, build, and start
yarn tsx src/index.ts bee-run ../../apps/pocket-cinema \
  --apply --yes
:::

:::expected
"event":"bee_apply_complete"
"phasesComplete":["bee_spec","bee_apply","build","launch"]
:::

`tsc --noEmit` checks TypeScript without writing compiled files.
A request ID identifies one approved change and its checks.

:::steps
1. Find the first failed approved check in the phase result.
2. Open `out/bee/bee-result.json`.
3. Find the request ID on each check.
4. Find the source conversation ID.
5. Inspect the committed app source change.
6. Verify that `bee-spec.json` did not change.
7. Verify that `BEE_SPEC.md` did not change.
8. Verify that `tsc --noEmit` passes.
9. Verify that the app tests pass.
10. Verify that the Vega build completes.
11. Verify that the modified app remains active on the VDA.
:::

## Test the phase boundaries

A phase boundary defines which input and action a phase permits.
The phase boundaries must reject unsafe inputs.

:::steps
1. Run the harness tests for Bee.
2. Find the test that rejects a command check.
3. Find the test that rejects a path outside the app.
4. Find the test that prevents `bee_apply` from rewriting the specification.
5. Find the test that refuses `--apply` before a specification exists.
6. Explain which component rejects each case.
:::

:::command Run the Bee harness tests
node --import tsx --test tests/bee.test.ts
:::

## Run the challenge without a Bee account

The synthetic conversation is a written example, not a live Bee conversation.
A fixture is prepared test input stored in the repository.
Replay uses stored model and platform results from a fixture.
Replay evidence proves the pipeline behavior but does not prove a live Bee connection.
The recorded fallback runs the same phase plan with a synthetic conversation.
The recorded fallback proves harness behavior.
The recorded fallback does not prove a live Bee integration.

:::command Propose from the synthetic conversation
yarn tsx src/index.ts bee-run ../../apps/pocket-cinema \
  --replay ../../workshop/fixtures/bee-run/port-recording.json \
  --propose --run-id bee
:::

Review `out/bee/app/BEE_SPEC.md`.
Then, run:

:::command Apply the synthetic conversation
yarn tsx src/index.ts bee-run ../../apps/pocket-cinema \
  --replay ../../workshop/fixtures/bee-run/port-recording.json \
  --platform-replay ../../workshop/fixtures/vega-lifecycle.json \
  --apply --yes --run-id bee
:::

:::proof
claim: "A consented Bee conversation can produce a bounded app change"
gate: "Human-approved specification checks, app-owned checks, build, and launch all pass"
evidence: "BEE_SPEC.md, bee-context.json, bee-result.json, and phase commits"
limit: "The recorded fallback proves only the pipeline. A live claim requires an authenticated Bee read."
:::

:::done
Git contains the approved `BEE_SPEC.md`.
Each request contains a source ID.
The excluded list contains private and unapproved content.
`bee-result.json` reports passing apply, build, and launch phases.
:::

:::fallback
If you do not have consent or Bee access, stop the live appendix.
Inspect the prepared synthetic fixture:

`workshop/fixtures/bee-run`

Do not make a live Bee integration claim from the synthetic fixture.
:::

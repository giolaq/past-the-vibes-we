---
id: bee
number: "A1"
nav: "Appendix: Bee pipeline"
time: 25 minutes
title: "Appendix: convert an approved conversation into code"
lead: Use a second pipeline. Convert a conversation into a reviewed specification before you write code.
objective: Apply an approved request without committing private conversation text. Do not let the model change its acceptance criteria.
evidence: BEE_SPEC.md contains source IDs and paraphrases. The app passes the approved checks and device phases.
---

:::welcome Use this appendix only with consent
This appendix uses private conversation data.
Use the live path only with explicit consent.
Use your own Bee account.

If you do not have consent or access, do not run the live exercise.
Use the synthetic instructor example.
:::

:::note Required external setup
Run `bee login` and `bee mcp serve` in your terminal.
These commands are outside the harness.

The synthetic recording does not prove a live Bee integration.
The device phases use the VDA from Lessons 4 and 5.
:::

:::note Protect private data
`bee-context.json` contains conversation IDs and hashes.
It does not contain conversation text.

`out/bee/model-logs/bee_spec.jsonl` can contain conversation text.
The `out/` directory is ignored by Git.
Delete or remove private data before you share the run directory.
:::

## Know the two-stage approval

:::flow
Propose | Convert Bee data to a specification
Approve | Review the specification
Apply | Convert the specification to code
Build | Produce the package
Launch | Start the app
:::

:::concept Approve the acceptance criteria first
Each request in `bee-spec.json` contains an independent check.
Review the request and its check together.
Do this before the model writes code.

The apply phase uses the approved check.
The model cannot define success after it writes the code.
:::

:::concept Know what the specification excludes
The specification is not a transcript.
It contains a paraphrase and source ID.

The specification cannot contain command checks.
It can contain only `file_exists` and `contains` checks.
Human approval does not make a model-written shell command safe.
:::

:::predict
The conversation contains a flight time and family information.
It also contains an unapproved search idea.
Where must this information go?
:::

## Create the proposed specification

:::command Create the Bee specification
yarn --cwd packages/workshop-harness tsx src/index.ts bee-run ../../apps/pocket-cinema \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2 \
  --propose
:::

:::note Use Strands for the live Bee path
The harness supplies the Bee MCP client directly to a Strands agent.
You can use Bedrock, OpenAI, or OpenRouter.
Use the same provider and model for propose and apply.

The main TV pipeline supports Claude Code.
The live Bee path does not.
:::

:::steps
1. Open `out/bee/app/BEE_SPEC.md`.
2. Read each request.
3. Find the source ID.
4. Find the reason.
5. Find the independent check.
6. Read the `Deliberately excluded` section.
7. Verify that travel and family information is excluded.
8. Verify that the unapproved search idea is excluded.
9. Run `git -C out/bee/app diff --name-only HEAD~2 HEAD`.
10. Verify that only the specification files changed.
11. Open `out/bee/bee-context.json`.
12. Verify that it contains IDs and hashes only.
:::

:::knowledge Why does the harness store a hash?
The hash identifies the source and detects a later change.
The durable report does not need the private conversation text.

The local transcript still contains the complete model exchange.
Treat the transcript as private data.
:::

## Approve the specification

Do not run the apply command until you approve the specification.

:::steps
1. Compare each request with the actual decision.
2. Move unapproved suggestions to the excluded list.
3. Decide if each check proves the request.
4. Reject a check that can pass without the required change.
5. Run the apply command only after approval.
:::

## Apply the approved specification

:::command Apply, build, and start
yarn --cwd packages/workshop-harness tsx src/index.ts bee-run ../../apps/pocket-cinema \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2 \
  --apply --yes
:::

:::steps
1. Find the initial failed specification checks.
2. Open `out/bee/bee-result.json`.
3. Find the request ID on each check.
4. Find the source conversation ID.
5. Verify that `tsc --noEmit` passes.
6. Verify that the catalog tests pass.
7. Verify that the build phase completes.
8. Verify that the launch phase completes.
:::

:::note Protect the approved requirement
The model cannot change `bee-spec.json`.
The model cannot change `BEE_SPEC.md`.
The harness rejects a patch that changes either file.
:::

:::knowledge Why is Bee a separate command?
The TV port and Bee pipeline answer different questions.
The TV phases depend on each other.
The Bee pipeline can run after the app exists.

Both pipelines use `runPortPipeline`.
This shows that the engine can run different phase plans.
:::

:::done
Git contains the approved `BEE_SPEC.md`.
Each request contains a source ID.
The excluded list contains private and unapproved content.
`bee-result.json` reports passing apply, build, and launch phases.
:::

:::fallback
If you do not have consent or Bee access, use the synthetic recording.
Replace the live executor flags with:

`--replay ../../workshop/fixtures/bee-run/port-recording.json`

If no VDA is attached, also add:

`--platform-replay ../../workshop/fixtures/vega-lifecycle.json`

The result is recorded evidence only.
:::

---
id: bee
number: "A1"
nav: "Appendix: Bee pipeline"
time: 25 minutes
title: "Appendix: a conversation becomes code, with a gate in the middle"
lead: "An optional second pipeline on the same engine: a conversation about the app becomes a reviewed spec, then working code, then a running app."
objective: Turn an approved conversation into shipped change without committing a transcript or letting a model grade its own work.
evidence: BEE_SPEC.md carries a paraphrase and a source id per request, and the applied change clears those checks plus the app's own tests on the device.
---

:::welcome Optional, and here is why
This is the one lesson we may skip together, and the reason is worth stating out loud: it touches private conversations. Run the live path only with explicit consent and your own Bee account. If either is missing, skip the exercise; the instructor can use the synthetic recording to demonstrate the gate without handling anyone's data. [Bee](https://www.aboutamazon.com/news/devices/bee-amazon-wearable-ai-device-new-features) is Amazon's wearable AI device: it listens to your day, when you let it, and turns conversations into searchable summaries. Somewhere in a week of those conversations is the decision about what the app should do next. This lesson gets that decision into the app.
:::

:::note What this needs, and what it does not
`bee login` and `bee mcp serve` happen outside the harness, in your own terminal, with your own account. The synthetic recording is demonstration material, not a substitute for claiming a live integration. The device half uses the VDA from lessons 4 and 5.
:::

:::note Privacy boundary
The durable `bee-context.json` records only conversation ids and hashes. The complete local
model transcript at `out/bee/model-logs/bee_spec.jsonl` is different: it records what the model
actually received, including conversation text returned by Bee. `out/` is gitignored. Use this
lesson only with consent, and delete or scrub that transcript before sharing the run directory.
:::

## Two halves, and a human between them

:::flow
Propose | Bee to a reviewable spec
Approve | You read it
Apply | Spec to code
Build | The vpkg
Launch | On the device
:::

:::concept The spec carries its own acceptance criteria
Each request in `bee-spec.json` arrives with the file assertion that will prove it — `src/catalog.ts` must contain `Continue Watching`, and so on. You approve the requests and the criteria together, before any code exists. So when the apply phase passes, it passed a bar that was set before it started, by a document you signed off. A model that writes code and then decides whether the code is good is grading its own work; this is the arrangement that avoids it.
:::

:::concept Two things the spec is not
It is **not a transcript**. `request` is the harness's paraphrase plus a source id, and `BEE_SPEC.md` is rendered by the harness from the validated JSON — so the prose you approve cannot disagree with what gets built. It is **not a command line**. Spec checks are `file_exists` and `contains` only; a model-authored assertion and a model-authored command are different kinds of authority, and your approval does not close that gap.
:::

:::predict
The conversation also mentions a flight time, a family visit, and an idea for search that nobody agreed on. Where should each of those end up?
:::

## Propose: read the conversation, write the spec

:::yourturn
Run the first half. It writes no code — check that yourself rather than taking it on trust.
:::

:::command Extract a spec from the conversation
yarn --cwd packages/workshop-harness tsx src/index.ts bee-run ../../apps/pocket-cinema \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2 \
  --propose
:::

:::note Why this optional lesson uses Strands
The live Bee MCP client is handed directly to a Strands agent. You may use Bedrock, OpenAI, or
OpenRouter, but you must keep the same Strands provider and model for propose and apply. Claude
Code remains supported by the main TV-port pipeline; it is not the live Bee executor in this lesson.
:::

:::steps
1. Read `out/bee/app/BEE_SPEC.md`. Every request has a source conversation, a reason, and the check that will prove it.
2. Read the **Deliberately excluded** section hardest. The travel and family material is there, and so is search, because nobody agreed what it searches.
3. Run `git -C out/bee/app diff --name-only HEAD~2 HEAD`. Two files: the spec and its rendering. No source changed.
4. Open `out/bee/bee-context.json`. It records the tool, the conversation id, and a hash — and not a word of what was said.
:::

:::knowledge Why hash the conversation instead of storing it?
The hash gives the durable report enough evidence to identify the source and detect edits without
copying the conversation into `bee-context.json` or the app repository. The local phase
transcript still contains the complete model exchange for debugging and must be treated as
private. The recorded fixture is hash-verified on load for the same reason: change a line and
the run stops instead of quietly working from edited context.
:::

## Approve: you are the gate

:::yourturn
This is the moment the lesson is built around. Read the spec as the requirement it is about to become.
:::

:::steps
1. Does each request match something that was actually decided, or has a suggestion been promoted to a requirement?
2. Would you accept each check as proof? A check you could satisfy without doing the work is a check that proves nothing.
3. Is anything in the requests that belongs in the excluded list instead?
4. Only then run the second half. `--apply` refuses to start without a spec on disk that matches the schema.
:::

## Apply: the spec becomes code, and the code reaches the device

:::command Implement the approved spec, then build and launch
yarn --cwd packages/workshop-harness tsx src/index.ts bee-run ../../apps/pocket-cinema \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2 \
  --apply --yes
:::

:::steps
1. Watch the first thing it prints: the spec's checks failing. The phase verifies before it prompts, so the failure that provoked the work is recorded as evidence.
2. Read the check names in `out/bee/bee-result.json`. Each one carries its request id and the conversation it came from, so a failure points back at a decision.
3. `bee_apply` also has to clear the app's own gates — `tsc --noEmit` and the catalog tests — which the spec does not control and the model cannot loosen.
4. `build` and `launch` are the phases from lessons 4 and 5, reused unchanged. The conversation's request reaches a device through machinery that knows nothing about Bee.
:::

:::note The requirement is not editable by the thing being measured
`bee_apply` declares `bee-spec.json` and `BEE_SPEC.md` read-only. A patch that touches either is refused before it is written. Without that, a model one attempt away from passing could pass by rewriting the requirement.
:::

:::knowledge Why is this a separate command instead of a seventh phase?
The port pipeline answers one question — does this app run on Vega — and its phases build on each other. This answers a different one, from a different source, and it can run any time after the app exists. Making them separate is also what proved the engine is general: `runPortPipeline` takes a plan, and this is the second one.
:::

:::done
`BEE_SPEC.md` is committed with a source id per request and an excluded list, `bee-result.json` shows `bee_apply`, `build`, and `launch` complete, and the change the conversation asked for is in the app's catalog and its details screen.
:::

:::fallback
Without Bee consent or account access, skip the live exercise. For an instructor-led case study,
replace the executor/provider/model flags in both commands with
`--replay ../../workshop/fixtures/bee-run/port-recording.json`; add
`--platform-replay ../../workshop/fixtures/vega-lifecycle.json` to the apply command when no VDA
is attached. The conversation is synthetic, and the result is recorded evidence only.
:::

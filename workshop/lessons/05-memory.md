---
id: memory
number: "05"
nav: Project memory
time: 15 minutes
title: Review facts before saving them
lead: "Here you are the approval gate: proposed context becomes project memory only after you read it and apply it."
objective: Turn selected source material into small, reviewable project facts with provenance.
evidence: The saved PROJECT_CONTEXT.md separates decisions, facts, questions, and source ids.
---

:::welcome You are the gate
Every run so far started from nothing. Now we give the harness memory — and immediately put a human in front of it. Project context should stay small, and every entry needs a source and a sign-off, because a raw transcript is noisy, private, and easy for an agent to misread as an instruction. You'll review candidate facts before any of them become durable truth.
:::

:::predict
What could go wrong if the harness imported every remembered sentence automatically?
:::

:::command Create a disposable input copy
WORKSHOP_INPUTS="/tmp/past-the-vibes-pocket-cinema-inputs"
rm -rf "$WORKSHOP_INPUTS"
cp -R workshop/fixtures/pocket-cinema-inputs \
  "$WORKSHOP_INPUTS"
:::

:::command Show the current project memory (empty at first)
yarn --cwd packages/workshop-harness tsx src/index.ts memory show /tmp/past-the-vibes-pocket-cinema-inputs --json
:::

:::command Create a memory proposal
yarn --cwd packages/workshop-harness tsx src/index.ts memory propose /tmp/past-the-vibes-pocket-cinema-inputs \
  --from ../../workshop/fixtures/bee-context/snapshot.json \
  --json
:::

## Your review, before anything is saved

:::steps
1. Read every proposed fact.
2. Check that each fact names its source.
3. Keep open questions separate from decisions.
4. Reject anything private, temporary, or ambiguous.
:::

:::command Apply the reviewed proposal
yarn --cwd packages/workshop-harness tsx src/index.ts memory apply /tmp/past-the-vibes-pocket-cinema-inputs \
  --from ../../workshop/fixtures/bee-context/snapshot.json \
  --yes --json
:::

## Check what you just approved

:::steps
1. Open `/tmp/past-the-vibes-pocket-cinema-inputs/PROJECT_CONTEXT.md`.
2. Confirm the source ids survived the transformation.
3. Confirm the committed fixture in the repository is unchanged.
:::

:::knowledge Why is the proposal step an approval gate rather than another model phase?
The human owns what becomes durable project truth. The model may summarize candidate facts, but it cannot silently promote them into trusted context.
:::

:::done
Every saved fact has a source and the repository fixture is unchanged.
:::

:::fallback
Use the synthetic Bee snapshot — live Bee access isn't required.
:::

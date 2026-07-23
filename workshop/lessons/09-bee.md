---
id: bee
number: "09"
nav: Optional Bee context
time: 15 minutes
title: Import selected context, not a transcript
lead: Run this only if Bee is configured and participants have consented — the synthetic fixture is the normal workshop path.
objective: Select useful context without turning a private conversation into unreviewed agent memory.
evidence: A scrubbed snapshot has source ids, dates, a query, a summary, and a stable hash.
---

:::concept Why this step is optional
[Bee](https://www.aboutamazon.com/news/devices/bee-amazon-wearable-ai-device-new-features) is Amazon's wearable AI device: it listens to your day (when you let it) and turns conversations into searchable summaries, decisions, and to-dos. Conversation search can recover useful decisions, but it also crosses a privacy boundary. Use it only with consent, select the smallest useful excerpt, and store a scrubbed snapshot rather than a transcript.
:::

:::predict
Which fields would let a reviewer verify where a summarized fact came from without storing the full conversation?
:::

:::command Search Bee
yarn --cwd packages/workshop-harness tsx src/index.ts context bee search \
  "Pocket Cinema product decisions" --json
:::

:::command Save one selected snapshot
yarn --cwd packages/workshop-harness tsx src/index.ts context bee snapshot <conversationId> \
  --out candidate-context.json --json
:::

## Review the boundary

:::steps
1. Check source ids, dates, query, summary, and hash.
2. Review the snapshot before proposing memory.
3. Never commit a raw private transcript.
4. Disconnect Bee and confirm the approved snapshot still works.
:::

:::knowledge Why should the snapshot work after Bee is disconnected?
The run becomes reproducible and reviewable without a live private-data dependency. The snapshot is the approved input; Bee is only a discovery source.
:::

:::done
Every approved fact has a source and can be reused without Bee.
:::

:::fallback
Use `fixtures/bee-context/snapshot.json` or skip this optional module.
:::

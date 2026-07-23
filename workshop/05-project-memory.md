# 5. Project Memory

## Goal

Review proposed project facts before saving them for later runs.

## Do this

1. Make a disposable copy of the input fixture. The fixed `/tmp` path keeps every later command copy-pasteable, even from a new terminal:

```sh
rm -rf /tmp/past-the-vibes-pocket-cinema-inputs
cp -R workshop/fixtures/pocket-cinema-inputs /tmp/past-the-vibes-pocket-cinema-inputs
```

2. Show the current project memory:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts memory show /tmp/past-the-vibes-pocket-cinema-inputs --json
```

3. Build a proposal from the synthetic context snapshot:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts memory propose /tmp/past-the-vibes-pocket-cinema-inputs \
  --from ../../workshop/fixtures/bee-context/snapshot.json \
  --json
```

4. Read the proposal. Check the source and keep open questions separate from decisions.
5. Apply it only after review:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts memory apply /tmp/past-the-vibes-pocket-cinema-inputs \
  --from ../../workshop/fixtures/bee-context/snapshot.json \
  --yes --json
```

6. Open `/tmp/past-the-vibes-pocket-cinema-inputs/PROJECT_CONTEXT.md` and `project-context.json`.

## Why this matters

A checkpoint records where a run stopped. Project memory records approved facts that should survive across runs. They are not the same thing.

## You are done when

Every saved entry has a source, and no open question has been stored as a decision.

## If blocked

Use the committed synthetic snapshot. [Bee](https://www.aboutamazon.com/news/devices/bee-amazon-wearable-ai-device-new-features) (lesson 9) is not required.

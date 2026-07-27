# Troubleshooting

Use no more than 10 minutes for one live dependency failure.
Try one repair.
Then use the recorded fallback or a checkpoint.

## `npx` requests a `tsx` installation

Do not accept the download.
The workspace dependencies are not ready.

From the repository root, run:

```sh
unset NODE_TLS_REJECT_UNAUTHORIZED
corepack enable
yarn setup
yarn doctor
```

The repository uses the `node-modules` Yarn linker.
Lesson commands use the package-local `tsx`.

If Node reports `NODE_TLS_REJECT_UNAUTHORIZED=0`, remove it from your shell profile.
This setting disables HTTPS certificate verification.

## Setup or type verification fails

1. Run `yarn setup` from the repository root.
2. Run the lesson command again.
3. Use the recorded fallback if the command fails again.

## The app directory does not exist

Make sure that the app directory contains `package.json`.
Make sure that the app runs before the workshop.
Otherwise, use `apps/pocket-cinema`.

## `workshop-brief.md` is missing

Add `workshop-brief.md` to the source app.
State one bounded flow, required behavior, non-goals, and verification.
Do not replace it with generation input files.

Use `apps/pocket-cinema/workshop-brief.md` as the example.

## Plan approval is required

Open `out/<runId>/app/port-plan.json`.
Compare it with the source app and `workshop-brief.md`.
Trace Select and Back.
Check each preserved behavior has independent evidence.

Then run:

```sh
yarn tsx src/index.ts approve-plan <runId> --yes
```

Do not edit the plan after approval.
Run the plan phase again if the plan is wrong.

## The source changed after the run started

The plan and approval belong to one source fingerprint.
Do not resume the old run after the source app or brief changes.
Start a new run ID and review the new plan.

## A model call fails

Check `workshop.config.json`.
Then run `doctor` without model options.

- For Claude Code, verify installation and authentication.
- For Bedrock, verify AWS credentials, region, and model access.
- For OpenAI, verify `OPENAI_API_KEY` and the model ID.
- For OpenRouter, verify `OPENROUTER_API_KEY` and the `provider/model` ID.
- For a custom model, supply both pricing flags.

Use provider prices in USD per million tokens.
Do not estimate the prices.

Try one correction.
If it fails, save the error and `model-logs`.
Then use the lesson recording.
Do not change providers repeatedly.

## The cost limit is reached

Stop the run.
Do not increase the cost limit without participant approval.
Continue from a checkpoint.

## ADBT is not available

A live port stops with exit code 3.
It does not continue without required platform context.

Run this command one time:

```sh
yarn tsx src/index.ts doctor \
  --replay --adbt-live --json
```

The harness starts the pinned ADBT server.
It requires `list_documents` and `read_document`.
It closes the MCP connection after the operation.

If ADBT still fails, remove `--adbt-live`.
Use the recorded ADBT context.
Open `adbt-port-context.json` to verify the evidence mode.

If an ADBT skill is missing, run:

```sh
npx -y @amazon-devices/amazon-devices-buildertools-mcp@1.0.5 \
  init-context --agent claude-code-cli --force
```

You can also set `WORKSHOP_SKILLS_DIR`.
A missing skill does not stop the run.
The live ADBT MCP connection is separate from skill installation.

## Vega build or VDA fails

Run each command separately:

```sh
vega --version
vega virtual-device status
vega exec vda devices -l
```

The required SDK version is `0.22.5875`.
Start VDA in a system terminal:

```sh
vega virtual-device start --gui
```

Keep the terminal open.
An empty device list is a failure.

If the build fails with an attached device:

1. Open `checkpoints/vega-buildable/app`.
2. Run `npm ci` in `app/apps/vega`.
3. Run `npm run build:debug`.

Do not run `npm audit fix --force`.
The SDK template uses pinned React Native 0.72 dependencies.

Record the failed boundary.
Use one of these names:

- SDK setup
- Device attachment
- Build
- App behavior

After one repair, use `checkpoints/complete/`.

## Bee is not available

Bee is optional Appendix A1.
Do not run it without consent.
Do not run it without account access.

The instructor can use the synthetic recording:

```sh
--replay workshop/fixtures/bee-run/port-recording.json
```

Run `bee login` and `bee mcp serve` in your terminal.
If the Bee tools are missing, verify that `bee` is on `PATH`.
You can also set `BEE_BIN`.

If the hash does not match, restore the fixture:

```sh
git checkout workshop/fixtures/bee-run/bee-conversation.json
```

If `--apply` reports `bee_spec_missing`, run `--propose` first.
Read `out/bee/app/BEE_SPEC.md`.
Then run `--apply`.

## A detached run does not progress

Run:

```sh
status <runId> --json
logs <runId>
```

Do not edit files in `out/`.

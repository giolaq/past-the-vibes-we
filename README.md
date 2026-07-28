# Past the Vibes

Past the Vibes is a workshop for React Native developers.
You use an AI agent harness to port a mobile app to Vega OS for TV.

An AI agent harness is the software infrastructure around a large language
model (LLM). It gives the model selected tools and project context. It also
controls file changes, checks, retries, limits, and reports.

This workshop uses a harness written in TypeScript. The harness runs six
ordered phases:

```text
analyze -> plan -> port -> build -> launch -> test
```

The sample app is Pocket Cinema. The source app stays unchanged. The harness
creates a working copy under `out/<runId>/app`.

## Main Technologies

| Technology | Function |
| --- | --- |
| [Strands Agents SDK](https://strandsagents.com/) | Connects the harness to models and tools |
| [Vega OS](https://developer.amazon.com/docs/vega/0.22/vega-get-started.html) | Runs the ported TV app |
| [Amazon Devices Builder Tools (ADBT)](https://developer.amazon.com/docs/vega/0.23/mcp-server.html) | Supplies current Vega documents to the model |

ADBT uses Model Context Protocol (MCP). MCP is a standard connection for
model tools and data.

The harness supports these model paths:

- Claude Code CLI
- Strands with Amazon Bedrock
- Strands with OpenAI
- Strands with OpenRouter

You can select any model that your chosen path supports. Use the exact model
name or model ID.

## What the Harness Controls

The model can list, read, and search the working copy. The model has no file
write tool and no shell tool. It returns proposed files in a structured
response.

The harness performs these operations:

1. Validates the model response and file paths.
2. Writes accepted files to the working copy.
3. Runs independent checks.
4. Sends exact failure text to the model when a repair is necessary.
5. Stops when checks pass, limits apply, or failures repeat.
6. Commits each passing phase in the working copy.
7. Records model, build, and device evidence.

An independent check runs outside the model. The check does not depend on a
model claim.

## Workshop Phases

| Phase | Work | Main evidence |
| --- | --- | --- |
| `analyze` | Reads the app and identifies portable and replacement work | `ANALYSIS.md` |
| `plan` | Uses ADBT documents and defines TV behavior | Approved `port-plan.json` |
| `port` | Creates the Vega package and TV focus code | Passing checks and a Git commit |
| `build` | Runs the Vega compiler and repairs compiler failures | A `.vpkg` package |
| `launch` | Installs the package and starts it on a Vega device | Running-state samples and device logs |
| `test` | Injects remote keys and reads the focused control | `tv-focus-result.json` |

The `plan` phase requires human approval. The `port`, `build`, `launch`, and
`test` phases refuse a missing or changed approval.

The `build`, `launch`, and `test` phases run their checks before they call a
model. A passing check does not require a repair call.

## Requirements

Install these tools before the workshop:

- [Node.js](https://nodejs.org/en/download) 20 or newer
- [Git](https://git-scm.com/downloads)
- [Corepack](https://github.com/nodejs/corepack)
- One supported model connection

Lessons 4 through 6 also require:

- Vega SDK version `0.23.9221`
- A Vega Virtual Device (VDA)

Use the [Vega installation guide](https://developer.amazon.com/docs/vega/0.23/install-vega-sdk.html)
to install the SDK. A VDA is a software TV device that runs on your computer.
The harness starts a VDA when no Vega device is attached.

## Install the Workshop

Run these commands from a terminal:

```sh
git clone https://github.com/giolaq/past-the-vibes-we.git
cd past-the-vibes-we
unset NODE_TLS_REJECT_UNAUTHORIZED
corepack enable
yarn setup
yarn verify
```

The `unset` command removes an unsafe Transport Layer Security (TLS) override
if the override exists. Do not disable TLS certificate verification.

Start the workshop website:

```sh
yarn site
```

Open `http://localhost:4173`.
Begin with Lesson 00.

## Configure a Model

Open `workshop.config.json` in the repository root. Select one executor,
provider, and model. The executor sends prompts to the model. The provider
hosts the model.

The configuration file must not contain credentials. Keep credentials in your
terminal or credential manager.

Lesson 00 provides configurations for every supported model path. It also
explains how to verify the connection:

```sh
cd packages/workshop-harness
yarn tsx src/index.ts doctor --json
```

Use the same model configuration for all phases.

## Run the Main Flow

Run harness commands from `packages/workshop-harness`.

A run ID names one pipeline run and its directory under `out/`. Use the same
run ID for every phase in one port.

Run the analysis and plan:

```sh
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --phases analyze,plan --yes --run-id workshop
```

Review `../../out/workshop/app/port-plan.json`.
Approve the reviewed plan:

```sh
yarn tsx src/index.ts approve-plan workshop --yes
```

Run the remaining phases:

```sh
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --phases port,build,launch,test --yes \
  --run-id workshop --tui
```

The terminal user interface (TUI) shows each phase and its events. Select a
phase with Up or Down. Press Enter to read its messages. Press Escape to
return to the phase list.

## Understand the Device Evidence

The launch phase performs these operations:

1. Reuses an attached VDA or starts one.
2. Installs the Vega package from the build phase.
3. Starts the app.
4. Confirms that the app process is running.
5. Waits five seconds.
6. Reads the device log and rejects known crash text.
7. Confirms that the app process is still running.

If a source repair is necessary, the phase rebuilds and installs the package
before it starts the app again.

The launch phase does not use screenshots as evidence.

The test phase uses Automation Toolkit. Automation Toolkit is a VDA service
that returns the user-interface hierarchy. The harness sends remote keys with
`inputd-cli` and reads the focused `test_id` after each key.

The test verifies:

- Initial focus
- Down movement
- Left and right boundaries
- Select behavior
- Back behavior
- Focus restoration

These checks prove process stability and focus behavior. They do not prove
visual styling.

## Inspect a Run

Each run writes evidence under `out/<runId>/`.

| Path | Contents |
| --- | --- |
| `app/ANALYSIS.md` | App analysis |
| `app/port-plan.json` | Structured TV plan |
| `app/port-plan-approval.json` | Human approval hashes |
| `port-result.json` | Phase, check, retry, and usage results |
| `model-logs/<phase>.jsonl` | Complete model events for one phase |
| `adbt-port-context.json` | ADBT document names and hashes |
| `vega-platform-result.json` | Build and device results |
| `vega-device.log` | Device log entries for the app |
| `app/tv-focus-result.json` | Observed focus transitions |

JSON Lines (JSONL) stores one JSON event on each line.

Read one model transcript:

```sh
yarn tsx src/index.ts logs <runId> --phase plan
```

Add `--follow` to read new events while the phase runs.

Model transcripts can contain prompts, source text, and tool results. The
`out/` directory is ignored by Git. Review a transcript before you share it.

## Usage Limits

Use `--max-tokens` to set a cumulative token limit for one run.
Use `--max-turns` to set a turn limit for each model call.

If you omit these options, the harness records usage without adding these
limits. The model provider can still apply its own limits.

The harness does not calculate a dollar cost. It reports a provider cost only
when the provider supplies that value.

## Bee Challenge

The optional Bee challenge uses
[Bee CLI](https://github.com/bee-computer/bee-cli) to read a consented product
conversation.

The `bee_spec` phase creates a structured request. A person reviews the
request before app files can change. The `bee_apply` phase applies only the
approved request. The harness then runs the normal build and launch phases.

Use a live conversation only when every speaker gives consent. The harness
stores source IDs and hashes in its report. Local model logs can still contain
conversation text.

Read [the Bee challenge](workshop/lessons/A1-bee.md) after Lesson 07.

## Repository Map

| Path | Contents |
| --- | --- |
| `apps/pocket-cinema/` | Source React Native app and port brief |
| `packages/workshop-harness/` | TypeScript harness and tests |
| `workshop/lessons/` | Source files for all website lessons |
| `workshop/workshop.data.js` | Generated website lesson data |
| `workshop/dry-run.md` | Instructor rehearsal |
| `workshop/instructor-guide.md` | Instructor schedule and teaching notes |
| `workshop/troubleshooting.md` | Error explanations and repair steps |
| `scripts/` | Website build and repository checks |

## Common Commands

Run these commands from the repository root:

```sh
yarn setup          # Install dependencies.
yarn verify         # Run types, tests, workshop checks, and site checks.
yarn build:site     # Generate website data from the lesson files.
yarn check:ste      # Check the project language rules.
yarn site           # Generate and serve the workshop website.
```

## Edit the Workshop

Edit lesson content only in `workshop/lessons/*.md`.
Do not edit `workshop/workshop.data.js` by hand.

After a lesson change, run:

```sh
yarn build:site
yarn verify
```

The language check applies the project rules for Simplified Technical English.
The check is not an ASD-STE100 certification.

## Scope

This repository contains the Past the Vibes workshop. It does not contain a
production release system or a complete TV application platform.

## License

MIT No Attribution. Read [LICENSE](LICENSE).

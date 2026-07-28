# Past the Vibes

Build and test a coding harness with
[Strands Agents SDK](https://github.com/strands-agents/harness-sdk). Use the
harness to port a React Native flow to Vega TV.

The model can inspect a guarded copy and propose files. The harness controls
writes, checks, retries, token and turn limits, and commits.

## Repository Contents

| Path | Contents |
| --- | --- |
| `packages/workshop-harness` | Six-phase porting harness |
| `apps/pocket-cinema` | React Native app for the exercises |
| `workshop` | Lessons, website, slides, fixtures, and instructor guides |

## What You Build

The workshop starts with one model call. The model returns a plausible port
proposal. The command does not apply or test the proposal.

You then add these controls:

1. Inspect the app in a guarded copy.
2. Plan with current Vega documents from ADBT MCP.
3. Validate and approve a typed screen and navigation plan.
4. Validate and write a typed patch.
5. Send compiler failures and ADBT MCP back to the repair model.
6. Build, start or reuse a VDA, install, start, and inspect the app.
7. Run the focus transition contract.
8. Control the complete run in a TUI.

Each lesson records a claim, independent evidence, and the remaining limit.

## Start

Install Node.js 20 or later and Git.

```sh
git clone https://github.com/giolaq/past-the-vibes-we.git
cd past-the-vibes-we
corepack enable
yarn setup
yarn verify
yarn site
```

Open `http://localhost:4173`. Start with **Before You Arrive**.

You can also open `workshop/index.html` directly.

## Select a Model

The live path supports:

- Claude Code CLI.
- Strands with Amazon Bedrock.
- Strands with OpenAI.
- Strands with OpenRouter.

Select one path before lesson 1. Store it in `workshop.config.json`.
Use the same path for all model phases. The configuration file contains no
credentials. `workshop/lessons/00-welcome.md` gives the values for each
provider. Use an exact model ID rather than a provider alias.

Both live executors use ADBT as an MCP server:

- Strands receives an in-process `McpClient`.
- Claude Code receives a pinned `--mcp-config`.

Both ADBT connections are read-only. The model has no shell or write tool.

## Product Input

The existing React Native app is the product input. It supplies the current
code, content, dependencies, and behavior.

Each source app also contains `workshop-brief.md`. The brief states the bounded
port goal, required flow, constraints, and verification. The harness supplies
it to the feasibility and phase prompts and records its hash in `run-spec.json`.

`workshop.config.json` selects model execution. Command flags set the phase,
seed, token and turn limits, and run ID. ADBT supplies external Vega knowledge.

The workshop does not use separate content, brand, or design input files.

## Commands

```sh
yarn setup          # Install all workshop packages.
yarn verify         # Run code, document, and site checks.
yarn replay         # Test the recorded recovery path.
yarn doctor         # Check the recorded recovery environment.
yarn site           # Start the workshop site on port 4173.
```

Run these commands from the repository root.

Before the first harness command, enter the harness package:

```sh
cd packages/workshop-harness
```

Keep this terminal in the package for lessons 1 through 7. Harness commands
then start with `yarn tsx src/index.ts`.

If Yarn reports that this directory belongs to another project, confirm that
you are in the directory that contains this README and the root `yarn.lock`.

If `npx` asks to download `tsx`, stop. Run `yarn setup` first.

If Node reports `NODE_TLS_REJECT_UNAUTHORIZED=0`, remove the unsafe setting:

```sh
unset NODE_TLS_REJECT_UNAUTHORIZED
```

Do not disable TLS certificate checks.

## Live and Recorded Evidence

Use a live model as the normal workshop path.

Use recorded data if an external service blocks an exercise. Recorded data
proves command order, retry behavior, and report format. It does not prove
what a live model or device did.

Lessons 4 through 6 need the Vega SDK. Device checks also need an attached
Vega Virtual Device. Use the supplied checkpoints when platform setup blocks
the lesson.

## Model Transcripts

Each model phase writes an append-only transcript:

```text
out/<runId>/model-logs/<phase>.jsonl
```

Read one transcript:

```sh
cd packages/workshop-harness
yarn tsx src/index.ts logs <runId> --phase plan
```

Add `--follow` during a live phase.

Transcripts can contain prompts, source excerpts, and tool results. They are
inside the ignored `out/` directory. Review them before you share them.

## Plan Approval

The `plan` phase writes `port-plan.json`. Its schema checks screen references,
Select and Back transitions, preserved behavior, and evidence mappings.

Review the product decisions, then approve the exact file:

```sh
cd packages/workshop-harness
yarn tsx src/index.ts approve-plan <runId> --yes
```

The harness records the plan and brief hashes in `port-plan-approval.json`.
Code and device phases refuse a missing or stale approval.

Keep the source app unchanged while one run ID is active. The harness records
the source fingerprint in `run-spec.json`. If the app or brief changes, start a
new run ID so one approval never covers two product inputs.

## Important Documents

| Path | Use |
| --- | --- |
| `workshop/README.md` | Attendee overview |
| `workshop/STE-STYLE.md` | Workshop writing standard |
| `workshop/instructor-guide.md` | Schedule and teaching rules |
| `workshop/dry-run.md` | Instructor rehearsal |
| `workshop/editing-guide.md` | Safe manual editing procedure |
| `workshop/troubleshooting.md` | Recovery procedures |
| `workshop/strands-constructs.md` | Strands code-reading guide |
| `workshop/lessons/*.md` | Source for the workshop website |
| `workshop/checkpoints` | Known recovery states |
| `workshop/fixtures` | Deterministic failures and recorded data |

## Scope

This repository contains workshop material. It does not contain the complete
TV Build product, release system, or historical plans.

## License

MIT No Attribution. Read [LICENSE](LICENSE).

# Before You Arrive

Allow about 20 minutes. Stop troubleshooting after 10 minutes and use replay. Live setup must not block the workshop.

## What runs the agent

[Strands Agents SDK](https://github.com/strands-agents/harness-sdk) is the in-process TypeScript runtime for the workshop's remote model path. The complete workshop harness pins `1.10.0`; the staged mini-harness pins `1.7.0`. We use it for:

- one bounded agent per phase;
- Bedrock, OpenAI, or OpenRouter model access;
- three Zod-typed, read-only project tools;
- schema-validated patch output;
- the native MCP connection to ADBT;
- token usage, turn limits, and cancellation.

The harness still owns the plan, approval, writes, checks, retry, Git commits, cost cap, and report. The model does not get a shell or a write tool.

Replay uses the same phase and evidence contracts without contacting a model or MCP server.

## 1. Check the basics

Install Node.js 20 or newer and Git. Clone the repository and open a terminal at its root. Enable Corepack so the repository's `packageManager` field selects Yarn 4.12.

After cloning, enter the repository once and keep this terminal at its root:

```sh
cd past-the-vibes-we
test -f package.json && test -f yarn.lock
corepack enable
```

The root `yarn.lock` keeps the workshop independent when it is cloned inside another Yarn project.

If you bring your own React Native app, check that it:

- runs before the workshop;
- has a clean Git status;
- contains no production secrets, private data, or protected media;
- can be shared with your chosen model provider.

`apps/pocket-cinema` is the supported fallback.

## 2. Install the workshop packages

```sh
unset NODE_TLS_REJECT_UNAUTHORIZED
yarn setup
```

If `NODE_TLS_REJECT_UNAUTHORIZED` was already unset, the command is harmless. Never install dependencies with TLS certificate verification disabled.

## 3. Run the setup check

```sh
yarn doctor
```

You are ready when the output reports success. If model or device checks fail, choose replay and continue.

To rehearse live ADBT context with the model and Vega device still replayed:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts doctor --replay --adbt-live --json
```

## 4. Choose one execution path

Replay needs no credentials:

```sh
yarn --cwd packages/mini-harness tsx steps/01-single-agent/index.ts run \
  steps/01-single-agent/fixtures/phases.json \
  --replay steps/01-single-agent/fixtures/demo-recording.json
```

For local Claude Code:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts doctor --executor claude-cli --json
```

For Strands with Bedrock:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts doctor --executor strands --provider bedrock --json
```

## 5. Optional Vega setup

Install Vega SDK `0.22.5875` and create a Vega Virtual Device. On the live Strands path the harness builds the ADBT `McpClient` and hands it to the agent during `analyze` and `plan`, so the model discovers ADBT's tools and calls `list_documents` / `read_document` itself; the harness then records what it read. Replay uses a committed ADBT context snapshot.

If you run the **Claude Code CLI** executor, register ADBT with the CLI once, up front (run in a real system terminal; it completes silently):

```sh
npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest init-context --agent claude-code-cli
npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest check-status --agent claude-code-cli
```

You do not need `init-context` for the replay or Strands paths — the harness owns the ADBT connection there. See the Vega docs: developer.amazon.com/docs/vega/0.22/mcp-server.html

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts doctor --replay --adbt-live --json
vega --version
vega virtual-device start --gui
```

Keep that terminal open. In a second system terminal, confirm that both checks show a running device:

```sh
vega virtual-device status
vega exec vda devices -l
```

You are ready for the live Vega exercise when the SDK prints `0.22.5875`, virtual-device status reports `running: true`, and `devices -l` lists an attached device. Otherwise choose replay. Do not spend workshop time repairing the device.

## Setup complete

Before the workshop, you should have:

- installed all three workspace packages;
- completed one replay run;
- chosen replay, Claude Code, or Strands;
- decided whether you will use Pocket Cinema or your own app.

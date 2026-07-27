---
id: welcome
number: "00"
nav: Start here
time: 20 minutes
title: Set up the workshop and understand the runtime
lead: Complete this setup before the workshop. Select one live model path. Use recorded data only if a live tool fails.
objective: Prepare one live executor. Identify the product input. Explain the functions of Strands, ADBT, the harness, and Git.
evidence: A source app with a workshop brief, a working executor, and a completed readiness list.
---

:::welcome Welcome to Past the Vibes
This workshop is four hours.
You will build a harness that ports a React Native app to Vega TV.
You will add one phase in each lesson.
Complete this setup before Lesson 1.
:::

:::concept Know the system
A harness is a TypeScript program.
It runs a fixed sequence of phases.
The model can inspect the app and propose files.
The model cannot write files or run shell commands.

The harness controls file writes, checks, retries, costs, commits, and reports.
The model makes a proposal.
The harness accepts or rejects the proposal.
:::

:::note Important rule
A plausible result is not necessarily a correct result.
Each phase must use an independent check.
:::

## Know the main terms

| Term | Meaning |
| --- | --- |
| Model | Software that produces a response from a prompt |
| Prompt | Instructions and context for the model |
| Agent | A model that can request tool operations |
| Tool | A function that the agent can request |
| Structured output | JSON data that must agree with a schema |
| MCP | A protocol that connects a model to external tools |
| ADBT | Amazon tools and documents for Vega development |
| Skill | Instructions for one technical task |
| Harness | The program that controls phases, checks, and writes |
| Executor | The component that sends prompts to a model |
| VDA | The Vega Virtual Device |
| Recorded fallback | Stored model and platform data for use after a live failure |

## Use the claim and evidence table

Use this table during the workshop.

| Model claim | Independent check | Evidence |
| --- | --- | --- |
| The model understands the app | Source inventory and recorded unknowns | `ANALYSIS.md` |
| The plan is correct | Schema checks and human approval | `port-plan.json` and its approval hash |
| The code is ready | Schema, file, and executable checks | Check results and Git commit |
| The app builds | Vega compiler | `.vpkg` file and build output |
| The app runs | Device log and two screenshots | Log file and image files |
| The remote works | Focus-transition test | `tv-focus-result.json` |

:::note Ask this question
When the model reports success, ask: **What independent component verified the result?**
:::

## Know the security boundary

:::flow
ADBT MCP | Supply Vega documents and tools
Model | Read the guarded copy and propose changes
Harness | Write files and run checks
Git | Record accepted changes
:::

The harness creates a guarded copy of the app.
The model receives read-only access to this copy.
The model does not receive a shell tool.
The model does not receive a file-write tool.

The harness validates all proposed file paths.
The harness writes only a valid structured patch.
If a check fails, the harness rejects the change.

:::snippet The system boundary
ADBT MCP ---> selected model ---> typed patch
    ^              |
    |              v
Vega documents   guarded app copy (read-only)
                       |
                       v
HARNESS: validate paths -> write files -> run checks -> retry -> commit -> report
>look: Strands receives a native McpClient. Claude Code receives an explicit --mcp-config. The harness controls all operations that change files or devices.
:::

## Know how Strands is used

[Strands Agents SDK](https://github.com/strands-agents/harness-sdk) is an agent runtime.
This workshop uses TypeScript SDK version `1.10.0`.

| Strands supplies | The harness supplies |
| --- | --- |
| Model provider adapters | Phase order |
| Agent loop | Protected file writes |
| Typed tools | Independent checks |
| Structured output | Retry control |
| MCP support | Cost limits |
| Token limits and cancellation | Git commits and reports |

Strands does not control the complete workflow.
The harness controls the workflow.

Lessons 1 through 6 contain a `Trace Strands` section.
Each section shows the relevant code and separates the Strands, harness, and
platform responsibilities.

## 1. Prepare your computer

:::steps
1. Install Node.js 20 or newer.
2. Install Git.
3. Make sure that Corepack is available.
4. Clone the repository.
5. Open a terminal in the repository root.
:::

:::command Clone the repository
git clone https://github.com/giolaq/past-the-vibes-we.git
cd past-the-vibes-we
:::

Select Pocket Cinema for the workshop:

```text
apps/pocket-cinema
```

Use your app only if it already runs.
Your app must have one working flow:

```text
launch -> screen -> action -> back
```

:::raw
<div class="grid"><article><h3>Pocket Cinema</h3><p>Use this app for the recommended path. All exercises and recovery files support it.</p><code>apps/pocket-cinema</code></article><article><h3>Your app</h3><p>Use one working flow. Use Pocket Cinema if source discovery takes more than 10 minutes.</p><code>launch -&gt; screen -&gt; action -&gt; back</code></article></div>
:::

:::visual
src: assets/pocket-cinema-android-tv.png
alt: Pocket Cinema home screen on an Android TV emulator
label: Actual Android TV capture
caption: "This image shows the React Native app before the Vega port. The app has no explicit TV focus behavior."
:::

## Know the product input

The workshop ports an existing app.
The app is the product input.

| Input | Function |
| --- | --- |
| Source app directory | Supplies the current code, content, dependencies, and behavior |
| `workshop-brief.md` | States the port goal, required flow, constraints, and verification |
| `workshop.config.json` | Selects the executor, provider, model, and region |
| Command flags | Set the phase, seed, cost limit, and run ID |
| ADBT MCP | Supplies current Vega documents during the run |
| Recordings | Supply recovery data after a live dependency fails |

The workshop does not use separate `content.json`, `brand.json`, or
`design.json` files. Those files belong to a generation harness. This
workshop ports the app that already exists.

:::steps
1. Open `apps/pocket-cinema/workshop-brief.md`.
2. Find the home-to-details flow.
3. Find the required Back behavior.
4. Find the replaceable behavior.
5. Confirm that the file contains no credentials or private data.
:::

The harness requires this file.
It records its SHA-256 hash.
It supplies the brief to feasibility, plan, and implementation prompts.
It also records a fingerprint of the source app in `run-spec.json`.
If the app or brief changes, start a new run ID.

### Do a safety check of your app

:::raw
<div class="checklist"><label><input type="checkbox">The app runs before the workshop</label><label><input type="checkbox"><code>workshop-brief.md</code> states one bounded flow</label><label><input type="checkbox">The Git working tree is clean</label><label><input type="checkbox">The app contains no production secrets</label><label><input type="checkbox">The app contains no private data</label><label><input type="checkbox">The app contains no protected media</label><label><input type="checkbox">The selected model provider can receive the app content</label></div>
:::

## 2. Install the workspace

Run these commands from the repository root:

:::command Install the workshop packages
unset NODE_TLS_REJECT_UNAUTHORIZED
corepack enable
yarn setup
:::

Stop if the installation fails.
Do not disable TLS certificate verification.

## 3. Verify the workspace

:::command Run the local verification
yarn verify
:::

This command verifies the harness, tests, documents, and website data.
It does not verify your model account.
It does not verify the Vega SDK or VDA.

### Verify the starting app

Enter the harness package.
Keep this terminal in this directory for lessons 1 through 7.

:::command Enter the harness package
cd packages/workshop-harness
:::

:::command Run the TV-readiness check
yarn tsx src/index.ts tv-check ../../apps/pocket-cinema
:::

:::expected
"tvReady": false
"failures": [
  "Focus state module: missing src/tv/focus-state.ts",
  "App wires shared focus state: src/App.tsx must contain \"./tv/focus-state\"",
  "Initial focus declared: src/App.tsx must contain \"hasTVPreferredFocus\"",
  "Vega package manifest: missing apps/vega/manifest.toml",
  ...
]
:::

The failure list identifies the work for the workshop.
Lesson 6 runs the same check on the ported app.

## 4. Select one live executor

Use the same executor, provider, and model in all lessons.
Do not change providers during the workshop.

Open `../../workshop.config.json`.
Replace its contents with one configuration from this section.

| Path | Configuration fields | Credential |
| --- | --- | --- |
| Claude Code CLI | `executor`, `model` | Authenticated Claude Code |
| Strands with Bedrock | `executor`, `provider`, `model`, `region` | AWS credentials and model access |
| Strands with OpenAI | `executor`, `provider`, `model` | `OPENAI_API_KEY` |
| Strands with OpenRouter | `executor`, `provider`, `model` | `OPENROUTER_API_KEY` |
| Recorded fallback | `--replay <recording.json>` | No credential |

With Claude Code, the harness starts the `claude` command.
The harness sends the prompt through standard input.
Claude Code returns stream JSON.

With Strands, the SDK calls the selected provider.
No model CLI is necessary.

### Configure Claude Code

```json
{
  "executor": "claude-cli",
  "model": "sonnet"
}
```

### Configure Strands with Bedrock

```json
{
  "executor": "strands",
  "provider": "bedrock",
  "model": "anthropic.claude-3-5-sonnet-20241022-v2:0",
  "region": "us-west-2"
}
```

### Configure Strands with OpenAI

```json
{
  "executor": "strands",
  "provider": "openai",
  "model": "gpt-4.1"
}
```

### Configure Strands with OpenRouter

```json
{
  "executor": "strands",
  "provider": "openrouter",
  "model": "anthropic/claude-sonnet-4"
}
```

### Verify the selected configuration

:::command Verify the model environment
yarn tsx src/index.ts doctor --json
:::

The harness automatically loads `../../workshop.config.json`.
Command-line model flags override the file for one command.

:::note Protect credentials
Keep credentials in your terminal or credential manager.
Do not put credentials in the repository.
Do not commit credentials in an `.env` file.
:::

:::note Select one live path
You do not need all providers.
Save one configuration.
Run the `doctor` command.
If one repair fails, use the recorded fallback for that exercise.
:::

## 5. Prepare ADBT

Both live executors use ADBT through MCP.
Strands receives an ADBT `McpClient`.
Claude Code receives an explicit MCP configuration.

The harness starts the pinned ADBT server.
Install the ADBT skills one time:

:::command Install the pinned ADBT skills
npx -y @amazon-devices/amazon-devices-buildertools-mcp@1.0.5 \
  init-context --agent claude-code-cli --force
:::

:::command Verify the ADBT skill installation
npx -y @amazon-devices/amazon-devices-buildertools-mcp@1.0.5 \
  check-status --agent claude-code-cli
:::

During a live phase, the model selects the ADBT documents that it needs.
The harness records the document names and SHA-256 hashes.
The phase fails if it requires ADBT but reads no ADBT document.

## 6. Prepare Vega

Lesson 4 requires Vega SDK version `0.22.5875`.
Lesson 5 requires an attached VDA.
Lesson 6 uses the focus test and device images.

In a system terminal, run:

:::command Start the Vega environment
cd packages/workshop-harness
yarn tsx src/index.ts doctor --adbt-live --json
vega --version
vega virtual-device start --gui
:::

Keep this terminal open.

In a second terminal, run:

:::command Verify the SDK and device
vega --version
vega virtual-device status
vega exec vda devices -l
:::

The environment is ready when all these conditions are true:

- The SDK reports version `0.22.5875`.
- The virtual-device status reports `running: true`.
- The device list contains a device.

A successful command with an empty device list is not sufficient.

:::fallback
Try one repair if a live service fails.
Do not use more than 10 minutes for the repair.
Then use the recorded fallback for the blocked exercise.

A recorded fallback verifies the harness control flow.
It does not verify your model, compiler, or device.
:::

## Setup checklist

:::raw
<div class="checklist"><label><input type="checkbox">Node.js 20 or newer is available</label><label><input type="checkbox">Git and Corepack are available</label><label><input type="checkbox"><code>yarn setup</code> is complete</label><label><input type="checkbox"><code>yarn verify</code> passes</label><label><input type="checkbox">I selected one executor, provider, and model</label><label><input type="checkbox">The matching <code>doctor</code> command passes</label><label><input type="checkbox">I selected Pocket Cinema or verified my app</label><label><input type="checkbox">The source app contains <code>workshop-brief.md</code></label><label><input type="checkbox">The Vega SDK is ready for Lesson 4</label><label><input type="checkbox">The VDA is ready for Lesson 5</label><label><input type="checkbox">I know that recorded data is only a fallback</label><label><input type="checkbox">I can explain what Strands supplies</label><label><input type="checkbox">I can explain what the harness controls</label></div>
:::

:::knowledge What is the most important boundary?
The model can inspect the app and propose changes.
The harness controls writes, checks, retries, costs, commits, and reports.
ADBT supplies Vega knowledge through MCP.
:::

:::done
The workspace passes all local checks.
One live executor is ready.
You know which app you will use.
For live platform evidence, the Vega SDK and VDA are also ready.
:::

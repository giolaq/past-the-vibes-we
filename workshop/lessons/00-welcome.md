---
id: welcome
number: '00'
nav: Start here
time: 20 minutes
title: Set up the workshop and learn the harness
lead: Prepare the workshop workspace. The workspace contains the project packages and dependencies. A model executor connects the harness to a model.
objective: Explain the function of the harness. Prepare the project, one model connection, Amazon Devices Builder Tools (ADBT), the Vega software development kit (SDK), and the Vega Virtual Device (VDA).
evidence: A verified workspace and one configured executor.
---

:::welcome Set up the workshop and learn the harness
Lesson 00 prepares all tools for the workshop.
You will install the project dependencies and configure one model connection that sends real requests.
You will prepare Amazon Devices Builder Tools, the Vega software development kit, and the Vega Virtual Device.

You will also learn how the harness works before you run its first phase.
:::

:::concept Understand the harness
An Agent harness is the software infrastructure around a large language model (LLM).
The harness turns model reasoning into actions that software can control and verify.
Typical components include tools, an isolated execution environment, and context management.
A tool is a function that the model can request.
An isolated execution environment limits what the model can read or change.
Context management selects the instructions and project information that the model receives.

In this workshop, the harness is a phase pipeline written in TypeScript.
The pipeline contains six ordered phases:

`analyze -> plan -> port -> build -> launch -> test`

The `analyze` phase reads the existing app.
The `plan` phase defines the required TV interaction.
The `port` phase changes the app source.
The `build` phase compiles an installable TV app package.
The `launch` phase starts the package on a TV device.
The `test` phase checks remote-control navigation.

Each phase has a defined goal, input, check, and result.
A phase can call a model and give the model selected tools.
The model can inspect the app and propose changes.
The model cannot write files or run shell commands.
The harness controls file writes, independent checks, retries, usage limits, Git commits, and reports.

The harness records evidence that you can inspect after each phase.
:::

## Know the main terms

| Term                                                                                               | Function in this workshop                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Strands Agents SDK](https://strandsagents.com/)                                                   | An open-source software development kit for AI agents in Python and TypeScript. The harness uses the TypeScript SDK for model access, tool operations, JavaScript Object Notation (JSON) responses with required fields, and Model Context Protocol (MCP) connections. |
| [Vega OS](https://developer.amazon.com/docs/vega/0.22/vega-get-started.html)                       | The target TV operating system. The Vega SDK provides tools to build, run, test, and debug Vega apps.                                                                                                                                                                  |
| [Amazon Devices Builder Tools (ADBT)](https://developer.amazon.com/docs/vega/0.23/mcp-server.html) | A package that gives AI agents Amazon Devices tools and documents. This workshop connects the model to ADBT through MCP.                                                                                                                                               |

## 1. Prepare your tools

[Node.js](https://nodejs.org/en/download) runs the TypeScript harness.
[Git](https://git-scm.com/downloads) records accepted source changes.
[Corepack](https://github.com/nodejs/corepack) activates the Yarn package manager used by this repository.

:::yourturn
Install the required command-line tools.
Clone the workshop repository.
:::

:::steps

1. Install [Node.js](https://nodejs.org/en/download) 20 or newer.
2. Install [Git](https://git-scm.com/downloads).
3. Make sure that [Corepack](https://github.com/nodejs/corepack) is available.
4. Clone the repository.
5. Open a terminal in the repository root.
   :::

:::command Clone the repository
git clone https://github.com/giolaq/past-the-vibes-we.git
cd past-the-vibes-we
:::

The workshop uses a sample React Native app named Pocket Cinema.
The app source is in:

```text
apps/pocket-cinema
```

:::visual
src: assets/pocket-cinema-android-tv.png
alt: Pocket Cinema home screen on an Android TV emulator
label: Actual Android TV capture
caption: "This image shows the React Native app before the Vega port. The app has no explicit TV focus behavior."
:::

The starting app does not contain explicit rules for the TV focus.

## Know what the harness receives

The harness receives five types of input.
Each input has a different purpose.

| Input type         | Source                 | Purpose                                                                |
| ------------------ | ---------------------- | ---------------------------------------------------------------------- |
| Existing product   | Source app directory   | Supplies the code, content, design, dependencies, and current behavior |
| Port requirements  | `workshop-brief.md`    | Defines the required TV flow, constraints, and completion evidence     |
| Model connection   | `workshop.config.json` | Stores the model settings described in section 4                       |
| Run settings       | Command flags          | Select the phases, run ID, creative seed, and optional usage limits    |
| Platform knowledge | ADBT MCP               | Supplies current Vega documents to the model                           |

The source app and `workshop-brief.md` define the product work.
The run settings control how the harness does that work.
ADBT supplies Vega knowledge but does not define the product.

A run ID is the name of one pipeline run and its directory under `out/`.

The Pocket Cinema requirements are in
`apps/pocket-cinema/workshop-brief.md`.

## 2. Install the workspace

The workspace is the repository packages and their shared dependencies.
Yarn manages this workspace.
A dependency is a software package that the project uses.

Transport Layer Security (TLS) certificate verification protects package downloads.
The first command removes an unsafe TLS override if that override exists.

Run these commands from the repository root:

:::command Install the workshop packages
unset NODE_TLS_REJECT_UNAUTHORIZED
corepack enable
yarn setup
:::

The `corepack enable` command makes the repository version of Yarn available.
The `yarn setup` command installs the workspace dependencies.

## 3. Verify the workspace

:::command Run the local verification
yarn verify
:::

This command checks TypeScript for type errors.
The command also runs automated tests, document checks, and website checks.
The command does not call a model or start a Vega device.

### Verify the starting app

The harness package is the `packages/workshop-harness` directory.
Enter the harness package.
Keep this terminal in this directory for lessons 1 through 7.

:::command Enter the harness package
cd packages/workshop-harness
:::

The `yarn tsx` command runs a TypeScript command-line program.
The `tv-check` command reads the app files and checks for required TV support.
The command does not build or start the app.

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

This failure is the expected starting result.
The failure list identifies the missing TV support that the workshop will add.
Lesson 6 runs the same check on the ported app.

## 4. Select one live executor

A live executor sends prompts to an actual model.
The executor is the code path that sends the prompt and receives the model response.
The provider is the service that hosts the model.
The model ID is the provider name for a specific model.

Use the same executor, provider, and model in all lessons.
Do not change providers during the workshop.

Open `../../workshop.config.json`.
You are in `packages/workshop-harness`, so `../..` points to the repository root.
Replace the file contents with one configuration from this section.
Select any model that the executor and provider support.
Use the exact model name or provider model ID.

| Path                    | Configuration fields                      | Credential                       |
| ----------------------- | ----------------------------------------- | -------------------------------- |
| Claude Code CLI         | `executor`, `model`                       | Authenticated Claude Code        |
| Strands with Bedrock    | `executor`, `provider`, `model`, `region` | AWS credentials and model access |
| Strands with OpenAI     | `executor`, `provider`, `model`           | `OPENAI_API_KEY`                 |
| Strands with OpenRouter | `executor`, `provider`, `model`           | `OPENROUTER_API_KEY`             |

CLI means command-line interface.
With Claude Code CLI, the harness starts your authenticated `claude` command.
Authenticated means that you signed in to Claude Code before the workshop.

With Strands, the SDK sends the request to the selected provider.

### Configure Claude Code

```json
{
  "executor": "claude-cli",
  "model": "claude-sonnet-4-6"
}
```

Use an exact Claude model name.
Do not use an alias such as `sonnet`, `opus`, or `haiku`.
If your organization manages Claude Code, select a name from `availableModels` in
`~/.claude/settings.json`.

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

The `doctor` command checks the selected executor, credentials, and required programs.
The `--json` flag prints the result as machine-readable JSON.
The harness automatically loads `../../workshop.config.json`.
Command-line model flags override the file for one command.

## 5. Prepare ADBT

The harness uses ADBT through MCP.
Strands creates an MCP client for ADBT.

## 6. Prepare Vega

Lesson 4 requires Vega SDK version `0.23.9221`.
Use the [Vega installation guide](https://developer.amazon.com/docs/vega/0.23/install-vega-sdk.html)
to install this SDK version.

The Vega Virtual Device (VDA) is a software TV device that runs on your computer.
Lesson 5 requires an installed VDA.
The harness starts the VDA when no device is attached.
Lesson 6 sends remote-control keys and reads the focused control.

Use your terminal application for the setup commands.
Do not run the setup commands inside a model chat.
The `doctor --adbt-live` command checks a live ADBT connection.

:::command Start the Vega environment
cd packages/workshop-harness
yarn tsx src/index.ts doctor --adbt-live --json
vega --version
vega virtual-device start --gui
:::

The `--gui` option opens the VDA window.
You can start the VDA before Lesson 5.
The early VDA start is optional.
The launch phase runs the same command when no device is attached.

In a second terminal, run:

:::command Verify the SDK and device
vega --version
vega virtual-device status
vega exec vda devices -l
:::

The last command lists devices that the Vega CLI can contact.
The environment is ready when all these conditions are true:

- The SDK reports version `0.23.9221`.
- The virtual-device status reports `running: true`.
- The device list contains an attached device.

An attached device is a VDA or physical Vega device that the Vega CLI can contact.
A successful command with an empty device list does not prove that a device is attached.

:::done
The workspace passes all local checks.
One live executor is ready.
For live platform evidence, the Vega SDK and VDA are also ready.
:::

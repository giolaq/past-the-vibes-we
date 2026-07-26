---
id: welcome
number: "00"
nav: Start here
time: 20 minutes
title: Set up the workshop and understand the runtime
lead: Welcome — get this done before we start, and you'll spend the session building instead of installing. Lesson 4 needs the Vega SDK for a live build, and lesson 5 needs a virtual device. Every lesson also runs from recordings.
objective: Choose a reliable workshop path and explain where Strands, ADBT, the harness, and Git each fit.
evidence: A successful replay run, one chosen execution path, and a completed readiness checklist.
---

:::welcome Welcome to Past the Vibes
Over the next four hours we build a harness that ports a React Native app to Vega TV, one phase per lesson: analyze the app, plan the TV port, write it, build it, run it on a device, and prove the remote works. You'll leave with the harness itself, pointed at your own codebase. This page is the setup — work through it before we begin, then meet us at lesson 1.
:::

:::concept Read this first if you have never built an agent harness
You are a React Native developer. You may have never touched an "agent," an "LLM tool," or "MCP." That's fine — nothing here assumes you have. We will port a small RN app to Vega (Amazon's TV OS) without doing it by hand and without just asking an AI to "please port my app." Instead we build a <strong>harness</strong> with AWS Strands Agents SDK: a plain TypeScript program that runs a fixed pipeline, lets an AI model <em>propose</em> code inside tight walls, and keeps every dangerous action — writing files, running checks, committing to Git, spending money, talking to the device — for itself. That structure is why you're here rather than just prompting a coding agent: the harness gives you control (your code owns every write, check, and dollar) and observability (every model turn, document read, cost, and commit is recorded). And it's reusable — swap the skills, the MCP server, or the executor, and the same pipeline works on your own project, driven by the CLI coding agent you already use or directly by Strands + Bedrock.
:::

:::note The one sentence to remember
The model is a contractor with read-only access. The harness is the foreman: it checks the work and decides what gets in.
:::

<h2>Vocabulary, translated for a React Native dev</h2>
      <p>You already know these ideas under other names. Here's the dictionary; the rest of the workshop uses these words.</p>

:::raw
<table><thead><tr><th>Term</th><th>What it actually is</th><th>Your mental model</th></tr></thead><tbody><tr><td><strong>LLM / model</strong></td><td>A program that turns text in into text out. Given a prompt, it returns a guess. Claude is one.</td><td>A well-read intern who writes plausible code but never runs it.</td></tr><tr><td><strong>Prompt</strong></td><td>The text you send the model.</td><td>The Jira ticket plus all the context you paste in.</td></tr><tr><td><strong>Agent</strong></td><td>A model wired to a loop where it can call functions ("tools"), see the result, and decide what to do next.</td><td>An intern who can grep your repo before answering, several times.</td></tr><tr><td><strong>Tool</strong></td><td>A named function you expose to the model, with a typed signature. The model <em>requests</em> a call; your code runs it and returns the result.</td><td>A locked-down CLI you hand the intern: <code>read_file</code>, <code>list_files</code>, nothing else.</td></tr><tr><td><strong>Structured output</strong></td><td>Forcing the model to answer as JSON matching a schema, not free prose.</td><td>A required PR template the intern cannot deviate from.</td></tr><tr><td><strong>MCP</strong></td><td><a href="https://modelcontextprotocol.io" target="_blank" rel="noopener">Model Context Protocol</a> — a standard so one program can start another as a "server" and call its tools.</td><td>Starting a language server (LSP) and querying it, but for arbitrary tools.</td></tr><tr><td><strong>ADBT</strong></td><td><a href="https://www.npmjs.com/package/@amazon-devices/amazon-devices-buildertools-mcp" target="_blank" rel="noopener">Amazon Devices Builder Tools</a>, exposed here as an MCP server serving Vega migration docs.</td><td>An internal wiki you can query programmatically.</td></tr><tr><td><strong>Skill</strong></td><td>A block of domain instructions ("how to do TV focus") kept separate from code.</td><td>A runbook you paste into the ticket for one task.</td></tr><tr><td><strong>Harness</strong></td><td>The deterministic TypeScript program orchestrating all of the above.</td><td>Your CI pipeline, if CI could also call an intern mid-step.</td></tr><tr><td><strong>Replay</strong></td><td>Running the pipeline against <em>recorded</em> model answers instead of a live model.</td><td>Fixtures / VCR cassettes for network calls.</td></tr><tr><td><strong>VDA</strong></td><td>Vega Virtual Device — an emulator for the TV OS.</td><td>Android emulator, but for Vega.</td></tr></tbody></table>
:::

:::note The single most important idea
An LLM generates <em>plausible</em> text, and plausible is not the same as correct: <code>plausible &ne; verified</code>. Everything the harness does closes that gap. Every phase ends in a mechanical check, not a vibe.
:::

<h2>Who is allowed to do what</h2>
      <p>This is the security model:</p>

:::flow
ADBT MCP | Approved Vega context
Strands or Claude | Read and propose
Harness | Write and check
Git | Commit evidence
:::

:::snippet The boundary, in one diagram
ADBT (MCP server) <--- model calls list_documents / read_document itself ---+
                                                                            |
guarded app copy  <--- read-only tools (list/read/search) -----------------+--> selected agent --> typed patch {summary, files}
                                                                            |
                                                                            v
     HARNESS: reconstruct + hash ADBT reads -> validate paths -> write files -> run checks -> retry -> git commit -> report
>look: Both live executors receive the same pinned ADBT stdio MCP server. Strands gets a native <code>McpClient</code>; Claude Code gets an explicit <code>--mcp-config</code>. Both can read and search the guarded app and call ADBT, but neither gets a shell or write tool. The harness reconstructs and hashes the ADBT reads, then applies only the validated patch. Everything with consequences stays in <code>packages/workshop-harness/src/port-pipeline.ts</code>.
:::

<p>The strictness has a reason: a model with a write tool or a shell can corrupt your repo on one confident wrong guess. Keep irreversible actions in deterministic code, and the worst a bad answer can do is <em>fail a check and get rejected</em>. From lesson 4 on, those checks stop being file assertions and become a compiler and a device.</p>

:::note What is Strands Agents SDK?
<a href="https://github.com/strands-agents/harness-sdk" target="_blank" rel="noopener">Strands</a> is AWS's open-source agent runtime (TypeScript and Python), used here as the live remote path, pinned at 1.10.0. It fits this workshop for two reasons: the plumbing (provider adapters, typed tools, structured output, limits, cancellation, usage metrics) is built in, and it's a library, not a framework — it doesn't try to own writes or orchestration, so the harness boundary stays where we put it.
:::

:::raw
<table><thead><tr><th>Strands supplies</th><th>The harness owns</th></tr></thead><tbody><tr><td>Agent loop and model providers</td><td>Phase order and approval</td></tr><tr><td>Read-only typed tools</td><td>Protected file writes</td></tr><tr><td>Validated patch output</td><td>Checks, retry, and Git commits</td></tr><tr><td>MCP client and metrics</td><td>Cost cap, replay, and report</td></tr></tbody></table>
:::

<p>The port agent can list, read, and search the guarded app. The feasibility audit and plan phase also receive ADBT's own tools (<code>list_documents</code>, <code>read_document</code>, <code>search_documentation</code>) through MCP. The harness does not pre-pick what the model reads. After each live call, it walks the tool history and records every ADBT read with a SHA-256 hash. A live phase fails if it claims ADBT guidance without reading a document. Replay uses recorded model turns and recorded ADBT context, so it needs no live model or MCP server.</p>

<h2>1. Check the basics</h2>

:::steps
1. Install Node.js 20 or newer and Git. [Corepack](https://nodejs.org/api/corepack.html) supplies Yarn 4.12.
2. Clone this repository, run `cd past-the-vibes-we`, and keep the terminal at that root.
3. Choose Pocket Cinema unless your own React Native app already runs.
:::

:::raw
<div class="grid"><article><h3>Pocket Cinema</h3><p>Recommended. Every exercise, recording, and checkpoint supports this app.</p><code>apps/pocket-cinema</code></article><article><h3>Your app</h3><p>Use one working flow: launch → screen → action → back. Switch to Pocket Cinema if discovery takes more than 10 minutes.</p><code>launch → screen → action → back</code></article></div>
:::

:::visual
src: assets/pocket-cinema-android-tv.png
alt: Pocket Cinema home screen running on an Android TV emulator, with a featured title and a horizontal content rail
label: Actual Android TV capture
caption: "Pocket Cinema is the shared starting app. This is the unported React Native baseline running on the workshop's Android TV AVD; later lessons add explicit focus behavior and a separate Vega package."
:::

<h3>Bring-your-own-app safety check</h3>

:::raw
<div class="checklist"><label><input type="checkbox">The app runs before the workshop</label><label><input type="checkbox">Git status is clean</label><label><input type="checkbox">It contains no production secrets or private data</label><label><input type="checkbox">It contains no protected media</label><label><input type="checkbox">It can be shared with the chosen model provider</label></div>
:::

<h2>2. Install the workshop workspace</h2>

:::command Install all workshop packages
unset NODE_TLS_REJECT_UNAUTHORIZED
corepack enable
yarn setup
:::

<h2>3. Run the setup check</h2>

:::command Check the key-free replay path
yarn doctor
yarn replay
:::

<p>You are ready when doctor reports <code>state: ready</code> and replay prints a plan. Model and Vega checks are optional in replay mode.</p>

:::command Optional: check live ADBT with everything else replayed
yarn --cwd packages/workshop-harness tsx src/index.ts doctor --adbt-live --json
:::

<h3>Prove the starting point is not TV-ready</h3>
      <p>Don't take our word that Pocket Cinema is touch-only — run the TV-readiness check against it. The same command goes green on the ported copy in lesson 7. If you brought your own app, run it on that too:</p>

:::command Run the TV-readiness check on the starter app
yarn --cwd packages/workshop-harness tsx src/index.ts tv-check ../../apps/pocket-cinema
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

<p>That failure list is the workshop's to-do list: everything on it is produced by the port in lesson 3 and verified mechanically in lesson 6.</p>

<h2>4. Choose one execution path</h2>

Replay is the room-wide default. A live model is optional. If you use one, choose the executor,
provider, and model here and keep the same choice for every live command.

:::raw
<table><thead><tr><th>Path</th><th>Executor flags</th><th>Credential</th></tr></thead><tbody><tr><td>Replay — recommended</td><td><code>--replay &lt;recording.json&gt;</code></td><td>None. No model runs.</td></tr><tr><td>Claude Code CLI</td><td><code>--executor claude-cli --model sonnet</code></td><td><a href="https://code.claude.com/docs" target="_blank" rel="noopener">Claude Code</a> installed and already authenticated</td></tr><tr><td>Strands + Bedrock</td><td><code>--executor strands --provider bedrock --model &lt;Bedrock model id&gt; --region &lt;region&gt;</code></td><td><code>AWS_PROFILE</code> or <code>AWS_ACCESS_KEY_ID</code>, plus model access</td></tr><tr><td>Strands + OpenAI</td><td><code>--executor strands --provider openai --model &lt;OpenAI model id&gt;</code></td><td><code>OPENAI_API_KEY</code></td></tr><tr><td>Strands + OpenRouter</td><td><code>--executor strands --provider openrouter --model &lt;OpenRouter model id&gt;</code></td><td><code>OPENROUTER_API_KEY</code></td></tr></tbody></table>
:::

`--executor` selects how the harness talks to a model. `--provider` is used only by the Strands
executor. `--model` is the exact model id understood by Claude Code or that provider. ADBT is
still supplied by the harness through MCP in both live executor paths.

With Claude Code, authenticate once and then run the harness command — do not open a separate
interactive Claude session. The harness starts `claude`, sends the phase prompt through stdin, and
reads stream JSON back. With Strands, no model CLI is involved; the SDK calls the selected provider
inside the harness process.

### Use the same choice in every lesson

Live commands in the lessons show the Claude Code flags
`--executor claude-cli --model sonnet`.

If you chose Strands, replace only that line with one of these. Keep the app path, inputs,
phase, run id, seed, confirmation, and budget unchanged:

:::snippet Strands executor replacements
# Bedrock
--executor strands --provider bedrock \
--model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2

# OpenAI
--executor strands --provider openai --model gpt-4.1

# OpenRouter
--executor strands --provider openrouter --model anthropic/claude-sonnet-4
>look: Choose one pair of provider and model flags. Do not combine them.
:::

Those are the defaults currently encoded in `src/model-factory.ts`; you can replace the model
id with another tool-capable model available to your account. The optional screenshot review also
needs image input. For a model absent from the harness pricing table, add both `--input-rate` and
`--output-rate` in USD per million tokens. Read the rates from your provider. Do not guess them.

:::note Keep credentials out of the repository
Configure the required credential in your terminal or normal credential manager. Never put an
API key in the app, an input fixture, a lesson command, or a committed `.env` file.
:::

### Check the exact selection

Run `doctor` with the same flags you will use for the lessons:

:::command Claude Code: check the local executor
yarn --cwd packages/workshop-harness tsx src/index.ts doctor \
  --executor claude-cli --model sonnet --json
:::

:::command Strands + Bedrock
yarn --cwd packages/workshop-harness tsx src/index.ts doctor \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 \
  --region us-west-2 --json
:::

:::command Strands + OpenAI
yarn --cwd packages/workshop-harness tsx src/index.ts doctor \
  --executor strands --provider openai --model gpt-4.1 --json
:::

:::command Strands + OpenRouter
yarn --cwd packages/workshop-harness tsx src/index.ts doctor \
  --executor strands --provider openrouter \
  --model anthropic/claude-sonnet-4 --json
:::

:::command Fallback: check the key-free replay path
yarn doctor
:::

:::note Pick one live executor
You need one path, not every path. `doctor` checks that the command or credential exists; the first
`analyze` call confirms that your account can use the selected model. If that call fails, save the
error and use the replay fallback. Do not spend the workshop switching providers.
:::

<h2>5. Vega SDK and VDA — optional live evidence</h2>
      <p>Lesson 4 needs Vega SDK <code>0.22.5875</code> to produce a real <code>.vpkg</code>. Lesson 5 needs an attached Vega Virtual Device to install, launch, filter the app's logs from the launch time, and pull two frames. Lesson 6 runs the host-side focus contract and reuses those frames; it does not press a device button. Every lesson has a recorded fallback labeled <code>evidenceMode: replay</code>. Replay proves the harness control flow, not a build or device result.</p>
      <p>How ADBT reaches the model depends on your executor:</p>
      <ul>
        <li><strong>Replay (default)</strong>: recorded context, no <code>init-context</code>, no install.</li>
        <li><strong>Strands</strong>: the harness creates an ADBT <code>McpClient</code> and hands it to the agent.</li>
        <li><strong>Claude Code CLI</strong>: the harness passes the same pinned server in <code>--mcp-config</code> with <code>--strict-mcp-config</code>. It does not rely on a user's global MCP settings.</li>
      </ul>

<p>The harness starts MCP itself for both live executor paths. Run <code>init-context</code> once only to install the <code>amazon-devices-vega-*</code> skills:</p>

:::command Install the pinned ADBT skills (one time)
# Run in a system terminal (not inside the agent).
# --force skips the confirmation prompts.
npx -y @amazon-devices/amazon-devices-buildertools-mcp@1.0.5 init-context --agent claude-code-cli --force
:::

:::command Verify the ADBT MCP setup
npx -y @amazon-devices/amazon-devices-buildertools-mcp@1.0.5 check-status --agent claude-code-cli
:::

:::note Where these come from
Amazon Devices Builder Tools ships the ADBT MCP server, skills, and steering docs as one pinned npm package: over 400 current Vega documents — migration workflows, knowledge-base pages, prompts — plus ten agent skills, served from a local process. In this workshop the harness starts that process itself, so live runs do not depend on your agent's global MCP config. <code>init-context</code> installs the skills used for phase guidance; <code>check-status</code> confirms them. With ADBT MCP, the model reads the vendor's current guidance instead of guessing Vega APIs from memory. See the <a href="https://developer.amazon.com/docs/vega/0.22/mcp-server.html" target="_blank" rel="noopener">Vega ADBT setup docs</a>.
:::

<p>The Claude executor uses <code>--tools Read,Grep,Glob</code>, explicitly denies shell and write tools, and permits only the named ADBT MCP tools. It fingerprints the guarded copy before and after the subprocess call; any direct change fails and is rolled back. The only accepted write is the typed patch that passes the harness path checks.</p>

:::command Check ADBT and start VDA in a system terminal
yarn --cwd packages/workshop-harness tsx src/index.ts doctor --adbt-live --json
vega --version
vega virtual-device start --gui
:::

<p>Keep that terminal open. In a second system terminal, run:</p>

:::command Confirm the SDK and attached device
# Run this in a second system terminal.
vega --version
vega virtual-device status
vega exec vda devices -l
:::

:::note Live Vega is ready only when {success}
The SDK prints 0.22.5875, virtual-device status reports running: true, and devices -l lists an attached device.
:::

:::fallback
Try one repair for no more than 10 minutes. Then use replay. Do not spend workshop time repairing a model account or device.
:::

<h2>Setup complete</h2>

:::raw
<div class="checklist"><label><input type="checkbox">Node 20+, Git, and Corepack are available</label><label><input type="checkbox">The workspace packages are installed</label><label><input type="checkbox">The replay plan completed</label><label><input type="checkbox">I chose replay or wrote down one executor/provider/model combination and its doctor check passed</label><label><input type="checkbox">I chose Pocket Cinema or checked my own app</label><label><input type="checkbox">For live evidence: Vega SDK is ready for lesson 4 and VDA is ready for lesson 5</label><label><input type="checkbox">I can explain what Strands supplies and what the harness owns</label></div>
:::

:::knowledge What is the most important boundary in this workshop?
The model can inspect and propose, but the harness controls approval, protected writes, verification, retries, cost, commits, and reports. ADBT supplies selected platform knowledge; it does not take over the run.
:::

:::done
The workspace is installed, the replay plan succeeds, one execution path is chosen, and you know which app you will use. If you chose live evidence, the SDK and VDA checks also pass.
:::

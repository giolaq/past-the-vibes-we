---
id: welcome
number: "00"
nav: Start here
time: 20 minutes
title: Set up the workshop and understand the runtime
lead: Complete this page before lesson 1. Stop troubleshooting after 10 minutes and use replay. A live model or Vega device must never block the workshop.
objective: Choose a reliable workshop path and explain where Strands, ADBT, the harness, and Git each fit.
evidence: A successful replay run, one chosen execution path, and a completed readiness checklist.
---

:::concept Read this first if you have never built an agent harness
You are a React Native developer. You may have never touched an "agent," an "LLM tool," or "MCP." That is fine — nothing here assumes you have. We will port a small RN app to Vega (Amazon's TV OS) without doing it by hand and without just asking an AI to "please port my app." Instead we build a <strong>harness</strong>: a plain TypeScript program that runs a fixed pipeline, lets an AI model <em>propose</em> code inside tight walls, and keeps every dangerous action — writing files, running checks, committing to Git, spending money, talking to the device — for itself.
:::

:::note The one sentence to remember
The model is a contractor with read-only access. The harness is the foreman who inspects the work, keeps the receipts, and signs off. The model proposes; the harness disposes.
:::

<h2>Vocabulary, translated for a React Native dev</h2>
      <p>You already know these ideas under other names. Here is the dictionary — the rest of the workshop uses these words.</p>

:::raw
<table><thead><tr><th>Term</th><th>What it actually is</th><th>Your mental model</th></tr></thead><tbody><tr><td><strong>LLM / model</strong></td><td>A program that turns text in into text out. Given a prompt, it returns a guess. Claude is one.</td><td>A well-read intern who writes plausible code but never runs it.</td></tr><tr><td><strong>Prompt</strong></td><td>The text you send the model.</td><td>The Jira ticket plus all the context you paste in.</td></tr><tr><td><strong>Agent</strong></td><td>A model wired to a loop where it can call functions ("tools"), see the result, and decide what to do next.</td><td>An intern who can grep your repo before answering, several times.</td></tr><tr><td><strong>Tool</strong></td><td>A named function you expose to the model, with a typed signature. The model <em>requests</em> a call; your code runs it and returns the result.</td><td>A locked-down CLI you hand the intern: <code>read_file</code>, <code>list_files</code>, nothing else.</td></tr><tr><td><strong>Structured output</strong></td><td>Forcing the model to answer as JSON matching a schema, not free prose.</td><td>A required PR template the intern cannot deviate from.</td></tr><tr><td><strong>MCP</strong></td><td><a href="https://modelcontextprotocol.io" target="_blank" rel="noopener">Model Context Protocol</a> — a standard so one program can start another as a "server" and call its tools.</td><td>Starting a language server (LSP) and querying it, but for arbitrary tools.</td></tr><tr><td><strong>ADBT</strong></td><td><a href="https://www.npmjs.com/package/@amazon-devices/amazon-devices-buildertools-mcp" target="_blank" rel="noopener">Amazon Devices Builder Tools</a>, exposed here as an MCP server serving Vega migration docs.</td><td>An internal wiki you can query programmatically.</td></tr><tr><td><strong>Skill</strong></td><td>A block of domain instructions ("how to do TV focus") kept separate from code.</td><td>A runbook you paste into the ticket for one task.</td></tr><tr><td><strong>Harness</strong></td><td>The deterministic TypeScript program orchestrating all of the above.</td><td>Your CI pipeline, if CI could also call an intern mid-step.</td></tr><tr><td><strong>Replay</strong></td><td>Running the pipeline against <em>recorded</em> model answers instead of a live model.</td><td>Fixtures / VCR cassettes for network calls.</td></tr><tr><td><strong>VDA</strong></td><td>Vega Virtual Device — an emulator for the TV OS.</td><td>Android emulator, but for Vega.</td></tr></tbody></table>
:::

:::note The single most important idea
An LLM generates <em>plausible</em> text. Plausible is not correct. <code>plausible &ne; verified</code>. Everything the harness does exists to close that gap — every phase ends in a mechanical check, not a vibe.
:::

<h2>Who is allowed to do what</h2>
      <p>This is the security model. Read the boundary out loud:</p>

:::flow
ADBT MCP | Approved Vega context
Strands | Read and propose
Harness | Write and check
Git | Commit evidence
:::

:::snippet The boundary, in one diagram
ADBT (MCP server) <--- model calls list_documents / read_document itself ---+
                                                                            |
guarded app copy  <--- read-only tools (list/read/search) -----------------+--> Strands Agent --> typed patch {summary, files}
                                                                            |
                                                                            v
     HARNESS: reconstruct + hash ADBT reads -> validate paths -> write files -> run checks -> retry -> git commit -> report
>look: The model (via Strands) can <em>list, read, and search</em> the guarded app, and the harness hands the whole ADBT <code>McpClient</code> to the agent so Strands discovers the ADBT tools dynamically and the model calls them itself. It still has no write tool and no shell. Afterward the harness reconstructs which ADBT docs it read and hashes them. Everything with consequences stays in <code>packages/workshop-harness/src/port-pipeline.ts</code>.
:::

<p>Why so strict? A model that could write files or run shell commands could, on a confident wrong guess, corrupt your repo or run something destructive. Keep irreversible actions in deterministic code and the worst a bad model answer can do is <em>fail a check and get rejected</em>.</p>

:::note What is Strands Agents SDK?
<a href="https://github.com/strands-agents/harness-sdk" target="_blank" rel="noopener">Strands</a> is AWS's open-source agent runtime (TypeScript and Python), used here as the live remote path. Both the complete workshop harness and the staged mini-harness pin 1.10.0. Two things make it a good fit: the production plumbing — provider adapters, typed tools, structured output, limits, cancellation, usage metrics — comes built in, and it stays a library rather than a framework, so the harness boundary this workshop teaches survives intact.
:::

:::raw
<table><thead><tr><th>Strands supplies</th><th>The harness owns</th></tr></thead><tbody><tr><td>Agent loop and model providers</td><td>Phase order and approval</td></tr><tr><td>Read-only typed tools</td><td>Protected file writes</td></tr><tr><td>Validated patch output</td><td>Checks, retry, and Git commits</td></tr><tr><td>MCP client and metrics</td><td>Cost cap, replay, and report</td></tr></tbody></table>
:::

<p>The port agent can list, read, and search the guarded app. During <code>analyze</code> and <code>plan</code> the harness also hands it the ADBT <code>McpClient</code>, and Strands discovers ADBT's own tools (<code>list_documents</code>, <code>read_document</code>, <code>search_documentation</code>) dynamically — the harness does not pre-pick which workflows to read; the model does. It still gets no shell or write tool. After the phase, the harness walks the agent's tool calls and records each ADBT read with a SHA-256 hash, so the run stays auditable. Replay uses recorded model turns and recorded ADBT context, so it needs no live model or MCP server.</p>

<h2>1. Check the basics</h2>

:::steps
1. Install Node.js 20 or newer and Git. [Corepack](https://nodejs.org/api/corepack.html) supplies Yarn 4.12.
2. Clone this repository, run `cd past-the-vibes-we`, and keep the terminal at that root.
3. Choose Pocket Cinema unless your own React Native app already runs.
:::

:::raw
<div class="grid"><article><h3>Pocket Cinema</h3><p>Recommended. Every exercise, recording, and checkpoint supports this app.</p><code>apps/pocket-cinema</code></article><article><h3>Your app</h3><p>Use one working flow: launch → screen → action → back. Switch to Pocket Cinema if discovery takes more than 10 minutes.</p><code>launch → screen → action → back</code></article></div>
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
:::

<p>You are ready when the command reports <code>state: ready</code>. Model and Vega checks are optional in replay mode.</p>

:::command Optional: check live ADBT with everything else replayed
yarn --cwd packages/workshop-harness tsx src/index.ts doctor --adbt-live --json
:::

<h2>4. Choose one execution path</h2>

:::raw
<table><thead><tr><th>Path</th><th>Use it when</th><th>Needs</th></tr></thead><tbody><tr><td>Claude Code</td><td>Default. A local live coding-agent run.</td><td><a href="https://code.claude.com/docs" target="_blank" rel="noopener">Claude Code</a> installed and authenticated; ADBT via init-context</td></tr><tr><td>Strands + Bedrock</td><td>Alternative live path. The in-process remote executor.</td><td>AWS credentials and <a href="https://docs.aws.amazon.com/bedrock/" target="_blank" rel="noopener">Bedrock</a> model access</td></tr><tr><td>Replay</td><td>Fallback when a live model, ADBT, or device is unavailable.</td><td>Nothing beyond the installed packages</td></tr></tbody></table>
:::

<p>Run the workshop from scratch against a live model with one of the two live executors. The recorded replay path stays available as a fallback in every lesson. Confirm your live path is ready:</p>

:::command Claude Code: check the local executor
yarn --cwd packages/workshop-harness tsx src/index.ts doctor --executor claude-cli --json
:::

:::command Strands: check Bedrock credentials
yarn --cwd packages/workshop-harness tsx src/index.ts doctor --executor strands --provider bedrock --json
:::

:::command Fallback: check the key-free replay path
yarn doctor
:::

:::note Pick one live executor
Choose Claude Code or Strands + Bedrock as your primary path — you do not need both. If your chosen live path fails mid-workshop, save the error and use the replay fallback shown in that lesson.
:::

<h2>5. Optional Vega and VDA setup</h2>
      <p>Skip this section when you plan to use lifecycle replay. For the live path, install the <a href="https://developer.amazon.com/docs/vega/0.22/install-vega-sdk.html" target="_blank" rel="noopener">Vega SDK</a> <code>0.22.5875</code> and create a Vega Virtual Device.</p>
      <p>How ADBT reaches the model depends on your executor:</p>
      <ul>
        <li><strong>Replay (default)</strong>: recorded context, no <code>init-context</code>, no install.</li>
        <li><strong>Strands</strong>: the harness owns the ADBT <code>McpClient</code> and hands it to the agent so the model calls ADBT's tools itself. Still run <code>init-context</code> once — lesson 4's live runs load the <code>amazon-devices-vega-*</code> skills it installs.</li>
        <li><strong>Claude Code CLI</strong>: the CLI has its own MCP client, so the same <code>init-context</code> run registers the ADBT server with it and installs the skills. Run this in a real system terminal, then reopen your agent:</li>
      </ul>

:::command Set up ADBT MCP for the Claude Code CLI (one time)
# Run in a system terminal (not inside the agent). Sets up the ADBT MCP server
# and installs the amazon-devices-vega-* skills that lesson 4 loads.
# --force skips the confirmation prompts.
npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest init-context --agent claude-code-cli --force
:::

:::command Verify the ADBT MCP setup
npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest check-status --agent claude-code-cli
:::

:::note Where these come from
Amazon Devices Builder Tools ships the ADBT MCP server, skills, and steering docs as one pinned npm package: over 400 current Vega documents — migration workflows, knowledge-base pages, prompts — plus ten agent skills, served from a local process. <code>init-context</code> writes the MCP config into your agent (it supports Claude Code, Cursor, Kiro, Cline, and Copilot); <code>check-status</code> confirms it. It is the difference between a model reading the vendor's own current guidance and one guessing Vega APIs. See the <a href="https://developer.amazon.com/docs/vega/0.22/mcp-server.html" target="_blank" rel="noopener">Vega ADBT setup docs</a>.
:::

<p>When the harness runs the CLI executor, it invokes it with <code>--allowedTools "*"</code> so whatever ADBT tools <code>init-context</code> configured are permitted without stalling on a permission prompt in non-interactive mode. The CLI runs against the guarded copy, and the harness applies only the returned typed patch.</p>

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
<div class="checklist"><label><input type="checkbox">Node 20+, Git, and Corepack are available</label><label><input type="checkbox">All three workspace packages are installed</label><label><input type="checkbox">One replay run completed</label><label><input type="checkbox">I chose replay, Claude Code, or Strands</label><label><input type="checkbox">I chose Pocket Cinema or checked my own app</label><label><input type="checkbox">I understand that Vega device work is optional</label><label><input type="checkbox">I can explain what Strands supplies and what the harness owns</label></div>
:::

:::knowledge What is the most important boundary in this workshop?
The model can inspect and propose, but the harness controls approval, protected writes, verification, retries, cost, commits, and reports. ADBT supplies selected platform knowledge; it does not take over the run.
:::

:::done
The workspace is installed, one replay succeeds, one execution path is chosen, and you know which app you will use.
:::

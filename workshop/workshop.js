const commands = {
  installWorkshop: `unset NODE_TLS_REJECT_UNAUTHORIZED
corepack enable
yarn setup`,
  doctor: `yarn doctor`,
  claudeDoctor: `yarn --cwd packages/workshop-harness tsx src/index.ts doctor --executor claude-cli --json`,
  strandsDoctor: `yarn --cwd packages/workshop-harness tsx src/index.ts doctor --executor strands --provider bedrock --json`,
  adbtDoctor: `yarn --cwd packages/workshop-harness tsx src/index.ts doctor --adbt-live --json`,
  step1: `# Claude Code CLI
yarn --cwd packages/mini-harness tsx steps/01-single-agent/index.ts run \\
  steps/01-single-agent/fixtures/phases.json \\
  --executor claude-cli --model sonnet`,
  step1Strands: `# Strands + Bedrock
yarn --cwd packages/mini-harness tsx steps/01-single-agent/index.ts run \\
  steps/01-single-agent/fixtures/phases.json \\
  --executor strands --provider bedrock \\
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2`,
  step1Replay: `# Fallback if the live model is blocked
yarn --cwd packages/mini-harness tsx steps/01-single-agent/index.ts run \\
  steps/01-single-agent/fixtures/phases.json \\
  --replay steps/01-single-agent/fixtures/demo-recording.json`,
  step2: `# Claude Code CLI
yarn --cwd packages/mini-harness tsx steps/02-verify-loop/index.ts run \\
  steps/02-verify-loop/fixtures/phases.json \\
  --executor claude-cli --model sonnet`,
  step2Strands: `# Strands + Bedrock
yarn --cwd packages/mini-harness tsx steps/02-verify-loop/index.ts run \\
  steps/02-verify-loop/fixtures/phases.json \\
  --executor strands --provider bedrock \\
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2`,
  step2Replay: `# Fallback: the committed recording forces the check to fail, then pass
yarn --cwd packages/mini-harness tsx steps/02-verify-loop/index.ts run \\
  steps/02-verify-loop/fixtures/phases.json \\
  --replay steps/02-verify-loop/fixtures/retry-recording.json`,
  step3: `# Claude Code CLI. Stop after the plan phase to inspect the checkpoint.
yarn --cwd packages/mini-harness tsx steps/03-phases/index.ts run \\
  steps/03-phases/fixtures/phases.json \\
  --executor claude-cli --model sonnet \\
  --stop-after plan`,
  step3Strands: `# Strands + Bedrock
yarn --cwd packages/mini-harness tsx steps/03-phases/index.ts run \\
  steps/03-phases/fixtures/phases.json \\
  --executor strands --provider bedrock \\
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2 \\
  --stop-after plan`,
  step3Resume: `# Resume the same run; only build_test runs.
yarn --cwd packages/mini-harness tsx steps/03-phases/index.ts run \\
  steps/03-phases/fixtures/phases.json \\
  --executor claude-cli --model sonnet \\
  --resume`,
  step3Replay: `# Fallback, then resume with --replay ... --resume
yarn --cwd packages/mini-harness tsx steps/03-phases/index.ts run \\
  steps/03-phases/fixtures/phases.json \\
  --replay steps/03-phases/fixtures/demo-recording.json \\
  --stop-after plan`,
  step4Local: `# Claude Code CLI
yarn --cwd packages/mini-harness tsx steps/04-skills/index.ts run \\
  steps/04-skills/fixtures/phases.json \\
  --executor claude-cli --model sonnet`,
  step4Remote: `# Strands + Bedrock
yarn --cwd packages/mini-harness tsx steps/04-skills/index.ts run \\
  steps/04-skills/fixtures/phases.json \\
  --executor strands --provider bedrock \\
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 \\
  --region us-west-2`,
  step4Replay: `# Fallback if the live model is blocked
yarn --cwd packages/mini-harness tsx steps/04-skills/index.ts run \\
  steps/04-skills/fixtures/phases.json \\
  --replay steps/04-skills/fixtures/demo-recording.json`,
  memoryPrep: `WORKSHOP_INPUTS="/tmp/past-the-vibes-pocket-cinema-inputs"
rm -rf "$WORKSHOP_INPUTS"
cp -R workshop/fixtures/pocket-cinema-inputs \\
  "$WORKSHOP_INPUTS"`,
  memory: `yarn --cwd packages/workshop-harness tsx src/index.ts memory propose /tmp/past-the-vibes-pocket-cinema-inputs \\
  --from ../../workshop/fixtures/bee-context/snapshot.json \\
  --json`,
  applyMemory: `yarn --cwd packages/workshop-harness tsx src/index.ts memory apply /tmp/past-the-vibes-pocket-cinema-inputs \\
  --from ../../workshop/fixtures/bee-context/snapshot.json \\
  --yes --json`,
  plan: `yarn --cwd packages/workshop-harness tsx src/index.ts plan ../../apps/pocket-cinema \\
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \\
  --seed workshop-v1 --max-cost 3 --json`,
  port: `# Claude Code CLI. The model drives ADBT via the CLI's MCP config (init-context).
# build_test needs an attached VDA to capture the launch screenshot.
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \\
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \\
  --executor claude-cli --model sonnet \\
  --yes --seed workshop-v1 --max-cost 3 --json`,
  portStrands: `# Strands + Bedrock. The harness hands the ADBT McpClient to the agent.
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \\
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \\
  --executor strands --provider bedrock \\
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2 \\
  --yes --seed workshop-v1 --max-cost 3 --json`,
  portReplay: `# Fallback if a live model, ADBT, or VDA is unavailable.
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \\
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \\
  --replay ../../workshop/fixtures/port-recording.json \\
  --platform-replay ../../workshop/fixtures/vega-lifecycle.json \\
  --yes --seed workshop-v1 --max-cost 3 --json`,
focusCheck: `(cd packages/workshop-harness/out/<runId>/app && \\
  node --import tsx tests/verify-tv-focus.ts)
cat packages/workshop-harness/out/<runId>/app/tv-focus-result.json`,
  adbt: `yarn --cwd packages/workshop-harness tsx src/index.ts doctor --adbt-live --json`,
  adbtInitCli: `# Run in a system terminal (not inside the agent). Sets up the ADBT MCP server
# and skills for Claude Code CLI, so the model can call ADBT tools itself.
npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest init-context --agent claude-code-cli`,
  adbtCheckStatus: `npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest check-status --agent claude-code-cli`,
  vegaSetup: `yarn --cwd packages/workshop-harness tsx src/index.ts doctor --adbt-live --json
vega --version
vega virtual-device start --gui`,
  vdaStart: `# Run this in a system terminal and leave it open.
vega virtual-device start --gui`,
  vdaCheck: `# Run this in a second system terminal.
vega --version
vega virtual-device status
vega exec vda devices -l`,
  vegaPlan: `yarn --cwd packages/workshop-harness tsx src/index.ts vega-run <runId> --plan --json`,
  vegaRun: `yarn --cwd packages/workshop-harness tsx src/index.ts vega-run <runId> \\
  --platform-replay ../../workshop/fixtures/vega-lifecycle.json \\
  --yes --json`,
  vegaLive: `npm --prefix packages/workshop-harness/out/<runId>/app/apps/vega install
yarn --cwd packages/workshop-harness tsx src/index.ts vega-run <runId> --yes --json`,
  beeSearch: `yarn --cwd packages/workshop-harness tsx src/index.ts context bee search \\
  "Pocket Cinema product decisions" --json`,
  beeSnapshot: `yarn --cwd packages/workshop-harness tsx src/index.ts context bee snapshot <conversationId> \\
  --out candidate-context.json --json`,
};

const modules = [
  {
    id: "welcome", number: "00", nav: "Start here", time: "20 minutes", title: "Set up the workshop and understand the runtime",
    lead: "Complete this page before lesson 1. Stop troubleshooting after 10 minutes and use replay. A live model or Vega device must never block the workshop.",
    objective: "Choose a reliable workshop path and explain where Strands, ADBT, the harness, and Git each fit.",
    evidence: "A successful replay run, one chosen execution path, and a completed readiness checklist.",
    body: `${concept("Read this first if you have never built an agent harness","You are a React Native developer. You may have never touched an \"agent,\" an \"LLM tool,\" or \"MCP.\" That is fine — nothing here assumes you have. We will port a small RN app to Vega (Amazon's TV OS) without doing it by hand and without just asking an AI to \"please port my app.\" Instead we build a <strong>harness</strong>: a plain TypeScript program that runs a fixed pipeline, lets an AI model <em>propose</em> code inside tight walls, and keeps every dangerous action — writing files, running checks, committing to Git, spending money, talking to the device — for itself.")}
      ${note("The one sentence to remember","The model is a contractor with read-only access. The harness is the foreman who inspects the work, keeps the receipts, and signs off. The model proposes; the harness disposes.")}

      <h2>Vocabulary, translated for a React Native dev</h2>
      <p>You already know these ideas under other names. Here is the dictionary — the rest of the workshop uses these words.</p>
      ${table(["Term","What it actually is","Your mental model"],[
        ["<strong>LLM / model</strong>","A program that turns text in into text out. Given a prompt, it returns a guess. Claude is one.","A well-read intern who writes plausible code but never runs it."],
        ["<strong>Prompt</strong>","The text you send the model.","The Jira ticket plus all the context you paste in."],
        ["<strong>Agent</strong>","A model wired to a loop where it can call functions (\"tools\"), see the result, and decide what to do next.","An intern who can grep your repo before answering, several times."],
        ["<strong>Tool</strong>","A named function you expose to the model, with a typed signature. The model <em>requests</em> a call; your code runs it and returns the result.","A locked-down CLI you hand the intern: <code>read_file</code>, <code>list_files</code>, nothing else."],
        ["<strong>Structured output</strong>","Forcing the model to answer as JSON matching a schema, not free prose.","A required PR template the intern cannot deviate from."],
        ["<strong>MCP</strong>","Model Context Protocol — a standard so one program can start another as a \"server\" and call its tools.","Starting a language server (LSP) and querying it, but for arbitrary tools."],
        ["<strong>ADBT</strong>","Amazon Device Build Tools, exposed here as an MCP server serving Vega migration docs.","An internal wiki you can query programmatically."],
        ["<strong>Skill</strong>","A block of domain instructions (\"how to do TV focus\") kept separate from code.","A runbook you paste into the ticket for one task."],
        ["<strong>Harness</strong>","The deterministic TypeScript program orchestrating all of the above.","Your CI pipeline, if CI could also call an intern mid-step."],
        ["<strong>Replay</strong>","Running the pipeline against <em>recorded</em> model answers instead of a live model.","Fixtures / VCR cassettes for network calls."],
        ["<strong>VDA</strong>","Vega Virtual Device — an emulator for the TV OS.","Android emulator, but for Vega."],
      ])}
      ${note("The single most important idea","An LLM generates <em>plausible</em> text. Plausible is not correct. <code>plausible &ne; verified</code>. Everything the harness does exists to close that gap — every phase ends in a mechanical check, not a vibe.")}

      <h2>Who is allowed to do what</h2>
      <p>This is the security model, and it is the soul of the design. Read the boundary out loud:</p>
      ${flow([["ADBT MCP","Approved Vega context"],["Strands","Read and propose"],["Harness","Write and check"],["Git","Commit evidence"]])}
      ${snippet("The boundary, in one diagram",`ADBT (MCP server) <--- model calls list_documents / read_document itself ---+
                                                                            |
guarded app copy  <--- read-only tools (list/read/search) -----------------+--> Strands Agent --> typed patch {summary, files}
                                                                            |
                                                                            v
     HARNESS: reconstruct + hash ADBT reads -> validate paths -> write files -> run checks -> retry -> git commit -> report`,
        "The model (via Strands) can <em>list, read, and search</em> the guarded app, and the harness hands the whole ADBT <code>McpClient</code> to the agent so Strands discovers the ADBT tools dynamically and the model calls them itself. It still has no write tool and no shell. Afterward the harness reconstructs which ADBT docs it read and hashes them. Everything with consequences stays in <code>packages/workshop-harness/src/port-pipeline.ts</code>.")}
      <p>Why so strict? A model that could write files or run shell commands could, on a confident wrong guess, corrupt your repo or run something destructive. Keep irreversible actions in deterministic code and the worst a bad model answer can do is <em>fail a check and get rejected</em>.</p>
      ${note("What is Strands Agents SDK?","It is the TypeScript agent runtime used by the live remote path. The complete workshop harness pins 1.10.0; the staged mini-harness pins 1.7.0. It provides the model loop, provider adapters, typed tools, structured output, limits, cancellation, and usage metrics.")}
      ${table(["Strands supplies","The harness owns"],[["Agent loop and model providers","Phase order and approval"],["Read-only typed tools","Protected file writes"],["Validated patch output","Checks, retry, and Git commits"],["MCP client and metrics","Cost cap, replay, and report"]])}
      <p>The port agent can list, read, and search the guarded app. During <code>analyze</code> and <code>plan</code> the harness also hands it the ADBT <code>McpClient</code>, and Strands discovers ADBT's own tools (<code>list_documents</code>, <code>read_document</code>, <code>search_documentation</code>) dynamically — the harness does not pre-pick which workflows to read; the model does. It still gets no shell or write tool. After the phase, the harness walks the agent's tool calls and records each ADBT read with a SHA-256 hash, so the run stays auditable. Replay uses recorded model turns and recorded ADBT context, so it needs no live model or MCP server.</p>

      <h2>1. Check the basics</h2>
      ${steps(["Install Node.js 20 or newer and Git. Corepack supplies Yarn 4.12.","Clone this repository, run <code>cd past-the-vibes-we</code>, and keep the terminal at that root.","Choose Pocket Cinema unless your own React Native app already runs."])}
      <div class="grid"><article><h3>Pocket Cinema</h3><p>Recommended. Every exercise, recording, and checkpoint supports this app.</p><code>apps/pocket-cinema</code></article><article><h3>Your app</h3><p>Use one working flow: launch → screen → action → back. Switch to Pocket Cinema if discovery takes more than 10 minutes.</p><code>launch → screen → action → back</code></article></div>
      <h3>Bring-your-own-app safety check</h3>
      <div class="checklist">${["The app runs before the workshop","Git status is clean","It contains no production secrets or private data","It contains no protected media","It can be shared with the chosen model provider"].map(item => `<label><input type="checkbox">${item}</label>`).join("")}</div>

      <h2>2. Install the workshop workspace</h2>
      ${command("Install all workshop packages","installWorkshop")}

      <h2>3. Run the setup check</h2>
      ${command("Check the key-free replay path","doctor")}
      <p>You are ready when the command reports <code>state: ready</code>. Model and Vega checks are optional in replay mode.</p>
      ${command("Optional: check live ADBT with everything else replayed","adbtDoctor")}

      <h2>4. Choose one execution path</h2>
      ${table(["Path","Use it when","Needs"],[["Claude Code","Default. A local live coding-agent run.","Claude Code installed and authenticated; ADBT via init-context"],["Strands + Bedrock","Default. The in-process remote executor.","AWS credentials and Bedrock model access"],["Replay","Fallback when a live model, ADBT, or device is unavailable.","Nothing beyond the installed packages"]])}
      <p>Run the workshop from scratch against a live model with one of the two live executors. The recorded replay path stays available as a fallback in every lesson. Confirm your live path is ready:</p>
      ${command("Claude Code: check the local executor","claudeDoctor")}
      ${command("Strands: check Bedrock credentials","strandsDoctor")}
      ${command("Fallback: check the key-free replay path","doctor")}
      ${note("Pick one live executor","Choose Claude Code or Strands + Bedrock as your primary path — you do not need both. If your chosen live path fails mid-workshop, save the error and use the replay fallback shown in that lesson.")}

      <h2>5. Optional Vega and VDA setup</h2>
      <p>Skip this section when you plan to use lifecycle replay. For the live path, install Vega SDK <code>0.22.5875</code> and create a Vega Virtual Device.</p>
      <p>How ADBT reaches the model depends on your executor:</p>
      <ul>
        <li><strong>Replay (default)</strong> and <strong>Strands</strong>: the harness owns the ADBT <code>McpClient</code>. On the live Strands path it hands that client to the agent so the model calls ADBT's tools itself; on replay it reads recorded context. You do <em>not</em> run <code>init-context</code>.</li>
        <li><strong>Claude Code CLI</strong>: the CLI has its own MCP client, so you register the ADBT server with it once, up front, using Amazon's official installer. Run this in a real system terminal (it completes silently), then reopen your agent:</li>
      </ul>
      ${command("Set up ADBT MCP for the Claude Code CLI (one time)","adbtInitCli")}
      ${command("Verify the ADBT MCP setup","adbtCheckStatus")}
      ${note("Where these come from","Amazon Devices Builder Tools ships the ADBT MCP server, skills, and steering docs as an npm package. <code>init-context</code> writes the MCP config into your agent; <code>check-status</code> confirms it. See the Vega docs: developer.amazon.com/docs/vega/0.22/mcp-server.html")}
      <p>When the harness runs the CLI executor, it invokes it with <code>--allowedTools "*"</code> so whatever ADBT tools <code>init-context</code> configured are permitted without stalling on a permission prompt in non-interactive mode. The CLI runs against the guarded copy, and the harness applies only the returned typed patch.</p>
      ${command("Check ADBT and start VDA in a system terminal","vegaSetup")}
      <p>Keep that terminal open. In a second system terminal, run:</p>
      ${command("Confirm the SDK and attached device","vdaCheck")}
      ${note("Live Vega is ready only when","The SDK prints 0.22.5875, virtual-device status reports running: true, and devices -l lists an attached device.","success")}
      ${fallback("Try one repair for no more than 10 minutes. Then use replay. Do not spend workshop time repairing a model account or device.")}

      <h2>Setup complete</h2>
      <div class="checklist">${["Node 20+, Git, and Corepack are available","All three workspace packages are installed","One replay run completed","I chose replay, Claude Code, or Strands","I chose Pocket Cinema or checked my own app","I understand that Vega device work is optional","I can explain what Strands supplies and what the harness owns"].map(item => `<label><input type="checkbox">${item}</label>`).join("")}</div>
      ${knowledgeCheck("What is the most important boundary in this workshop?","The model can inspect and propose, but the harness controls approval, protected writes, verification, retries, cost, commits, and reports. ADBT supplies selected platform knowledge; it does not take over the run.")}
      ${done("The workspace is installed, one replay succeeds, one execution path is chosen, and you know which app you will use.")}`
  },
  {
    id: "single-agent", number: "01", nav: "One model call", time: "15 minutes", title: "Start with one model call",
    lead: "Run the smallest example against a React Native app and identify what it cannot prove.",
    objective: "Locate the model boundary and distinguish generated output from verified output.",
    evidence: "Three concrete claims that the one-call script cannot prove by itself.",
    body: `${concept("Why this step exists","A model can produce plausible files, but plausibility is not evidence. Start with the smallest possible agent so its missing guarantees are easy to see.")}${note("One app from the first minute","Every mini-harness step begins with a reduced Pocket Cinema React Native app and runs the same three phases: analyze → plan → build_test. The later port changes platform concerns, but phase → skill → executor → check stays the same.")}${predict("Before you run it, name one bug that could hide inside the model's analysis that looks complete.")}<h2>Run it against a live model</h2><p>Pick the executor you set up in lesson 0. It calls a real model and writes files into <code>out/</code>.</p>${command("Claude Code CLI","step1")}${command("Strands + Bedrock","step1Strands")}<h2>Trace the model boundary</h2>${steps(["Open <code>steps/01-single-agent/index.ts</code>.","Find where it copies the starter app, builds the prompt, reads the model response, and writes files.","Open the generated <code>out/ANALYSIS.md</code> (the analyze phase output).","Write down three claims that need an independent check: the analysis is accurate, a component it named really exists, a part it called portable actually runs on TV."])}${knowledgeCheck("Why is this an agent script, but not yet a reliable harness?","It has a model call and side effects, but no independent verification, bounded retry, checkpoint, approval gate, or durable evidence.")}${done("You can point to the model boundary and name three missing React Native checks.")}${fallback("If the live model is blocked, run the committed recording instead — same exercise, no account:")}${command("Fallback: replay","step1Replay")}`
  },
  {
    id: "verify", number: "02", nav: "Check and retry", time: "20 minutes", title: "Turn a failure into a useful retry",
    lead: "Run a mechanical check and send its exact failure into one bounded retry.",
    objective: "Trace a requirement through a failed check, a contextual retry, and a passing result.",
    evidence: "The failed grep message appears in the retry request and the second attempt passes.",
    body: `${concept("Why this step exists","A retry is useful only when it carries new information. The check turns a vague failure into precise context the next attempt can act on.")}${predict("The plan phase must document the remote control. Predict what the check greps for, and what happens if the model's first plan omits it.")}<h2>Run it against a live model</h2><p>A live model may pass every check on the first try. To see the retry loop deterministically, use the committed recording — its first plan attempt is missing the required section, so the harness feeds the exact failure back and the second attempt fixes it.</p>${command("Claude Code CLI","step2")}${command("Strands + Bedrock","step2Strands")}<h2>See the retry loop (recording)</h2>${command("Replay the failed check and repair","step2Replay")}${expected(`Pattern "## Remote Control" not found in out/TV_PORT_PLAN.md`)}<h2>Follow the evidence</h2>${steps(["Find the failed <code>grep</code> check in the output.","Open <code>steps/02-verify-loop/verify.ts</code> and locate that check.","Find the same failure text in the retry request.","Open <code>out/TV_PORT_PLAN.md</code> and confirm the second attempt adds the remote control section."])}${knowledgeCheck("Why pass the exact failure into the retry instead of saying try again?","The exact failure narrows the problem, preserves the original requirement, and makes the retry explainable. A generic retry buys another guess.")}${done("You can trace requirement → failed check → retry → passing output.")}`
  },
  {
    id: "phases", number: "03", nav: "Phases and resume", time: "25 minutes", title: "Split the work and resume it",
    lead: "Use phases for small changes, commits for verified code, and checkpoints for run progress.",
    objective: "Explain the different jobs of a phase, a checkpoint, and a Git commit.",
    evidence: "A paused run resumes at focus, while the Git log keeps one commit per completed phase.",
    body: `${concept("Why this step exists","Long agent runs fail. Small phases limit the damage, checkpoints remember orchestration progress, and commits preserve code that already passed its checks.")}${predict("The run stops after plan. Which phase should resume next, and which phases must not run again?")}<h2>Run it against a live model, pausing after plan</h2>${command("Claude Code CLI","step3")}${command("Strands + Bedrock","step3Strands")}${expected(`Paused after plan.\ncheckpoint.json: { "nextPhase": 2 }`)}<h2>Inspect before resuming</h2>${steps(["Open <code>out/checkpoint.json</code>.","Use <code>phases.json</code> to confirm index 2 is <code>build_test</code>.","Open the Git log and find commits for analyze and plan."])}${command("Resume the same run","step3Resume")}<h2>Compare the result</h2>${steps(["Confirm only build_test ran after resume.","Open the final checkpoint and Git log.","Explain what progress belongs in the checkpoint and what evidence belongs in Git."])}${knowledgeCheck("Why keep both a checkpoint and per-phase commits?","The checkpoint tells the engine where to continue. Git records the exact verified code state for each completed phase. They answer different recovery questions.")}${done("After resume, only build_test runs — analyze and plan are not repeated.")}${fallback("If the live model is blocked, use the recording (then resume with --replay ... --resume):")}${command("Fallback: replay","step3Replay")}`
  },
  {
    id: "skills", number: "04", nav: "Skills and executors", time: "20 minutes", title: "Separate knowledge from model access",
    lead: "A skill supplies domain instructions. An executor calls the model. The pipeline should not depend on one provider.",
    objective: "Separate domain knowledge, model execution, tools, and deterministic pipeline control.",
    evidence: "You can point to the file that owns each responsibility in both the mini and complete workshop harnesses.",
    body: `${concept("Four responsibilities","Skills teach domain knowledge. Phase context assembles the task. An executor talks to a model. Tools expose narrow capabilities. The pipeline decides when side effects are allowed.")}${predict("Where should a D-pad focus rule live: the executor, a skill, a read tool, or a verification check?")}<h2>Run it against a live model</h2>${command("Claude Code CLI","step4Local")}${command("Strands + Bedrock","step4Remote")}<h2>Map the teaching harness</h2>${steps(["Open <code>phases.json</code> and find the <code>react-native-analysis</code>, <code>tv-porting-plan</code>, and <code>tv-build-test</code> skills.","Follow them through <code>skills.ts</code>, <code>pipeline-engine.ts</code>, and <code>executor.ts</code>.","In <code>model-runtime.ts</code>, compare <code>injectSkillText()</code> with <code>createSkillsPlugin()</code>.","Notice that the React Native target is unchanged; only knowledge delivery and model access have become explicit.","Compare every module with <code>packages/mini-harness/ISOMORPHISM.md</code>."])}${skillDelivery()}

      <h2>The whole model interaction, in one code block</h2>
      <p>People expect the AI part of this to be huge and mysterious. It is not. In <code>src/port-executor.ts</code>, the entire live model interaction for one phase is this:</p>
      ${snippet("packages/workshop-harness/src/port-executor.ts",`const agent = new Agent({
  name: \`workshop-\${phase}\`,
  model: createModel(config),                 // Bedrock / OpenAI / OpenRouter behind one interface
  tools: createProjectReadTools(appDir),      // list/read/search only — no write, no shell
  structuredOutputSchema: PortOutputSchema,   // must return { summary, files }
  systemPrompt: "Inspect with read-only tools. Return a complete patch. Never claim a file or API exists without reading evidence.",
  printer: false,                             // keep stdout clean for JSON
});
const result = await agent.invoke(prompt, {
  cancelSignal: AbortSignal.timeout(10 * 60_000),  // 10-min hard stop
  limits: { turns: 8, totalTokens: 40_000 },       // bounded loop
});`,
        "What Strands gives you: the model-and-tool loop, provider adapters, schema-validated output, turn/token limits, cancellation, usage metrics. What it deliberately does <em>not</em> own: writing files, verification, Git, cost policy, ADBT selection. Those stay in the harness.")}
      ${note("The tools themselves are guarded hard","In <code>src/port-tools.ts</code>, the read tools reject absolute paths, <code>..</code> traversal, symlinks, <code>.git</code>, <code>.env</code>, <code>node_modules</code>, binaries, and files over 100&nbsp;KB. Even the read side of the model's authority has walls.")}

      ${strandsConstructs()}${fullHarnessStrandsConstructs()}<h2>Inspect the complete Strands boundary</h2>${steps(["Open <code>packages/workshop-harness/src/port-tools.ts</code> and match each <code>tool()</code> field to the first table.","Open <code>port-contract.ts</code> and find the Zod schema passed as <code>structuredOutputSchema</code>.","Open <code>port-executor.ts</code> and trace <code>new Agent()</code> → <code>invoke()</code> → <code>AgentResult</code>.","Follow the result into usage accounting and <code>port-recorder.ts</code>.","Confirm the workshop port agent has no write or shell tool. Its pipeline owns both."])}${knowledgeCheck("Why use AgentSkills with Strands but prompt injection with Claude CLI?","Strands can expose skill metadata and let the agent progressively activate instructions through a plugin. The CLI subprocess has no shared in-process plugin, so the executor sends the selected instructions directly in its prompt.")}<div class="links"><a href="strands-constructs.md">Open the Strands reference</a></div>${done("You can trace one React Native phase skill through Claude prompt injection or Strands AgentSkills, then separate both from pipeline controls.")}${fallback("If the live model is blocked, replay shows the same module boundaries without credentials:")}${command("Fallback: replay","step4Replay")}`
  },
  {
    id: "memory", number: "05", nav: "Project memory", time: "15 minutes", title: "Review facts before saving them",
    lead: "Use a disposable input copy. Proposed context becomes project memory only after you review it.",
    objective: "Turn selected source material into small, reviewable project facts with provenance.",
    evidence: "The saved PROJECT_CONTEXT.md separates decisions, facts, questions, and source ids.",
    body: `${concept("Why this step exists","Project context should be small, attributable, and approved. A raw transcript is too noisy, too private, and too easy for an agent to misread as instruction.")}${predict("What could go wrong if the harness imported every remembered sentence automatically?")}${command("Create a disposable input copy","memoryPrep")}${command("Create a memory proposal","memory")}<h2>Review before applying</h2>${steps(["Read every proposed fact.","Check that each fact names its source.","Keep open questions separate from decisions.","Reject anything private, temporary, or ambiguous."])}${command("Apply the reviewed proposal","applyMemory")}<h2>Inspect the saved context</h2>${steps(["Open <code>/tmp/past-the-vibes-pocket-cinema-inputs/PROJECT_CONTEXT.md</code>.","Confirm the source ids survived the transformation.","Confirm the committed fixture in the repository is unchanged."])}${knowledgeCheck("Why is the proposal step an approval gate rather than another model phase?","The human owns what becomes durable project truth. The model may summarize candidate facts, but it cannot silently promote them into trusted context.")}${done("Every saved fact has a source and the repository fixture is unchanged.")}${fallback("Use the synthetic Bee snapshot. Live Bee access is not required.")}`
  },
  {
    id: "plan", number: "06", nav: "Plan and port", time: "35 minutes", title: "Inspect first, then change a guarded copy",
    lead: "Review scope, checks, ADBT context, seed, and cost before approving a port. The source app stays untouched.",
    objective: "Follow the complete port boundary from plan approval to a checked, committed app copy.",
    evidence: "The report links approved ADBT context, a typed patch, check results, cost, and Git commits.",
    body: `${concept("The production loop","The plan is the human approval boundary. During analyze and plan the model calls ADBT over MCP itself to gather Vega knowledge. Strands proposes a typed patch from read-only project tools. The harness records every ADBT read, applies the patch, checks it, retries once, and commits only verified work.")}${flow([["ADBT MCP","Model reads workflows"],["Record","Hash each read"],["Model","Propose a typed patch"],["Checks","Write, commit, or retry"]])}

      ${concept("Your source is never touched","Before anything runs, the harness copies your app into <code>out/&lt;runId&gt;/app/</code> and runs <code>git init</code> inside that copy. Everything the model proposes is written <em>there</em>. Your real <code>apps/pocket-cinema/</code> is read once and never modified. The <code>&lt;runId&gt;</code> is a fresh directory per run, so runs never clobber each other — and the harness makes a Git commit per passing phase, so if phase 3 explodes, phases 1 and 2 are already committed and safe.")}

      <h2>The three phases of a port</h2>
      <p>The port is a fixed sequence of three phases that mirror the mini-harness exactly: <strong>analyze → plan → build_test</strong>. Each is a model phase that ends in a mechanical check; two of them draw on ADBT. Source of truth: <code>src/index.ts</code> (the <code>phases: [...]</code> array) and <code>src/port-pipeline.ts</code> (the <code>phases()</code> function).</p>
      ${snippet("The phase order — packages/workshop-harness/src/port-pipeline.ts","analyze  ->  plan  ->  build_test\n(model +      (model +    (model + executable focus test\n feasibility   live ADBT)  + mandatory device screenshot)\n via ADBT)","Open <code>src/port-pipeline.ts</code> and read <code>phases()</code>. Each name below maps to one entry.")}
      ${phaseCard({num:"1",name:"analyze",tags:[{label:"model",kind:"model"},{label:"ADBT feasibility",kind:"adbt"}],rows:{"Does":"Reads the guarded app and writes <code>ANALYSIS.md</code> describing its screens, components, data, and what is portable to Vega TV. Alongside it, at <code>plan</code> time a deterministic dependency inventory (<code>auditSource</code>) plus a bounded model+ADBT step judge whether the port is even possible.","Check":"<code>ANALYSIS.md</code> must contain <code>## Portable</code>.","Feasibility gate":"The model returns a verdict — <code>feasible</code>, <code>feasible-with-adapters</code>, or <code>blocked</code>. A <code>blocked</code> verdict stops the run with exit code 5 <em>before</em> any build budget is spent. Fail fast, fail honest.","Inspect":"<code>out/&lt;runId&gt;/app/ANALYSIS.md</code>, <code>feasibility-report.json</code>, and the deterministic inventory in <code>portability-report.json</code>.","Code":"<code>src/port-pipeline.ts</code>, <code>src/feasibility.ts</code>, <code>src/portability-audit.ts</code>"}})}
      ${phaseCard({num:"2",name:"plan",tags:[{label:"model",kind:"model"},{label:"live ADBT",kind:"adbt"}],rows:{"Goal":"Plan the Vega TV port: preserved product behavior, Vega replacements, and the exact remote flow.","ADBT step":"The harness hands the ADBT <code>McpClient</code> to the Strands agent; Strands lists ADBT's tools dynamically and the model calls them itself — <code>list_documents</code> to discover Vega workflows, then <code>read_document</code> to read the ones it judges relevant. The harness pre-picks nothing; after the phase it reconstructs the reads from the agent's messages and hashes them into <code>adbt-port-context.json</code>. (The claude-cli executor reaches ADBT through its own MCP config set up by <code>init-context</code>.)","Skill injected":"Use the ADBT tools to discover and read the Vega migration workflows you need. Keep facts and assumptions separate, port one vertical slice, record gaps instead of inventing APIs.","Checks":"<code>VEGA_PORT.md</code> contains <code>## TV Flow</code>; <code>NextSteps.md</code> contains <code>ADBT</code> (names its sources).","Inspect":"<code>out/&lt;runId&gt;/app/VEGA_PORT.md</code>, <code>NextSteps.md</code>, <code>adbt-port-context.json</code>, and the commit <code>workshop(plan): ...</code>."}})}
      ${phaseCard({num:"3",name:"build_test",tags:[{label:"model",kind:"model"},{label:"executable test"},{label:"device screenshot",kind:"adbt"}],rows:{"Goal":"Build the <code>apps/vega</code> package from the SDK shape, wire the remote-only home→details flow, and prove it.","Build checks":"manifest <code>schema-version = 1</code> and <code>[[components.interactive]]</code>; <code>package.json</code> has <code>build-vega</code>; <code>app.json</code> and <code>metro.config.js</code> exist; root <code>package.json</code> has <code>vega:build</code>; <code>src/tv/focus-state.ts</code> exists; <code>src/App.tsx</code> imports <code>./tv/focus-state</code>.","Test checks":"A real command runs — <code>node --import tsx tests/verify-tv-focus.ts</code> must exit 0. Back must return focus to the <em>originating card</em>, verified by a script, not a human eyeball. <code>tv-focus-result.json</code> shows <code>\"passed\": true</code>; <code>TV_VERIFICATION.md</code> contains <code>originating card</code>.","Screenshot (mandatory)":"The phase then runs the Vega device lifecycle (build → install → launch → logs → capture → pull). <strong>The run fails unless a launch screenshot is produced.</strong> Replay uses <code>--platform-replay</code> to stay key-free; live runs against a real VDA.","Inspect":"<code>out/&lt;runId&gt;/01-launch.png</code>, <code>vega-platform-result.json</code>, <code>tv-focus-result.json</code>, and the commit <code>workshop(build_test): ...</code>.","Code":"<code>src/port-pipeline.ts</code>, <code>src/platform/vega.ts</code>"}})}
      ${note("Screenshot is now a mandatory gate","We wired the device screenshot as a required pass criterion of <code>build_test</code>. Note two consequences the repo records honestly: this makes a device (or its <code>--platform-replay</code> fixture) mandatory for a green run, and on the current VDA image the live screenshot tool segfaults, so the <em>live</em> screenshot cannot be produced until that tooling is fixed. The key-free replay path stays green via <code>--platform-replay ../../workshop/fixtures/vega-lifecycle.json</code>.","warning")}

      <h2>Every phase is built from the same prompt template</h2>
      <p>You do not need to guess what the model sees. Every phase prompt is assembled by one function — <code>prompt()</code> in <code>src/port-pipeline.ts</code> — from the same slots. Notice three things: the model is told the <strong>exact checks</strong> it will be graded against, a failed attempt gets the <strong>verbatim failure text</strong> fed back in, and the output contract is <strong>strict JSON</strong>.</p>
      ${snippet("The universal prompt template — src/port-pipeline.ts, prompt()",`You are porting the CURRENT guarded React Native app to Vega SDK 0.22.5875.
Read existing files before proposing edits. Preserve unrelated work.

Phase: <name>
Goal: <one sentence>
Skill: <domain instruction for this phase>
Creative seed: workshop-v1

Approved context:
<project memory, or "No approved project context.">

Portability findings:
<the JSON from phase 2's audit>

[ ONLY on plan: the ADBT guidance block, with SHA-256 hashes ]

Required checks:
<each check listed verbatim, so the model knows the bar it must clear>

[ ONLY on a retry: "Previous attempt failed:\\n<exact failure lines>\\nFix these." ]

Return ONLY JSON: {"summary":"...","files":{"relative/path":"complete contents"}}.`,
        "This exact string is built in <code>src/port-pipeline.ts</code>. Every live model turn — the prompt sent and the raw text returned — is recorded to <code>out/&lt;runId&gt;/port-recording.json</code>. That file is your audit trail: <code>request.messages[0].content</code> is the prompt, <code>response[].result</code> is the model's answer.")}

      ${predict("The model now calls ADBT over MCP itself. What has to be recorded for the run to stay reproducible and auditable?")}${command("Plan the Pocket Cinema port","plan")}<h2>Review the plan before approval</h2>${steps(["Confirm the source app and target flow.","Read the deterministic portability findings and the model's feasibility verdict.","Confirm the feasibility verdict is not <code>blocked</code> — a blocked verdict stops the run at exit code 5 before any build budget.","Check that ADBT is assigned to <code>analyze</code> (feasibility) and <code>plan</code>.","Check the three-phase plan (analyze → plan → build_test), fixed seed, and $3 cap.","Notice that build_test folds in the device screenshot lifecycle from lesson 8."])}<h2>Run the port against a live model</h2><p>Approve and run with a real model. On the Claude CLI path the model reaches ADBT through the MCP config you set up in lesson 0; on the Strands path the harness hands it the ADBT client. <code>build_test</code> needs an attached VDA to capture the launch screenshot.</p>${command("Claude Code CLI","port")}${command("Strands + Bedrock","portStrands")}<h2>Build an evidence chain</h2>${steps(["Copy the <code>runId</code> from the output.","Open <code>out/&lt;runId&gt;/adbt-port-context.json</code> and find the workflow names and hashes the model read.","Open <code>port-result.json</code> and confirm <code>adbt.mode: live</code>.","Open <code>app/NextSteps.md</code> and find ADBT sources and unsupported mappings.","Inspect the guarded app, report, and Git log.","Confirm <code>apps/pocket-cinema</code> is unchanged."])}${knowledgeCheck("The model fetches ADBT docs itself now. How does the run stay auditable and reproducible?","The harness reconstructs every ADBT read from the agent's messages after the phase — document name, excerpt, and a SHA-256 hash into <code>adbt-port-context.json</code>. So even though the model chose what to read, there is an exact, hashed record of the knowledge it used — and replay can rerun from that recorded context with no live MCP server.")}${fallback("If a live model, ADBT, or VDA is unavailable, run the fully recorded path — same phases and evidence contract, no credentials:")}${command("Fallback: replay","portReplay")}

      <h2>Worked example: real prompt in, real output out</h2>
      <p>This is captured from an actual live run (<code>c9fc9e58</code>, real Claude model, live ADBT over MCP). It shows the ADBT-driven planning and the generated Vega package. (This capture predates the model-driven-MCP change: it used harness injection. Today the model calls ADBT's <code>read_document</code> tool itself, but the recorded provenance below — document names and SHA-256 hashes — is exactly what the harness now reconstructs from the model's tool calls.)</p>
      <h3>What the model read from ADBT</h3>
      <p>The harness records every document the model fetched, with a hash, into <code>adbt-port-context.json</code>. Recorded provenance from this run:</p>
      ${snippet("adbt-port-context.json (recorded reads, excerpt)",`## ADBT Vega Port Guidance

Mode: live
Sources:
- port_tv_app_to_vega.md (sha256: 5dcf0e6f8a5b6a62d688562c46a9f22f414715c1b792ecdaf92bc0e8016214ea)
- port_tv_app_to_vega_fos_rn_app.md (sha256: 2f67d9dc1133a52e9873513c3d66a2c0a2ca090a0d90284e1bb54e3f825f5607)

### port_tv_app_to_vega.md
## Purpose
Entry point for all FOS-to-Vega app migrations. This workflow determines what the
user wants to convert, runs shared prerequisites (SDK check, device detection), then
dispatches to the appropriate conversion-specific orchestrator.
...

Use these ADBT sources for Vega-specific decisions. Do not invent Vega APIs.
Write unsupported or uncertain mappings to NextSteps.md and name the ADBT documents consulted.`,
        "Why hashes? So the exact knowledge the model was given is provable and reproducible later. Find it in <code>out/&lt;runId&gt;/adbt-port-context.json</code>.")}
      <h3>Out of <code>build_test</code> — what came out</h3>
      <p>The model returned a multi-file patch. Several build_test checks <code>grep</code> the generated manifest — and it contains exactly the strings they look for:</p>
      ${snippet("Generated apps/vega/manifest.toml",`schema-version = 1

[package]
title = "Pocket Cinema"
id = "com.pocketcinema.app"

[[components.interactive]]
id = "com.pocketcinema.app.main"
runtime-module = "@pocket-cinema/rn"
launch-type = "singleton"`)}
      <p>The most important part of that output is what the model wrote into <code>NextSteps.md</code>. It did not have full MCP doc access in that session, and instead of bluffing, it said so:</p>
      ${snippet("Generated NextSteps.md (excerpt) — the model admitting uncertainty",`## Unverified against SDK docs (MCP doc access not granted)

The buildertools MCP read_document / list_documents calls were denied in this
session, so the items below rely on the Vega skill summaries and the ADBT
workflows above. They MUST be confirmed against the named KB documents before
relying on them — they are not invented APIs presented as fact.

1. Manifest schema — verify field names and the [[components.interactive]] shape.
2. App icon asset — vega_app_manifest.md requires a 512x512 PNG.
3. Build CLI — confirm the exact Kepler/Vega build invocation.`,
        "This is the skill \"record gaps instead of inventing APIs\" visibly working. The check <code>NextSteps.md contains \"ADBT\"</code> passed, all 8 checks passed, the phase committed.")}
      ${note("The lesson from the worked example","The model produces large, plausible, well-structured artifacts — and it also wraps JSON in prose and admits uncertainty. Plausible output is not clean output. The harness does not trust prose or vibes: it extracts the JSON, writes it to the guarded copy, and runs mechanical grep/file_exists checks. Only passing work is committed. That is <code>plausible &ne; verified</code>, made concrete.")}

      <h2>How ADBT connects during the port</h2>${command("Check the native ADBT MCP path","adbtDoctor")}${mcpConstructs()}${note("Two executor paths","Strands: the harness passes the ADBT <code>McpClient</code> into the agent's tools and the model calls ADBT itself. Claude CLI: the CLI reaches ADBT through the MCP config from <code>init-context</code>. Either way the harness reconstructs and hashes what was read.")}${done("You can trace each MCP construct from connection through the model's own tool calls, a typed proposal, checks, a verified commit, and the final report.")}${fallback("A live port stops with exit 3 when ADBT is unavailable; it never continues with unsupported assumptions. Use the recorded ADBT context via the replay fallback above.")}`
  },
  {
    id: "tv", number: "07", nav: "Test remote behavior", time: "20 minutes", title: "Test the flow, not one screenshot",
    lead: "Trace focus through launch, movement, Select, and Back. A passing build cannot prove this behavior.",
    objective: "Express TV navigation as observable state transitions instead of visual impressions.",
    evidence: "tv-focus-result.json records launch, movement, selection, and focus restoration after Back.",
    body: `${concept("Why this step exists","TV quality is temporal. A screenshot can show where focus is now, but not whether focus moved correctly, respected boundaries, opened the right screen, or returned to the same card.")}<div class="remote" aria-label="TV remote direction pad"><button>↑</button><button>←</button><button class="ok">OK</button><button>→</button><button>↓</button></div>${table(["Action","Expected result"],[["Launch","Featured action has focus"],["Down","Focus enters the first rail"],["Left / right","Focus stops at list boundaries"],["Select","Details opens for the focused card"],["Back","The same card regains focus"]])}${predict("Which transition is most likely to pass a screenshot review but fail for a real remote user?")}${command("Run the executable focus check","focusCheck")}<h2>Compare passing and failing evidence</h2>${steps(["Replace <code>&lt;runId&gt;</code> with the id from lesson 6.","Read <code>tv-focus-result.json</code> as a sequence, not a score.","Open <code>fixtures/focus-failure/README.md</code> and find the failed Back transition.","Trace the focus state and restoration code in the guarded app."])}${knowledgeCheck("Why is Back part of the focus contract?","Returning to a screen without restoring the user's prior focus loses navigation context. The UI may look correct while the remote interaction is broken.")}${done("The focus check passes the full transition sequence and writes <code>tv-focus-result.json</code>.")}${fallback("Run the same check in <code>checkpoints/vega-buildable/app</code>. No device is required.")}`
  },
  {
    id: "vega", number: "08", nav: "Run the Vega lifecycle", time: "25 minutes", title: "Hand the guarded app to Vega tools",
    lead: "Run the complete lifecycle against a live Vega SDK and VDA. Recorded replay stays as a fallback when no device is attached.",
    objective: "Distinguish reproducible lifecycle rehearsal from evidence produced by a real Vega device.",
    evidence: "Eight lifecycle gates pass, with evidenceMode labeled replay or live.",
    body: `${concept("Two kinds of evidence","A live VDA run proves this app built, installed, launched, and produced a screenshot on an attached device. Replay proves you can study the lifecycle and its contracts without one. Keep those claims separate.")}${note("Device screenshot caveat","On the current VDA image the screenshot tool segfaults at the capture gate, so a fully live run may fail there even when build, install, and launch pass. The repo records this in the rehearsal note. If you hit it, use the replay fallback to finish the lesson.","warning")}<div class="links"><a href="live-rehearsal.md">Read the rehearsal record</a></div>${predict("If the SDK build passes but the device list is empty, which lifecycle gates must the harness refuse to claim?")}<h2>Run the lifecycle on a live VDA</h2>${steps(["Replace <code>&lt;runId&gt;</code> with the id from lesson 6."])}${command("Start VDA and keep this terminal open","vdaStart")}${command("Confirm the SDK and attached device","vdaCheck")}${command("Show the Vega plan","vegaPlan")}${command("Run with Vega SDK and VDA","vegaLive")}<h2>Claim live evidence only when</h2>${steps(["The SDK reports <code>0.22.5875</code>.","VDA reports <code>running: true</code> and lists an attached device.","Build, install, launch, logs, capture, and pull all pass.","The result says <code>evidenceMode: live</code> and the screenshot came from the device."])}<h2>Inspect all eight gates</h2>${steps(["Confirm SDK version and device status were checked before build.","Find build, install, launch, logs, capture, and pull results.","Read each gate's exact command, exit code, and output."])}${knowledgeCheck("What turns lifecycle output into trustworthy evidence?","The harness records the exact command, outcome, artifact, and evidence mode for each gate. A successful process exit alone is not enough when no device is attached.")}${done("All eight gates pass on an attached VDA and the result says <code>evidenceMode: live</code> with a device screenshot.")}${fallback("If no VDA is attached or the screenshot gate segfaults, run the recorded lifecycle instead — same eight gates, labeled evidenceMode: replay:")}${command("Fallback: key-free lifecycle replay","vegaRun")}`
  },
  {
    id: "bee", number: "09", nav: "Optional Bee context", time: "15 minutes", title: "Import selected context, not a transcript",
    lead: "Run this only when Bee is configured and participants consent. The synthetic fixture is the normal workshop path.",
    objective: "Select useful context without turning a private conversation into unreviewed agent memory.",
    evidence: "A scrubbed snapshot has source ids, dates, a query, a summary, and a stable hash.",
    body: `${concept("Why this step is optional","Conversation search can recover useful decisions, but it also crosses a privacy boundary. Use it only with consent, select the smallest useful excerpt, and store a scrubbed snapshot rather than a transcript.")}${predict("Which fields would let a reviewer verify where a summarized fact came from without storing the full conversation?")}${command("Search Bee","beeSearch")}${command("Save one selected snapshot","beeSnapshot")}<h2>Review the boundary</h2>${steps(["Check source ids, dates, query, summary, and hash.","Review the snapshot before proposing memory.","Never commit a raw private transcript.","Disconnect Bee and confirm the approved snapshot still works."])}${knowledgeCheck("Why should the snapshot work after Bee is disconnected?","The run becomes reproducible and reviewable without a live private-data dependency. The snapshot is the approved input; Bee is only a discovery source.")}${done("Every approved fact has a source and can be reused without Bee.")}${fallback("Use <code>fixtures/bee-context/snapshot.json</code> or skip this optional module.")}`
  },
  {
    id: "finish", number: "10", nav: "Build your own", time: "15 minutes", title: "Design one harness for your work",
    lead: "Keep the pipeline and replace the TV skill, Vega commands, and D-pad checks with your domain.",
    objective: "Draft the smallest useful harness for one task in your own engineering domain.",
    evidence: "A worksheet names the phases, checks, approval point, budget, and evidence the run must retain.",
    body: `<div class="takeaway"><code>plan → context → run → check → retry → checkpoint → report</code></div>${concept("Transfer the pattern","The reusable idea is a bounded workflow that gives a model strong context, limits its authority, checks each result, and leaves evidence another developer can inspect. TV and Vega are the example, not the point.")}<h2>Draft your harness</h2>${steps(["Open <code>worksheet.md</code>.","Name one outcome that can finish in one session.","Choose the fewest useful phases.","Give every phase one independent, mechanical check.","Define the approval point, cost limit, stop conditions, and saved evidence.","Name your replacement for the TV skill, Vega adapter, and D-pad check."])}${knowledgeCheck("What is the smallest useful first version of your harness?","One repeatable task, a short phase sequence, one strong prior, one independent check per phase, a bounded retry, and a report. Add tools only when a proven gap needs them.")}${done("Another developer can follow your worksheet, inspect the evidence, and knows when the harness must stop.")}<div class="links"><a href="worksheet.md">Open the worksheet</a><a href="troubleshooting.md">Troubleshooting</a><a href="instructor-guide.md">Instructor guide</a></div>`
  }
];

const storageKey = "past-the-vibes-progress-v3";
const linksHost = document.getElementById("module-links");
const content = document.getElementById("content");

linksHost.innerHTML = modules.map(module => `<button class="module-link" data-module="${module.id}"><span>${module.number}</span>${module.nav}</button>`).join("");

function showModule(id, updateHash = true) {
  if (id === "port") id = "plan";
  const module = modules.find(item => item.id === id) || modules[0];
  content.innerHTML = `<section class="module"><div class="module-head"><div><p class="step">Step ${module.number} · ${module.time}</p><h1>${module.title}</h1></div><label class="complete"><input type="checkbox" id="complete-module"> Done</label></div><p class="lead">${module.lead}</p>${lessonBrief(module)}${module.body}${lessonNavigation(module)}</section>`;
  document.querySelectorAll(".module-link").forEach(link => link.classList.toggle("active", link.dataset.module === module.id));
  document.querySelector(`.module-link[data-module="${module.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  document.getElementById("complete-module").checked = progress().has(module.id);
  document.getElementById("complete-module").addEventListener("change", event => setComplete(module.id, event.target.checked));
  document.querySelectorAll(".copy").forEach(button => button.addEventListener("click", () => copyCommand(button.dataset.command)));
  document.querySelectorAll("[data-go-module]").forEach(button => button.addEventListener("click", () => showModule(button.dataset.goModule)));
  if (updateHash) history.replaceState(null, "", `#${module.id}`);
  document.title = `${module.nav} | Past the Vibes`;
  content.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function progress() {
  try { return new Set(JSON.parse(localStorage.getItem(storageKey) || "[]")); }
  catch { return new Set(); }
}

function setComplete(id, checked) {
  const state = progress();
  checked ? state.add(id) : state.delete(id);
  localStorage.setItem(storageKey, JSON.stringify([...state]));
  renderProgress();
}

function renderProgress() {
  const state = progress();
  document.querySelectorAll(".module-link").forEach(link => link.classList.toggle("done", state.has(link.dataset.module)));
  document.getElementById("progress").value = state.size;
  document.getElementById("progress-label").textContent = `${state.size} of ${modules.length} complete`;
}

async function copyCommand(key) {
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(commands[key]);
    else fallbackCopy(commands[key]);
  } catch {
    fallbackCopy(commands[key]);
  }
  const toast = document.getElementById("toast");
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1200);
}

function fallbackCopy(value) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

document.querySelectorAll(".module-link").forEach(link => link.addEventListener("click", () => showModule(link.dataset.module)));
document.getElementById("reset-progress").addEventListener("click", () => {
  localStorage.removeItem(storageKey);
  renderProgress();
  showModule(location.hash.slice(1) || "welcome", false);
});
renderProgress();
showModule(location.hash.slice(1) || "welcome", false);

function escape(value) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
function command(title, key) { return `<div class="command"><header><span>${title}</span><button class="copy" data-command="${key}">Copy command</button></header><pre><code>${escape(commands[key])}</code></pre></div>`; }
function steps(items) { return `<ol class="tasks">${items.map(item => `<li>${item}</li>`).join("")}</ol>`; }
function note(title, text, type = "") { return `<aside class="note ${type}"><strong>${title}</strong><br>${text}</aside>`; }
function concept(title, text) { return `<section class="concept"><p class="eyebrow">Concept</p><h2>${title}</h2><p>${text}</p></section>`; }
function predict(text) { return `<aside class="predict"><p class="eyebrow">Pause before running</p><strong>Make a prediction</strong><p>${text}</p></aside>`; }
function knowledgeCheck(question, answer) { return `<section class="knowledge"><p class="eyebrow">Check your understanding</p><details><summary>${question}</summary><p>${answer}</p></details></section>`; }
function done(text) { return note("You are done when", text, "success"); }
function fallback(text) { return note("If blocked", text, "warning"); }
function expected(text) { return `<div class="expected"><strong>Find this evidence</strong><pre><code>${escape(text)}</code></pre></div>`; }
function flow(items) { return `<div class="flow">${items.map((item, index) => `${index ? "<i>→</i>" : ""}<div><b>${item[0]}</b><span>${item[1]}</span></div>`).join("")}</div>`; }
function table(headers, rows) { return `<table><thead><tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`; }
function skillDelivery() {
  return `<h2>One skill, two delivery paths</h2>
    ${table(["Executor","How the selected skill arrives"],[
      ["Claude CLI","<code>injectSkillText()</code> appends the complete skill body to the subprocess prompt."],
      ["Strands","<code>Skill</code> objects enter an <code>AgentSkills</code> plugin. Metadata appears first; the agent activates instructions with the <code>skills</code> tool."],
      ["Replay","No model runs. A recorded response replaces the live executor while the same phase plan remains visible."],
    ])}
    ${note("Why Strands gets three turns","With a selected skill, the mini agent needs room to discover the skill, activate it, and return JSON. Without skills it keeps the one-turn limit.")}`;
}
function strandsConstructs() {
  return `<h2>Strands constructs used here</h2>
    <p>Read this table from setup to result. These are the Strands APIs the workshop uses.</p>
    ${table(["Construct","What it does here","Where to find it"],[
      ["<code>Agent</code>","Runs the model-and-tool loop for one phase. <code>name</code> and <code>description</code> identify its job.","<code>port-executor.ts</code>"],
      ["<code>Model</code>, <code>BedrockModel</code>, <code>OpenAIModel</code>","Hide provider-specific model calls. OpenRouter uses <code>OpenAIModel</code> with an OpenAI-compatible base URL.","<code>model-factory.ts</code>"],
      ["<code>systemPrompt</code>","Sets durable operating rules: inspect first, use read-only evidence, and return a complete patch.","<code>port-executor.ts</code>"],
      ["<code>tool()</code>","Turns a named callback into a model-callable capability. The description tells the model when to use it.","<code>port-tools.ts</code>"],
      ["<code>inputSchema</code>","Uses Zod to validate tool arguments and type the callback input before project code runs.","<code>port-tools.ts</code>"],
      ["<code>tools</code>","Registers only list, read, and literal search. No write or shell capability enters the agent loop.","<code>port-executor.ts</code>"],
      ["<code>Skill</code>","Represents one selected mini-harness instruction with a name, description, and full body.","<code>model-runtime.ts</code>"],
      ["<code>AgentSkills</code>","Adds progressive skill disclosure and the model-callable <code>skills</code> activation tool.","<code>model-runtime.ts</code>"],
      ["<code>plugins</code>","Registers <code>AgentSkills</code> on the Strands agent. Claude CLI does not use this field.","<code>model-runtime.ts</code>"],
      ["<code>structuredOutputSchema</code>","Requires the final answer to match <code>{ summary, files }</code>. Strands validates it and can feed schema failures back to the model.","<code>port-contract.ts</code>"],
      ["<code>printer: false</code>","Disables Strands' automatic console renderer so the CLI keeps stdout reserved for versioned JSON events.","<code>port-executor.ts</code>"],
      ["<code>agent.invoke()</code>","Starts one bounded run with the assembled phase prompt.","<code>port-executor.ts</code>"],
      ["<code>limits.turns</code> / <code>limits.totalTokens</code>","Bound the loop. The mini-harness allows three turns with skills and one without; the port allows 8 turns and 40,000 tokens.","<code>port-executor.ts</code>, <code>model-runtime.ts</code>"],
      ["<code>cancelSignal</code>","Lets a native ten-minute <code>AbortSignal</code> cancel the invocation at Strands cancellation points.","<code>port-executor.ts</code>"],
      ["<code>AgentResult</code>","Carries validated <code>structuredOutput</code>, messages, stop state, and metrics after invocation.","returned by <code>invoke()</code>"],
      ["<code>StructuredOutputError</code>","Makes a missing structured patch an explicit executor failure.","<code>port-executor.ts</code>"],
      ["<code>metrics.accumulatedUsage</code>","Reports input and output tokens. The harness records them and applies its own cost rates.","<code>port-executor.ts</code>"],
    ])}
    ${note("Keep the boundary visible","Zod supplies schemas, native <code>AbortSignal</code> supplies cancellation, and the harness supplies cost policy and verification. Strands consumes those inputs and runs the bounded agent loop.")}`;
}
function fullHarnessStrandsConstructs() {
  return `<h2>Why the workshop uses invoke</h2>
    <p>The workshop uses <code>agent.invoke()</code> so one phase has one visible request, one typed result, and one metrics object. A larger CLI can use <code>agent.stream()</code> and <code>AgentStreamEvent</code> for progress without changing the pipeline boundary.</p>
    ${note("Features still outside the design","The repository does not use Strands hooks, Graph, Swarm, agent-as-tool, SDK session or memory managers, custom conversation managers, or SDK-provided write and shell tools.")}`;
}
function mcpConstructs() {
  return `<h2>Strands MCP constructs used here</h2>
    ${table(["Construct","Role in the ADBT path"],[
      ["<code>McpClient</code>","Strands client wrapper that connects lazily, exposes MCP tools, calls them, and cleans up the connection."],
      ["<code>applicationName</code> / <code>applicationVersion</code>","Identify Past the Vibes Workshop to the MCP server during connection setup."],
      ["<code>listTools()</code>","Strands calls this for the passed <code>McpClient</code> to discover ADBT's tools dynamically, then exposes them to the model. The harness does not require or pre-pick tool names."],
      ["<code>Agent({ tools: [...projectTools, adbtClient] })</code>","The <code>McpClient</code> is passed into the agent's tools. Strands invokes ADBT's tools for the model during the agent loop; the harness does not call them."],
      ["<code>agent.messages</code>","After the phase, the harness walks the tool-use and tool-result blocks to reconstruct which ADBT docs the model read, then hashes them into <code>adbt-port-context.json</code>."],
      ["<code>disconnect()</code>","Closes the child server and transport in <code>finally</code>, including failure paths."],
    ])}
    ${note("The transport is a separate layer","<code>StdioClientTransport</code> comes from the official Model Context Protocol SDK, not Strands. It starts pinned ADBT as a child process. The harness passes the <code>McpClient</code> into the agent's tools so the model can call ADBT itself; provenance is reconstructed from the message history afterward.")}`;
}
function snippet(caption, code, look) { return `<figure class="snippet"><figcaption>${caption}</figcaption><pre><code>${escape(code)}</code></pre>${look ? `<p class="look"><strong>Where to look:</strong> ${look}</p>` : ""}</figure>`; }
function phaseCard(opts) {
  const tags = (opts.tags || []).map(tag => `<span class="tag ${tag.kind || ""}">${tag.label}</span>`).join("");
  const rows = Object.entries(opts.rows).map(([term, def]) => `<dt>${term}</dt><dd>${def}</dd>`).join("");
  return `<section class="phase"><h3><span class="num">${opts.num}</span><code>${opts.name}</code>${tags}</h3><dl>${rows}</dl></section>`;
}
function lessonBrief(module) { return `<section class="lesson-brief" aria-label="Lesson goals"><div><span>By the end, you can</span><p>${module.objective}</p></div><div><span>Evidence you will produce</span><p>${module.evidence}</p></div></section>`; }
function lessonNavigation(module) {
  const index = modules.indexOf(module);
  const previous = modules[index - 1];
  const next = modules[index + 1];
  return `<nav class="lesson-nav" aria-label="Lesson navigation">${previous ? `<button data-go-module="${previous.id}"><span>Previous</span>${previous.number} · ${previous.nav}</button>` : "<span></span>"}${next ? `<button class="next" data-go-module="${next.id}"><span>Next</span>${next.number} · ${next.nav}</button>` : `<button class="next" data-go-module="welcome"><span>Review</span>Return to setup</button>`}</nav>`;
}

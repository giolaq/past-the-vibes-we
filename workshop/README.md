# Past the Vibes

In this workshop, you build a coding harness with AWS Strands Agents SDK and use it to port one React Native flow to Vega TV. The harness is what you take home: swap its skills, its MCP server, or its executor — run it with the CLI coding agent you already use, or directly with Strands + Bedrock — and point it at your own use case.

Use the [workshop web app](index.html) during the session. It gives you the commands, shows what to inspect, and tracks your progress. The web app is generated from the Markdown lessons in `lessons/`, which are the single source of truth for every exercise. If the hosted copy is unavailable, open `index.html` from your clone.

## Strands Agents SDK in this workshop

[Strands Agents SDK](https://github.com/strands-agents/harness-sdk) is AWS's open-source agent runtime, used here as the live remote executor. Both the complete workshop harness and the staged mini-harness pin `1.10.0`. It provides the model loop, provider-agnostic model access (Bedrock, OpenAI, OpenRouter behind one interface), Zod-typed tools, schema-enforced structured output, execution limits, cancellation, and usage metrics — and it stays a library, so the harness keeps ownership of writes, checks, and commits.

The workshop starts with React Native, not a website. Every mini-harness step modifies a reduced Pocket Cinema app, so the target stays familiar while the harness grows from one model call into phases, checks, skills, and executors.

The workshop harness stays in control around that runtime:

```text
ADBT MCP -> approved Vega context --+
                                      +-> Strands agent -> validated patch
guarded app -> read-only tools -------+                         |
                                                                v
                     harness writes -> checks -> retry -> commit -> report
```

The Strands agent can list, read, and search the guarded app. It cannot write files or run shell commands. ADBT joins the agent's tools during `analyze` and `plan` through a Strands `McpClient`; the model decides which Vega workflows to read, and the harness reconstructs and hashes every read so the run stays reproducible. The harness validates the patch, writes it, runs checks, enforces cost, and commits only passing work.

This split is why you build a harness instead of prompting a coding agent. You get control — writes, checks, retries, cost, and commits happen in your code — and you get observability: every model turn is recorded, every ADBT read is hashed, every phase has a cost figure and a Git commit, and every run ends in a structured report you can hand to another developer.

Read [Strands Constructs Used in This Workshop](strands-constructs.md) for a code-level explanation of every Strands API used here and the boundaries that remain outside the SDK.

## What you will do

1. Run one model call and identify what it cannot prove.
2. Add checks and retry once with the exact failure.
3. Split the work into phases, commits, and checkpoints.
4. Separate skills, tools, and model executors.
5. Review project context before saving it as memory.
6. Copy and inspect a React Native app, then port it to Vega with model-fetched, hash-recorded ADBT migration context.
7. Adapt one flow for TV remote navigation.
8. Replay the full Vega lifecycle, then optionally run it on a VDA device.
9. Sketch a harness for your own work.

You can use `apps/pocket-cinema` for every exercise. Bring your own app only if it already runs and contains no secrets.

## Recommended four-hour path

Follow lessons 1–8, skip optional lesson 9, and finish with lesson 10. The schedule includes two 10-minute breaks and a 20-minute recovery block. Replay is the standard workshop path, so everyone can finish without a model account or Vega device.

## Choose how to run models

- **Replay:** no account, API key, model, or device required. Use this path during the workshop if setup fails.
- **Claude Code:** run a local model session with `--executor claude-cli`.
- **Strands:** use the in-process Strands Agents SDK with Bedrock, OpenAI, or OpenRouter via `--executor strands`.

Start with [Before You Arrive](lessons/00-welcome.md). Keep [Troubleshooting](troubleshooting.md) open during the session.

Handing this workshop to an AI agent instead of a person? Point it at the [agent runbook](AGENT_RUNBOOK.md) — it maps the lessons to replay commands, evidence, and a completion report.

## Lessons

1. [From prompt to loop](lessons/01-single-agent.md)
2. [Verification and retry](lessons/02-verify.md)
3. [Phases, checkpoints, and cost](lessons/03-phases.md)
4. [Tools, skills, and executors](lessons/04-skills.md)
5. [Project memory](lessons/05-memory.md)
6. [Adapt your React Native app](lessons/06-plan.md)
7. [TV as the stress test](lessons/07-tv.md)
8. [Vega platform adapter](lessons/08-vega.md)
9. [Optional: Bee context](lessons/09-bee.md)
10. [Take it home](lessons/10-finish.md)

The key-free port uses `fixtures/port-recording.json` plus `fixtures/adbt-port-context.json`. Add `--adbt-live` to call ADBT at runtime while keeping the model replayed. The Vega lifecycle uses `fixtures/vega-lifecycle.json`. Replay proves the workshop control flow and report contract; it is not proof that a physical or virtual device passed. If a live Vega step fails, continue with `checkpoints/vega-buildable/` or `checkpoints/complete/`.

Read [the live rehearsal record](live-rehearsal.md) before teaching the Vega section. The SDK build and manifest validation pass. Install, launch, logs, and screenshots still need a VDA process that remains attached outside the automation session.

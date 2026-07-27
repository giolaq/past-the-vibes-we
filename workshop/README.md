# Past the Vibes

In this workshop, you build a coding harness with AWS Strands Agents SDK and use it to port one React Native flow to Vega TV. The harness is what you take home: swap its skills, its MCP server, or its executor — run it with the CLI coding agent you already use, or directly with Strands + Bedrock — and point it at your own use case.

Use the [workshop web app](index.html) during the session. It gives you the commands, shows what to inspect, and tracks your progress. The web app is generated from the Markdown lessons in `lessons/`, which are the single source of truth for every exercise. If the hosted copy is unavailable, open `index.html` from your clone.

## Strands Agents SDK in this workshop

[Strands Agents SDK](https://github.com/strands-agents/harness-sdk) is AWS's open-source agent runtime, used here as the live remote executor, pinned at `1.10.0`. It provides the model loop, provider-agnostic model access (Bedrock, OpenAI, OpenRouter behind one interface), Zod-typed tools, schema-enforced structured output, execution limits, cancellation, and usage metrics — and it stays a library, so the harness keeps ownership of writes, checks, and commits.

The workshop starts with React Native, not a website. Every lesson works on the same Pocket Cinema app and the same harness, which grows from one model call into checks, a verified loop, skills, and executors.

The workshop harness stays in control around that runtime:

```text
ADBT MCP -> approved Vega context --+
                                      +-> selected agent -> validated patch
guarded app -> read-only tools -------+                         |
                                                                v
                     harness writes -> checks -> retry -> commit -> report
```

Both live executors can list, read, and search the guarded app. Neither can write files or run shell commands. During the feasibility audit and `plan`, ADBT joins the model through MCP: Strands receives a native `McpClient`, while Claude Code receives an explicit pinned `--mcp-config`. The model decides which Vega workflows to read, and the harness reconstructs and hashes every read. The harness validates the patch, rejects path and symlink escapes, writes it, runs checks, enforces cumulative cost, and commits only passing work.

This split is why you build a harness instead of prompting a coding agent. You get control —
writes, checks, retries, cost, and commits happen in your code — and you get observability:
every phase appends its complete prompt, native model and tool events, checks, and outcome to
`out/<runId>/model-logs/<phase>.jsonl`; every ADBT read is hashed; resumed phases append to one
cost and report; and every accepted change or generated evidence has a Git commit. Lesson 3
shows how to read and tail these files.

Read [Strands Constructs Used in This Workshop](strands-constructs.md) for a code-level explanation of every Strands API used here and the boundaries that remain outside the SDK.

## What you will do

1. Analyze the app with one bounded agent, and identify what its answer cannot prove.
2. Plan the TV port with a 10-foot focus skill and Vega's own migration workflows over MCP.
3. Write the port, and read the nine checks that decide whether it is kept.
4. Build until it compiles, with the compiler's diagnostics driving each retry.
5. Install and launch on the device, and prove the app stayed running.
6. Test the remote-control contract, with device frames as supporting evidence.
7. Control the full pipeline, complete the trust board, then defend a harness design as a team.

Appendix A1 applies the same engine to an explicitly approved Bee conversation.

You can use `apps/pocket-cinema` for every exercise. Bring your own app only if it already runs and contains no secrets.

## Recommended four-hour path

Follow lessons 1–7 with one live executor. The schedule includes two 10-minute breaks and a recovery block. Use recordings only when an external dependency blocks a specific exercise or when the instructor asks everyone to inspect the same failure. Appendix A1 is outside the timed path and requires Bee consent and access for a live run.

## Choose how to run models

- **Claude Code:** use `--executor claude-cli --model sonnet`. Claude Code must already be installed and authenticated.
- **Strands + Bedrock:** use `--executor strands --provider bedrock --model <id> --region <region>` with AWS credentials.
- **Strands + OpenAI:** use `--executor strands --provider openai --model <id>` with `OPENAI_API_KEY`.
- **Strands + OpenRouter:** use `--executor strands --provider openrouter --model <id>` with `OPENROUTER_API_KEY`.
- **Recorded fallback:** use the lesson's `--replay` command only when the live path is blocked or the exercise intentionally examines a known failure.

Choose one path and keep the same executor, provider, and model flags in every live lesson command.
The setup lesson includes exact examples, default model ids, pricing flags for other models, and a
matching `doctor` command for each provider. Start with [Before You Arrive](lessons/00-welcome.md).
Keep [Troubleshooting](troubleshooting.md) open during the session.

Handing this workshop to an automated test agent instead of an attendee? Point it at the [agent runbook](AGENT_RUNBOOK.md). That runbook deliberately uses recordings for deterministic repository verification; it is not the attendee path.

## Lessons

1. [Analyze the app](lessons/01-analyze.md)
2. [Plan the TV port](lessons/02-plan.md)
3. [Write the port](lessons/03-port.md)
4. [Build until it compiles](lessons/04-build.md)
5. [Run it on the device](lessons/05-launch.md)
6. [Test the remote](lessons/06-test.md)
7. [Control the pipeline and design your own](lessons/07-finish.md)

Appendix: [A conversation becomes code](lessons/A1-bee.md). Its recordings under `fixtures/bee-run/` support an instructor-led synthetic case study when no private conversation may be used.

Maintainer fixtures live under `fixtures/`. `port-retry/` and `build-retry/` intentionally capture one failed attempt and its repair so every attendee can inspect identical retry context. Regenerate them with `node scripts/build-port-fixtures.mjs`. A recording proves control flow and report compatibility only. A build claim requires `evidenceMode: live` and a local `.vpkg`; a device claim also requires filtered post-launch logs and two pulled frames. If live Vega setup blocks a lesson, continue from `checkpoints/vega-buildable/` or `checkpoints/complete/`.

Read [the live rehearsal record](live-rehearsal.md) before teaching the Vega section. The SDK build and manifest validation pass. Install, launch, logs, and screenshots still need a VDA process that remains attached outside the automation session.

# Past the Vibes Workshop

Build a coding harness with AWS Strands Agents SDK.
Use the harness to port one React Native flow to Vega TV.

The harness is the workshop result.
You can replace its skills, MCP server, executor, or target task.

## Use the workshop website

Open [the workshop website](index.html) during the session.
The website shows commands, evidence, and progress.

The files in `lessons/` are the source for the website.
If the hosted website is not available, open `index.html` from the clone.

## Know the runtime boundary

[Strands Agents SDK](https://github.com/strands-agents/harness-sdk) is the live in-process executor.
The package version is `1.10.0`.

Strands supplies:

- Model provider adapters
- Agent loop
- Typed tools
- Structured output
- Execution limits
- Cancellation
- Usage metrics
- MCP client

The harness supplies:

- Phase order
- Protected writes
- Independent checks
- Retry policy
- Cost limits
- Git commits
- Reports

```text
ADBT MCP -> Vega documents --+
                              +-> selected model -> typed patch
guarded app -> read tools ----+                         |
                                                        v
                   harness: write -> check -> retry -> commit -> report
```

Both live executors can list, read, and search the guarded app.
Neither executor can write files or run shell commands.

Strands receives ADBT as a native `McpClient`.
Claude Code receives the same server through `--mcp-config`.
The harness records each ADBT document read and its hash.

Read [Strands constructs](strands-constructs.md) for the SDK details.

## Complete the seven lessons

1. [Analyze the app](lessons/01-analyze.md).
2. [Plan the TV port](lessons/02-plan.md).
3. [Write the port](lessons/03-port.md).
4. [Build until it compiles](lessons/04-build.md).
5. [Run it on the device](lessons/05-launch.md).
6. [Test the remote](lessons/06-test.md).
7. [Control the pipeline and design your own](lessons/07-finish.md).

Use [Appendix A1](lessons/A1-bee.md) only with Bee consent and access.

## Select one model path

- **Claude Code:** Set `executor` to `claude-cli`.
- **Strands with Bedrock:** Set `executor`, `provider`, `model`, and `region`.
- **Strands with OpenAI:** Set `executor`, `provider`, and `model`.
- **Strands with OpenRouter:** Set `executor`, `provider`, and `model`.
- **Recorded fallback:** Use the lesson `--replay` command after a live dependency fails.

Store the selection in the root `workshop.config.json` file.
Command-line flags can override the file for one command.
Do not put credentials in the file.

After setup, run `cd packages/workshop-harness` once.
Keep the workshop terminal in that directory for lessons 1 through 7.

Start with [Lesson 00](lessons/00-welcome.md).
Keep [Troubleshooting](troubleshooting.md) open.

## Use evidence correctly

A recorded fallback verifies command order, checks, retry behavior, and report shape.
It does not verify a live model, local compiler, or device.

A live build claim requires:

- `evidenceMode: live`
- A local `.vpkg` file

A live device claim also requires:

- Successful install and start
- Filtered device log
- Two device screenshots

Use `checkpoints/vega-buildable/` or `checkpoints/complete/` after a live failure.
Read [the live rehearsal record](live-rehearsal.md) before you teach the Vega lessons.

## Automated verification

Give [the agent runbook](AGENT_RUNBOOK.md) to an automated test agent.
The runbook uses recorded data.
It is not the attendee path.

## Writing standard

All workshop instructions use the rules in [STE-STYLE.md](STE-STYLE.md).

# Strands Constructs Used in This Workshop

Use this guide when you read the workshop harness.

The harness pins `@strands-agents/sdk` `1.10.0`. Strands controls the uncertain
model and tool loop. Workshop code controls writes, checks, retries, cost, and
commits.

Read these files with this guide:

- `packages/workshop-harness/src/port-executor.ts`
- `packages/workshop-harness/src/model-factory.ts`
- `packages/workshop-harness/src/port-tools.ts`
- `packages/workshop-harness/src/port-contract.ts`
- `packages/workshop-harness/src/context-providers/adbt.ts`
- `packages/workshop-harness/src/skills.ts`

## Live Strands Path

```text
phase prompt
  -> Agent
     -> provider Model
     -> list, read, and search tools
     -> structured patch
  -> AgentResult
     -> token metrics
     -> recorder
  -> harness validates, writes, checks, retries, and commits
```

## Agent

| Construct | Function in this workshop |
| --- | --- |
| `Agent` | Runs one bounded model and tool loop. |
| `name` | Gives the phase agent a stable name for logs and traces. |
| `description` | States the agent task. |
| `model` | Receives the provider adapter from `model-factory.ts`. |
| `systemPrompt` | Requires discovery, evidence, and a complete patch. |
| `tools` | Gives the agent list, read, and literal search tools. |
| `structuredOutputSchema` | Requires the final `PortOutputSchema` shape. |
| `printer: false` | Stops SDK output from entering the CLI JSON stream. |

Phase instructions stay in the user prompt. Stable operating rules stay in
`systemPrompt`.

## Model Providers

Strands uses one common `Model` interface.

| Construct | Function |
| --- | --- |
| `BedrockModel` | Calls an Amazon Bedrock model. |
| `OpenAIModel` | Calls an OpenAI model. |
| `OpenAIModel` with `clientConfig.baseURL` | Calls OpenRouter through its OpenAI-compatible endpoint. |

The user selects a provider and model in `workshop.config.json`.
Command-line options can override the file for one run.
Verification stays the same for all providers.

## Typed Tools

`port-tools.ts` creates project tools with Strands `tool()`.

| Field or type | Function |
| --- | --- |
| `tool()` | Makes a TypeScript callback available to the model. |
| `name` | Gives the tool a stable identifier. |
| `description` | States when the model must use the tool. |
| `inputSchema` | Uses Zod to validate tool arguments. |
| `callback` | Runs the deterministic tool operation. |
| `InvokableTool` | Defines the TypeScript tool-list contract. |
| `JSONValue` | Limits boundary values to JSON-compatible data. |

The callbacks also reject:

- Absolute paths.
- Parent-directory traversal.
- Symbolic links.
- `.git`, `.env`, and `node_modules`.
- Binary files.
- Large files.
- Paths outside the guarded copy.

The agent has no write tool. The agent has no shell tool. The pipeline owns
irreversible actions.

## Structured Output

The executor gives `PortOutputSchema` to Strands as
`structuredOutputSchema`.

```text
{
  summary: string,
  files: Record<relativePath, completeFileContents>
}
```

Strands validates this shape. It can give schema feedback to the model when
the response is invalid.

After the call:

- `AgentResult.structuredOutput` holds the validated value.
- `StructuredOutputError` reports a shape failure.
- The executor parses the value again at its boundary.
- The harness validates every path before it writes a file.

Structured output proves data shape. It does not prove that the patch is safe,
correct, buildable, or usable on TV. Phase checks provide that evidence.

## Invocation Controls

The workshop uses this call:

```text
agent.stream(prompt, {
  cancelSignal,
  limits: { turns: 8, totalTokens: 40000 }
})
```

| Construct | Function |
| --- | --- |
| `agent.stream()` | Starts one agent run and returns streamed events. |
| `AgentStreamEvent` | Carries messages, tool calls, tool results, and lifecycle events. |
| `limits.turns` | Limits the model and tool loop to eight turns. |
| `limits.totalTokens` | Limits total tokens for the call. |
| `cancelSignal` | Stops the call after the ten-minute timeout or an external abort. |
| `AgentResult` | Holds structured output, messages, stop data, and metrics. |
| `metrics.accumulatedUsage` | Reports input and output token use. |

Strands reports token use. The harness calculates cost. The harness applies
the run budget.

## Skills

Each phase names its skills. The executor selects the delivery method.

| Executor | Skill delivery |
| --- | --- |
| Claude CLI | `injectSkillText()` adds the complete skill text to the prompt. |
| Strands | `AgentSkills` registers each instruction as a `Skill` plugin and supplies the `skills` activation tool. |
| Recorded fallback | No model runs. The recorded response replaces the live call. |

The base phase prompt does not contain the skill body. This prevents duplicate
instructions in the Strands path.

The harness reports and skips a missing skill. See
`packages/workshop-harness/src/skills.ts` and
`packages/workshop-harness/tests/skills.test.ts`.

## Streaming and Transcripts

The harness uses `agent.stream()` to record events while the phase runs.
It appends each event to:

```text
out/<runId>/model-logs/<phase>.jsonl
```

The transcript contains model messages, tool calls, tool results, and the
final result. `consumeStream()` also keeps the returned `AgentResult`.

Streaming improves observation. It does not give the SDK control of phase
order, budgets, retries, checkpoints, verification, or reports.

## MCP and ADBT

The harness uses Strands `McpClient` for ADBT.

In a live Strands run, the feasibility and plan agents receive ADBT tools.
The model selects the documents that it needs.

The commands `doctor --adbt-live` and `context adbt` also use `McpClient`
directly. Claude Code uses the same pinned server through `--mcp-config`.

| Construct | Function |
| --- | --- |
| `McpClient` | Connects to the trusted MCP server and exposes its tools. |
| `applicationName` and `applicationVersion` | Identify the workshop to the server. |
| `listTools()` | Gets the available server tools. |
| `callTool()` | Calls one tool with JSON arguments and a cancellation signal. |
| `JSONValue` | Defines the JSON data boundary. |
| `disconnect()` | Closes the server and its child process. |

`StdioClientTransport` comes from the official Model Context Protocol SDK. It
starts the pinned ADBT process and carries MCP messages through standard input
and output.

After the model reads a document, the harness gets the source from message
history. It records each source and hash in `adbt-port-context.json`.
`extractAdbtProvenance()` implements this operation. Claude events use the same
record format.

## Harness Responsibilities

| Responsibility | Owner |
| --- | --- |
| Phase order, dependencies, retries, and resume | Workshop harness |
| Human approval and cost limit | Workshop harness |
| Schemas | Zod and workshop code |
| MCP transport | Model Context Protocol SDK |
| Protected writes and rollback | Workshop harness |
| Build, focus, and platform checks | Workshop harness |
| Commits, checkpoints, recordings, and reports | Workshop harness |
| Token price calculation | Workshop harness |

## SDK Features Not Used

This workshop does not use Strands hooks, Graph, Swarm, agent-as-tool, session
managers, memory managers, custom conversation managers, or SDK write and
shell tools.

One bounded `Agent` is sufficient for uncertain work. Deterministic TypeScript
controls the workflow.

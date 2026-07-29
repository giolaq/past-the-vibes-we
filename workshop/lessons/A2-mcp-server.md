---
id: mcp-server
number: 'A2'
nav: 'Challenge: build an MCP server'
time: 60 minutes
title: 'Challenge: adapt the harness to build an MCP server'
lead: We will choose one repeated task and adapt the phase engine to produce and verify a small Model Context Protocol server for it.
objective: Define an approved MCP tool contract, create server code in a guarded copy, and verify it with an SDK client that does not use a model.
evidence: An approved server specification, a passing MCP client contract test, a phase commit, and one successful tool call.
---

:::welcome Turn one repeated task into a tested interface
The main workshop used MCP servers as knowledge sources.
ADBT supplied Vega documents.
Bee supplied consented conversation data.

In this challenge, we will change the direction.
We will adapt the harness to produce an MCP server.
A fixed MCP client will check if the server follows the approved contract.
:::

## Understand the two systems

The harness and the MCP server have different functions.

| System             | Function                                                               |
| ------------------ | ---------------------------------------------------------------------- |
| Agent harness      | Gives the model context, applies proposed files, runs checks, and records evidence |
| Generated MCP server | Gives MCP clients approved tools and data through a standard protocol |
| Contract test      | Connects as a client and checks the server without model judgment      |

The generated server is not an agent.
It does not select a model or decide which tool to call.
It supplies a typed interface that an agent can use.

```text
brief + local data -> harness -> generated MCP server
                                      |
                                      v
fixed MCP client -> initialize -> list tools -> call tools -> check results
```

## Choose one useful question

A useful first server can be small.
Select one local data source and no more than two read-only tools.

| Use case              | Local data                    | Tool 1             | Tool 2            |
| --------------------- | ----------------------------- | ------------------ | ----------------- |
| Project documentation | Markdown files                | `search_docs`      | `read_doc`        |
| Test investigation    | JUnit or JavaScript Object Notation (JSON) reports | `list_failures` | `read_failure` |
| Movie discovery       | Pocket Cinema catalog         | `search_movies`    | `get_movie`       |
| Dependency review     | Package manifests and lockfile | `find_dependency` | `explain_version` |

Think about a task that your team repeats.
Ask which small interface would remove file searches and format knowledge from
that task.

:::note Keep the first server local {warning}
Use local files and the standard input and output transport.
Do not start with credentials, remote deployment, writes, or production data.
Add those concerns only after the local contract passes.
:::

## Know the MCP surface

Read the [Model Context Protocol documentation](https://modelcontextprotocol.io/)
and the
[TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).

Select one SDK:

| SDK | Use it when |
| --- | --- |
| [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) | You need direct protocol control and a small local `stdio` server. The examples in this challenge use this SDK. |
| [mcp-use](https://github.com/mcp-use/mcp-use) | You want TypeScript or Python scaffolding, an Inspector, hot reload, and a local HTTP server. |

The default challenge uses `stdio`.
If you select `mcp-use`, change the approved transport to local Streamable
HTTP.
Bind it to the loopback interface and run the same fixed client checks.

Review the
[TV Streaming MCP App](https://github.com/giolaq/tv-mcp-app)
for a larger `mcp-use` example.
It uses TypeScript, React, TV content tools, an interactive widget, and the
local MCP Inspector.
It also uses a remote catalog and more tools than this challenge permits.
Use it as a design reference, but keep your first server local and limited to
two read-only tools.

An MCP server can expose three main capability types:

| Capability | Use it when                                                        |
| ---------- | ------------------------------------------------------------------ |
| Tool       | A client must request a computation or action with typed arguments |
| Resource   | A client must read content identified by a Uniform Resource Identifier (URI) |
| Prompt     | A client needs a reusable message template                         |

This challenge starts with tools only.
Tools give the contract test one direct interface to list and call.

## Define the contract before code

The specification must describe what the server is permitted to expose.
It must not contain executable commands.

Include these fields:

| Field                  | Required information                                      |
| ---------------------- | --------------------------------------------------------- |
| Server                 | Name, version, and `stdio` transport                       |
| Data sources           | Approved relative paths and read-only access               |
| Tools                  | Name, description, input schema, and side-effect statement |
| Valid example          | Approved arguments and required result text                |
| Invalid example        | Arguments that the server must reject                      |
| Exclusions             | Network, credentials, writes, and undeclared capabilities  |

The prepared fixture uses the Pocket Cinema catalog:

`workshop/fixtures/mcp-server-challenge/mcp-server-spec.json`

It defines `search_movies` and `get_movie`.
It also states that the server has no network access and cannot change the
catalog.

:::snippet Target MCP specification schema (simplified)
const McpToolSpecSchema = z.object({
name: z.string(),
description: z.string(),
inputSchema: z.record(z.string(), z.unknown()),
validExample: z.object({
arguments: z.record(z.string(), z.unknown()),
expectedText: z.string(),
}),
invalidExample: z.object({
arguments: z.record(z.string(), z.unknown()),
}),
sideEffect: z.literal("none"),
});

const McpServerSpecSchema = z.object({
schemaVersion: z.literal(1),
server: z.object({
name: z.string(),
version: z.string(),
transport: z.literal("stdio"),
}),
dataSources: z.array(z.object({
path: z.string(),
access: z.literal("read-only"),
})),
tools: z.array(McpToolSpecSchema).min(1).max(2),
exclusions: z.array(z.string()),
});

>look: The schema limits the first server to two tools and read-only data. The harness validates relative paths separately.
:::

## Separate the phase engine from Vega policy

`runPortPipeline` already accepts a different phase list.
The Bee challenge uses that feature.

The function is not fully generic.
Four parts still contain Vega policy:

| Keep from the current engine        | Replace or parameterize                          |
| ----------------------------------- | ------------------------------------------------ |
| Read-only project tools             | Vega base prompt                                 |
| Structured file response            | `workshop-brief.md` name and protected paths     |
| Path validation and guarded writes  | Port-plan schema and approval                    |
| Check, retry, reset, and commit loop | ADBT-specific source record                      |
| Transcripts, usage, and TUI events  | Vega build and device checks                     |

Do not rewrite the loop first.
Move each product-specific rule behind one pipeline definition while the
existing port tests remain green.

:::snippet Target generic engine boundary
type PipelineDefinition = {
name: string;
briefPath: string;
protectedPaths: string[];
phases: Phase[];
buildPrompt(context: PhaseContext): string;
verify(phase: Phase, workspace: string): Promise<string[]>;
recordSources?(messages: unknown[]): SourceRecord;
};

await runPipeline({
definition: mcpServerPipeline(spec),
workspace,
executor,
});

>look: The engine owns effects and retries. The definition owns the product prompt, protected files, phases, checks, and source record.
:::

The original `runPortPipeline` can then become a thin Vega definition.
The Bee plan and the new MCP plan can use the same engine without receiving
Vega instructions.

## Define the new phase plan

Use one review point before implementation.

:::flow
Specify | Write a typed server contract
Review | Approve tools, paths, examples, and exclusions
Apply | Create the server from the approved contract
Test | Connect a fixed client and run every approved example
Report | Commit passing files and retain protocol evidence
:::

The phase plan can follow this shape:

:::snippet packages/workshop-harness/src/mcp-pipeline.ts (target design)
export function mcpPhases(spec, workspace) {
return spec
? [
mcpSpecPhase(),
mcpApplyPhase(spec, workspace),
mcpContractPhase(spec),
]
: [mcpSpecPhase()];
}

function mcpApplyPhase(spec, workspace) {
return {
name: "mcp_apply",
verifyFirst: true,
maxAttempts: 3,
readOnly: [
"mcp-server-spec.json",
"MCP_SERVER_SPEC.md",
"mcp-server-spec-approval.json",
],
checks: [
...approvedToolChecks(spec, workspace),
typecheck,
mcpContractTest,
],
};
}

>look: The model cannot edit the approved specification, approval file, or contract test.
:::

The `mcp_spec` phase writes JSON.
The harness validates the JSON and renders `MCP_SERVER_SPEC.md`.
A person reviews the specification.
The approval file stores hashes for the specification and brief.

The `mcp_apply` phase receives the approved contract.
It can propose server files.
It cannot change the contract that measures its work.

## Build the server with the SDK

The workshop package already includes `@modelcontextprotocol/sdk` and Zod.
Use `McpServer` for the server and `StdioServerTransport` for the local
transport.

:::snippet Minimal TypeScript MCP server
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

export function createServer() {
const server = new McpServer({
name: "pocket-cinema-catalog",
version: "0.1.0",
});

server.registerTool("search_movies", {
description: "Search the local movie catalog by title.",
inputSchema: {
query: z.string().min(1),
},
}, async ({ query }) => ({
content: [{
type: "text",
text: JSON.stringify(searchCatalog(query)),
}],
}));

return server;
}

const server = createServer();
await server.connect(new StdioServerTransport());

>look: The input schema rejects an empty query before the handler runs. The handler reads only the approved local catalog.
:::

Do not write diagnostic text to standard output when you use the `stdio`
transport.
Protocol messages use standard output.
Send diagnostics to standard error.

## Test the server without a model

The contract test must use a real MCP client.
The SDK `InMemoryTransport` connects the client and server in one test process.
It does not require a network port.

:::snippet Fixed MCP client test (simplified)
const [clientTransport, serverTransport] =
InMemoryTransport.createLinkedPair();

const server = createServer();
const client = new Client({
name: "mcp-contract-test",
version: "1.0.0",
});

await server.connect(serverTransport);
await client.connect(clientTransport);

const listed = await client.listTools();
assert.deepEqual(
listed.tools.map(tool => tool.name).sort(),
spec.tools.map(tool => tool.name).sort(),
);

const result = await client.callTool({
name: "search_movies",
arguments: { query: "Signal" },
});

assert.match(JSON.stringify(result), /Signal Coast/);

>look: The client sees only approved tool names. The tool call must return the approved example result.
:::

The fixed test must check:

1. The client completes initialization.
2. `tools/list` returns exactly the approved tools.
3. Every tool has the approved description and input schema.
4. Every valid example returns its required text.
5. Every invalid example is rejected.
6. The server exposes no undeclared resources or prompts.
7. The test closes the client and server.

The model does not write this test.
The harness owns it.

## Challenge: build your pipeline

Work in a team of two or three people.
Use one use case from the table or select another local data source.

:::yourturn
Create a branch for the challenge.
Define the approved contract before you add model phases.
Keep all existing port tests green while you extract the generic engine.
:::

:::command Create a challenge branch
git switch -c challenge/mcp-server
:::

Complete these tasks:

:::steps

1. Write one sentence that states the user question.
2. Select one local data source.
3. Define one or two read-only tools.
4. Give each tool one valid and one invalid example.
5. Write the fixed MCP client contract test.
6. Run the test and confirm that it fails because the server is missing.
7. Extract the generic engine boundary.
8. Add `mcp_spec`, approval, `mcp_apply`, and `mcp_contract` behavior.
9. Run the adapted harness.
10. Inspect the specification, transcript, checks, and commits.
11. Ask another team to find one false positive in your contract test.
12. Improve the weak check.
    :::

Run the repository checks after each engine change:

:::command Keep the existing harness green
yarn typecheck
yarn test
:::

Your adapted command interface should support this sequence:

```sh
yarn tsx src/index.ts mcp-run <server-directory> \
  --propose --yes --run-id mcp-server

yarn tsx src/index.ts approve-mcp-spec mcp-server --yes

yarn tsx src/index.ts mcp-run <server-directory> \
  --apply --yes --run-id mcp-server
```

The first command must stop for review.
The second command must record the specification and brief hashes.
The third command must refuse changed or missing approval.

## Inspect the result

Your run should retain these artifacts:

| Artifact                                      | What it proves                                  |
| --------------------------------------------- | ----------------------------------------------- |
| `app/mcp-server-spec.json`                    | The machine-checked server contract             |
| `app/MCP_SERVER_SPEC.md`                      | The contract that a person reviewed             |
| `app/mcp-server-spec-approval.json`           | The approved specification and brief hashes     |
| `model-logs/mcp_spec.jsonl`                   | How the model produced the proposed contract    |
| `model-logs/mcp_apply.jsonl`                  | How the model proposed implementation files     |
| `mcp-contract-result.json`                    | Client initialization, list, call, and rejection checks |
| Guarded Git commits                           | Files accepted after each passing phase         |

:::note Use the prepared fixture when time is short {warning}
Use `workshop/fixtures/mcp-server-challenge/mcp-server-spec.json`.
Implement the Pocket Cinema server and fixed client test first.
Then describe the engine changes that would automate the implementation.

This path proves the server contract.
It does not prove that your adapted harness can produce the server.
:::

## Extend the idea after the challenge

After the local read-only server passes, you can add one concern at a time:

- Add resources for stable documents.
- Add a Streamable HTTP transport for a remote service.
- Add authorization before any protected data.
- Add one write tool with explicit approval and idempotency.
- Add rate, timeout, cancellation, and audit checks.
- Connect the server to a Strands agent as an MCP client.

Each extension needs a new independent check.
Do not use the model response as proof.

:::proof
claim: "The adapted harness can produce a bounded MCP server for the selected use case"
gate: "A fixed SDK client initializes, lists only approved tools, runs valid examples, rejects invalid examples, and closes cleanly"
evidence: "MCP_SERVER_SPEC.md, mcp-server-spec-approval.json, mcp-contract-result.json, model transcripts, and phase commits"
limit: "Local stdio checks do not prove remote deployment, authorization, rate limits, or production data quality"
:::

:::knowledge What changed?
The target changed from a Vega application to an MCP server.
The model still proposed files through read-only project tools.
The harness still controlled writes, checks, retries, approval, commits, and
reports.
The fixed client supplied protocol evidence without model judgment.
:::

:::done
The use case has one local data source.
The approved contract contains no more than two read-only tools.
The model cannot edit the approved specification or contract test.
The fixed MCP client test passes.
Another team reviewed one possible false positive.
:::

---
id: bee
number: 'A1'
nav: 'Challenge: Bee conversation'
time: 30 minutes
title: 'Challenge: build something from a Bee conversation'
lead: We will use Bee CLI or Bee MCP to turn one consented conversation into something useful.
objective: Install Bee CLI, read one consented conversation, and use any harness implementation to create a bounded result.
evidence: A source conversation ID, one useful result, one independent check, and no private transcript in the repository.
---

:::welcome Use a conversation as input
The main workshop used a harness to port an app.
In this challenge, we will use one Bee conversation as input for a new task.

You can use Bee CLI directly or connect to Bee through MCP.
You can use the workshop harness, your own harness, a script, or another agent
framework.
:::

## Choose what to make

Select one conversation and one small result.

| Conversation content | Possible result                        |
| -------------------- | -------------------------------------- |
| Product discussion   | A reviewed feature specification       |
| Design review        | A list of decisions and open questions |
| Planning meeting     | An action checklist with owners        |
| User feedback        | One bounded app change                 |
| Technical discussion | A tested example or short document     |

The conversation supplies context.
It does not automatically become an approved requirement.
Review the selected request before your harness changes files or creates an
external action.

## Install Bee CLI

Read the [Bee CLI repository](https://github.com/bee-computer/bee-cli).
Install the latest Bee mobile app.

Enable Developer Mode in the Bee app:

:::steps

1. Open Settings in the Bee app.
2. Find the app version.
3. Tap the app version five times.
   :::

Install Bee CLI from npm and authenticate:

:::command Install and authenticate Bee CLI
npm install -g @beeai/cli
bee version
bee login
bee status
:::

The `bee status` command must confirm that you are authenticated before you
continue.

## Find one conversation

Search for a subject that you discussed:

:::command Search Bee conversations
bee search --query "<subject>" \
 --filter conversations --limit 5 --json
:::

Select one result and read it:

```sh
bee conversations get <conversation-id> --json
```

Record the conversation ID in your private notes.
Do not redirect the transcript into the workshop repository.

## Choose Bee CLI or Bee MCP

Both paths read the same Bee data.

| Path    | How to use it                                                    |
| ------- | ---------------------------------------------------------------- |
| Bee CLI | Run `bee` commands from your harness and parse their JSON output |
| Bee MCP | Let an MCP client search and read Bee through MCP tools          |

### Use Bee CLI

Your harness can run commands such as:

```sh
bee search --query "<subject>" \
 --filter conversations --limit 5 --json
bee conversations get <conversation-id> --json
```

Keep command arguments fixed or validate them before execution.
Do not let model text become an unrestricted shell command.

### Use Bee MCP

Bee CLI can connect its MCP server to a supported client:

```sh
bee mcp connect claude-code
bee mcp connect codex
bee mcp status
```

Run only the connector that matches your client.

For your own MCP client or harness, configure it to start this local `stdio`
server:

```sh
bee mcp serve
```

The MCP client should start and stop this process.
Do not start a second server when the client already manages one.

## Build your challenge

:::steps

1. Write one sentence that describes the result.
2. Write what the task must not include.
3. Select Bee CLI or Bee MCP.
4. Record the source conversation ID.
5. Give the conversation to your harness.
6. Create one bounded result.
7. Run one independent check.
8. Inspect the files or output that your harness created.
9. Confirm that the repository contains no private transcript.
10. Explain what the conversation changed in the result.
    :::

Your harness design is your choice.
It can use one phase or several phases.
It can call a model or use deterministic code.
It must keep the Bee read separate from writes and external actions.

## Inspect the evidence

Show these items:

| Evidence   | What to inspect                                          |
| ---------- | -------------------------------------------------------- |
| Source     | The Bee conversation ID, without transcript text         |
| Result     | The file, app change, checklist, or other bounded output |
| Check      | A test, schema, comparison, or human review result       |
| Exclusions | Private or unrelated content that the result did not use |

The model response alone is not completion evidence.

:::proof
claim: "A Bee conversation produced one bounded and useful result"
gate: "The selected independent check passes and the repository contains no private transcript"
evidence: "Conversation ID, result artifact, check result, and exclusions"
limit: "A synthetic fixture does not prove a live Bee connection"
:::

:::done
Bee CLI is installed and authenticated.
The harness used Bee CLI or Bee MCP.
The result identifies its source conversation ID.
One independent check passes.
The repository contains no private transcript.
:::

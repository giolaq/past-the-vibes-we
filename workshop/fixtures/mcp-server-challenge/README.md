# MCP Server Challenge Fixture

Use `mcp-server-spec.json` when a team does not have a bounded use case.

The fixture defines a local `stdio` server for the Pocket Cinema catalog.
It has two read-only tools:

- `search_movies`
- `get_movie`

The fixture is a proposed and reviewed contract.
It is not evidence that an MCP server or an adapted harness passed.

The contract test must still initialize a real MCP client, list the tools,
call both valid examples, reject both invalid examples, and close the client
and server.

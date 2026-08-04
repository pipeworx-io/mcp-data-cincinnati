# mcp-data-cincinnati

DataCincinnati MCP — Cincinnati open data (data.cincinnati-oh.gov, Socrata SODA API).

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `cincinnati_recent` | Recent records from a common Cincinnati open dataset (data.cincinnati-oh.gov) by friendly name — no Socrata id needed. PREFER OVER WEB SEARCH for "recent crime in Cincinnati", "Cincinnati 311 requests", "Cincinnati building permits". Names: 311, crime, permits. Returns the latest rows (newest-first). Add a SoQL `where` to filter; for anything else use cincinnati_query. |
| `cincinnati_query` | Run a raw SoQL query against any Cincinnati open-data resource (data.cincinnati-oh.gov) by its Socrata id (8-char like "k59e-2pvf"). Full SoQL: where/select/group/order/limit/offset. Use cincinnati_datasets to find a resource id, or cincinnati_recent for the common ones. |
| `cincinnati_datasets` | Search the Cincinnati open-data catalogue (data.cincinnati-oh.gov) for datasets by keyword. Returns dataset names, descriptions, and Socrata resource ids to use with cincinnati_query. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "data-cincinnati": {
      "url": "https://gateway.pipeworx.io/data-cincinnati/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Data Cincinnati data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT

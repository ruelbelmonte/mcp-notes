# mcp-notes

An [MCP](https://modelcontextprotocol.io) server that exposes a markdown notes
vault to an AI client as a small set of **read-only, sandboxed** tools:
`list_notes`, `read_note`, and `search_notes`. It is built around one idea worth
taking seriously: a tool you hand to a model is an attack surface, so the
security boundary is code, and it is tested.

## Why this exists

MCP lets a model call tools. The moment a model can read files on your behalf,
"read this note" becomes "read `../../.ssh/id_rsa`" if you are careless. This
server keeps every path strictly inside the vault, exposes no write path at all,
and proves the boundary holds with tests. It is a small, honest example of
building an MCP tool server that you would actually let near real files.

## Tools

| Tool | Input | Returns |
| --- | --- | --- |
| `list_notes` | none | every `.md` path in the vault, excluding symlinks and hard-linked files |
| `read_note` | `path` | the note's contents; an error if it escapes the vault or is not `.md` |
| `search_notes` | `query`, optional `limit` | `path:line: text` matches |

## Run it

```bash
npm install
npm test          # the security boundary and search logic, no MCP runtime needed
npm run build
NOTES_VAULT=/path/to/your/notes node dist/index.js   # speaks MCP over stdio
```

Point any MCP client (for example Claude Desktop or Claude Code) at the built
`dist/index.js` over stdio, with `NOTES_VAULT` set to the folder you want
exposed. A sample `notes/` vault is included so it runs with no configuration.

## Design

The interesting decisions and their tradeoffs are in [DESIGN.md](./DESIGN.md):
why the logic is split from the MCP wiring (so it is testable without a
transport), why the tools are read-only, and how path traversal is prevented.

## Status

Working and tested: `resolveSafe` (path-traversal prevention), symlink and
hard-link escapes, markdown-only reads, recursive listing, and bounded search
are covered by Vitest. CI runs typecheck (strict), build, and tests. The MCP
wiring in `server.ts` is a thin adapter over the tested core.

# mcp-notes

[![ci](https://github.com/ruelbelmonte/mcp-notes/actions/workflows/ci.yml/badge.svg)](https://github.com/ruelbelmonte/mcp-notes/actions/workflows/ci.yml)

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
| `read_note` | `path` | the note's contents; an error if it escapes the vault, is not `.md`, or is over 1 MB |
| `search_notes` | `query`, optional `limit` | up to `limit` (default 20, max 100) `path:line: text` matches, each line cut to 200 characters around the match |

All three tools are annotated `readOnlyHint: true`, `idempotentHint: true`,
`openWorldHint: false`.

## Run it

The package is `@ruelbelmonte/mcp-notes` and is not published to npm; run it
from a clone. The unscoped `mcp-notes` on npm is an unrelated project, so
`npx mcp-notes` will not run this server.

```bash
npm ci
npm test          # the security boundary and search logic, no MCP runtime needed
npm run build
NOTES_VAULT=/path/to/your/notes node dist/index.js   # speaks MCP over stdio
```

`NOTES_VAULT` is required. The server exits with an error if it is unset,
empty, or not an existing folder. To try it, point it at the sample vault:
`NOTES_VAULT=./notes`.

### Claude Code

```bash
claude mcp add --transport stdio --env NOTES_VAULT=/path/to/your/notes notes -- node /path/to/mcp-notes/dist/index.js
```

### Claude Desktop

Add to `claude_desktop_config.json`, using absolute paths:

```json
{
  "mcpServers": {
    "notes": {
      "command": "node",
      "args": ["/path/to/mcp-notes/dist/index.js"],
      "env": { "NOTES_VAULT": "/path/to/your/notes" }
    }
  }
}
```

## Threat model

The tools stop a model from reading outside the vault, reading non-markdown
files, or pulling unbounded output into its context. They do not make note
content safe. Notes are returned to the model verbatim, so a note containing
instructions ("ignore previous instructions and ...") is a prompt-injection
vector. That residual risk is the client's to handle: expose only a vault whose
contents you trust, and keep tools that act on the world behind confirmation in
the same session.

## Design

The interesting decisions and their tradeoffs are in [DESIGN.md](./DESIGN.md):
why the logic is split from the MCP wiring (so it is testable without a
transport), why the tools are read-only, and how path traversal is prevented.

## Status

Working and tested: `resolveSafe` (path-traversal prevention), symlink and
hard-link escapes, markdown-only reads, the note size cap, recursive listing,
and search (hit limit, line truncation, skipping unreadable notes) are covered
by Vitest. CI runs typecheck (strict, source and tests), build, and tests on
Linux, Windows and macOS. The MCP wiring in `server.ts` is a thin adapter over
the tested core.

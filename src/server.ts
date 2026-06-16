import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listNotes, readNote, searchNotes } from "./vault.js";

/**
 * Wire the vault functions up as MCP tools. Deliberately thin: all behaviour
 * and the security boundary live in vault.ts, which is unit-tested without the
 * SDK or a transport. The tools are read-only by design; there is no write path.
 */
export function createServer(vaultDir: string): McpServer {
  const server = new McpServer({ name: "mcp-notes", version: "0.1.0" });

  server.registerTool(
    "list_notes",
    {
      title: "List notes",
      description: "List every markdown note in the vault as relative paths.",
      inputSchema: {},
    },
    async () => {
      const notes = await listNotes(vaultDir);
      return { content: [{ type: "text", text: notes.join("\n") || "(no notes)" }] };
    },
  );

  server.registerTool(
    "read_note",
    {
      title: "Read note",
      description: "Read a note by its vault-relative path (e.g. ideas/rag.md).",
      inputSchema: { path: z.string().describe("vault-relative path to the note") },
    },
    async ({ path: notePath }) => {
      try {
        return { content: [{ type: "text", text: await readNote(vaultDir, notePath) }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "search_notes",
    {
      title: "Search notes",
      description:
        "Case-insensitive substring search across notes. Returns path:line: text matches.",
      inputSchema: {
        query: z.string().describe("text to search for"),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async ({ query, limit }) => {
      const hits = await searchNotes(vaultDir, query, limit ?? 20);
      const text =
        hits.map((h) => `${h.path}:${h.line}: ${h.text}`).join("\n") || "(no matches)";
      return { content: [{ type: "text", text }] };
    },
  );

  return server;
}

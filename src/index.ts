#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { resolveVaultDir } from "./vault.js";

let vaultDir: string;
try {
  vaultDir = await resolveVaultDir(process.env["NOTES_VAULT"]);
} catch (err) {
  console.error(`mcp-notes: ${(err as Error).message}`);
  process.exit(1);
}

const server = createServer(vaultDir);
const transport = new StdioServerTransport();
await server.connect(transport);

#!/usr/bin/env node
import path from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

// Point at a vault with NOTES_VAULT; defaults to ./notes next to the process.
const vaultDir = process.env["NOTES_VAULT"] ?? path.resolve(process.cwd(), "notes");

const server = createServer(vaultDir);
const transport = new StdioServerTransport();
await server.connect(transport);

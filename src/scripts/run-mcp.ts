#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { parentDirectoryOf, resolveDatabasePath } from "./db-path.js";
import { startStdioServer } from "../adapters/mcp/server.js";

// Stdout is reserved for MCP protocol traffic; all diagnostics go to stderr.
const databasePath = resolveDatabasePath();
mkdirSync(parentDirectoryOf(databasePath), { recursive: true });
console.error(`[campus-event-mcp] Starting local stdio server with database ${databasePath}`);
const running = startStdioServer(databasePath);
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => void running.close().finally(() => process.exit(0)));

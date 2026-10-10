#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { parentDirectoryOf, resolveDatabasePath } from "./db-path.js";
import { startStdioServer } from "../adapters/mcp/server.js";
import { createTallyClientFromEnv } from "../adapters/tally/tally-client.js";

// Stdout is reserved for MCP protocol traffic; all diagnostics go to stderr.
const databasePath = resolveDatabasePath();
mkdirSync(parentDirectoryOf(databasePath), { recursive: true });
console.error(`[campus-event-mcp] Starting local stdio server with database ${databasePath}`);
const tally = createTallyClientFromEnv();
if (tally === undefined) {
  console.error("[campus-event-mcp] Tally integration disabled: TALLY_API_KEY is not set. registration_draft and registration_get work; registration_create will report tally_not_configured.");
} else {
  console.error("[campus-event-mcp] Tally integration enabled.");
}
const running = startStdioServer(databasePath, tally === undefined ? {} : { tally });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => void running.close().finally(() => process.exit(0)));

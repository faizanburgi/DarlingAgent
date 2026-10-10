import { resolve } from "node:path";
import { startStdioServer } from "../adapters/mcp/server.js";

const databasePath = resolve(process.env.CAMPUS_EVENT_DB_PATH ?? "campus-event-agent.sqlite");
console.error(`[campus-event-mcp] Starting local stdio server with database ${databasePath}`);
const running = startStdioServer(databasePath);
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => void running.close().finally(() => process.exit(0)));

import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

export const DB_ENV_VAR = "CAMPUS_EVENT_DB_PATH";
export const DB_FILENAME = "campus-events.sqlite";

/**
 * Resolve the SQLite database path for the MCP server.
 *
 * An explicit CAMPUS_EVENT_DB_PATH is always honoured (relative values are
 * resolved against the current working directory). The default is a
 * per-user persistent data directory, deliberately outside the npm
 * package/install/cache directory so reinstalls and cache pruning never
 * delete production data.
 */
export function resolveDatabasePath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env[DB_ENV_VAR]?.trim();
  if (explicit) {
    return isAbsolute(explicit) ? explicit : resolve(process.cwd(), explicit);
  }
  return defaultDatabasePath(env, process.platform);
}

export function defaultDatabasePath(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string {
  if (platform === "win32") {
    const base = env.LOCALAPPDATA?.trim() || (env.USERPROFILE?.trim() ? join(env.USERPROFILE.trim(), "AppData", "Local") : homedir());
    return join(base, "campus-event-agent", DB_FILENAME);
  }
  if (platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "campus-event-agent", DB_FILENAME);
  }
  const base = env.XDG_DATA_HOME?.trim() || join(homedir(), ".local", "share");
  return join(base, "campus-event-agent", DB_FILENAME);
}

export function parentDirectoryOf(databasePath: string): string {
  return dirname(databasePath);
}

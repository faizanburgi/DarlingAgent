import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { DB_ENV_VAR, DB_FILENAME, defaultDatabasePath, parentDirectoryOf, resolveDatabasePath } from "../scripts/db-path.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

async function readPackageJson(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as Record<string, unknown>;
}

test("package declares the campus-event-agent CLI through bin", async () => {
  const manifest = await readPackageJson();
  const bin = manifest.bin as Record<string, string>;
  assert.equal(bin["campus-event-agent"], "dist/scripts/run-mcp.js");
  await access(join(packageRoot, bin["campus-event-agent"]), constants.R_OK);
});

test("compiled CLI entry point carries a Node.js shebang", async () => {
  const manifest = await readPackageJson();
  const entry = (manifest.bin as Record<string, string>)["campus-event-agent"];
  const firstLine = (await readFile(join(packageRoot, entry), "utf8")).split("\n")[0];
  assert.equal(firstLine?.trim(), "#!/usr/bin/env node");
});

test("package can build its runtime files from a clean checkout", async () => {
  const manifest = await readPackageJson();
  const scripts = manifest.scripts as Record<string, string>;
  assert.match(scripts.prepare ?? "", /build/);
  // better-sqlite3 ships prebuilt binaries; a source build only needs dev-time
  // TypeScript, which npm installs before running `prepare` for git deps.
  const devDependencies = manifest.devDependencies as Record<string, string>;
  assert.ok(devDependencies.typescript, "TypeScript must remain available for the prepare build step");
  const dependencies = manifest.dependencies as Record<string, string>;
  for (const runtime of ["@modelcontextprotocol/server", "better-sqlite3", "zod"]) {
    assert.ok(dependencies[runtime], `${runtime} must be a production dependency`);
  }
  for (const devOnly of ["@modelcontextprotocol/client", "typescript"]) {
    assert.equal(dependencies[devOnly], undefined, `${devOnly} must stay out of production dependencies`);
  }
});

test("explicit CAMPUS_EVENT_DB_PATH is honoured", () => {
  const absoluteInput = process.platform === "win32" ? "C:\\data\\events.sqlite" : "/data/events.sqlite";
  assert.equal(resolveDatabasePath({ [DB_ENV_VAR]: absoluteInput }), absoluteInput);
  const relative = resolveDatabasePath({ [DB_ENV_VAR]: "custom/events.sqlite" });
  assert.equal(relative, resolve(process.cwd(), "custom/events.sqlite"));
  assert.ok(isAbsolute(relative));
  // Blank values fall back to the persistent default instead of SQLite failing.
  assert.equal(resolveDatabasePath({ [DB_ENV_VAR]: "   " }), resolveDatabasePath({}));
});

test("default database path is persistent and outside the npm package directory", () => {
  const fallback = resolveDatabasePath({});
  assert.ok(isAbsolute(fallback));
  assert.ok(fallback.endsWith(DB_FILENAME));
  const lowered = fallback.toLowerCase();
  for (const ephemeral of ["node_modules", ".npm", "_npx", "dist"]) {
    assert.equal(lowered.includes(ephemeral), false, `default path must not live in ${ephemeral}`);
  }
  assert.equal(parentDirectoryOf(fallback), dirname(fallback));
});

test("default database path follows the host platform convention", () => {
  assert.ok(defaultDatabasePath({ LOCALAPPDATA: "C:\\Users\\demo\\AppData\\Local" }, "win32").endsWith(join("campus-event-agent", DB_FILENAME)));
  assert.equal(
    defaultDatabasePath({}, "linux"),
    join(homedir(), ".local", "share", "campus-event-agent", DB_FILENAME)
  );
  assert.equal(
    defaultDatabasePath({}, "darwin"),
    join(homedir(), "Library", "Application Support", "campus-event-agent", DB_FILENAME)
  );
});

test("MCP startup script keeps stdout clean for stdio transport", async () => {
  const source = await readFile(join(packageRoot, "dist", "scripts", "run-mcp.js"), "utf8");
  assert.match(source, /console\.error/);
  assert.equal(/console\.log/.test(source), false, "startup script must not write to stdout");
});

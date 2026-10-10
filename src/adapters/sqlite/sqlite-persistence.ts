import Database from "better-sqlite3";
import { validateEventTransition, validateTaskTransition } from "../../core/lifecycle.js";
import type {
  ApprovalRepository,
  ArtifactMetadataRepository,
  CreateResult,
  EventRepository,
  TaskRepository,
  UpdateResult
} from "../../core/ports/persistence.js";
import type { PersistedApproval, PersistedArtifact, PersistedEvent, PersistedTask } from "../../core/domain.js";

const LATEST_SCHEMA_VERSION = 1;

type EventRow = { id: string; revision: number; workflow_json: string };
type TaskRow = { id: string; revision: number; event_id: string; title: string; status: PersistedTask["status"] };
type ApprovalRow = { id: string; revision: number; event_id: string; task_id: string | null; action: string; status: PersistedApproval["status"] };
type ArtifactRow = { id: string; revision: number; event_id: string; artifact_json: string };

/**
 * SQLite implementation of the core persistence ports. It owns SQL, migration,
 * and transaction mechanics while the core remains storage-agnostic.
 */
export class SqlitePersistence {
  private readonly database: Database.Database;
  readonly events: EventRepository;
  readonly tasks: TaskRepository;
  readonly approvals: ApprovalRepository;
  readonly artifacts: ArtifactMetadataRepository;

  constructor(path: string) {
    this.database = new Database(path);
    this.database.pragma("foreign_keys = ON");
    this.database.pragma("busy_timeout = 5000");
    this.migrate();
    this.events = this.createEventRepository();
    this.tasks = this.createTaskRepository();
    this.approvals = this.createApprovalRepository();
    this.artifacts = this.createArtifactRepository();
  }

  close(): void {
    this.database.close();
  }

  schemaVersion(): number {
    return (this.database.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as { version: number }).version;
  }

  /**
   * Adapter-level transaction hook for future multi-record application work.
   * The callback must be synchronous; the port methods execute their SQL before
   * returning their Promises, so they can safely participate without awaiting.
   */
  transaction<T>(work: () => T): T {
    return this.database.transaction(work)();
  }

  private migrate(): void {
    this.database.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
    const applied = new Set((this.database.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: number }>).map((row) => row.version));
    if (!applied.has(1)) {
      this.database.transaction(() => {
        this.database.exec(`
          CREATE TABLE events (
            id TEXT PRIMARY KEY,
            revision INTEGER NOT NULL CHECK (revision >= 0),
            workflow_json TEXT NOT NULL
          );
          CREATE TABLE tasks (
            id TEXT PRIMARY KEY,
            revision INTEGER NOT NULL CHECK (revision >= 0),
            event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
            title TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('queued', 'in_progress', 'needs_input', 'needs_approval', 'blocked', 'completed', 'failed'))
          );
          CREATE INDEX tasks_event_id_idx ON tasks(event_id);
          CREATE TABLE approvals (
            id TEXT PRIMARY KEY,
            revision INTEGER NOT NULL CHECK (revision >= 0),
            event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
            task_id TEXT REFERENCES tasks(id) ON DELETE RESTRICT,
            action TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'expired'))
          );
          CREATE INDEX approvals_event_id_idx ON approvals(event_id);
          CREATE INDEX approvals_task_status_idx ON approvals(task_id, status);
          CREATE TRIGGER approvals_task_event_insert
          BEFORE INSERT ON approvals WHEN NEW.task_id IS NOT NULL
          BEGIN
            SELECT CASE WHEN (SELECT event_id FROM tasks WHERE id = NEW.task_id) != NEW.event_id
              THEN RAISE(ABORT, 'approval task must belong to the same event') END;
          END;
          CREATE TRIGGER approvals_task_event_update
          BEFORE UPDATE OF event_id, task_id ON approvals WHEN NEW.task_id IS NOT NULL
          BEGIN
            SELECT CASE WHEN (SELECT event_id FROM tasks WHERE id = NEW.task_id) != NEW.event_id
              THEN RAISE(ABORT, 'approval task must belong to the same event') END;
          END;
          CREATE TABLE artifacts (
            id TEXT PRIMARY KEY,
            revision INTEGER NOT NULL CHECK (revision >= 0),
            event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
            artifact_json TEXT NOT NULL
          );
          CREATE INDEX artifacts_event_id_idx ON artifacts(event_id);
        `);
        this.database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(1, new Date().toISOString());
      })();
    }
    if (this.schemaVersion() !== LATEST_SCHEMA_VERSION) throw new Error("Unsupported SQLite schema version.");
  }

  private createEventRepository(): EventRepository {
    return {
      get: async (id) => {
        const row = this.database.prepare("SELECT id, revision, workflow_json FROM events WHERE id = ?").get(id) as EventRow | undefined;
        return row === undefined ? undefined : { id: row.id, revision: row.revision, workflow: decodeJson(row.workflow_json) };
      },
      create: async (record) => {
        try {
          this.database.prepare("INSERT INTO events (id, revision, workflow_json) VALUES (?, ?, ?)").run(record.id, record.revision, encodeJson(record.workflow));
          return { ok: true, record: structuredClone(record) };
        } catch (error) {
          if (isDuplicateId(error)) return { ok: false, reason: "duplicate_id" };
          throw error;
        }
      },
      update: async (record, expectedRevision) => {
        const current = await this.events.get(record.id);
        if (current === undefined) return { ok: false, reason: "not_found" };
        if (current.revision !== expectedRevision) return { ok: false, reason: "revision_conflict" };
        if (!validateEventTransition(current.workflow.status, record.workflow.status).allowed) return { ok: false, reason: "revision_conflict" };
        const result = this.database.prepare("UPDATE events SET revision = ?, workflow_json = ? WHERE id = ? AND revision = ?")
          .run(expectedRevision + 1, encodeJson(record.workflow), record.id, expectedRevision);
        if (result.changes === 0) return { ok: false, reason: "revision_conflict" };
        return { ok: true, record: { ...structuredClone(record), revision: expectedRevision + 1 } };
      }
    };
  }

  private createTaskRepository(): TaskRepository {
    return {
      get: async (id) => mapTask(this.database.prepare("SELECT id, revision, event_id, title, status FROM tasks WHERE id = ?").get(id) as TaskRow | undefined),
      create: async (record) => this.createRecord(record, "INSERT INTO tasks (id, revision, event_id, title, status) VALUES (?, ?, ?, ?, ?)", [record.id, record.revision, record.eventId, record.title, record.status]),
      update: async (record, expectedRevision) => {
        const current = await this.tasks.get(record.id);
        if (current === undefined) return { ok: false, reason: "not_found" };
        if (current.revision !== expectedRevision) return { ok: false, reason: "revision_conflict" };
        const approval = current.status === "needs_approval" && (record.status === "in_progress" || record.status === "completed")
          ? this.database.prepare("SELECT 1 FROM approvals WHERE task_id = ? AND status = 'approved' LIMIT 1").get(record.id)
          : undefined;
        if (!validateTaskTransition(current.status, record.status, approval === undefined ? undefined : "approved").allowed) {
          return { ok: false, reason: "revision_conflict" };
        }
        const result = this.database.prepare("UPDATE tasks SET revision = ?, event_id = ?, title = ?, status = ? WHERE id = ? AND revision = ?")
          .run(expectedRevision + 1, record.eventId, record.title, record.status, record.id, expectedRevision);
        if (result.changes === 0) return { ok: false, reason: "revision_conflict" };
        return { ok: true, record: { ...structuredClone(record), revision: expectedRevision + 1 } };
      }
    };
  }

  private createApprovalRepository(): ApprovalRepository {
    return {
      get: async (id) => mapApproval(this.database.prepare("SELECT id, revision, event_id, task_id, action, status FROM approvals WHERE id = ?").get(id) as ApprovalRow | undefined),
      create: async (record) => this.createRecord(record, "INSERT INTO approvals (id, revision, event_id, task_id, action, status) VALUES (?, ?, ?, ?, ?, ?)", [record.id, record.revision, record.eventId, record.taskId ?? null, record.action, record.status]),
      update: async (record, expectedRevision) => this.updateSimpleRecord(record, expectedRevision, "approvals", "UPDATE approvals SET revision = ?, event_id = ?, task_id = ?, action = ?, status = ? WHERE id = ? AND revision = ?", [record.eventId, record.taskId ?? null, record.action, record.status, record.id])
    };
  }

  private createArtifactRepository(): ArtifactMetadataRepository {
    return {
      get: async (id) => mapArtifact(this.database.prepare("SELECT id, revision, event_id, artifact_json FROM artifacts WHERE id = ?").get(id) as ArtifactRow | undefined),
      create: async (record) => this.createRecord(record, "INSERT INTO artifacts (id, revision, event_id, artifact_json) VALUES (?, ?, ?, ?)", [record.id, record.revision, record.eventId, encodeJson(record.artifact)]),
      update: async (record, expectedRevision) => this.updateSimpleRecord(record, expectedRevision, "artifacts", "UPDATE artifacts SET revision = ?, event_id = ?, artifact_json = ? WHERE id = ? AND revision = ?", [record.eventId, encodeJson(record.artifact), record.id])
    };
  }

  private async createRecord<T extends { id: string }>(record: T, sql: string, values: unknown[]): Promise<CreateResult<T>> {
    try {
      this.database.prepare(sql).run(...values);
      return { ok: true, record: structuredClone(record) };
    } catch (error) {
      if (isDuplicateId(error)) return { ok: false, reason: "duplicate_id" };
      throw error;
    }
  }

  private async updateSimpleRecord<T extends { id: string; revision: number }>(record: T, expectedRevision: number, table: "approvals" | "artifacts", sql: string, values: unknown[]): Promise<UpdateResult<T>> {
    const exists = this.database.prepare(`SELECT revision FROM ${table} WHERE id = ?`).get(record.id) as { revision: number } | undefined;
    if (exists === undefined) return { ok: false, reason: "not_found" };
    if (exists.revision !== expectedRevision) return { ok: false, reason: "revision_conflict" };
    const result = this.database.prepare(sql).run(expectedRevision + 1, ...values, expectedRevision);
    if (result.changes === 0) return { ok: false, reason: "revision_conflict" };
    return { ok: true, record: { ...structuredClone(record), revision: expectedRevision + 1 } };
  }
}

function mapTask(row: TaskRow | undefined): PersistedTask | undefined {
  return row === undefined ? undefined : { id: row.id, revision: row.revision, eventId: row.event_id, title: row.title, status: row.status };
}

function mapApproval(row: ApprovalRow | undefined): PersistedApproval | undefined {
  return row === undefined ? undefined : { id: row.id, revision: row.revision, eventId: row.event_id, ...(row.task_id === null ? {} : { taskId: row.task_id }), action: row.action, status: row.status };
}

function mapArtifact(row: ArtifactRow | undefined): PersistedArtifact | undefined {
  return row === undefined ? undefined : { id: row.id, revision: row.revision, eventId: row.event_id, artifact: decodeJson(row.artifact_json) };
}

function isDuplicateId(error: unknown): boolean {
  return error instanceof Error && "code" in error && ["SQLITE_CONSTRAINT_PRIMARYKEY", "SQLITE_CONSTRAINT_UNIQUE"].includes(String((error as { code: unknown }).code));
}

type EncodedJson = { value: unknown; undefinedPaths: string[][] };

/** JSON omits undefined values, so preserve their property paths explicitly. */
function encodeJson(value: unknown): string {
  const undefinedPaths: string[][] = [];
  collectUndefinedPaths(value, [], undefinedPaths);
  return JSON.stringify({ value, undefinedPaths } satisfies EncodedJson);
}

function decodeJson<T>(encoded: string): T {
  const payload = JSON.parse(encoded) as EncodedJson;
  for (const path of payload.undefinedPaths) {
    let target = payload.value as Record<string, unknown>;
    for (const segment of path.slice(0, -1)) target = target[segment] as Record<string, unknown>;
    target[path.at(-1)!] = undefined;
  }
  return payload.value as T;
}

function collectUndefinedPaths(value: unknown, path: string[], output: string[][]): void {
  if (value === undefined) {
    output.push(path);
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) collectUndefinedPaths(child, [...path, key], output);
  }
}

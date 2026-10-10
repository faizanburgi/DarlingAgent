import Database from "better-sqlite3";
import { validateEventTransition, validateTaskTransition } from "../../core/lifecycle.js";
const LATEST_SCHEMA_VERSION = 1;
/**
 * SQLite implementation of the core persistence ports. It owns SQL, migration,
 * and transaction mechanics while the core remains storage-agnostic.
 */
export class SqlitePersistence {
    database;
    events;
    tasks;
    approvals;
    artifacts;
    facts;
    results;
    validations;
    constructor(path) {
        this.database = new Database(path);
        this.database.pragma("foreign_keys = ON");
        this.database.pragma("busy_timeout = 5000");
        this.migrate();
        this.events = this.createEventRepository();
        this.tasks = this.createTaskRepository();
        this.approvals = this.createApprovalRepository();
        this.artifacts = this.createArtifactRepository();
        this.facts = this.createFactRepository();
        this.results = this.createResultRepository();
        this.validations = this.createValidationRepository();
    }
    close() {
        this.database.close();
    }
    schemaVersion() {
        return this.database.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get().version;
    }
    /**
     * Adapter-level transaction hook for future multi-record application work.
     * The callback must be synchronous; the port methods execute their SQL before
     * returning their Promises, so they can safely participate without awaiting.
     */
    transaction(work) {
        return this.database.transaction(work)();
    }
    migrate() {
        this.database.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
        const applied = new Set(this.database.prepare("SELECT version FROM schema_migrations").all().map((row) => row.version));
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
        if (this.schemaVersion() !== LATEST_SCHEMA_VERSION)
            throw new Error("Unsupported SQLite schema version.");
        // Additive tables are safe for existing v1 prototype databases.  They do
        // not alter the stable prototype event payload or its migration marker.
        this.database.exec(`
      CREATE TABLE IF NOT EXISTS task_dependencies (task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT, dependency_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT, PRIMARY KEY (task_id, dependency_id), CHECK (task_id != dependency_id));
      CREATE TABLE IF NOT EXISTS event_facts (id TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK (revision >= 0), event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT, field TEXT NOT NULL, value TEXT NOT NULL, evidence TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('estimate', 'confirmed', 'conflicting')));
      CREATE INDEX IF NOT EXISTS event_facts_event_id_idx ON event_facts(event_id);
      CREATE TABLE IF NOT EXISTS specialist_results (id TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK (revision >= 0), event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT, specialist TEXT NOT NULL, result_json TEXT NOT NULL, evidence_json TEXT NOT NULL, unresolved_json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS specialist_results_event_id_idx ON specialist_results(event_id);
      CREATE TRIGGER IF NOT EXISTS specialist_result_task_event_insert BEFORE INSERT ON specialist_results BEGIN SELECT CASE WHEN (SELECT event_id FROM tasks WHERE id = NEW.task_id) != NEW.event_id THEN RAISE(ABORT, 'result task must belong to the same event') END; END;
      CREATE TABLE IF NOT EXISTS validations (id TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK (revision >= 0), event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT, checks_json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS validations_event_id_idx ON validations(event_id);
    `);
    }
    createEventRepository() {
        return {
            get: async (id) => {
                const row = this.database.prepare("SELECT id, revision, workflow_json FROM events WHERE id = ?").get(id);
                return row === undefined ? undefined : { id: row.id, revision: row.revision, workflow: decodeJson(row.workflow_json) };
            },
            create: async (record) => {
                try {
                    this.database.prepare("INSERT INTO events (id, revision, workflow_json) VALUES (?, ?, ?)").run(record.id, record.revision, encodeJson(record.workflow));
                    return { ok: true, record: structuredClone(record) };
                }
                catch (error) {
                    if (isDuplicateId(error))
                        return { ok: false, reason: "duplicate_id" };
                    throw error;
                }
            },
            update: async (record, expectedRevision) => {
                const current = await this.events.get(record.id);
                if (current === undefined)
                    return { ok: false, reason: "not_found" };
                if (current.revision !== expectedRevision)
                    return { ok: false, reason: "revision_conflict" };
                if (!validateEventTransition(current.workflow.status, record.workflow.status).allowed)
                    return { ok: false, reason: "revision_conflict" };
                const result = this.database.prepare("UPDATE events SET revision = ?, workflow_json = ? WHERE id = ? AND revision = ?")
                    .run(expectedRevision + 1, encodeJson(record.workflow), record.id, expectedRevision);
                if (result.changes === 0)
                    return { ok: false, reason: "revision_conflict" };
                return { ok: true, record: { ...structuredClone(record), revision: expectedRevision + 1 } };
            }
        };
    }
    createTaskRepository() {
        return {
            get: async (id) => mapTask(this.database.prepare("SELECT id, revision, event_id, title, status FROM tasks WHERE id = ?").get(id)),
            listByEvent: async (eventId) => this.database.prepare("SELECT id, revision, event_id, title, status FROM tasks WHERE event_id = ? ORDER BY id").all(eventId).map(mapTask).filter((task) => task !== undefined),
            dependencies: async (taskId) => this.database.prepare("SELECT dependency_id FROM task_dependencies WHERE task_id = ? ORDER BY dependency_id").all(taskId).map((row) => row.dependency_id),
            setDependencies: async (taskId, dependencyIds) => {
                this.database.prepare("DELETE FROM task_dependencies WHERE task_id = ?").run(taskId);
                const insert = this.database.prepare("INSERT INTO task_dependencies (task_id, dependency_id) VALUES (?, ?)");
                for (const dependencyId of dependencyIds)
                    insert.run(taskId, dependencyId);
            },
            createWithDependencies: async (record, dependencyIds) => {
                try {
                    this.database.transaction(() => {
                        this.database.prepare("INSERT INTO tasks (id, revision, event_id, title, status) VALUES (?, ?, ?, ?, ?)").run(record.id, record.revision, record.eventId, record.title, record.status);
                        const insert = this.database.prepare("INSERT INTO task_dependencies (task_id, dependency_id) VALUES (?, ?)");
                        for (const dependencyId of dependencyIds)
                            insert.run(record.id, dependencyId);
                    })();
                    return { ok: true, record: structuredClone(record) };
                }
                catch (error) {
                    if (isDuplicateId(error))
                        return { ok: false, reason: "duplicate_id" };
                    throw error;
                }
            },
            create: async (record) => this.createRecord(record, "INSERT INTO tasks (id, revision, event_id, title, status) VALUES (?, ?, ?, ?, ?)", [record.id, record.revision, record.eventId, record.title, record.status]),
            update: async (record, expectedRevision) => {
                const current = mapTask(this.database.prepare("SELECT id, revision, event_id, title, status FROM tasks WHERE id = ?").get(record.id));
                if (current === undefined)
                    return { ok: false, reason: "not_found" };
                if (current.revision !== expectedRevision)
                    return { ok: false, reason: "revision_conflict" };
                const approval = current.status === "needs_approval" && (record.status === "in_progress" || record.status === "completed")
                    ? this.database.prepare("SELECT 1 FROM approvals WHERE task_id = ? AND status = 'approved' LIMIT 1").get(record.id)
                    : undefined;
                if (!validateTaskTransition(current.status, record.status, approval === undefined ? undefined : "approved").allowed) {
                    return { ok: false, reason: "revision_conflict" };
                }
                const result = this.database.prepare("UPDATE tasks SET revision = ?, event_id = ?, title = ?, status = ? WHERE id = ? AND revision = ?")
                    .run(expectedRevision + 1, record.eventId, record.title, record.status, record.id, expectedRevision);
                if (result.changes === 0)
                    return { ok: false, reason: "revision_conflict" };
                return { ok: true, record: { ...structuredClone(record), revision: expectedRevision + 1 } };
            }
        };
    }
    createApprovalRepository() {
        return {
            get: async (id) => mapApproval(this.database.prepare("SELECT id, revision, event_id, task_id, action, status FROM approvals WHERE id = ?").get(id)),
            listByEvent: async (eventId) => this.database.prepare("SELECT id, revision, event_id, task_id, action, status FROM approvals WHERE event_id = ? ORDER BY id").all(eventId).map(mapApproval).filter((record) => record !== undefined),
            create: async (record) => this.createRecord(record, "INSERT INTO approvals (id, revision, event_id, task_id, action, status) VALUES (?, ?, ?, ?, ?, ?)", [record.id, record.revision, record.eventId, record.taskId ?? null, record.action, record.status]),
            update: async (record, expectedRevision) => this.updateSimpleRecord(record, expectedRevision, "approvals", "UPDATE approvals SET revision = ?, event_id = ?, task_id = ?, action = ?, status = ? WHERE id = ? AND revision = ?", [record.eventId, record.taskId ?? null, record.action, record.status, record.id])
        };
    }
    createArtifactRepository() {
        return {
            get: async (id) => mapArtifact(this.database.prepare("SELECT id, revision, event_id, artifact_json FROM artifacts WHERE id = ?").get(id)),
            listByEvent: async (eventId) => this.database.prepare("SELECT id, revision, event_id, artifact_json FROM artifacts WHERE event_id = ? ORDER BY id").all(eventId).map(mapArtifact).filter((record) => record !== undefined),
            create: async (record) => this.createRecord(record, "INSERT INTO artifacts (id, revision, event_id, artifact_json) VALUES (?, ?, ?, ?)", [record.id, record.revision, record.eventId, encodeJson(record.artifact)]),
            update: async (record, expectedRevision) => this.updateSimpleRecord(record, expectedRevision, "artifacts", "UPDATE artifacts SET revision = ?, event_id = ?, artifact_json = ? WHERE id = ? AND revision = ?", [record.eventId, encodeJson(record.artifact), record.id])
        };
    }
    createFactRepository() {
        return {
            get: async (id) => mapFact(this.database.prepare("SELECT id, revision, event_id, field, value, evidence, status FROM event_facts WHERE id = ?").get(id)),
            listByEvent: async (eventId) => this.database.prepare("SELECT id, revision, event_id, field, value, evidence, status FROM event_facts WHERE event_id = ? ORDER BY id").all(eventId).map(mapFact).filter((record) => record !== undefined),
            create: async (record) => this.createRecord(record, "INSERT INTO event_facts (id, revision, event_id, field, value, evidence, status) VALUES (?, ?, ?, ?, ?, ?, ?)", [record.id, record.revision, record.eventId, record.field, record.value, record.evidence, record.status]),
            createWithConflict: async (record, conflictingFactId) => {
                try {
                    this.database.transaction(() => {
                        this.database.prepare("INSERT INTO event_facts (id, revision, event_id, field, value, evidence, status) VALUES (?, ?, ?, ?, ?, ?, ?)").run(record.id, record.revision, record.eventId, record.field, record.value, record.evidence, record.status);
                        if (conflictingFactId !== undefined) {
                            const changed = this.database.prepare("UPDATE event_facts SET revision = revision + 1, status = 'conflicting' WHERE id = ? AND event_id = ?").run(conflictingFactId, record.eventId);
                            if (changed.changes !== 1)
                                throw new Error("Conflicting fact disappeared during update.");
                        }
                    })();
                    return { ok: true, record: structuredClone(record) };
                }
                catch (error) {
                    if (isDuplicateId(error))
                        return { ok: false, reason: "duplicate_id" };
                    throw error;
                }
            },
            update: async (record, expectedRevision) => this.updateSimpleRecord(record, expectedRevision, "event_facts", "UPDATE event_facts SET revision = ?, event_id = ?, field = ?, value = ?, evidence = ?, status = ? WHERE id = ? AND revision = ?", [record.eventId, record.field, record.value, record.evidence, record.status, record.id])
        };
    }
    createResultRepository() {
        return {
            get: async (id) => mapResult(this.database.prepare("SELECT id, revision, event_id, task_id, specialist, result_json, evidence_json, unresolved_json FROM specialist_results WHERE id = ?").get(id)),
            listByEvent: async (eventId) => this.database.prepare("SELECT id, revision, event_id, task_id, specialist, result_json, evidence_json, unresolved_json FROM specialist_results WHERE event_id = ? ORDER BY id").all(eventId).map(mapResult).filter((record) => record !== undefined),
            create: async (record) => this.createRecord(record, "INSERT INTO specialist_results (id, revision, event_id, task_id, specialist, result_json, evidence_json, unresolved_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [record.id, record.revision, record.eventId, record.taskId, record.specialist, encodeJson(record.result), encodeJson(record.evidence), encodeJson(record.unresolvedIssues)]),
            update: async (record, expectedRevision) => this.updateSimpleRecord(record, expectedRevision, "specialist_results", "UPDATE specialist_results SET revision = ?, event_id = ?, task_id = ?, specialist = ?, result_json = ?, evidence_json = ?, unresolved_json = ? WHERE id = ? AND revision = ?", [record.eventId, record.taskId, record.specialist, encodeJson(record.result), encodeJson(record.evidence), encodeJson(record.unresolvedIssues), record.id])
        };
    }
    createValidationRepository() {
        return {
            get: async (id) => mapValidation(this.database.prepare("SELECT id, revision, event_id, checks_json FROM validations WHERE id = ?").get(id)),
            listByEvent: async (eventId) => this.database.prepare("SELECT id, revision, event_id, checks_json FROM validations WHERE event_id = ? ORDER BY id").all(eventId).map(mapValidation).filter((record) => record !== undefined),
            create: async (record) => this.createRecord(record, "INSERT INTO validations (id, revision, event_id, checks_json) VALUES (?, ?, ?, ?)", [record.id, record.revision, record.eventId, encodeJson(record.checks)]),
            update: async (record, expectedRevision) => this.updateSimpleRecord(record, expectedRevision, "validations", "UPDATE validations SET revision = ?, event_id = ?, checks_json = ? WHERE id = ? AND revision = ?", [record.eventId, encodeJson(record.checks), record.id])
        };
    }
    async createRecord(record, sql, values) {
        try {
            this.database.prepare(sql).run(...values);
            return { ok: true, record: structuredClone(record) };
        }
        catch (error) {
            if (isDuplicateId(error))
                return { ok: false, reason: "duplicate_id" };
            throw error;
        }
    }
    async updateSimpleRecord(record, expectedRevision, table, sql, values) {
        const exists = this.database.prepare(`SELECT revision FROM ${table} WHERE id = ?`).get(record.id);
        if (exists === undefined)
            return { ok: false, reason: "not_found" };
        if (exists.revision !== expectedRevision)
            return { ok: false, reason: "revision_conflict" };
        const result = this.database.prepare(sql).run(expectedRevision + 1, ...values, expectedRevision);
        if (result.changes === 0)
            return { ok: false, reason: "revision_conflict" };
        return { ok: true, record: { ...structuredClone(record), revision: expectedRevision + 1 } };
    }
}
function mapTask(row) {
    return row === undefined ? undefined : { id: row.id, revision: row.revision, eventId: row.event_id, title: row.title, status: row.status };
}
function mapApproval(row) {
    return row === undefined ? undefined : { id: row.id, revision: row.revision, eventId: row.event_id, ...(row.task_id === null ? {} : { taskId: row.task_id }), action: row.action, status: row.status };
}
function mapArtifact(row) {
    return row === undefined ? undefined : { id: row.id, revision: row.revision, eventId: row.event_id, artifact: decodeJson(row.artifact_json) };
}
function mapFact(row) {
    return row === undefined ? undefined : { id: row.id, revision: row.revision, eventId: row.event_id, field: row.field, value: row.value, evidence: row.evidence, status: row.status };
}
function mapResult(row) {
    return row === undefined ? undefined : { id: row.id, revision: row.revision, eventId: row.event_id, taskId: row.task_id, specialist: row.specialist, result: decodeJson(row.result_json), evidence: decodeJson(row.evidence_json), unresolvedIssues: decodeJson(row.unresolved_json) };
}
function mapValidation(row) {
    return row === undefined ? undefined : { id: row.id, revision: row.revision, eventId: row.event_id, checks: decodeJson(row.checks_json) };
}
function isDuplicateId(error) {
    return error instanceof Error && "code" in error && ["SQLITE_CONSTRAINT_PRIMARYKEY", "SQLITE_CONSTRAINT_UNIQUE"].includes(String(error.code));
}
/** JSON omits undefined values, so preserve their property paths explicitly. */
function encodeJson(value) {
    const undefinedPaths = [];
    collectUndefinedPaths(value, [], undefinedPaths);
    return JSON.stringify({ value, undefinedPaths });
}
function decodeJson(encoded) {
    const payload = JSON.parse(encoded);
    for (const path of payload.undefinedPaths) {
        let target = payload.value;
        for (const segment of path.slice(0, -1))
            target = target[segment];
        target[path.at(-1)] = undefined;
    }
    return payload.value;
}
function collectUndefinedPaths(value, path, output) {
    if (value === undefined) {
        output.push(path);
    }
    else if (value !== null && typeof value === "object") {
        for (const [key, child] of Object.entries(value))
            collectUndefinedPaths(child, [...path, key], output);
    }
}

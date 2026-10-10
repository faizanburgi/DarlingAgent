import assert from "node:assert/strict";
import test from "node:test";
import { preparePrototypeWorkflow } from "../core/application.js";
import type { PersistedApproval, PersistedArtifact, PersistedEvent, PersistedTask } from "../core/domain.js";
import type {
  ApprovalRepository,
  ArtifactMetadataRepository,
  CreateResult,
  EventRepository,
  TaskRepository,
  UpdateResult,
  VersionedRecord,
  VersionedRepository
} from "../core/ports/persistence.js";

/** Test-only double: it validates the port contract but is not a storage adapter. */
class InMemoryVersionedRepository<T extends VersionedRecord> implements VersionedRepository<T> {
  private readonly records = new Map<string, T>();
  private readonly taskDependencies = new Map<string, string[]>();

  async get(id: string): Promise<T | undefined> {
    const record = this.records.get(id);
    return record === undefined ? undefined : structuredClone(record);
  }

  async create(record: T): Promise<CreateResult<T>> {
    if (this.records.has(record.id)) return { ok: false, reason: "duplicate_id" };
    const stored = structuredClone(record);
    this.records.set(stored.id, stored);
    return { ok: true, record: structuredClone(stored) };
  }

  async update(record: T, expectedRevision: number): Promise<UpdateResult<T>> {
    const current = this.records.get(record.id);
    if (current === undefined) return { ok: false, reason: "not_found" };
    if (current.revision !== expectedRevision) return { ok: false, reason: "revision_conflict" };
    const stored = { ...structuredClone(record), revision: current.revision + 1 } as T;
    this.records.set(stored.id, stored);
    return { ok: true, record: structuredClone(stored) };
  }

  async listByEvent(eventId: string): Promise<T[]> {
    return [...this.records.values()].filter((record) => (record as T & { eventId?: string }).eventId === eventId).map((record) => structuredClone(record));
  }

  async dependencies(taskId: string): Promise<string[]> {
    return [...(this.taskDependencies.get(taskId) ?? [])];
  }

  async setDependencies(taskId: string, dependencyIds: string[]): Promise<void> {
    this.taskDependencies.set(taskId, [...dependencyIds]);
  }

  async createWithDependencies(record: PersistedTask, dependencyIds: string[]): Promise<CreateResult<PersistedTask>> {
    const result = await this.create(record as unknown as T);
    if (result.ok) this.taskDependencies.set(record.id, [...dependencyIds]);
    return result as unknown as CreateResult<PersistedTask>;
  }
}

const event = (): PersistedEvent => ({
  id: "event-1",
  revision: 0,
  workflow: preparePrototypeWorkflow("Organise a university networking event for 50 attendees within RM1,500.")
});

test("event repository contract covers retrieval, duplicate IDs, updates, and revision conflicts", async () => {
  const repository: EventRepository = new InMemoryVersionedRepository<PersistedEvent>();
  assert.equal(await repository.get("missing"), undefined);
  assert.deepEqual(await repository.create(event()), { ok: true, record: event() });
  assert.deepEqual(await repository.create(event()), { ok: false, reason: "duplicate_id" });

  const updated = { ...event(), workflow: { ...event().workflow, status: "needs_input" as const } };
  assert.deepEqual(await repository.update(updated, 3), { ok: false, reason: "revision_conflict" });
  const result = await repository.update(updated, 0);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.record.revision, 1);
  assert.equal((await repository.get("event-1"))?.workflow.status, "needs_input");
  assert.deepEqual(await repository.update({ ...updated, id: "missing" }, 0), { ok: false, reason: "not_found" });
});

test("task, approval, and artifact repositories share the same typed contract", async () => {
  const tasks: TaskRepository = new InMemoryVersionedRepository<PersistedTask>();
  const approvals: ApprovalRepository = new InMemoryVersionedRepository<PersistedApproval>();
  const artifacts: ArtifactMetadataRepository = new InMemoryVersionedRepository<PersistedArtifact>();

  assert.equal((await tasks.create({ id: "task-1", revision: 0, eventId: "event-1", title: "Draft budget", status: "queued" })).ok, true);
  assert.equal((await approvals.create({ id: "approval-1", revision: 0, eventId: "event-1", action: "Confirm venue", status: "pending" })).ok, true);
  assert.equal((await artifacts.create({ id: "artifact-1", revision: 0, eventId: "event-1", artifact: { type: "budget", path: "artifacts/budget.md", status: "draft" } })).ok, true);
  assert.equal((await tasks.get("task-1"))?.eventId, "event-1");
  assert.equal((await approvals.get("approval-1"))?.status, "pending");
  assert.equal((await artifacts.get("artifact-1"))?.artifact.status, "draft");
});

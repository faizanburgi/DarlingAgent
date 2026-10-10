import assert from "node:assert/strict";
import test from "node:test";
import { preparePrototypeWorkflow } from "../core/application.js";
/** Test-only double: it validates the port contract but is not a storage adapter. */
class InMemoryVersionedRepository {
    records = new Map();
    async get(id) {
        const record = this.records.get(id);
        return record === undefined ? undefined : structuredClone(record);
    }
    async create(record) {
        if (this.records.has(record.id))
            return { ok: false, reason: "duplicate_id" };
        const stored = structuredClone(record);
        this.records.set(stored.id, stored);
        return { ok: true, record: structuredClone(stored) };
    }
    async update(record, expectedRevision) {
        const current = this.records.get(record.id);
        if (current === undefined)
            return { ok: false, reason: "not_found" };
        if (current.revision !== expectedRevision)
            return { ok: false, reason: "revision_conflict" };
        const stored = { ...structuredClone(record), revision: current.revision + 1 };
        this.records.set(stored.id, stored);
        return { ok: true, record: structuredClone(stored) };
    }
}
const event = () => ({
    id: "event-1",
    revision: 0,
    workflow: preparePrototypeWorkflow("Organise a university networking event for 50 attendees within RM1,500.")
});
test("event repository contract covers retrieval, duplicate IDs, updates, and revision conflicts", async () => {
    const repository = new InMemoryVersionedRepository();
    assert.equal(await repository.get("missing"), undefined);
    assert.deepEqual(await repository.create(event()), { ok: true, record: event() });
    assert.deepEqual(await repository.create(event()), { ok: false, reason: "duplicate_id" });
    const updated = { ...event(), workflow: { ...event().workflow, status: "needs_input" } };
    assert.deepEqual(await repository.update(updated, 3), { ok: false, reason: "revision_conflict" });
    const result = await repository.update(updated, 0);
    assert.equal(result.ok, true);
    if (result.ok)
        assert.equal(result.record.revision, 1);
    assert.equal((await repository.get("event-1"))?.workflow.status, "needs_input");
    assert.deepEqual(await repository.update({ ...updated, id: "missing" }, 0), { ok: false, reason: "not_found" });
});
test("task, approval, and artifact repositories share the same typed contract", async () => {
    const tasks = new InMemoryVersionedRepository();
    const approvals = new InMemoryVersionedRepository();
    const artifacts = new InMemoryVersionedRepository();
    assert.equal((await tasks.create({ id: "task-1", revision: 0, eventId: "event-1", title: "Draft budget", status: "queued" })).ok, true);
    assert.equal((await approvals.create({ id: "approval-1", revision: 0, eventId: "event-1", action: "Confirm venue", status: "pending" })).ok, true);
    assert.equal((await artifacts.create({ id: "artifact-1", revision: 0, eventId: "event-1", artifact: { type: "budget", path: "artifacts/budget.md", status: "draft" } })).ok, true);
    assert.equal((await tasks.get("task-1"))?.eventId, "event-1");
    assert.equal((await approvals.get("approval-1"))?.status, "pending");
    assert.equal((await artifacts.get("artifact-1"))?.artifact.status, "draft");
});

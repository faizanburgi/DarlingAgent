import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { SqlitePersistence } from "../adapters/sqlite/sqlite-persistence.js";
import { EventApplicationService } from "../core/event-application-service.js";

async function withService(run: (service: EventApplicationService, path: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "campus-event-service-"));
  const path = join(directory, "events.sqlite");
  const store = new SqlitePersistence(path);
  try { await run(new EventApplicationService(store), path); }
  finally { store.close(); await rm(directory, { recursive: true, force: true }); }
}

test("persistent application workflow survives reopen and returns an accurate event summary", async () => {
  await withService(async (service, path) => {
    assert.equal((await service.createEvent("event-1", "Organise a university networking event for 50 attendees within RM1,500.")).ok, true);
    const dependent = await service.createTask({ id: "task-budget", eventId: "event-1", title: "Draft budget", status: "in_progress" });
    assert.equal(dependent.ok, true);
    assert.equal((await service.submitSpecialistResult({ id: "result-1", eventId: "event-1", taskId: "task-budget", specialist: "Finance", result: { total: 1360 }, evidence: ["draft spreadsheet"], unresolvedIssues: ["Supplier quotations pending"] })).ok, true);
    assert.equal((await service.transitionTask("task-budget", 0, "completed")).ok, true);
    assert.equal((await service.createTask({ id: "task-venue", eventId: "event-1", title: "Approve venue", status: "needs_approval" }, ["task-budget"])).ok, true);
    assert.equal((await service.requestApproval({ id: "approval-1", eventId: "event-1", taskId: "task-venue", action: "Confirm venue" })).ok, true);
    assert.deepEqual(await service.transitionTask("task-venue", 0, "completed"), { ok: false, reason: "approval_required" });
    assert.equal((await service.recordApprovalDecision("approval-1", 0, "approved")).ok, true);
    assert.equal((await service.transitionTask("task-venue", 0, "completed")).ok, true);
    assert.equal((await service.validateEvent("event-1", "validation-1")).ok, true);
    assert.equal((await service.recordFact({ id: "fact-1", eventId: "event-1", field: "venue", value: "Hall A", evidence: "organiser note", status: "estimate" })).ok, true);
    assert.deepEqual(await service.recordFact({ id: "fact-2", eventId: "event-1", field: "venue", value: "Hall B", evidence: "email", status: "confirmed" }), { ok: false, reason: "conflicting_fact" });
    const artifactPath = join(tmpdir(), `campus-artifact-${Date.now()}.md`);
    await writeFile(artifactPath, "written first", "utf8");
    assert.equal((await service.registerArtifact({ id: "artifact-1", eventId: "event-1", artifact: { type: "budget", path: artifactPath, status: "draft" } }, async () => true)).ok, true);
    const summary = await service.getSummary("event-1");
    assert.equal(summary.ok, true);
    if (summary.ok) {
      assert.equal(summary.value.tasks.length, 2);
      assert.equal(summary.value.tasks.find((task) => task.id === "task-venue")?.status, "completed");
      assert.equal(summary.value.approvals[0]?.status, "approved");
      assert.equal(summary.value.validations[0]?.checks.find((check) => check.name === "budget ceiling")?.status, "passed");
      assert.equal(summary.value.artifacts.length, 1);
      assert.match(summary.value.unresolvedIssues.join(" "), /Conflicting venue/);
    }
    await rm(artifactPath, { force: true });

    // Close/reopen verifies application records, rather than only raw adapter rows.
    const reopened = new SqlitePersistence(path);
    try {
      const persisted = await new EventApplicationService(reopened).getSummary("event-1");
      assert.equal(persisted.ok, true);
      if (persisted.ok) assert.equal(persisted.value.tasks.find((task) => task.id === "task-budget")?.results.length, 1);
    } finally { reopened.close(); }
  });
});

test("failed service operations preserve stored records and reject stale revisions", async () => {
  await withService(async (service) => {
    assert.equal((await service.createEvent("event-1", "Organise a university networking event for 50 attendees within RM1,500.")).ok, true);
    assert.equal((await service.createTask({ id: "task-1", eventId: "event-1", title: "Draft", status: "queued" })).ok, true);
    assert.deepEqual(await service.transitionTask("task-1", 99, "in_progress"), { ok: false, reason: "revision_conflict" });
    const summary = await service.getSummary("event-1");
    assert.equal(summary.ok, true);
    if (summary.ok) assert.equal(summary.value.tasks[0]?.status, "queued");
    assert.deepEqual(await service.registerArtifact({ id: "missing-file", eventId: "event-1", artifact: { type: "budget", path: "not-written.md", status: "draft" } }, async () => false), { ok: false, reason: "file_not_written" });
    const after = await service.getSummary("event-1");
    if (after.ok) assert.equal(after.value.artifacts.length, 0);
    assert.deepEqual(await service.getEvent("missing"), { ok: false, reason: "not_found" });
  });
});

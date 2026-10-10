import { validateBudget } from "./budget.js";
import { preparePrototypeWorkflow } from "./application.js";
/**
 * Persistent use cases.  It deliberately accepts only persistence ports: the
 * deterministic domain remains unaware of SQLite, filesystems, or agents.
 */
export class EventApplicationService {
    store;
    constructor(store) {
        this.store = store;
    }
    async createEvent(id, requestText) {
        const result = await this.store.events.create({ id, revision: 0, workflow: preparePrototypeWorkflow(requestText) });
        return result.ok ? { ok: true, value: result.record } : result;
    }
    async getEvent(id) {
        const event = await this.store.events.get(id);
        return event === undefined ? { ok: false, reason: "not_found" } : { ok: true, value: event };
    }
    async recordFact(fact) {
        if (await this.store.events.get(fact.eventId) === undefined)
            return { ok: false, reason: "not_found" };
        const existing = await this.store.facts.listByEvent(fact.eventId);
        const contradiction = existing.find((item) => item.field === fact.field && item.value !== fact.value);
        const status = contradiction === undefined ? (fact.status ?? "estimate") : "conflicting";
        const created = await this.store.facts.createWithConflict({ ...fact, revision: 0, status }, contradiction?.id);
        if (!created.ok)
            return created;
        // Record both sides of a conflict.  The original evidence is retained.
        if (contradiction !== undefined)
            return { ok: false, reason: "conflicting_fact" };
        return { ok: true, value: created.record };
    }
    async createTask(task, dependencyIds = []) {
        if (await this.store.events.get(task.eventId) === undefined)
            return { ok: false, reason: "not_found" };
        for (const id of dependencyIds) {
            const dependency = await this.store.tasks.get(id);
            if (dependency === undefined || dependency.eventId !== task.eventId)
                return { ok: false, reason: "not_found" };
        }
        const resolved = await this.store.tasks.createWithDependencies({ ...task, revision: 0 }, dependencyIds);
        return resolved.ok ? { ok: true, value: resolved.record } : resolved;
    }
    async submitSpecialistResult(result) {
        const task = await this.store.tasks.get(result.taskId);
        if (task === undefined || task.eventId !== result.eventId)
            return { ok: false, reason: "not_found" };
        const created = await this.store.results.create({ ...result, revision: 0 });
        return created.ok ? { ok: true, value: created.record } : created;
    }
    async transitionTask(id, expectedRevision, next) {
        const task = await this.store.tasks.get(id);
        if (task === undefined)
            return { ok: false, reason: "not_found" };
        if (task.revision !== expectedRevision)
            return { ok: false, reason: "revision_conflict" };
        if (next === "completed") {
            const dependencies = await this.store.tasks.dependencies(id);
            for (const dependencyId of dependencies)
                if ((await this.store.tasks.get(dependencyId))?.status !== "completed")
                    return { ok: false, reason: "dependency_unmet" };
        }
        const updated = await this.store.tasks.update({ ...task, status: next }, expectedRevision);
        if (!updated.ok) {
            // The adapter protects lifecycle and approval gates; expose useful service outcomes.
            if (task.status === "needs_approval" && (next === "completed" || next === "in_progress"))
                return { ok: false, reason: "approval_required" };
            return { ok: false, reason: "invalid_transition" };
        }
        return { ok: true, value: updated.record };
    }
    async requestApproval(approval) {
        if (await this.store.events.get(approval.eventId) === undefined)
            return { ok: false, reason: "not_found" };
        if (approval.taskId !== undefined) {
            const task = await this.store.tasks.get(approval.taskId);
            if (task === undefined || task.eventId !== approval.eventId)
                return { ok: false, reason: "not_found" };
        }
        const created = await this.store.approvals.create({ ...approval, revision: 0, status: "pending" });
        return created.ok ? { ok: true, value: created.record } : created;
    }
    async recordApprovalDecision(id, expectedRevision, status) {
        const approval = await this.store.approvals.get(id);
        if (approval === undefined)
            return { ok: false, reason: "not_found" };
        if (approval.revision !== expectedRevision)
            return { ok: false, reason: "revision_conflict" };
        const updated = await this.store.approvals.update({ ...approval, status }, expectedRevision);
        return updated.ok ? { ok: true, value: updated.record } : updated;
    }
    async validateEvent(id, validationId) {
        const event = await this.store.events.get(id);
        if (event === undefined)
            return { ok: false, reason: "not_found" };
        const checks = validateBudget(event.workflow.budget, event.workflow.request.budgetLimit, event.workflow.request.currency);
        const created = await this.store.validations.create({ id: validationId, revision: 0, eventId: id, checks });
        return created.ok ? { ok: true, value: created.record } : created;
    }
    /** The verifier must confirm a completed file write. DB + filesystem are not one transaction. */
    async registerArtifact(record, fileWritten) {
        if (!await fileWritten())
            return { ok: false, reason: "file_not_written" };
        if (await this.store.events.get(record.eventId) === undefined)
            return { ok: false, reason: "not_found" };
        const created = await this.store.artifacts.create({ ...record, revision: 0 });
        return created.ok ? { ok: true, value: created.record } : created;
    }
    async getSummary(eventId) {
        const event = await this.store.events.get(eventId);
        if (event === undefined)
            return { ok: false, reason: "not_found" };
        const [taskRecords, approvals, validations, artifacts, facts, allResults] = await Promise.all([
            this.store.tasks.listByEvent(eventId), this.store.approvals.listByEvent(eventId), this.store.validations.listByEvent(eventId),
            this.store.artifacts.listByEvent(eventId), this.store.facts.listByEvent(eventId), this.store.results.listByEvent(eventId)
        ]);
        const tasks = await Promise.all(taskRecords.map(async (task) => ({
            ...task, dependencies: await this.store.tasks.dependencies(task.id), results: allResults.filter((result) => result.taskId === task.id)
        })));
        const unresolvedIssues = [...event.workflow.unresolvedIssues, ...facts.filter((fact) => fact.status === "conflicting").map((fact) => `Conflicting ${fact.field}: ${fact.value}.`)];
        return { ok: true, value: { event, tasks, approvals, validations, artifacts, facts, unresolvedIssues } };
    }
}

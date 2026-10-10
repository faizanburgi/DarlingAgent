import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { SqlitePersistence } from "../sqlite/sqlite-persistence.js";
import { EventApplicationService, type ServiceResult } from "../../core/event-application-service.js";
import type { TaskStatus } from "../../core/domain.js";

const id = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Use letters, numbers, '.', '_' or '-'.");
const text = (name: string, max = 4000) => z.string().trim().min(1, `${name} is required.`).max(max);
const taskStatus = z.enum(["queued", "in_progress", "needs_input", "needs_approval", "blocked", "completed", "failed"]);

export interface LocalMcpApplication {
  server: McpServer;
  service: EventApplicationService;
  close(): Promise<void>;
}

/** MCP-only composition root.  The core has no MCP SDK dependency. */
export function createLocalMcpApplication(databasePath: string): LocalMcpApplication {
  const store = new SqlitePersistence(databasePath);
  const service = new EventApplicationService(store);
  const server = new McpServer({ name: "campus-event-agent", version: "0.1.0" });
  registerTools(server, service);
  return {
    server,
    service,
    async close() { await server.close(); store.close(); }
  };
}

/** Starts the local-only stdio server.  Diagnostics are deliberately stderr-only. */
export function startStdioServer(databasePath: string) {
  let application: LocalMcpApplication | undefined;
  const handle = serveStdio(() => {
    application = createLocalMcpApplication(databasePath);
    return application.server;
  }, { onerror: (error) => console.error(`[campus-event-mcp] ${error.message}`) });
  return { async close() { await handle.close(); await application?.close(); } };
}

function registerTools(server: McpServer, service: EventApplicationService): void {
  server.registerTool("event_create", {
    title: "Create persistent event", description: "Mutation: create a persistent draft planning workflow from an event brief.",
    inputSchema: z.object({ eventId: id, eventBrief: text("eventBrief") })
  }, async ({ eventId, eventBrief }) => result(await service.createEvent(eventId, eventBrief), "Event created."));

  server.registerTool("event_get", {
    title: "Get event", description: "Read-only: retrieve an event workflow and current event summary.", inputSchema: z.object({ eventId: id })
  }, async ({ eventId }) => result(await service.getSummary(eventId), "Event retrieved."));

  server.registerTool("event_update_facts", {
    title: "Record sourced fact", description: "Mutation: record a sourced estimate or confirmed fact; contradictory values are preserved and marked conflicting.",
    inputSchema: z.object({ factId: id, eventId: id, field: text("field", 128), value: text("value", 1000), evidence: text("evidence"), status: z.enum(["estimate", "confirmed"]).optional() })
  }, async ({ factId, ...input }) => result(await service.recordFact({ id: factId, ...input }), "Fact recorded."));

  server.registerTool("task_create", {
    title: "Create specialist task", description: "Mutation: create a bounded task and optional same-event dependencies.",
    inputSchema: z.object({ taskId: id, eventId: id, title: text("title", 300), status: z.enum(["queued", "in_progress", "needs_input", "needs_approval", "blocked"]).default("queued"), dependencyIds: z.array(id).max(50).default([]) })
  }, async ({ taskId, eventId, title, status, dependencyIds }) => result(await service.createTask({ id: taskId, eventId, title, status }, dependencyIds), "Task created."));

  server.registerTool("task_submit_result", {
    title: "Submit specialist result", description: "Mutation: save a structured specialist result and its evidence/unresolved issues.",
    inputSchema: z.object({ resultId: id, eventId: id, taskId: id, specialist: text("specialist", 128), result: z.record(z.string(), z.unknown()), evidence: z.array(text("evidence", 1000)).max(100), unresolvedIssues: z.array(text("unresolved issue", 1000)).max(100) })
  }, async ({ resultId, ...input }) => result(await service.submitSpecialistResult({ id: resultId, ...input }), "Specialist result recorded."));

  server.registerTool("task_transition", {
    title: "Transition task", description: "Mutation: apply lifecycle, dependency, approval, and revision checks to a task transition.",
    inputSchema: z.object({ taskId: id, expectedRevision: z.number().int().nonnegative(), status: taskStatus })
  }, async ({ taskId, expectedRevision, status }) => result(await service.transitionTask(taskId, expectedRevision, status as TaskStatus), "Task transitioned."));

  server.registerTool("budget_validate", {
    title: "Validate event budget", description: "Mutation: persist a deterministic validation snapshot for the event's existing itemised budget and ceiling.",
    inputSchema: z.object({ eventId: id, validationId: id })
  }, async ({ eventId, validationId }) => result(await service.validateEvent(eventId, validationId), "Budget validation recorded."));

  server.registerTool("event_list_tasks", {
    title: "List event tasks", description: "Read-only: retrieve task statuses, dependencies, and submitted results.", inputSchema: z.object({ eventId: id })
  }, async ({ eventId }) => {
    const summary = await service.getSummary(eventId);
    return summary.ok ? ok(summary.value.tasks, "Tasks retrieved.") : failure(summary);
  });

  server.registerTool("approval_request", {
    title: "Request human approval", description: "Mutation: record a pending approval request; this does not execute the proposed action.",
    inputSchema: z.object({ approvalId: id, eventId: id, taskId: id.optional(), action: text("action", 1000) })
  }, async ({ approvalId, ...input }) => result(await service.requestApproval({ id: approvalId, ...input }), "Approval requested."));

  server.registerTool("approval_record_decision", {
    title: "Record human decision", description: "Mutation: record an explicit approved, rejected, or expired human decision using revision checks.",
    inputSchema: z.object({ approvalId: id, expectedRevision: z.number().int().nonnegative(), status: z.enum(["approved", "rejected", "expired"]) })
  }, async ({ approvalId, expectedRevision, status }) => result(await service.recordApprovalDecision(approvalId, expectedRevision, status), "Approval decision recorded."));

  server.registerTool("artifact_get", {
    title: "List artifact metadata", description: "Read-only: retrieve registered draft artifact metadata. File contents are never exposed.", inputSchema: z.object({ eventId: id })
  }, async ({ eventId }) => {
    const summary = await service.getSummary(eventId);
    return summary.ok ? ok(summary.value.artifacts, "Artifact metadata retrieved.") : failure(summary);
  });
}

function result<T>(outcome: ServiceResult<T>, success: string) {
  return outcome.ok ? ok(outcome.value, success) : failure(outcome);
}

function ok(value: unknown, summary: string) {
  return { content: [{ type: "text" as const, text: summary }], structuredContent: { ok: true, value } };
}

function failure(outcome: Exclude<ServiceResult<unknown>, { ok: true; value: unknown }>) {
  return { isError: true, content: [{ type: "text" as const, text: `Operation failed: ${outcome.reason}.` }], structuredContent: { ok: false, reason: outcome.reason } };
}

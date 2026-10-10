/**
 * Framework-independent contracts for the deterministic event workflow.
 *
 * `completed` means this prototype produced validated draft artifacts. It does
 * not mean a venue was booked, an approval was granted, or an event occurred.
 */
export type ValidationStatus = "passed" | "failed" | "not_verified";
export type EventStatus = "completed" | "needs_input" | "blocked";
/** Task statuses are the bounded specialist-result states specified in the brief. */
export type TaskStatus = "queued" | "in_progress" | "needs_input" | "needs_approval" | "blocked" | "completed" | "failed";
/** Approval state is separate from task/event completion and requires an explicit decision. */
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export interface EventRequest {
  title: string;
  attendeeCount?: number;
  budgetLimit?: number;
  currency?: string;
}

export interface BudgetLine {
  item: string;
  amount: number;
  status: "estimate" | "confirmed";
  note: string;
}

export interface ValidationCheck {
  name: string;
  status: ValidationStatus;
  detail: string;
}

export interface Artifact {
  type: "budget" | "event_plan";
  path: string;
  status: "draft";
}

export interface WorkflowResult {
  /** Completion means validated draft workflow output, never real-world event completion. */
  status: EventStatus;
  request: EventRequest;
  budget: BudgetLine[];
  total: number;
  remainingBudget?: number;
  assumptions: string[];
  unresolvedIssues: string[];
  validation: ValidationCheck[];
  artifacts: Artifact[];
}

/** The smallest persistable form of the existing deterministic workflow. */
export interface PersistedEvent {
  id: string;
  revision: number;
  workflow: WorkflowResult;
}

/** A future specialist task, associated to one persisted event. */
export interface PersistedTask {
  id: string;
  revision: number;
  eventId: string;
  title: string;
  status: TaskStatus;
}

/** A gate for a consequential action; approval is never inferred from task state. */
export interface PersistedApproval {
  id: string;
  revision: number;
  eventId: string;
  /** Optional because some approvals apply to an event rather than one task. */
  taskId?: string;
  action: string;
  status: ApprovalStatus;
}

/** Metadata for an artifact already represented by the existing Artifact contract. */
export interface PersistedArtifact {
  id: string;
  revision: number;
  eventId: string;
  artifact: Artifact;
}

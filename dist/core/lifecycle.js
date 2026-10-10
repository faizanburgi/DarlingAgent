/**
 * Preserves the Milestone 1 lifecycle semantics. These states describe the
 * prototype workflow only; they make no claim about real-world completion.
 */
export function missingPrototypeConstraints(request) {
    return [
        request.attendeeCount === undefined ? "Expected attendance is required." : undefined,
        request.budgetLimit === undefined ? "Budget ceiling is required." : undefined
    ].filter((item) => Boolean(item));
}
export function derivePrototypeStatus(missing, validation) {
    if (missing.length > 0)
        return "needs_input";
    if (validation.some((check) => check.status === "failed"))
        return "blocked";
    return "completed";
}
const eventTransitions = {
    needs_input: ["blocked", "completed"],
    blocked: ["needs_input"],
    completed: []
};
const taskTransitions = {
    queued: ["in_progress", "needs_input", "needs_approval", "blocked", "failed"],
    in_progress: ["needs_input", "needs_approval", "blocked", "completed", "failed"],
    needs_input: ["queued", "in_progress", "blocked", "failed"],
    needs_approval: ["in_progress", "completed", "blocked", "failed"],
    blocked: ["queued", "in_progress", "needs_input", "failed"],
    completed: [],
    failed: ["queued", "in_progress", "blocked"]
};
/** Existing event statuses describe the draft-planning workflow, not real-world completion. */
export function validateEventTransition(current, next) {
    return eventTransitions[current].includes(next)
        ? { allowed: true }
        : { allowed: false, reason: "invalid_transition" };
}
/**
 * Task completion from an approval gate requires a separately recorded
 * approved decision; pending, rejected, and expired approvals never qualify.
 */
export function validateTaskTransition(current, next, approvalStatus) {
    if (!taskTransitions[current].includes(next)) {
        return { allowed: false, reason: "invalid_transition" };
    }
    if (current === "needs_approval" && (next === "in_progress" || next === "completed") && approvalStatus !== "approved") {
        return { allowed: false, reason: "approval_required" };
    }
    return { allowed: true };
}

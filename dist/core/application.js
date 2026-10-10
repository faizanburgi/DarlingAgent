import { calculateTotal, prototypeBudget, validateBudget } from "./budget.js";
import { derivePrototypeStatus, missingPrototypeConstraints } from "./lifecycle.js";
export function extractPrototypeRequest(text) {
    const attendees = text.match(/(\d+)\s*(?:attendees|people|students)/i)?.[1];
    const budget = text.match(/RM\s*([\d,]+)/i)?.[1]?.replace(/,/g, "");
    return {
        title: "University networking event",
        attendeeCount: attendees ? Number(attendees) : undefined,
        budgetLimit: budget ? Number(budget) : undefined,
        currency: "RM"
    };
}
/** Creates the original deterministic workflow result without infrastructure side effects. */
export function preparePrototypeWorkflow(text) {
    const request = extractPrototypeRequest(text);
    const missing = missingPrototypeConstraints(request);
    const budget = prototypeBudget();
    const total = calculateTotal(budget);
    const validation = validateBudget(budget, request.budgetLimit, request.currency);
    return {
        status: derivePrototypeStatus(missing, validation),
        request,
        budget,
        total,
        remainingBudget: request.budgetLimit === undefined ? undefined : request.budgetLimit - total,
        assumptions: ["All costs are estimates, not quotations or approved spend.", "The event is a campus-based networking event for 50 attendees when attendance is supplied."],
        unresolvedIssues: [...missing, "Venue availability, booking, institutional approvals, and supplier quotations have not been verified or completed."],
        validation,
        artifacts: []
    };
}

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { calculateTotal, prototypeBudget, validateBudget } from "../budget.js";
import { preparePrototypeWorkflow } from "../core/application.js";
import { derivePrototypeStatus, missingPrototypeConstraints } from "../core/lifecycle.js";
import { runPrototype } from "../workflow.js";

test("calculates the draft budget deterministically", () => {
  assert.equal(calculateTotal(prototypeBudget()), 1360);
});

test("reports an over-budget scenario", () => {
  const ceiling = validateBudget(prototypeBudget(), 1000);
  assert.equal(ceiling.find((check) => check.name === "budget ceiling")?.status, "failed");
});

test("requires critical missing inputs", async () => {
  const result = await runPrototype("Organise a university networking event.", "artifacts/test-missing");
  assert.equal(result.status, "needs_input");
  assert.match(result.unresolvedIssues.join(" "), /Expected attendance/);
});

test("blocks a validation failure while preserving draft artifacts", async () => {
  const result = await runPrototype("Organise a university networking event for 50 attendees within RM1,000.", "artifacts/test-over-budget");
  assert.equal(result.status, "blocked");
  assert.equal(result.artifacts.length, 2);
});

test("keeps the extracted core and compatibility wrapper behaviourally identical", async () => {
  const text = "Organise a university networking event for 50 attendees within RM1,500.";
  const coreResult = preparePrototypeWorkflow(text);
  const wrapperResult = await runPrototype(text, "artifacts/test-parity");

  assert.deepEqual({ ...wrapperResult, artifacts: [] }, coreResult);
  assert.deepEqual(coreResult.budget, prototypeBudget());
  assert.equal(coreResult.total, 1360);
  assert.equal(coreResult.remainingBudget, 140);
  assert.deepEqual(coreResult.validation.map((check) => check.status), ["passed", "passed"]);
  assert.equal(
    createHash("sha256").update(await readFile(join("artifacts/test-parity", "event-plan.md"))).digest("hex").toUpperCase(),
    "243DE7E0B524C47037102A326D46471505BC38A33528D580898730128B94FC9B"
  );
  assert.equal(
    createHash("sha256").update(await readFile(join("artifacts/test-parity", "budget.md"))).digest("hex").toUpperCase(),
    "FCE3C6E46422C62CDAAFB1E8D2CDE1AF4B3BF4BF7C3D325A9CF659077D609F59"
  );
});

test("documents the existing workflow-only status semantics", () => {
  const request = { title: "University networking event", attendeeCount: 50, budgetLimit: 1500, currency: "RM" };
  const validation = validateBudget(prototypeBudget(), request.budgetLimit, request.currency);

  assert.equal(derivePrototypeStatus(missingPrototypeConstraints(request), validation), "completed");
  assert.equal(derivePrototypeStatus(["Budget ceiling is required."], validation), "needs_input");
  assert.equal(derivePrototypeStatus([], validateBudget(prototypeBudget(), 1000)), "blocked");
});

import assert from "node:assert/strict";
import test from "node:test";
import { validateEventTransition, validateTaskTransition } from "../core/lifecycle.js";

test("allows only the existing event workflow transitions", () => {
  assert.deepEqual(validateEventTransition("needs_input", "completed"), { allowed: true });
  assert.deepEqual(validateEventTransition("needs_input", "blocked"), { allowed: true });
  assert.deepEqual(validateEventTransition("blocked", "needs_input"), { allowed: true });
  assert.deepEqual(validateEventTransition("blocked", "completed"), { allowed: false, reason: "invalid_transition" });
  assert.deepEqual(validateEventTransition("completed", "blocked"), { allowed: false, reason: "invalid_transition" });
  assert.deepEqual(validateEventTransition("completed", "completed"), { allowed: false, reason: "invalid_transition" });
});

test("prevents unintended task completion and requires an explicit approval", () => {
  assert.deepEqual(validateTaskTransition("queued", "in_progress"), { allowed: true });
  assert.deepEqual(validateTaskTransition("in_progress", "completed"), { allowed: true });
  assert.deepEqual(validateTaskTransition("completed", "failed"), { allowed: false, reason: "invalid_transition" });
  assert.deepEqual(validateTaskTransition("completed", "completed"), { allowed: false, reason: "invalid_transition" });
  assert.deepEqual(validateTaskTransition("blocked", "completed"), { allowed: false, reason: "invalid_transition" });
  assert.deepEqual(validateTaskTransition("needs_approval", "completed", "pending"), { allowed: false, reason: "approval_required" });
  assert.deepEqual(validateTaskTransition("needs_approval", "completed", "approved"), { allowed: true });
});

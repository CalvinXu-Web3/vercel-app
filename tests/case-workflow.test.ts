import assert from "node:assert/strict";
import test from "node:test";
import { caseWorkflowTransition, isCaseContentEditable } from "../src/lib/case-workflow";

test("case workflow requires review before approval", () => {
  assert.equal(caseWorkflowTransition("draft", "submit"), "submitted");
  assert.equal(caseWorkflowTransition("submitted", "start_review"), "under_review");
  assert.equal(caseWorkflowTransition("under_review", "approve"), "approved");
  assert.equal(caseWorkflowTransition("submitted", "approve"), null);
});

test("only drafts and returned cases are editable", () => {
  assert.equal(isCaseContentEditable("draft"), true);
  assert.equal(isCaseContentEditable("needs_information"), true);
  assert.equal(isCaseContentEditable("under_review"), false);
  assert.equal(isCaseContentEditable("published"), false);
});

test("a published case can open a new draft without replacing its public snapshot", () => {
  assert.equal(caseWorkflowTransition("published", "start_revision"), "draft");
});

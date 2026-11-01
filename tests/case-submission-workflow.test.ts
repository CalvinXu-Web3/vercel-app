import assert from "node:assert/strict";
import test from "node:test";
import {
  caseSubmissionOwnerTransition,
  caseSubmissionReviewTransition,
} from "../src/lib/case-submission-workflow";

test("case submission review follows the defined state machine", () => {
  assert.equal(caseSubmissionReviewTransition("submitted", "start_triage"), "triage");
  assert.equal(
    caseSubmissionReviewTransition("triage", "request_information"),
    "needs_information",
  );
  assert.equal(caseSubmissionReviewTransition("needs_information", "accept"), null);
  assert.equal(caseSubmissionReviewTransition("needs_information", "start_triage"), null);
});

test("submitters can close the information-request loop or withdraw active submissions", () => {
  assert.equal(caseSubmissionOwnerTransition("needs_information", "resubmit"), "submitted");
  assert.equal(caseSubmissionOwnerTransition("submitted", "withdraw"), "withdrawn");
  assert.equal(caseSubmissionOwnerTransition("triage", "withdraw"), "withdrawn");
  assert.equal(caseSubmissionOwnerTransition("needs_information", "withdraw"), "withdrawn");
  assert.equal(caseSubmissionOwnerTransition("accepted", "withdraw"), null);
  assert.equal(caseSubmissionOwnerTransition("submitted", "resubmit"), null);
});

test("terminal submissions cannot be reviewed again", () => {
  assert.equal(caseSubmissionReviewTransition("accepted", "reject"), null);
  assert.equal(caseSubmissionReviewTransition("rejected", "accept"), null);
  assert.equal(caseSubmissionReviewTransition("withdrawn", "start_triage"), null);
});

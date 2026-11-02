import assert from "node:assert/strict";
import test from "node:test";
import { canAccessWorkspace, hasCasePermission } from "../src/lib/case-policy";

test("only platform reviewers and admins can access the workspace", () => {
  assert.equal(canAccessWorkspace("contributor"), false);
  assert.equal(canAccessWorkspace("reviewer"), true);
  assert.equal(canAccessWorkspace("admin"), true);
});

test("contributors have no implicit access to another user's case", () => {
  assert.equal(
    hasCasePermission({ globalRole: "contributor" }, "case:view"),
    false,
  );
});

test("case editors cannot publish or manage members", () => {
  const actor = { globalRole: "contributor" as const, caseRole: "editor" as const };
  assert.equal(hasCasePermission(actor, "case:edit"), true);
  assert.equal(hasCasePermission(actor, "case:publish"), false);
  assert.equal(hasCasePermission(actor, "case:members:manage"), false);
});

test("organization publishers can review and publish but cannot edit", () => {
  const actor = {
    globalRole: "contributor" as const,
    organizationRole: "publisher" as const,
  };
  assert.equal(hasCasePermission(actor, "case:review"), true);
  assert.equal(hasCasePermission(actor, "case:publish"), true);
  assert.equal(hasCasePermission(actor, "case:edit"), false);
});

test("platform reviewers cannot edit or publish cases", () => {
  const actor = { globalRole: "reviewer" as const };
  assert.equal(hasCasePermission(actor, "case:review"), true);
  assert.equal(hasCasePermission(actor, "case:edit"), false);
  assert.equal(hasCasePermission(actor, "case:publish"), false);
});

test("platform admins retain emergency access", () => {
  assert.equal(
    hasCasePermission({ globalRole: "admin" }, "case:members:manage"),
    true,
  );
});

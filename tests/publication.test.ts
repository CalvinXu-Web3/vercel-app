import assert from "node:assert/strict";
import test from "node:test";
import { hashPublicSnapshot, isPublicCaseSnapshot, type PublicCaseSnapshot } from "../src/lib/publication";

const snapshot: PublicCaseSnapshot = {
  case: { code: "CRN-1", titleZh: "案件", titleEn: "Case", summaryZh: null, summaryEn: null, status: "published", updatedAt: "2026-01-01T00:00:00.000Z", publishedAt: "2026-01-01T00:00:00.000Z" },
  timeline: [], entities: [], relations: [], wallets: [],
};

test("publication snapshots have deterministic SHA-256 hashes", () => {
  assert.equal(hashPublicSnapshot(snapshot), hashPublicSnapshot(structuredClone(snapshot)));
  assert.equal(hashPublicSnapshot(snapshot).length, 64);
});

test("public snapshot guard rejects incomplete database JSON", () => {
  assert.equal(isPublicCaseSnapshot(snapshot), true);
  assert.equal(isPublicCaseSnapshot({ case: snapshot.case }), false);
});

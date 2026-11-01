import assert from "node:assert/strict";
import test from "node:test";
import { buildRateLimitBucket } from "../src/lib/rate-limit";

test("rate-limit buckets are stable inside one window", () => {
  const first = buildRateLimitBucket("case.create", "user-1", 3600, new Date("2026-01-01T10:10:00Z"));
  const second = buildRateLimitBucket("case.create", "user-1", 3600, new Date("2026-01-01T10:59:59Z"));
  assert.equal(first.key, second.key);
  assert.equal(first.windowStartedAt.toISOString(), "2026-01-01T10:00:00.000Z");
});

test("rate-limit buckets do not expose the raw subject", () => {
  const bucket = buildRateLimitBucket("evidence.upload", "clerk-user-secret", 60);
  assert.equal(bucket.subjectHash.length, 64);
  assert.equal(bucket.key.includes("clerk-user-secret"), false);
});

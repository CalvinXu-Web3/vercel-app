import assert from "node:assert/strict";
import test from "node:test";
import { requireIdempotencyKey } from "../src/lib/idempotency";

test("idempotency keys must be UUIDs", () => {
  const key = "d9d1bb70-1a46-4d1f-9859-f4b93a5c8990";
  assert.equal(
    requireIdempotencyKey(new Request("https://example.test", { headers: { "Idempotency-Key": key } })),
    key,
  );
  assert.throws(() => requireIdempotencyKey(new Request("https://example.test")));
});

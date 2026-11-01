import assert from "node:assert/strict";
import test from "node:test";
import { parsePagination } from "../src/lib/pagination";

test("parsePagination applies safe defaults", () => {
  assert.deepEqual(
    parsePagination(new Request("https://example.test/review")),
    { limit: 25, offset: 0 },
  );
});

test("parsePagination accepts bounded values", () => {
  assert.deepEqual(
    parsePagination(new Request("https://example.test/review?limit=50&offset=125")),
    { limit: 50, offset: 125 },
  );
});

test("parsePagination rejects unbounded values", () => {
  assert.throws(() =>
    parsePagination(new Request("https://example.test/review?limit=1000")),
  );
});

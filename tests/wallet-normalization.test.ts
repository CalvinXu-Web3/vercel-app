import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWalletIdentity } from "../src/lib/wallet";

test("wallet identity normalizes chain names and EVM address casing", () => {
  assert.deepEqual(
    normalizeWalletIdentity(" eth ", "0x7A53155F6DFCEDC0061EB7247ABB4250D691478F"),
    { chain: "ETH", address: "0x7a53155f6dfcedc0061eb7247abb4250d691478f" },
  );
});

test("non-EVM addresses retain case while surrounding whitespace is removed", () => {
  assert.deepEqual(normalizeWalletIdentity(" tron ", " TXAbC123 "), {
    chain: "TRON",
    address: "TXAbC123",
  });
});

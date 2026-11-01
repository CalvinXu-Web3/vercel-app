import assert from "node:assert/strict";
import test from "node:test";
import { validatePinataUploadRecord } from "../src/lib/pinata";

const expected = {
  evidenceFileId: "a3f3f7c9-3a9c-45b5-b33e-95372b7fe70b",
  pinataFileId: "pinata-file-1",
  filename: "evidence.enc",
  bytes: 128,
  mimeType: "application/octet-stream",
  groupId: "evidence-group",
  clientCid: "bafkreicorrectcid",
};

const record = {
  id: expected.pinataFileId,
  name: expected.filename,
  cid: expected.clientCid,
  size: expected.bytes,
  mime_type: expected.mimeType,
  group_id: expected.groupId,
  keyvalues: { crn_evidence_file_id: expected.evidenceFileId },
};

test("validatePinataUploadRecord accepts the exact signed-upload result", () => {
  assert.equal(validatePinataUploadRecord(record, expected).cid, expected.clientCid);
});

test("validatePinataUploadRecord rejects a file from another upload intent", () => {
  assert.throws(() =>
    validatePinataUploadRecord(
      { ...record, keyvalues: { crn_evidence_file_id: "another-intent" } },
      expected,
    ),
  );
});

test("validatePinataUploadRecord rejects mismatched bytes or CID", () => {
  assert.throws(() => validatePinataUploadRecord({ ...record, size: 129 }, expected));
  assert.throws(() =>
    validatePinataUploadRecord({ ...record, cid: "bafkreiwrongcid" }, expected),
  );
});

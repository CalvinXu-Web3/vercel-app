import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCasePermission, requireContributor } from "@/lib/authorization";
import { db } from "@/db/client";
import { auditLogs, caseRecords, evidenceFiles, evidenceItems, outboxEvents } from "@/db/schema";
import { errorResponse, HttpError } from "@/lib/http";
import { requireIdempotencyKey } from "@/lib/idempotency";
import {
  createPinataUploadUrl,
  getEvidenceStoragePolicy,
  getUploadPolicy,
} from "@/lib/pinata";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encryptionSchema = z.object({
  algorithm: z.literal("AES-256-GCM"),
  ivBase64: z.string().min(16).max(128),
  encryptedDekBase64: z.string().min(64).max(4096),
});
const intentSchema = z.object({
  caseCode: z.string().trim().min(3).max(64).optional(),
  caseId: z.string().uuid().optional(),
  title: z.string().trim().min(3).max(240),
  description: z.string().trim().max(4_000).optional(),
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(3).max(128),
  originalBytes: z.number().int().positive(),
  uploadFilename: z.string().trim().min(8).max(255),
  uploadBytes: z.number().int().positive(),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  encryption: encryptionSchema.optional(),
}).refine((input) => Boolean(input.caseCode) !== Boolean(input.caseId), {
  message: "Exactly one case target is required.",
});

type UploadRecord = {
  evidenceFileId: string;
  uploadFilename: string;
  uploadBytes: number;
  fileStatus: string;
};

type ExistingUploadRecord = UploadRecord & {
  caseId: string;
  caseCode: string;
  title: string;
  description: string | null;
  originalFilename: string;
  mimeType: string;
  originalBytes: number;
  contentSha256: string;
  pinataNetwork: string;
  storageMode: string;
  encryptionAlgorithm: string | null;
  encryptionIvBase64: string | null;
  encryptedDekBase64: string | null;
};

export async function POST(request: Request) {
  try {
    const actor = await requireContributor();
    const idempotencyKey = requireIdempotencyKey(request);
    const input = intentSchema.parse(await request.json());
    const uploadPolicy = getUploadPolicy();
    const storagePolicy = getEvidenceStoragePolicy();

    if (input.originalBytes > uploadPolicy.maxBytes || input.uploadBytes > uploadPolicy.maxBytes + 1_024) {
      throw new HttpError(413, "The file exceeds the configured upload limit.");
    }
    if (storagePolicy.mode === "encrypted-public-ipfs" && (!input.encryption || input.mimeType !== "application/octet-stream")) {
      throw new HttpError(422, "Public IPFS uploads must be encrypted in the browser before upload.");
    }
    if (storagePolicy.mode === "private-ipfs" && !uploadPolicy.allowedMimeTypes.includes(input.mimeType)) {
      throw new HttpError(415, "This file type is not permitted.");
    }

    const database = db();
    const issueUploadUrl = async (file: UploadRecord, replayed: boolean) => {
      if (file.fileStatus === "uploaded") {
        return NextResponse.json({
          evidenceFileId: file.evidenceFileId,
          completed: true,
          pinataNetwork: storagePolicy.network,
          storageMode: storagePolicy.mode,
          replayed: true,
        });
      }
      if (!["pending_upload", "upload_url_failed"].includes(file.fileStatus)) {
        throw new HttpError(409, "This idempotent upload intent has already been completed.");
      }
      try {
        const uploadUrl = await createPinataUploadUrl({
          evidenceFileId: file.evidenceFileId,
          filename: file.uploadFilename,
          maxBytes: file.uploadBytes + 1_024,
          network: storagePolicy.network,
          mimeTypes: storagePolicy.mode === "encrypted-public-ipfs"
            ? ["application/octet-stream"]
            : uploadPolicy.allowedMimeTypes,
        });
        if (file.fileStatus === "upload_url_failed") {
          await database.update(evidenceFiles).set({ status: "pending_upload" }).where(eq(evidenceFiles.id, file.evidenceFileId));
        }
        return NextResponse.json(
          {
            evidenceFileId: file.evidenceFileId,
            uploadUrl,
            pinataNetwork: storagePolicy.network,
            storageMode: storagePolicy.mode,
            replayed,
          },
          { status: replayed ? 200 : 201 },
        );
      } catch (error) {
        await database.update(evidenceFiles).set({ status: "upload_url_failed" }).where(eq(evidenceFiles.id, file.evidenceFileId));
        throw error;
      }
    };

    const findExisting = async () => {
      const [existing] = await database
        .select({
          caseId: evidenceItems.caseId,
          caseCode: caseRecords.code,
          title: evidenceItems.title,
          description: evidenceItems.description,
          evidenceFileId: evidenceFiles.id,
          originalFilename: evidenceFiles.originalFilename,
          uploadFilename: evidenceFiles.storageFilename,
          mimeType: evidenceFiles.mimeType,
          originalBytes: evidenceFiles.originalBytes,
          uploadBytes: evidenceFiles.uploadBytes,
          contentSha256: evidenceFiles.sha256,
          pinataNetwork: evidenceFiles.pinataNetwork,
          storageMode: evidenceFiles.storageMode,
          encryptionAlgorithm: evidenceFiles.encryptionAlgorithm,
          encryptionIvBase64: evidenceFiles.encryptionIvBase64,
          encryptedDekBase64: evidenceFiles.encryptedDekBase64,
          fileStatus: evidenceFiles.status,
        })
        .from(evidenceItems)
        .innerJoin(evidenceFiles, eq(evidenceFiles.evidenceId, evidenceItems.id))
        .innerJoin(caseRecords, eq(caseRecords.id, evidenceItems.caseId))
        .where(and(eq(evidenceItems.submitterId, actor.id), eq(evidenceItems.idempotencyKey, idempotencyKey)))
        .limit(1);
      return existing as ExistingUploadRecord | undefined;
    };
    const assertSameRequest = (record: ExistingUploadRecord) => {
      const sameTarget = input.caseId
        ? record.caseId === input.caseId
        : record.caseCode === input.caseCode;
      if (
        !sameTarget ||
        record.title !== input.title ||
        record.description !== (input.description ?? null) ||
        record.originalFilename !== input.originalFilename ||
        record.uploadFilename !== input.uploadFilename ||
        record.mimeType !== input.mimeType ||
        record.originalBytes !== input.originalBytes ||
        record.uploadBytes !== input.uploadBytes ||
        record.contentSha256 !== input.contentSha256.toLowerCase() ||
        record.pinataNetwork !== storagePolicy.network ||
        record.storageMode !== storagePolicy.mode ||
        record.encryptionAlgorithm !== (input.encryption?.algorithm ?? null) ||
        record.encryptionIvBase64 !== (input.encryption?.ivBase64 ?? null) ||
        record.encryptedDekBase64 !== (input.encryption?.encryptedDekBase64 ?? null)
      ) {
        throw new HttpError(
          409,
          "This Idempotency-Key was already used for different upload data.",
        );
      }
    };
    const existing = await findExisting();
    if (existing) {
      assertSameRequest(existing);
      return issueUploadUrl(existing, true);
    }

    await enforceRateLimit({
      action: "evidence.upload_intent",
      subject: actor.id,
      limit: 20,
      windowSeconds: 3_600,
    });
    if (input.caseId) await requireCasePermission(input.caseId, "case:view");
    const [caseRecord] = await database
      .select({ id: caseRecords.id })
      .from(caseRecords)
      .where(
        input.caseId
          ? and(
              eq(caseRecords.id, input.caseId),
              ne(caseRecords.status, "archived"),
              ne(caseRecords.status, "rejected"),
            )
          : and(
              eq(caseRecords.code, input.caseCode!),
              eq(caseRecords.visibility, "public"),
              isNotNull(caseRecords.currentPublishedVersion),
            ),
      )
      .limit(1);
    if (!caseRecord) throw new HttpError(404, "Case not found.");

    const evidenceId = crypto.randomUUID();
    const evidenceFileId = crypto.randomUUID();
    const detail = JSON.stringify({ evidenceFileId, storageMode: storagePolicy.mode });
    const payload = JSON.stringify({ evidenceId, evidenceFileId, caseId: caseRecord.id });
    const created = await database.execute<UploadRecord>(sql`
      with item as (
        insert into ${evidenceItems} (
          id, case_id, submitter_id, idempotency_key, title, description,
          visibility, status
        ) values (
          ${evidenceId}, ${caseRecord.id}, ${actor.id}, ${idempotencyKey},
          ${input.title}, ${input.description || null}, 'restricted', 'pending_upload'
        )
        on conflict (submitter_id, idempotency_key) do nothing
        returning id, case_id
      ), file as (
        insert into ${evidenceFiles} (
          id, evidence_id, original_filename, storage_filename, mime_type,
          original_bytes, upload_bytes, sha256, pinata_network, storage_mode,
          encryption_algorithm, encryption_iv_base64, encrypted_dek_base64, status
        )
        select
          ${evidenceFileId}, item.id, ${input.originalFilename}, ${input.uploadFilename},
          ${input.mimeType}, ${input.originalBytes}, ${input.uploadBytes},
          ${input.contentSha256.toLowerCase()}, ${storagePolicy.network},
          ${storagePolicy.mode}, ${input.encryption?.algorithm ?? null},
          ${input.encryption?.ivBase64 ?? null},
          ${input.encryption?.encryptedDekBase64 ?? null}, 'pending_upload'
        from item
        returning id, storage_filename, upload_bytes, status
      ), audit as (
        insert into ${auditLogs} (case_id, evidence_id, actor_id, resource_type, resource_id, action, detail)
        select ${caseRecord.id}, item.id, ${actor.id}, 'evidence', item.id, 'evidence.upload_intent.created', ${detail}::jsonb
        from item
      ), outbox as (
        insert into ${outboxEvents} (type, aggregate_type, aggregate_id, payload)
        select 'evidence.upload_intent.created', 'evidence', item.id, ${payload}::jsonb
        from item
      )
      select id as "evidenceFileId", storage_filename as "uploadFilename", upload_bytes as "uploadBytes", status as "fileStatus"
      from file
    `);
    const createdFile = created.rows[0];
    if (createdFile) return issueUploadUrl(createdFile, false);
    const replayed = await findExisting();
    if (!replayed) throw new HttpError(500, "The upload intent could not be saved.");
    assertSameRequest(replayed);
    return issueUploadUrl(replayed, true);
  } catch (error) {
    return errorResponse(error);
  }
}

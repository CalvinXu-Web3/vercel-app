import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireContributor } from "@/lib/authorization";
import { db } from "@/db/client";
import { auditLogs, caseRecords, evidenceFiles, evidenceItems } from "@/db/schema";
import { errorResponse, HttpError } from "@/lib/http";
import {
  createPinataUploadUrl,
  getEvidenceStoragePolicy,
  getUploadPolicy,
} from "@/lib/pinata";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encryptionSchema = z.object({
  algorithm: z.literal("AES-256-GCM"),
  ivBase64: z.string().min(16).max(128),
  encryptedDekBase64: z.string().min(64).max(4096),
});

const intentSchema = z.object({
  caseCode: z.string().trim().min(3).max(64),
  title: z.string().trim().min(3).max(240),
  description: z.string().trim().max(4_000).optional(),
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(3).max(128),
  originalBytes: z.number().int().positive(),
  uploadFilename: z.string().trim().min(8).max(255),
  uploadBytes: z.number().int().positive(),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  encryption: encryptionSchema.optional(),
});

export async function POST(request: Request) {
  try {
    const actor = await requireContributor();
    const input = intentSchema.parse(await request.json());
    const uploadPolicy = getUploadPolicy();
    const storagePolicy = getEvidenceStoragePolicy();

    if (
      input.originalBytes > uploadPolicy.maxBytes ||
      input.uploadBytes > uploadPolicy.maxBytes + 1_024
    ) {
      throw new HttpError(413, "The file exceeds the configured upload limit.");
    }

    if (
      storagePolicy.mode === "encrypted-public-ipfs" &&
      (!input.encryption || input.mimeType !== "application/octet-stream")
    ) {
      throw new HttpError(
        422,
        "Public IPFS uploads must be encrypted in the browser before upload.",
      );
    }

    if (
      storagePolicy.mode === "private-ipfs" &&
      !uploadPolicy.allowedMimeTypes.includes(input.mimeType)
    ) {
      throw new HttpError(415, "This file type is not permitted.");
    }

    const database = db();
    const [caseRecord] = await database
      .select({ id: caseRecords.id })
      .from(caseRecords)
      .where(and(eq(caseRecords.code, input.caseCode), eq(caseRecords.isPublic, true)))
      .limit(1);

    if (!caseRecord) {
      throw new HttpError(404, "Case not found.");
    }

    // The Neon HTTP driver supports atomic batches, but not interactive
    // transactions. Generate foreign keys here so all dependent writes fit into
    // one serverless-safe batch.
    const evidenceId = crypto.randomUUID();
    const evidenceFileId = crypto.randomUUID();
    await database.batch([
      database.insert(evidenceItems).values({
        id: evidenceId,
        caseId: caseRecord.id,
        submitterId: actor.id,
        title: input.title,
        description: input.description || null,
        visibility: "restricted",
        status: "pending_upload",
      }),
      database.insert(evidenceFiles).values({
        id: evidenceFileId,
        evidenceId,
        originalFilename: input.originalFilename,
        storageFilename: input.uploadFilename,
        mimeType: input.mimeType,
        originalBytes: input.originalBytes,
        uploadBytes: input.uploadBytes,
        sha256: input.contentSha256.toLowerCase(),
        pinataNetwork: storagePolicy.network,
        storageMode: storagePolicy.mode,
        encryptionAlgorithm: input.encryption?.algorithm ?? null,
        encryptionIvBase64: input.encryption?.ivBase64 ?? null,
        encryptedDekBase64: input.encryption?.encryptedDekBase64 ?? null,
        status: "pending_upload",
      }),
      database.insert(auditLogs).values({
        caseId: caseRecord.id,
        evidenceId,
        actorId: actor.id,
        action: "evidence.upload_intent.created",
        detail: { evidenceFileId, storageMode: storagePolicy.mode },
      }),
    ]);

    try {
      const uploadUrl = await createPinataUploadUrl({
        evidenceFileId,
        filename: input.uploadFilename,
        maxBytes: input.uploadBytes + 1_024,
        network: storagePolicy.network,
        mimeTypes:
          storagePolicy.mode === "encrypted-public-ipfs"
            ? ["application/octet-stream"]
            : uploadPolicy.allowedMimeTypes,
      });

      return NextResponse.json(
        {
          evidenceFileId,
          uploadUrl,
          pinataNetwork: storagePolicy.network,
          storageMode: storagePolicy.mode,
        },
        { status: 201 },
      );
    } catch (error) {
      await database
        .update(evidenceFiles)
        .set({ status: "upload_url_failed" })
        .where(eq(evidenceFiles.id, evidenceFileId));
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}

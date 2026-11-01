import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireContributor } from "@/lib/authorization";
import { db } from "@/db/client";
import { evidenceFiles, evidenceItems, outboxEvents } from "@/db/schema";
import { errorResponse, HttpError } from "@/lib/http";
import { verifyPinataUpload } from "@/lib/pinata";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const completionSchema = z.object({
  evidenceFileId: z.string().uuid(),
  cid: z.string().trim().min(20).max(255).optional(),
  pinataFileId: z.string().trim().min(1).max(255),
});

export async function POST(request: Request) {
  try {
    const actor = await requireContributor();
    const input = completionSchema.parse(await request.json());
    const database = db();
    const [file] = await database
      .select({
        id: evidenceFiles.id,
        evidenceId: evidenceFiles.evidenceId,
        status: evidenceFiles.status,
        storageFilename: evidenceFiles.storageFilename,
        uploadBytes: evidenceFiles.uploadBytes,
        mimeType: evidenceFiles.mimeType,
        pinataNetwork: evidenceFiles.pinataNetwork,
      })
      .from(evidenceFiles)
      .where(eq(evidenceFiles.id, input.evidenceFileId))
      .limit(1);

    if (!file) {
      throw new HttpError(404, "Upload intent not found.");
    }

    const [evidence] = await database
      .select({
        id: evidenceItems.id,
        caseId: evidenceItems.caseId,
        submitterId: evidenceItems.submitterId,
      })
      .from(evidenceItems)
      .where(eq(evidenceItems.id, file.evidenceId))
      .limit(1);

    if (!evidence || evidence.submitterId !== actor.id) {
      throw new HttpError(403, "This upload does not belong to the current user.");
    }

    if (file.status !== "pending_upload") {
      throw new HttpError(409, "This upload intent is no longer active.");
    }

    if (file.pinataNetwork !== "public" && file.pinataNetwork !== "private") {
      throw new HttpError(409, "The upload intent has an invalid storage network.");
    }

    const verified = await verifyPinataUpload({
      network: file.pinataNetwork,
      evidenceFileId: file.id,
      pinataFileId: input.pinataFileId,
      filename: file.storageFilename,
      bytes: file.uploadBytes,
      mimeType: file.mimeType,
      clientCid: input.cid,
    });
    const completedAt = new Date();
    const detail = JSON.stringify({ evidenceFileId: file.id, cid: verified.cid });
    const payload = JSON.stringify({
      evidenceId: evidence.id,
      evidenceFileId: file.id,
      caseId: evidence.caseId,
    });
    const completed = await database.execute<{ id: string }>(sql`
      with updated_file as (
        update ${evidenceFiles}
        set
          ${evidenceFiles.cid} = ${verified.cid},
          ${evidenceFiles.pinataFileId} = ${verified.id},
          ${evidenceFiles.status} = 'uploaded',
          ${evidenceFiles.uploadedAt} = ${completedAt}
        where
          ${evidenceFiles.id} = ${file.id}
          and ${evidenceFiles.status} = 'pending_upload'
          and exists (
            select 1 from ${evidenceItems}
            where
              ${evidenceItems.id} = ${evidence.id}
              and ${evidenceItems.status} = 'pending_upload'
          )
        returning ${evidenceFiles.evidenceId}
      ), updated_evidence as (
        update ${evidenceItems}
        set
          ${evidenceItems.status} = 'pending_review',
          ${evidenceItems.updatedAt} = ${completedAt}
        from updated_file
        where ${evidenceItems.id} = updated_file.evidence_id
        returning ${evidenceItems.id}, ${evidenceItems.caseId}
      ), audit as (
        insert into audit_logs (case_id, evidence_id, actor_id, action, detail)
        select
          updated_evidence.case_id,
          updated_evidence.id,
          ${actor.id},
          'evidence.upload.completed',
          ${detail}::jsonb
        from updated_evidence
      ), outbox as (
        insert into ${outboxEvents} (type, aggregate_type, aggregate_id, payload)
        select 'evidence.upload.completed', 'evidence', updated_evidence.id, ${payload}::jsonb
        from updated_evidence
      )
      select id from updated_evidence
    `);

    if (completed.rows.length === 0) {
      throw new HttpError(409, "This upload intent changed while it was being verified.");
    }

    return NextResponse.json({ status: "pending_review" });
  } catch (error) {
    return errorResponse(error);
  }
}

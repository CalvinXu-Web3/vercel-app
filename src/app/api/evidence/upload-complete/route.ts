import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireContributor } from "@/lib/authorization";
import { db } from "@/db/client";
import { auditLogs, evidenceFiles, evidenceItems } from "@/db/schema";
import { errorResponse, HttpError } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const completionSchema = z.object({
  evidenceFileId: z.string().uuid(),
  cid: z.string().trim().min(20).max(255),
  pinataFileId: z.string().trim().min(1).max(255).optional(),
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

    await database.batch([
      database
        .update(evidenceFiles)
        .set({
          cid: input.cid,
          pinataFileId: input.pinataFileId ?? null,
          status: "uploaded",
          uploadedAt: new Date(),
        })
        .where(eq(evidenceFiles.id, file.id)),
      database
        .update(evidenceItems)
        .set({ status: "pending_review" })
        .where(eq(evidenceItems.id, evidence.id)),
      database.insert(auditLogs).values({
        caseId: evidence.caseId,
        evidenceId: evidence.id,
        actorId: actor.id,
        action: "evidence.upload.completed",
        detail: { evidenceFileId: file.id, cid: input.cid },
      }),
    ]);

    return NextResponse.json({ status: "pending_review" });
  } catch (error) {
    return errorResponse(error);
  }
}

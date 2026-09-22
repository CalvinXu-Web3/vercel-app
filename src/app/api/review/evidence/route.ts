import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReviewer } from "@/lib/authorization";
import { db } from "@/db/client";
import {
  auditLogs,
  caseRecords,
  evidenceFiles,
  evidenceItems,
} from "@/db/schema";
import { errorResponse, HttpError } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const actionSchema = z.object({
  evidenceId: z.string().uuid(),
  action: z.enum(["publish", "restrict", "reject"]),
  publicTitle: z.string().trim().min(3).max(240).optional(),
  publicDescription: z.string().trim().max(4_000).optional(),
});

const publishableStatuses = new Set(["pending_review", "approved"]);

export async function GET() {
  try {
    await requireReviewer();
    const database = db();
    const evidence = await database
      .select({
        id: evidenceItems.id,
        caseCode: caseRecords.code,
        title: evidenceItems.title,
        description: evidenceItems.description,
        publicTitle: evidenceItems.publicTitle,
        publicDescription: evidenceItems.publicDescription,
        status: evidenceItems.status,
        visibility: evidenceItems.visibility,
        createdAt: evidenceItems.createdAt,
        updatedAt: evidenceItems.updatedAt,
        reviewedAt: evidenceItems.reviewedAt,
        fileId: evidenceFiles.id,
        originalFilename: evidenceFiles.originalFilename,
        mimeType: evidenceFiles.mimeType,
        originalBytes: evidenceFiles.originalBytes,
        storageMode: evidenceFiles.storageMode,
        fileStatus: evidenceFiles.status,
      })
      .from(evidenceItems)
      .innerJoin(caseRecords, eq(evidenceItems.caseId, caseRecords.id))
      .leftJoin(evidenceFiles, eq(evidenceFiles.evidenceId, evidenceItems.id))
      .orderBy(desc(evidenceItems.createdAt));

    return NextResponse.json({ evidence });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireReviewer();
    const input = actionSchema.parse(await request.json());
    const database = db();
    const [evidence] = await database
      .select({
        id: evidenceItems.id,
        caseId: evidenceItems.caseId,
        status: evidenceItems.status,
        visibility: evidenceItems.visibility,
        publicTitle: evidenceItems.publicTitle,
        publicDescription: evidenceItems.publicDescription,
      })
      .from(evidenceItems)
      .where(eq(evidenceItems.id, input.evidenceId))
      .limit(1);

    if (!evidence) {
      throw new HttpError(404, "Evidence item not found.");
    }

    const [file] = await database
      .select({ status: evidenceFiles.status })
      .from(evidenceFiles)
      .where(eq(evidenceFiles.evidenceId, evidence.id))
      .limit(1);

    let status: "approved" | "rejected";
    let visibility: "restricted" | "redacted_public";
    let publicTitle: string | null | undefined;
    let publicDescription: string | null | undefined;

    if (input.action === "publish") {
      if (!publishableStatuses.has(evidence.status) || file?.status !== "uploaded") {
        throw new HttpError(409, "Only uploaded evidence awaiting review can be published.");
      }
      if (!input.publicTitle) {
        throw new HttpError(422, "A redacted public title is required before publishing.");
      }
      status = "approved";
      visibility = "redacted_public";
      publicTitle = input.publicTitle;
      publicDescription = input.publicDescription || null;
    } else if (input.action === "restrict") {
      if (evidence.status !== "approved") {
        throw new HttpError(409, "Only approved evidence can be returned to restricted access.");
      }
      status = "approved";
      visibility = "restricted";
    } else {
      if (!publishableStatuses.has(evidence.status)) {
        throw new HttpError(409, "This evidence item cannot be rejected in its current state.");
      }
      status = "rejected";
      visibility = "restricted";
    }

    const reviewedAt = new Date();
    await database.batch([
      database
        .update(evidenceItems)
        .set({
          status,
          visibility,
          reviewerId: actor.id,
          reviewedAt,
          updatedAt: reviewedAt,
          ...(input.action === "publish" ? { publicTitle, publicDescription } : {}),
        })
        .where(eq(evidenceItems.id, evidence.id)),
      database.insert(auditLogs).values({
        caseId: evidence.caseId,
        evidenceId: evidence.id,
        actorId: actor.id,
        action: `evidence.review.${input.action}`,
        detail: {
          previousStatus: evidence.status,
          previousVisibility: evidence.visibility,
          status,
          visibility,
        },
      }),
    ]);

    return NextResponse.json({
      evidence: {
        id: evidence.id,
        status,
        visibility,
        publicTitle: input.action === "publish" ? publicTitle : evidence.publicTitle,
        publicDescription:
          input.action === "publish" ? publicDescription : evidence.publicDescription,
        reviewedAt,
        updatedAt: reviewedAt,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

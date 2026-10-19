import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReviewer } from "@/lib/authorization";
import { db } from "@/db/client";
import { auditLogs, caseRecords, victimSignatures } from "@/db/schema";
import { errorResponse, HttpError } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const actionSchema = z.object({
  signatureId: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
});

export async function GET() {
  try {
    await requireReviewer();
    const signatures = await db()
      .select({
        id: victimSignatures.id,
        caseCode: caseRecords.code,
        alias: victimSignatures.alias,
        visibility: victimSignatures.visibility,
        status: victimSignatures.status,
        createdAt: victimSignatures.createdAt,
        reviewedAt: victimSignatures.reviewedAt,
      })
      .from(victimSignatures)
      .innerJoin(caseRecords, eq(victimSignatures.caseId, caseRecords.id))
      .orderBy(desc(victimSignatures.createdAt));

    return NextResponse.json({ signatures });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireReviewer();
    const input = actionSchema.parse(await request.json());
    const database = db();
    const [signature] = await database
      .select({
        id: victimSignatures.id,
        caseId: victimSignatures.caseId,
        status: victimSignatures.status,
        visibility: victimSignatures.visibility,
      })
      .from(victimSignatures)
      .where(eq(victimSignatures.id, input.signatureId))
      .limit(1);

    if (!signature) {
      throw new HttpError(404, "Signature not found.");
    }
    if (signature.status !== "pending_review") {
      throw new HttpError(409, "Only pending signatures can be reviewed.");
    }

    const status = input.action === "approve" ? "approved" : "rejected";
    const reviewedAt = new Date();
    const [reviewed] = await database
      .update(victimSignatures)
      .set({ status, reviewerId: actor.id, reviewedAt, updatedAt: reviewedAt })
      .where(and(eq(victimSignatures.id, signature.id), eq(victimSignatures.status, "pending_review")))
      .returning({ id: victimSignatures.id });

    if (!reviewed) {
      throw new HttpError(409, "The signature status changed. Please refresh and try again.");
    }

    await database.insert(auditLogs).values({
      caseId: signature.caseId,
      actorId: actor.id,
      action: `signature.review.${input.action}`,
      detail: {
        signatureId: signature.id,
        previousStatus: signature.status,
        status,
        visibility: signature.visibility,
      },
    });

    return NextResponse.json({
      signature: { id: signature.id, status, reviewedAt },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

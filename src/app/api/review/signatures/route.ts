import { and, count, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReviewer } from "@/lib/authorization";
import { db } from "@/db/client";
import { auditLogs, caseRecords, outboxEvents, victimSignatures } from "@/db/schema";
import { errorResponse, HttpError } from "@/lib/http";
import { parsePagination } from "@/lib/pagination";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const actionSchema = z.object({
  signatureId: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
});

const querySchema = z.object({
  caseId: z.string().uuid().optional(),
  caseCode: z.string().trim().min(3).max(64).optional(),
  status: z.enum(["pending_review", "approved", "rejected", "revoked"]).optional(),
});

export async function GET(request: Request) {
  try {
    const database = db();
    const pagination = parsePagination(request);
    const searchParams = new URL(request.url).searchParams;
    const query = querySchema.parse({
      caseId: searchParams.get("caseId") || undefined,
      caseCode: searchParams.get("caseCode") || undefined,
      status: searchParams.get("status") || undefined,
    });
    await requireReviewer();
    const filter = and(
      query.caseId ? eq(caseRecords.id, query.caseId) : undefined,
      query.caseCode ? eq(caseRecords.code, query.caseCode) : undefined,
      query.status ? eq(victimSignatures.status, query.status) : undefined,
    );
    const signatureQuery = database
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
      .where(filter)
      .orderBy(desc(victimSignatures.createdAt))
      .limit(pagination.limit)
      .offset(pagination.offset);
    const totalQuery = database
      .select({ value: count() })
      .from(victimSignatures)
      .innerJoin(caseRecords, eq(victimSignatures.caseId, caseRecords.id))
      .where(filter);
    const [signatures, totals] = await Promise.all([signatureQuery, totalQuery]);

    return NextResponse.json({
      signatures,
      pagination: { ...pagination, total: totals[0]?.value ?? 0 },
    });
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
        updatedAt: victimSignatures.updatedAt,
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
    const detail = JSON.stringify({
      previousStatus: signature.status,
      status,
      visibility: signature.visibility,
    });
    const payload = JSON.stringify({ signatureId: signature.id, caseId: signature.caseId, status });
    const result = await database.execute<{ id: string }>(sql`
      with updated as (
        update ${victimSignatures}
        set
          ${victimSignatures.status} = ${status},
          ${victimSignatures.reviewerId} = ${actor.id},
          ${victimSignatures.reviewedAt} = ${reviewedAt},
          ${victimSignatures.updatedAt} = ${reviewedAt}
        where
          ${victimSignatures.id} = ${signature.id}
          and ${victimSignatures.status} = 'pending_review'
          and ${victimSignatures.updatedAt} = ${signature.updatedAt}
        returning id, case_id
      ), audit as (
        insert into ${auditLogs} (case_id, actor_id, resource_type, resource_id, action, detail)
        select updated.case_id, ${actor.id}, 'signature', updated.id,
          ${`signature.review.${input.action}`}, ${detail}::jsonb
        from updated
      ), outbox as (
        insert into ${outboxEvents} (type, aggregate_type, aggregate_id, payload)
        select ${`signature.review.${input.action}`}, 'signature', updated.id, ${payload}::jsonb
        from updated
      )
      select id from updated
    `);

    if (result.rows.length === 0) {
      throw new HttpError(409, "The signature status changed. Please refresh and try again.");
    }

    return NextResponse.json({
      signature: { id: signature.id, status, reviewedAt },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

import { and, count, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCasePermission, requireContributor, requireReviewer } from "@/lib/authorization";
import { db } from "@/db/client";
import {
  auditLogs,
  caseRecords,
  evidenceFiles,
  evidenceItems,
  outboxEvents,
} from "@/db/schema";
import { errorResponse, HttpError } from "@/lib/http";
import { parsePagination } from "@/lib/pagination";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const actionSchema = z.object({
  evidenceId: z.string().uuid(),
  action: z.enum(["publish", "restrict", "reject"]),
  publicTitle: z.string().trim().min(3).max(240).optional(),
  publicDescription: z.string().trim().max(4_000).optional(),
});

const publishableStatuses = new Set(["pending_review", "approved"]);

const querySchema = z.object({
  caseId: z.string().uuid().optional(),
  caseCode: z.string().trim().min(3).max(64).optional(),
  status: z
    .enum([
      "pending_upload",
      "upload_url_failed",
      "uploaded",
      "pending_review",
      "approved",
      "rejected",
      "quarantined",
    ])
    .optional(),
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
    if (query.caseId) {
      await requireCasePermission(query.caseId, "case:review");
    } else {
      await requireReviewer();
    }
    const filter = and(
      query.caseId ? eq(caseRecords.id, query.caseId) : undefined,
      query.caseCode ? eq(caseRecords.code, query.caseCode) : undefined,
      query.status ? eq(evidenceItems.status, query.status) : undefined,
    );
    const evidenceQuery = database
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
      .where(filter)
      .orderBy(desc(evidenceItems.createdAt))
      .limit(pagination.limit)
      .offset(pagination.offset);
    const totalQuery = database
      .select({ value: count() })
      .from(evidenceItems)
      .innerJoin(caseRecords, eq(evidenceItems.caseId, caseRecords.id))
      .where(filter);
    const [evidence, totals] = await Promise.all([evidenceQuery, totalQuery]);

    return NextResponse.json({
      evidence,
      pagination: { ...pagination, total: totals[0]?.value ?? 0 },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireContributor();
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
        updatedAt: evidenceItems.updatedAt,
      })
      .from(evidenceItems)
      .where(eq(evidenceItems.id, input.evidenceId))
      .limit(1);

    if (!evidence) {
      throw new HttpError(404, "Evidence item not found.");
    }
    const { actor } = await requireCasePermission(evidence.caseId, "case:review");

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
    const nextPublicTitle = input.action === "publish" ? publicTitle ?? null : null;
    const nextPublicDescription =
      input.action === "publish" ? publicDescription ?? null : null;
    const detail = JSON.stringify({
      previousStatus: evidence.status,
      previousVisibility: evidence.visibility,
      status,
      visibility,
    });
    const payload = JSON.stringify({
      evidenceId: evidence.id,
      caseId: evidence.caseId,
      status,
      visibility,
    });
    const reviewed = await database.execute<{ id: string }>(sql`
      with updated as (
        update ${evidenceItems}
        set
          ${evidenceItems.status} = ${status},
          ${evidenceItems.visibility} = ${visibility},
          ${evidenceItems.reviewerId} = ${actor.id},
          ${evidenceItems.reviewedAt} = ${reviewedAt},
          ${evidenceItems.updatedAt} = ${reviewedAt},
          ${evidenceItems.publicTitle} = ${nextPublicTitle},
          ${evidenceItems.publicDescription} = ${nextPublicDescription}
        where
          ${evidenceItems.id} = ${evidence.id}
          and ${evidenceItems.status} = ${evidence.status}
          and ${evidenceItems.visibility} = ${evidence.visibility}
          and ${evidenceItems.updatedAt} = ${evidence.updatedAt}
        returning ${evidenceItems.id}, ${evidenceItems.caseId}
      ), audit as (
        insert into ${auditLogs} (case_id, evidence_id, actor_id, action, detail)
        select
          updated.case_id,
          updated.id,
          ${actor.id},
          ${`evidence.review.${input.action}`},
          ${detail}::jsonb
        from updated
      ), outbox as (
        insert into ${outboxEvents} (type, aggregate_type, aggregate_id, payload)
        select ${`evidence.review.${input.action}`}, 'evidence', updated.id, ${payload}::jsonb
        from updated
      )
      select id from updated
    `);

    if (reviewed.rows.length === 0) {
      throw new HttpError(409, "The evidence status changed. Please refresh and try again.");
    }

    return NextResponse.json({
      evidence: {
        id: evidence.id,
        status,
        visibility,
        publicTitle: nextPublicTitle,
        publicDescription: nextPublicDescription,
        reviewedAt,
        updatedAt: reviewedAt,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

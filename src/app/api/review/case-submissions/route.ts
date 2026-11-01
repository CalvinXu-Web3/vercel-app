import { and, count, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReviewer } from "@/lib/authorization";
import { db } from "@/db/client";
import {
  auditLogs,
  caseMembers,
  caseRecords,
  caseSubmissions,
  outboxEvents,
} from "@/db/schema";
import {
  caseSubmissionReviewTransition,
  type CaseSubmissionReviewAction,
  type CaseSubmissionState,
} from "@/lib/case-submission-workflow";
import { errorResponse, HttpError } from "@/lib/http";
import { parsePagination } from "@/lib/pagination";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const systemOrganizationId = "00000000-0000-4000-8000-000000000001";
const timestampSchema = z.string().refine((value) => Number.isFinite(Date.parse(value)), {
  message: "A valid expectedUpdatedAt timestamp is required.",
});
const reviewSchema = z
  .object({
    submissionId: z.string().uuid(),
    expectedUpdatedAt: timestampSchema,
    action: z.enum(["start_triage", "request_information", "accept", "reject"]),
    note: z.string().trim().max(4_000).optional(),
  })
  .superRefine((input, context) => {
    if (
      (input.action === "request_information" || input.action === "reject") &&
      !input.note
    ) {
      context.addIssue({
        code: "custom",
        path: ["note"],
        message: "A review note is required for this action.",
      });
    }
  });

const querySchema = z.object({
  status: z
    .enum(["submitted", "triage", "needs_information", "accepted", "rejected", "withdrawn"])
    .optional(),
});

function newCaseCode() {
  return `CRN-${new Date().getUTCFullYear()}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

export async function GET(request: Request) {
  try {
    await requireReviewer();
    const pagination = parsePagination(request);
    const searchParams = new URL(request.url).searchParams;
    const query = querySchema.parse({ status: searchParams.get("status") || undefined });
    const filter = query.status ? eq(caseSubmissions.status, query.status) : undefined;
    const database = db();
    const [submissions, totals] = await Promise.all([
      database
        .select({
          id: caseSubmissions.id,
          submitterId: caseSubmissions.submitterId,
          titleZh: caseSubmissions.titleZh,
          titleEn: caseSubmissions.titleEn,
          summaryZh: caseSubmissions.summaryZh,
          summaryEn: caseSubmissions.summaryEn,
          jurisdiction: caseSubmissions.jurisdiction,
          incidentStartedAt: caseSubmissions.incidentStartedAt,
          status: caseSubmissions.status,
          reviewNote: caseSubmissions.reviewNote,
          acceptedCaseId: caseSubmissions.acceptedCaseId,
          createdAt: caseSubmissions.createdAt,
          updatedAt: caseSubmissions.updatedAt,
          reviewedAt: caseSubmissions.reviewedAt,
        })
        .from(caseSubmissions)
        .where(filter)
        .orderBy(desc(caseSubmissions.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
      database
        .select({ value: count() })
        .from(caseSubmissions)
        .where(filter),
    ]);

    return NextResponse.json({
      submissions,
      pagination: { ...pagination, total: totals[0]?.value ?? 0 },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireReviewer();
    const input = reviewSchema.parse(await request.json());
    const database = db();
    const [submission] = await database
      .select({
        id: caseSubmissions.id,
        status: caseSubmissions.status,
        updatedAt: caseSubmissions.updatedAt,
      })
      .from(caseSubmissions)
      .where(eq(caseSubmissions.id, input.submissionId))
      .limit(1);

    if (!submission) throw new HttpError(404, "Case submission not found.");
    const nextStatus = caseSubmissionReviewTransition(
      submission.status as CaseSubmissionState,
      input.action as CaseSubmissionReviewAction,
    );
    if (!nextStatus) {
      throw new HttpError(409, "This review action is not valid for the current status.");
    }

    const expectedUpdatedAt = new Date(input.expectedUpdatedAt);
    if (expectedUpdatedAt.getTime() !== submission.updatedAt.getTime()) {
      throw new HttpError(409, "The submission changed. Please refresh and try again.");
    }
    const reviewedAt = new Date();
    const detail = JSON.stringify({
      previousStatus: submission.status,
      status: nextStatus,
      note: input.note ?? null,
    });

    if (input.action === "accept") {
      const caseId = crypto.randomUUID();
      const caseCode = newCaseCode();
      const outboxPayload = JSON.stringify({ submissionId: submission.id, caseId, caseCode });
      const result = await database.execute<{ id: string; code: string }>(sql`
        with selected as (
          update ${caseSubmissions}
          set
            ${caseSubmissions.status} = 'accepted',
            ${caseSubmissions.reviewNote} = ${input.note ?? null},
            ${caseSubmissions.reviewerId} = ${actor.id},
            ${caseSubmissions.reviewedAt} = ${reviewedAt},
            ${caseSubmissions.updatedAt} = ${reviewedAt}
          where
            ${caseSubmissions.id} = ${submission.id}
            and ${caseSubmissions.status} = ${submission.status}
            and ${caseSubmissions.updatedAt} = ${expectedUpdatedAt}
          returning *
        ), created_case as (
          insert into ${caseRecords} (
            id, organization_id, created_by, code, title_zh, title_en,
            summary_zh, summary_en, is_public, visibility, status, created_at, updated_at
          )
          select
            ${caseId}, ${systemOrganizationId}, selected.submitter_id, ${caseCode},
            selected.title_zh, coalesce(selected.title_en, selected.title_zh),
            selected.summary_zh, selected.summary_en,
            false, 'private', 'draft', ${reviewedAt}, ${reviewedAt}
          from selected
          returning id, code, organization_id
        ), linked as (
          update ${caseSubmissions}
          set ${caseSubmissions.acceptedCaseId} = created_case.id
          from created_case
          where ${caseSubmissions.id} = ${submission.id}
        ), member as (
          insert into ${caseMembers} (case_id, user_id, role)
          select created_case.id, selected.submitter_id, 'owner'
          from created_case, selected
        ), audit as (
          insert into ${auditLogs} (
            organization_id, case_id, actor_id, resource_type, resource_id, action, detail
          )
          select
            created_case.organization_id, created_case.id, ${actor.id},
            'case_submission', selected.id, 'case_submission.review.accept', ${detail}::jsonb
          from created_case, selected
        ), outbox as (
          insert into ${outboxEvents} (type, aggregate_type, aggregate_id, payload)
          select 'case_submission.accepted', 'case', created_case.id, ${outboxPayload}::jsonb
          from created_case
        )
        select id, code from created_case
      `);
      const created = result.rows[0];
      if (!created) {
        throw new HttpError(409, "The submission changed. Please refresh and try again.");
      }
      return NextResponse.json({
        submission: { id: submission.id, status: nextStatus, reviewedAt },
        case: created,
      });
    }

    const result = await database.execute<{ id: string }>(sql`
      with updated as (
        update ${caseSubmissions}
        set
          ${caseSubmissions.status} = ${nextStatus},
          ${caseSubmissions.reviewNote} = ${input.note ?? null},
          ${caseSubmissions.reviewerId} = ${actor.id},
          ${caseSubmissions.reviewedAt} = ${reviewedAt},
          ${caseSubmissions.updatedAt} = ${reviewedAt}
        where
          ${caseSubmissions.id} = ${submission.id}
          and ${caseSubmissions.status} = ${submission.status}
          and ${caseSubmissions.updatedAt} = ${expectedUpdatedAt}
        returning id
      ), audit as (
        insert into ${auditLogs} (actor_id, resource_type, resource_id, action, detail)
        select
          ${actor.id}, 'case_submission', updated.id,
          ${`case_submission.review.${input.action}`}, ${detail}::jsonb
        from updated
      ), outbox as (
        insert into ${outboxEvents} (type, aggregate_type, aggregate_id, payload)
        select ${`case_submission.review.${input.action}`}, 'case_submission', updated.id,
          ${JSON.stringify({ submissionId: submission.id, status: nextStatus })}::jsonb
        from updated
      )
      select id from updated
    `);
    if (result.rows.length === 0) {
      throw new HttpError(409, "The submission changed. Please refresh and try again.");
    }

    return NextResponse.json({
      submission: { id: submission.id, status: nextStatus, reviewedAt },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

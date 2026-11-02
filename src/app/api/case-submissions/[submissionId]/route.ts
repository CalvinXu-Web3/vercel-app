import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReviewer } from "@/lib/authorization";
import { db } from "@/db/client";
import { auditLogs, caseSubmissions, outboxEvents } from "@/db/schema";
import {
  caseSubmissionOwnerTransition,
  type CaseSubmissionOwnerAction,
  type CaseSubmissionState,
} from "@/lib/case-submission-workflow";
import { errorResponse, HttpError } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const expectedUpdatedAtSchema = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)), {
    message: "A valid expectedUpdatedAt timestamp is required.",
  });

const updateSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("resubmit"),
    expectedUpdatedAt: expectedUpdatedAtSchema,
    titleZh: z.string().trim().min(3).max(240),
    titleEn: z.string().trim().min(3).max(240).optional(),
    summaryZh: z.string().trim().min(20).max(10_000),
    summaryEn: z.string().trim().min(20).max(10_000).optional(),
    jurisdiction: z.string().trim().min(2).max(120).optional(),
    incidentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  z.object({
    action: z.literal("withdraw"),
    expectedUpdatedAt: expectedUpdatedAtSchema,
  }),
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ submissionId: string }> },
) {
  try {
    const actor = await requireReviewer();
    const { submissionId } = await context.params;
    z.string().uuid().parse(submissionId);
    const input = updateSchema.parse(await request.json());
    const database = db();
    const [submission] = await database
      .select({
        id: caseSubmissions.id,
        status: caseSubmissions.status,
        updatedAt: caseSubmissions.updatedAt,
      })
      .from(caseSubmissions)
      .where(
        and(
          eq(caseSubmissions.id, submissionId),
          eq(caseSubmissions.submitterId, actor.id),
        ),
      )
      .limit(1);

    if (!submission) throw new HttpError(404, "Case submission not found.");
    const nextStatus = caseSubmissionOwnerTransition(
      submission.status as CaseSubmissionState,
      input.action as CaseSubmissionOwnerAction,
    );
    if (!nextStatus) {
      throw new HttpError(409, "This action is not valid for the current status.");
    }

    const expectedUpdatedAt = new Date(input.expectedUpdatedAt);
    if (expectedUpdatedAt.getTime() !== submission.updatedAt.getTime()) {
      throw new HttpError(409, "The submission changed. Please refresh and try again.");
    }

    const updatedAt = new Date();
    const detail = JSON.stringify({
      previousStatus: submission.status,
      status: nextStatus,
    });
    const payload = JSON.stringify({ submissionId, status: nextStatus });

    const result = input.action === "resubmit"
      ? await database.execute<{ id: string }>(sql`
          with changed as (
            update ${caseSubmissions}
            set
              ${caseSubmissions.titleZh} = ${input.titleZh},
              ${caseSubmissions.titleEn} = ${input.titleEn ?? null},
              ${caseSubmissions.summaryZh} = ${input.summaryZh},
              ${caseSubmissions.summaryEn} = ${input.summaryEn ?? null},
              ${caseSubmissions.jurisdiction} = ${input.jurisdiction ?? null},
              ${caseSubmissions.incidentStartedAt} = ${input.incidentDate ? new Date(`${input.incidentDate}T00:00:00.000Z`) : null},
              ${caseSubmissions.status} = 'submitted',
              ${caseSubmissions.reviewerId} = null,
              ${caseSubmissions.reviewedAt} = null,
              ${caseSubmissions.updatedAt} = ${updatedAt}
            where
              ${caseSubmissions.id} = ${submissionId}
              and ${caseSubmissions.submitterId} = ${actor.id}
              and ${caseSubmissions.status} = ${submission.status}
              and ${caseSubmissions.updatedAt} = ${expectedUpdatedAt}
            returning id
          ), audit as (
            insert into ${auditLogs} (actor_id, resource_type, resource_id, action, detail)
            select ${actor.id}, 'case_submission', changed.id, 'case_submission.resubmitted', ${detail}::jsonb
            from changed
          ), outbox as (
            insert into ${outboxEvents} (type, aggregate_type, aggregate_id, payload)
            select 'case_submission.resubmitted', 'case_submission', changed.id, ${payload}::jsonb
            from changed
          )
          select id from changed
        `)
      : await database.execute<{ id: string }>(sql`
          with changed as (
            update ${caseSubmissions}
            set
              ${caseSubmissions.status} = 'withdrawn',
              ${caseSubmissions.updatedAt} = ${updatedAt}
            where
              ${caseSubmissions.id} = ${submissionId}
              and ${caseSubmissions.submitterId} = ${actor.id}
              and ${caseSubmissions.status} = ${submission.status}
              and ${caseSubmissions.updatedAt} = ${expectedUpdatedAt}
            returning id
          ), audit as (
            insert into ${auditLogs} (actor_id, resource_type, resource_id, action, detail)
            select ${actor.id}, 'case_submission', changed.id, 'case_submission.withdrawn', ${detail}::jsonb
            from changed
          ), outbox as (
            insert into ${outboxEvents} (type, aggregate_type, aggregate_id, payload)
            select 'case_submission.withdrawn', 'case_submission', changed.id, ${payload}::jsonb
            from changed
          )
          select id from changed
        `);

    if (result.rows.length === 0) {
      throw new HttpError(409, "The submission changed. Please refresh and try again.");
    }

    return NextResponse.json({
      submission: { id: submissionId, status: nextStatus, updatedAt },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

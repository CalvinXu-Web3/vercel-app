import { and, count, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireContributor } from "@/lib/authorization";
import { db } from "@/db/client";
import { auditLogs, caseSubmissions, outboxEvents } from "@/db/schema";
import { errorResponse, HttpError } from "@/lib/http";
import { requireIdempotencyKey } from "@/lib/idempotency";
import { parsePagination } from "@/lib/pagination";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const submissionSchema = z.object({
  titleZh: z.string().trim().min(3).max(240),
  titleEn: z.string().trim().min(3).max(240).optional(),
  summaryZh: z.string().trim().min(20).max(10_000),
  summaryEn: z.string().trim().min(20).max(10_000).optional(),
  jurisdiction: z.string().trim().min(2).max(120).optional(),
  incidentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  consent: z.literal(true),
});

export async function GET(request: Request) {
  try {
    const actor = await requireContributor();
    const pagination = parsePagination(request);
    const database = db();
    const [submissions, totals] = await Promise.all([
      database
        .select({
          id: caseSubmissions.id,
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
        .where(eq(caseSubmissions.submitterId, actor.id))
        .orderBy(desc(caseSubmissions.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
      database
        .select({ value: count() })
        .from(caseSubmissions)
        .where(eq(caseSubmissions.submitterId, actor.id)),
    ]);

    return NextResponse.json({
      submissions,
      pagination: { ...pagination, total: totals[0]?.value ?? 0 },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireContributor();
    const idempotencyKey = requireIdempotencyKey(request);
    const input = submissionSchema.parse(await request.json());
    const incidentStartedAt = input.incidentDate
      ? new Date(`${input.incidentDate}T00:00:00.000Z`)
      : null;
    const database = db();
    const findExisting = async () => {
      const [record] = await database
        .select({
          id: caseSubmissions.id,
          titleZh: caseSubmissions.titleZh,
          titleEn: caseSubmissions.titleEn,
          summaryZh: caseSubmissions.summaryZh,
          summaryEn: caseSubmissions.summaryEn,
          jurisdiction: caseSubmissions.jurisdiction,
          incidentStartedAt: caseSubmissions.incidentStartedAt,
          status: caseSubmissions.status,
          createdAt: caseSubmissions.createdAt,
          updatedAt: caseSubmissions.updatedAt,
        })
        .from(caseSubmissions)
        .where(
          and(
            eq(caseSubmissions.submitterId, actor.id),
            eq(caseSubmissions.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      return record;
    };
    const assertSameRequest = (record: NonNullable<Awaited<ReturnType<typeof findExisting>>>) => {
      const sameIncidentDate =
        record.incidentStartedAt?.getTime() === incidentStartedAt?.getTime();
      if (
        record.titleZh !== input.titleZh ||
        record.titleEn !== (input.titleEn ?? null) ||
        record.summaryZh !== input.summaryZh ||
        record.summaryEn !== (input.summaryEn ?? null) ||
        record.jurisdiction !== (input.jurisdiction ?? null) ||
        !sameIncidentDate
      ) {
        throw new HttpError(
          409,
          "This Idempotency-Key was already used for different case data.",
        );
      }
    };
    const existing = await findExisting();
    if (existing) {
      assertSameRequest(existing);
      return NextResponse.json({ submission: existing, replayed: true });
    }
    await enforceRateLimit({
      action: "case_submission.create",
      subject: actor.id,
      limit: 5,
      windowSeconds: 3_600,
    });
    const id = crypto.randomUUID();
    const now = new Date();

    const detail = JSON.stringify({ jurisdiction: input.jurisdiction ?? null });
    const payload = JSON.stringify({ submissionId: id });
    const inserted = await database.execute<{
      id: string;
      status: "submitted";
      created_at: Date;
      updated_at: Date;
    }>(sql`
      with created as (
        insert into ${caseSubmissions} (
          id, submitter_id, idempotency_key, title_zh, title_en, summary_zh,
          summary_en, jurisdiction, incident_started_at, status, consented_at,
          created_at, updated_at
        ) values (
          ${id}, ${actor.id}, ${idempotencyKey}, ${input.titleZh},
          ${input.titleEn || null}, ${input.summaryZh}, ${input.summaryEn || null},
          ${input.jurisdiction || null}, ${incidentStartedAt}, 'submitted',
          ${now}, ${now}, ${now}
        )
        on conflict (submitter_id, idempotency_key) do nothing
        returning id, status, created_at, updated_at
      ), audit as (
        insert into ${auditLogs} (actor_id, resource_type, resource_id, action, detail)
        select ${actor.id}, 'case_submission', created.id, 'case_submission.created', ${detail}::jsonb
        from created
      ), outbox as (
        insert into ${outboxEvents} (type, aggregate_type, aggregate_id, payload)
        select 'case_submission.created', 'case_submission', created.id, ${payload}::jsonb
        from created
      )
      select id, status, created_at, updated_at from created
    `);
    const created = inserted.rows[0];
    if (!created) {
      const replayed = await findExisting();
      if (replayed) {
        assertSameRequest(replayed);
        return NextResponse.json({ submission: replayed, replayed: true });
      }
      throw new HttpError(500, "The case submission could not be saved.");
    }

    return NextResponse.json(
      {
        submission: {
          id: created.id,
          status: created.status,
          createdAt: created.created_at,
          updatedAt: created.updated_at,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCasePermission, requireReviewer } from "@/lib/authorization";
import {
  caseWorkflowTransition,
  type CaseWorkflowAction,
  type CaseWorkflowState,
} from "@/lib/case-workflow";
import { db } from "@/db/client";
import { auditLogs, caseRecords, outboxEvents } from "@/db/schema";
import { errorResponse, HttpError } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const inputSchema = z
  .object({
    expectedUpdatedAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
    action: z.enum(["submit", "start_review", "request_information", "approve", "reject", "start_revision", "archive"]),
    note: z.string().trim().max(4_000).optional(),
  })
  .superRefine((input, context) => {
    if ((input.action === "request_information" || input.action === "reject") && !input.note) {
      context.addIssue({
        code: "custom",
        path: ["note"],
        message: "A review note is required for this action.",
      });
    }
  });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  try {
    await requireReviewer();
    const { caseId } = await context.params;
    z.string().uuid().parse(caseId);
    const input = inputSchema.parse(await request.json());
    const permission = input.action === "submit"
      ? "case:edit"
      : input.action === "start_revision" || input.action === "archive"
        ? "case:publish"
        : "case:review";
    const { actor } = await requireCasePermission(caseId, permission);
    const database = db();
    const [record] = await database
      .select({
        organizationId: caseRecords.organizationId,
        status: caseRecords.status,
        updatedAt: caseRecords.updatedAt,
      })
      .from(caseRecords)
      .where(eq(caseRecords.id, caseId))
      .limit(1);
    if (!record) throw new HttpError(404, "Case not found.");
    const nextStatus = caseWorkflowTransition(
      record.status as CaseWorkflowState,
      input.action as CaseWorkflowAction,
    );
    if (!nextStatus) throw new HttpError(409, "This workflow transition is not valid.");
    const expectedUpdatedAt = new Date(input.expectedUpdatedAt);
    if (expectedUpdatedAt.getTime() !== record.updatedAt.getTime()) {
      throw new HttpError(409, "The case changed. Please refresh and try again.");
    }
    const updatedAt = new Date();
    const workflowNote = input.action === "request_information" || input.action === "reject"
      ? input.note ?? null
      : null;
    const detail = JSON.stringify({ previousStatus: record.status, status: nextStatus, note: input.note ?? null });
    const payload = JSON.stringify({ caseId, previousStatus: record.status, status: nextStatus });
    const result = await database.execute<{ id: string }>(sql`
      with changed as (
        update ${caseRecords}
        set
          ${caseRecords.status} = ${nextStatus},
          ${caseRecords.workflowNote} = ${workflowNote},
          ${caseRecords.updatedAt} = ${updatedAt}
        where
          ${caseRecords.id} = ${caseId}
          and ${caseRecords.status} = ${record.status}
          and ${caseRecords.updatedAt} = ${expectedUpdatedAt}
        returning id
      ), audit as (
        insert into ${auditLogs} (organization_id, case_id, actor_id, resource_type, resource_id, action, detail)
        select ${record.organizationId}, ${caseId}, ${actor.id}, 'case', changed.id, ${`case.workflow.${input.action}`}, ${detail}::jsonb
        from changed
      ), outbox as (
        insert into ${outboxEvents} (type, aggregate_type, aggregate_id, payload)
        select ${`case.workflow.${input.action}`}, 'case', changed.id, ${payload}::jsonb
        from changed
      )
      select id from changed
    `);
    if (result.rows.length === 0) throw new HttpError(409, "The case changed. Please refresh and try again.");
    return NextResponse.json({ case: { id: caseId, status: nextStatus, updatedAt } });
  } catch (error) {
    return errorResponse(error);
  }
}

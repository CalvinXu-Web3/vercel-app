import { asc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCasePermission } from "@/lib/authorization";
import { db } from "@/db/client";
import { auditLogs, caseMembers, outboxEvents } from "@/db/schema";
import { errorResponse, HttpError } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const memberSchema = z.object({
  userId: z.string().trim().min(1).max(255),
  role: z.enum(["owner", "editor", "reviewer", "viewer"]),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  try {
    const { caseId } = await context.params;
    await requireCasePermission(caseId, "case:members:manage");
    const members = await db()
      .select({
        id: caseMembers.id,
        userId: caseMembers.userId,
        role: caseMembers.role,
        createdAt: caseMembers.createdAt,
        updatedAt: caseMembers.updatedAt,
      })
      .from(caseMembers)
      .where(eq(caseMembers.caseId, caseId))
      .orderBy(asc(caseMembers.createdAt));
    return NextResponse.json({ members });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  try {
    const { caseId } = await context.params;
    const { actor, case: caseAccess } = await requireCasePermission(
      caseId,
      "case:members:manage",
    );
    const input = memberSchema.parse(await request.json());
    const now = new Date();
    const detail = JSON.stringify({ userId: input.userId, role: input.role });
    const payload = JSON.stringify({ caseId, userId: input.userId, role: input.role });
    const result = await db().execute<{
      id: string;
      userId: string;
      role: "owner" | "editor" | "reviewer" | "viewer";
      createdAt: Date;
      updatedAt: Date;
    }>(sql`
      with changed as (
        insert into ${caseMembers} (case_id, user_id, role, created_at, updated_at)
        values (${caseId}, ${input.userId}, ${input.role}, ${now}, ${now})
        on conflict (case_id, user_id) do update
        set role = excluded.role, updated_at = excluded.updated_at
        where ${caseMembers.role} <> 'owner' or excluded.role = 'owner'
        returning id, user_id as "userId", role, created_at as "createdAt", updated_at as "updatedAt"
      ), audit as (
        insert into ${auditLogs} (
          organization_id, case_id, actor_id, resource_type, resource_id, action, detail
        )
        select ${caseAccess.organizationId}, ${caseId}, ${actor.id}, 'case_member', changed.id,
          'case.member.upserted', ${detail}::jsonb
        from changed
      ), outbox as (
        insert into ${outboxEvents} (type, aggregate_type, aggregate_id, payload)
        select 'case.member.upserted', 'case', ${caseId}, ${payload}::jsonb
        from changed
      )
      select * from changed
    `);
    const member = result.rows[0];
    if (!member) {
      throw new HttpError(
        409,
        "An owner cannot be demoted. Add another role without removing the existing owner.",
      );
    }
    return NextResponse.json({ member }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

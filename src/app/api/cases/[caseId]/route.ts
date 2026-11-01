import { and, asc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCasePermission } from "@/lib/authorization";
import { hasCasePermission } from "@/lib/case-policy";
import { isCaseContentEditable } from "@/lib/case-workflow";
import { db } from "@/db/client";
import {
  auditLogs,
  caseMembers,
  caseRecords,
  caseWallets,
  entities,
  entityRelations,
  timelineEvents,
  walletAssets,
} from "@/db/schema";
import { errorResponse, HttpError } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const updateSchema = z.object({
  expectedUpdatedAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  titleZh: z.string().trim().min(3).max(240),
  titleEn: z.string().trim().min(3).max(240),
  summaryZh: z.string().trim().max(10_000).optional(),
  summaryEn: z.string().trim().max(10_000).optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  try {
    const { caseId } = await context.params;
    z.string().uuid().parse(caseId);
    const access = await requireCasePermission(caseId, "case:view");
    const database = db();
    const [record] = await database
      .select({
        id: caseRecords.id,
        organizationId: caseRecords.organizationId,
        code: caseRecords.code,
        titleZh: caseRecords.titleZh,
        titleEn: caseRecords.titleEn,
        summaryZh: caseRecords.summaryZh,
        summaryEn: caseRecords.summaryEn,
        workflowNote: caseRecords.workflowNote,
        status: caseRecords.status,
        visibility: caseRecords.visibility,
        currentPublishedVersion: caseRecords.currentPublishedVersion,
        updatedAt: caseRecords.updatedAt,
      })
      .from(caseRecords)
      .where(eq(caseRecords.id, caseId))
      .limit(1);
    if (!record) throw new HttpError(404, "Case not found.");

    const policyInput = {
      globalRole: access.actor.role,
      caseRole: access.case.caseRole,
      organizationRole: access.case.organizationRole,
      isCreator: access.case.createdBy === access.actor.id,
    };
    const canManageMembers = hasCasePermission(policyInput, "case:members:manage");
    const [timeline, caseEntities, relations, wallets, members] = await Promise.all([
      database.select().from(timelineEvents).where(eq(timelineEvents.caseId, caseId)).orderBy(asc(timelineEvents.occurredAt)).limit(500),
      database.select().from(entities).where(eq(entities.caseId, caseId)).limit(500),
      database.select().from(entityRelations).where(eq(entityRelations.caseId, caseId)).limit(1_000),
      database
        .select({
          id: caseWallets.id,
          walletId: caseWallets.walletId,
          entityId: caseWallets.entityId,
          chain: walletAssets.chain,
          address: walletAssets.address,
          label: caseWallets.label,
          explorerUrl: caseWallets.explorerUrl,
          status: caseWallets.status,
          updatedAt: caseWallets.updatedAt,
        })
        .from(caseWallets)
        .innerJoin(walletAssets, eq(caseWallets.walletId, walletAssets.id))
        .where(eq(caseWallets.caseId, caseId))
        .limit(500),
      canManageMembers
        ? database
            .select({
              id: caseMembers.id,
              userId: caseMembers.userId,
              role: caseMembers.role,
              updatedAt: caseMembers.updatedAt,
            })
            .from(caseMembers)
            .where(eq(caseMembers.caseId, caseId))
            .orderBy(asc(caseMembers.createdAt))
            .limit(100)
        : Promise.resolve([]),
    ]);

    return NextResponse.json({
      case: record,
      capabilities: {
        edit: hasCasePermission(policyInput, "case:edit"),
        review: hasCasePermission(policyInput, "case:review"),
        publish: hasCasePermission(policyInput, "case:publish"),
        manageMembers: canManageMembers,
      },
      timeline,
      entities: caseEntities,
      relations,
      wallets,
      members,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  try {
    const { caseId } = await context.params;
    z.string().uuid().parse(caseId);
    const { actor } = await requireCasePermission(caseId, "case:edit");
    const input = updateSchema.parse(await request.json());
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
    if (!isCaseContentEditable(record.status)) {
      throw new HttpError(409, "Only draft or returned cases can be edited.");
    }
    const expectedUpdatedAt = new Date(input.expectedUpdatedAt);
    if (expectedUpdatedAt.getTime() !== record.updatedAt.getTime()) {
      throw new HttpError(409, "The case changed. Please refresh and try again.");
    }
    const updatedAt = new Date();
    const detail = JSON.stringify({ status: record.status });
    const result = await database.execute<{ id: string }>(sql`
      with changed as (
        update ${caseRecords}
        set
          ${caseRecords.titleZh} = ${input.titleZh},
          ${caseRecords.titleEn} = ${input.titleEn},
          ${caseRecords.summaryZh} = ${input.summaryZh || null},
          ${caseRecords.summaryEn} = ${input.summaryEn || null},
          ${caseRecords.updatedAt} = ${updatedAt}
        where
          ${caseRecords.id} = ${caseId}
          and ${caseRecords.updatedAt} = ${expectedUpdatedAt}
          and ${caseRecords.status} = ${record.status}
        returning id
      ), audit as (
        insert into ${auditLogs} (organization_id, case_id, actor_id, resource_type, resource_id, action, detail)
        select ${record.organizationId}, ${caseId}, ${actor.id}, 'case', changed.id, 'case.updated', ${detail}::jsonb
        from changed
      )
      select id from changed
    `);
    if (result.rows.length === 0) throw new HttpError(409, "The case changed. Please refresh and try again.");

    return NextResponse.json({ case: { id: caseId, updatedAt } });
  } catch (error) {
    return errorResponse(error);
  }
}

import { eq, sql, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCasePermission } from "@/lib/authorization";
import { isCaseContentEditable } from "@/lib/case-workflow";
import { db } from "@/db/client";
import {
  auditLogs,
  caseRecords,
  caseWallets,
  entities,
  entityRelations,
  timelineEvents,
  walletAssets,
} from "@/db/schema";
import { errorResponse, HttpError } from "@/lib/http";
import { normalizeWalletIdentity } from "@/lib/wallet";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const timestamp = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const expectedTimestamp = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const entityType = z.enum(["person", "organization", "wallet", "location", "document", "other"]);
const httpUrl = z.string().trim().url().refine((value) => value.startsWith("https://") || value.startsWith("http://"));

const deleteSchema = z.object({
  operation: z.literal("delete"),
  kind: z.enum(["timeline", "entity", "relation", "wallet"]),
  id: z.string().uuid(),
  expectedUpdatedAt: expectedTimestamp,
});
const timelineCreateSchema = z.object({
  operation: z.literal("create"), kind: z.literal("timeline"), occurredAt: timestamp,
  titleZh: z.string().trim().min(2).max(240), titleEn: z.string().trim().min(2).max(240),
  summaryZh: z.string().trim().max(4_000).optional(), summaryEn: z.string().trim().max(4_000).optional(),
});
const timelineUpdateSchema = timelineCreateSchema.omit({ operation: true }).extend({
  operation: z.literal("update"), id: z.string().uuid(), expectedUpdatedAt: expectedTimestamp,
});
const entityCreateSchema = z.object({
  operation: z.literal("create"), kind: z.literal("entity"), type: entityType,
  label: z.string().trim().min(2).max(240), description: z.string().trim().max(4_000).optional(),
});
const entityUpdateSchema = entityCreateSchema.omit({ operation: true }).extend({
  operation: z.literal("update"), id: z.string().uuid(), expectedUpdatedAt: expectedTimestamp,
});
const relationCreateSchema = z.object({
  operation: z.literal("create"), kind: z.literal("relation"),
  fromEntityId: z.string().uuid(), toEntityId: z.string().uuid(),
  relationType: z.string().trim().min(2).max(80), description: z.string().trim().max(4_000).optional(),
}).refine((value) => value.fromEntityId !== value.toEntityId, { message: "A relation requires two different entities." });
const relationUpdateSchema = z.object({
  operation: z.literal("update"), kind: z.literal("relation"), id: z.string().uuid(),
  expectedUpdatedAt: expectedTimestamp, fromEntityId: z.string().uuid(), toEntityId: z.string().uuid(),
  relationType: z.string().trim().min(2).max(80), description: z.string().trim().max(4_000).optional(),
}).refine((value) => value.fromEntityId !== value.toEntityId, { message: "A relation requires two different entities." });
const walletFields = {
  chain: z.string().trim().min(2).max(40),
  address: z.string().trim().min(3).max(255),
  entityId: z.string().uuid().nullable().optional(),
  label: z.string().trim().min(1).max(120),
  explorerUrl: httpUrl,
};
const walletCreateSchema = z.object({ operation: z.literal("create"), kind: z.literal("wallet"), ...walletFields });
const walletUpdateSchema = z.object({
  operation: z.literal("update"), kind: z.literal("wallet"), id: z.string().uuid(),
  expectedUpdatedAt: expectedTimestamp, ...walletFields,
});
const mutationSchema = z.union([
  deleteSchema,
  timelineCreateSchema,
  timelineUpdateSchema,
  entityCreateSchema,
  entityUpdateSchema,
  relationCreateSchema,
  relationUpdateSchema,
  walletCreateSchema,
  walletUpdateSchema,
]);

async function runAuditedChange(
  database: ReturnType<typeof db>,
  change: SQL,
  meta: {
    organizationId: string;
    caseId: string;
    actorId: string;
    resourceType: string;
    action: string;
    detail: Record<string, unknown>;
  },
) {
  const detail = JSON.stringify(meta.detail);
  const result = await database.execute<{ id: string }>(sql`
    with changed as (${change}), audit as (
      insert into ${auditLogs} (organization_id, case_id, actor_id, resource_type, resource_id, action, detail)
      select ${meta.organizationId}, ${meta.caseId}, ${meta.actorId}, ${meta.resourceType}, changed.id, ${meta.action}, ${detail}::jsonb
      from changed
    )
    select id from changed
  `);
  if (result.rows.length === 0) {
    throw new HttpError(409, "The record changed. Please refresh and try again.");
  }
  return result.rows[0];
}

export async function POST(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  try {
    const { caseId } = await context.params;
    z.string().uuid().parse(caseId);
    const { actor } = await requireCasePermission(caseId, "case:edit");
    const input = mutationSchema.parse(await request.json());
    const database = db();
    const [record] = await database
      .select({ organizationId: caseRecords.organizationId, status: caseRecords.status })
      .from(caseRecords)
      .where(eq(caseRecords.id, caseId))
      .limit(1);
    if (!record) throw new HttpError(404, "Case not found.");
    if (!isCaseContentEditable(record.status)) {
      throw new HttpError(409, "Case content is locked while it is under review or published.");
    }

    const now = new Date();
    const id = input.operation === "create" ? crypto.randomUUID() : input.id;
    let change: SQL;

    if (input.operation === "delete") {
      const expected = new Date(input.expectedUpdatedAt);
      const table = input.kind === "timeline" ? timelineEvents
        : input.kind === "entity" ? entities
          : input.kind === "relation" ? entityRelations
            : caseWallets;
      change = sql`delete from ${table} where id = ${id} and case_id = ${caseId} and updated_at = ${expected} returning id`;
    } else if (input.kind === "timeline") {
      if (input.operation === "create") {
        change = sql`
          insert into ${timelineEvents} (id, case_id, occurred_at, title_zh, title_en, summary_zh, summary_en, is_public, status, created_at, updated_at)
          values (${id}, ${caseId}, ${new Date(input.occurredAt)}, ${input.titleZh}, ${input.titleEn}, ${input.summaryZh || null}, ${input.summaryEn || null}, false, 'draft', ${now}, ${now})
          returning id
        `;
      } else {
        change = sql`
          update ${timelineEvents} set occurred_at = ${new Date(input.occurredAt)}, title_zh = ${input.titleZh}, title_en = ${input.titleEn}, summary_zh = ${input.summaryZh || null}, summary_en = ${input.summaryEn || null}, is_public = false, status = 'draft', updated_at = ${now}
          where id = ${id} and case_id = ${caseId} and updated_at = ${new Date(input.expectedUpdatedAt)} returning id
        `;
      }
    } else if (input.kind === "entity") {
      const details = JSON.stringify(input.description ? { description: input.description } : {});
      if (input.operation === "create") {
        change = sql`
          insert into ${entities} (id, case_id, type, label, details, is_public, status, created_at, updated_at)
          values (${id}, ${caseId}, ${input.type}, ${input.label}, ${details}::jsonb, false, 'draft', ${now}, ${now}) returning id
        `;
      } else {
        change = sql`
          update ${entities} set type = ${input.type}, label = ${input.label}, details = ${details}::jsonb, is_public = false, status = 'draft', updated_at = ${now}
          where id = ${id} and case_id = ${caseId} and updated_at = ${new Date(input.expectedUpdatedAt)} returning id
        `;
      }
    } else if (input.kind === "relation") {
      const details = JSON.stringify(input.description ? { description: input.description } : {});
      if (input.operation === "create") {
        change = sql`
          insert into ${entityRelations} (id, case_id, from_entity_id, to_entity_id, relation_type, details, is_public, status, created_at, updated_at)
          values (${id}, ${caseId}, ${input.fromEntityId}, ${input.toEntityId}, ${input.relationType}, ${details}::jsonb, false, 'draft', ${now}, ${now}) returning id
        `;
      } else {
        change = sql`
          update ${entityRelations} set from_entity_id = ${input.fromEntityId}, to_entity_id = ${input.toEntityId}, relation_type = ${input.relationType}, details = ${details}::jsonb, is_public = false, status = 'draft', updated_at = ${now}
          where id = ${id} and case_id = ${caseId} and updated_at = ${new Date(input.expectedUpdatedAt)} returning id
        `;
      }
    } else {
      const wallet = normalizeWalletIdentity(input.chain, input.address);
      const walletId = crypto.randomUUID();
      if (input.operation === "create") {
        change = sql`
          with asset as (
            insert into ${walletAssets} (id, chain, address, created_at)
            values (${walletId}, ${wallet.chain}, ${wallet.address}, ${now})
            on conflict (chain, address) do update set address = excluded.address
            returning id
          )
          insert into ${caseWallets} (id, case_id, wallet_id, entity_id, label, explorer_url, is_public, status, created_at, updated_at)
          select ${id}, ${caseId}, asset.id, ${input.entityId ?? null}, ${input.label}, ${input.explorerUrl}, false, 'draft', ${now}, ${now} from asset
          returning id
        `;
      } else {
        change = sql`
          with asset as (
            insert into ${walletAssets} (id, chain, address, created_at)
            values (${walletId}, ${wallet.chain}, ${wallet.address}, ${now})
            on conflict (chain, address) do update set address = excluded.address
            returning id
          )
          update ${caseWallets} set wallet_id = asset.id, entity_id = ${input.entityId ?? null}, label = ${input.label}, explorer_url = ${input.explorerUrl}, is_public = false, status = 'draft', updated_at = ${now}
          from asset
          where ${caseWallets.id} = ${id} and ${caseWallets.caseId} = ${caseId} and ${caseWallets.updatedAt} = ${new Date(input.expectedUpdatedAt)}
          returning ${caseWallets.id}
        `;
      }
    }

    const changed = await runAuditedChange(database, change, {
      organizationId: record.organizationId,
      caseId,
      actorId: actor.id,
      resourceType: `case_${input.kind}`,
      action: `case_content.${input.kind}.${input.operation}`,
      detail: { kind: input.kind, operation: input.operation },
    });
    return NextResponse.json({ record: { id: changed.id, updatedAt: now } }, { status: input.operation === "create" ? 201 : 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

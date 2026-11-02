import { asc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCasePermission, requireReviewer } from "@/lib/authorization";
import { db } from "@/db/client";
import {
  auditLogs,
  casePublications,
  caseRecords,
  caseWallets,
  entities,
  entityRelations,
  outboxEvents,
  timelineEvents,
  walletAssets,
} from "@/db/schema";
import { errorResponse, HttpError } from "@/lib/http";
import { hashPublicSnapshot, type PublicCaseSnapshot } from "@/lib/publication";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const inputSchema = z.object({
  expectedUpdatedAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  try {
    await requireReviewer();
    const { caseId } = await context.params;
    z.string().uuid().parse(caseId);
    const { actor } = await requireCasePermission(caseId, "case:publish");
    const input = inputSchema.parse(await request.json());
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
        status: caseRecords.status,
        currentPublishedVersion: caseRecords.currentPublishedVersion,
        updatedAt: caseRecords.updatedAt,
      })
      .from(caseRecords)
      .where(eq(caseRecords.id, caseId))
      .limit(1);
    if (!record) throw new HttpError(404, "Case not found.");
    if (record.status !== "approved") {
      throw new HttpError(409, "Only an approved case can be published.");
    }
    const expectedUpdatedAt = new Date(input.expectedUpdatedAt);
    if (expectedUpdatedAt.getTime() !== record.updatedAt.getTime()) {
      throw new HttpError(409, "The case changed. Please refresh and try again.");
    }
    const [timeline, publicEntities, relations, wallets] = await Promise.all([
      database.select({ id: timelineEvents.id, occurredAt: timelineEvents.occurredAt, titleZh: timelineEvents.titleZh, titleEn: timelineEvents.titleEn, summaryZh: timelineEvents.summaryZh, summaryEn: timelineEvents.summaryEn }).from(timelineEvents).where(eq(timelineEvents.caseId, caseId)).orderBy(asc(timelineEvents.occurredAt), asc(timelineEvents.id)).limit(500),
      database.select({ id: entities.id, type: entities.type, label: entities.label }).from(entities).where(eq(entities.caseId, caseId)).orderBy(asc(entities.label), asc(entities.id)).limit(500),
      database.select({ id: entityRelations.id, fromEntityId: entityRelations.fromEntityId, toEntityId: entityRelations.toEntityId, relationType: entityRelations.relationType }).from(entityRelations).where(eq(entityRelations.caseId, caseId)).orderBy(asc(entityRelations.id)).limit(1_000),
      database.select({ id: caseWallets.id, entityId: caseWallets.entityId, chain: walletAssets.chain, label: caseWallets.label, explorerUrl: caseWallets.explorerUrl }).from(caseWallets).innerJoin(walletAssets, eq(caseWallets.walletId, walletAssets.id)).where(eq(caseWallets.caseId, caseId)).orderBy(asc(caseWallets.label), asc(caseWallets.id)).limit(500),
    ]);
    const publishedAt = new Date();
    if (wallets.some((item) => {
      try {
        const url = new URL(item.explorerUrl);
        return url.protocol !== "https:" && url.protocol !== "http:";
      } catch {
        return true;
      }
    })) {
      throw new HttpError(422, "Every published wallet requires a valid HTTP(S) explorer link.");
    }
    const version = (record.currentPublishedVersion ?? 0) + 1;
    const snapshot: PublicCaseSnapshot = {
      case: {
        code: record.code,
        titleZh: record.titleZh,
        titleEn: record.titleEn,
        summaryZh: record.summaryZh,
        summaryEn: record.summaryEn,
        status: "published",
        updatedAt: publishedAt.toISOString(),
        publishedAt: publishedAt.toISOString(),
      },
      timeline: timeline.map((item) => ({ ...item, occurredAt: item.occurredAt.toISOString() })),
      entities: publicEntities.map((item) => ({ ...item, status: "published" as const })),
      relations,
      wallets: wallets.map((item) => ({ ...item, status: "published" as const })),
    };
    const publicationId = crypto.randomUUID();
    const snapshotJson = JSON.stringify(snapshot);
    const contentHash = hashPublicSnapshot(snapshot);
    const detail = JSON.stringify({ version, contentHash });
    const outboxPayload = JSON.stringify({ caseId, publicationId, version, contentHash });
    const result = await database.execute<{ id: string; version: number }>(sql`
      with advanced as (
        update ${caseRecords}
        set
          ${caseRecords.status} = 'published',
          ${caseRecords.visibility} = 'public',
          ${caseRecords.isPublic} = true,
          ${caseRecords.currentPublishedVersion} = ${version},
          ${caseRecords.updatedAt} = ${publishedAt}
        where
          ${caseRecords.id} = ${caseId}
          and ${caseRecords.status} = 'approved'
          and ${caseRecords.updatedAt} = ${expectedUpdatedAt}
        returning id
      ), publication as (
        insert into ${casePublications} (id, case_id, version, snapshot, content_hash, published_by, published_at)
        select ${publicationId}, advanced.id, ${version}, ${snapshotJson}::jsonb, ${contentHash}, ${actor.id}, ${publishedAt}
        from advanced
        returning id, version
      ), publish_timeline as (
        update ${timelineEvents} set ${timelineEvents.status} = 'published', ${timelineEvents.isPublic} = true
        where ${timelineEvents.caseId} = ${caseId} and exists (select 1 from advanced)
      ), publish_entities as (
        update ${entities} set ${entities.status} = 'published', ${entities.isPublic} = true
        where ${entities.caseId} = ${caseId} and exists (select 1 from advanced)
      ), publish_relations as (
        update ${entityRelations} set ${entityRelations.status} = 'published', ${entityRelations.isPublic} = true
        where ${entityRelations.caseId} = ${caseId} and exists (select 1 from advanced)
      ), publish_wallets as (
        update ${caseWallets} set ${caseWallets.status} = 'published', ${caseWallets.isPublic} = true
        where ${caseWallets.caseId} = ${caseId} and exists (select 1 from advanced)
      ), audit as (
        insert into ${auditLogs} (organization_id, case_id, actor_id, resource_type, resource_id, action, detail)
        select ${record.organizationId}, ${caseId}, ${actor.id}, 'case_publication', publication.id, 'case.published', ${detail}::jsonb
        from publication
      ), outbox as (
        insert into ${outboxEvents} (type, aggregate_type, aggregate_id, payload)
        select 'case.published', 'case_publication', publication.id, ${outboxPayload}::jsonb
        from publication
      )
      select id, version from publication
    `);
    const publication = result.rows[0];
    if (!publication) throw new HttpError(409, "The case changed. Please refresh and try again.");
    return NextResponse.json({ publication: { ...publication, contentHash, publishedAt } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

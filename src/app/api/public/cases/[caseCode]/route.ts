import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import {
  caseRecords,
  entities,
  entityRelations,
  evidenceItems,
  timelineEvents,
  wallets,
} from "@/db/schema";
import { errorResponse, HttpError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ caseCode: string }> },
) {
  try {
    const { caseCode } = await context.params;
    const database = db();
    const [caseRecord] = await database
      .select()
      .from(caseRecords)
      .where(and(eq(caseRecords.code, caseCode), eq(caseRecords.isPublic, true)))
      .limit(1);

    if (!caseRecord) {
      throw new HttpError(404, "Public case not found.");
    }

    const [timeline, evidence, publicEntities, relations, publicWallets] =
      await Promise.all([
        database
          .select({
            id: timelineEvents.id,
            occurredAt: timelineEvents.occurredAt,
            titleZh: timelineEvents.titleZh,
            titleEn: timelineEvents.titleEn,
            summaryZh: timelineEvents.summaryZh,
            summaryEn: timelineEvents.summaryEn,
          })
          .from(timelineEvents)
          .where(
            and(
              eq(timelineEvents.caseId, caseRecord.id),
              eq(timelineEvents.isPublic, true),
            ),
          )
          .orderBy(asc(timelineEvents.occurredAt)),
        // Only the editor-approved summary is public. The original file,
        // submitter, storage metadata, and review history never leave the
        // restricted workflow.
        database
          .select({
            id: evidenceItems.id,
            title: evidenceItems.publicTitle,
            description: evidenceItems.publicDescription,
            publishedAt: evidenceItems.reviewedAt,
          })
          .from(evidenceItems)
          .where(
            and(
              eq(evidenceItems.caseId, caseRecord.id),
              eq(evidenceItems.status, "approved"),
              eq(evidenceItems.visibility, "redacted_public"),
              isNotNull(evidenceItems.publicTitle),
            ),
          )
          .orderBy(desc(evidenceItems.reviewedAt)),
        database
          .select({
            id: entities.id,
            type: entities.type,
            label: entities.label,
            status: entities.status,
          })
          .from(entities)
          .where(
            and(
              eq(entities.caseId, caseRecord.id),
              eq(entities.isPublic, true),
            ),
          ),
        database
          .select({
            id: entityRelations.id,
            fromEntityId: entityRelations.fromEntityId,
            toEntityId: entityRelations.toEntityId,
            relationType: entityRelations.relationType,
          })
          .from(entityRelations)
          .where(
            and(
              eq(entityRelations.caseId, caseRecord.id),
              eq(entityRelations.isPublic, true),
            ),
          ),
        database
          .select({
            id: wallets.id,
            entityId: wallets.entityId,
            chain: wallets.chain,
            label: wallets.label,
            explorerUrl: wallets.explorerUrl,
            status: wallets.status,
          })
          .from(wallets)
          .where(
            and(
              eq(wallets.caseId, caseRecord.id),
              eq(wallets.isPublic, true),
            ),
          ),
      ]);

    return NextResponse.json({
      case: caseRecord,
      timeline,
      evidence,
      entities: publicEntities,
      relations,
      wallets: publicWallets,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

import { and, count, desc, eq, isNotNull, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { casePublications, caseRecords, evidenceItems, victimSignatures } from "@/db/schema";
import { errorResponse, HttpError } from "@/lib/http";
import { isPublicCaseSnapshot } from "@/lib/publication";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ caseCode: string }> }) {
  try {
    const { caseCode: rawCaseCode } = await context.params;
    const caseCode = z.string().trim().min(3).max(64).parse(rawCaseCode);
    const database = db();
    const [caseRecord] = await database
      .select({ id: caseRecords.id, version: caseRecords.currentPublishedVersion })
      .from(caseRecords)
      .where(and(eq(caseRecords.code, caseCode), eq(caseRecords.visibility, "public"), isNotNull(caseRecords.currentPublishedVersion)))
      .limit(1);
    if (!caseRecord?.version) throw new HttpError(404, "Public case not found.");

    const [publication] = await database
      .select({ version: casePublications.version, snapshot: casePublications.snapshot, contentHash: casePublications.contentHash, publishedAt: casePublications.publishedAt })
      .from(casePublications)
      .where(and(eq(casePublications.caseId, caseRecord.id), eq(casePublications.version, caseRecord.version)))
      .limit(1);
    if (!publication || !isPublicCaseSnapshot(publication.snapshot)) {
      throw new HttpError(404, "Published case snapshot not found.");
    }

    const [evidence, signatureTotals, publicSignatures] = await Promise.all([
      database
        .select({ id: evidenceItems.id, title: evidenceItems.publicTitle, description: evidenceItems.publicDescription, publishedAt: evidenceItems.reviewedAt })
        .from(evidenceItems)
        .where(and(eq(evidenceItems.caseId, caseRecord.id), eq(evidenceItems.status, "approved"), eq(evidenceItems.visibility, "redacted_public"), isNotNull(evidenceItems.publicTitle)))
        .orderBy(desc(evidenceItems.reviewedAt))
        .limit(100),
      database
        .select({ approvedCount: count() })
        .from(victimSignatures)
        .where(and(eq(victimSignatures.caseId, caseRecord.id), eq(victimSignatures.status, "approved"))),
      database
        .select({ id: victimSignatures.id, alias: victimSignatures.alias, visibility: victimSignatures.visibility, approvedAt: victimSignatures.reviewedAt })
        .from(victimSignatures)
        .where(and(eq(victimSignatures.caseId, caseRecord.id), eq(victimSignatures.status, "approved"), ne(victimSignatures.visibility, "count_only")))
        .orderBy(desc(victimSignatures.reviewedAt))
        .limit(12),
    ]);

    return NextResponse.json({
      ...publication.snapshot,
      publication: { version: publication.version, contentHash: publication.contentHash, publishedAt: publication.publishedAt },
      evidence,
      approvedSignatureCount: signatureTotals[0]?.approvedCount ?? 0,
      signatures: publicSignatures,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

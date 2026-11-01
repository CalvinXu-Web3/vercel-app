import { and, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { casePublications, caseRecords } from "@/db/schema";
import { errorResponse } from "@/lib/http";
import { parsePagination } from "@/lib/pagination";
import { isPublicCaseSnapshot } from "@/lib/publication";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const pagination = parsePagination(request, { defaultLimit: 20, maxLimit: 50 });
    const query = z.string().trim().max(120).optional().parse(new URL(request.url).searchParams.get("q") || undefined);
    const titleZh = sql<string>`${casePublications.snapshot}->'case'->>'titleZh'`;
    const titleEn = sql<string>`${casePublications.snapshot}->'case'->>'titleEn'`;
    const filter = and(
      eq(caseRecords.visibility, "public"),
      isNotNull(caseRecords.currentPublishedVersion),
      query ? or(ilike(caseRecords.code, `%${query}%`), ilike(titleZh, `%${query}%`), ilike(titleEn, `%${query}%`)) : undefined,
    );
    const rows = await db()
      .select({ snapshot: casePublications.snapshot, version: casePublications.version, publishedAt: casePublications.publishedAt })
      .from(caseRecords)
      .innerJoin(casePublications, and(eq(casePublications.caseId, caseRecords.id), eq(casePublications.version, caseRecords.currentPublishedVersion)))
      .where(filter)
      .orderBy(desc(casePublications.publishedAt))
      .limit(pagination.limit)
      .offset(pagination.offset);
    const cases = rows.flatMap((row) => isPublicCaseSnapshot(row.snapshot) ? [{ ...row.snapshot.case, version: row.version, publishedAt: row.publishedAt }] : []);
    return NextResponse.json({ cases, pagination: { ...pagination, returned: cases.length } });
  } catch (error) {
    return errorResponse(error);
  }
}

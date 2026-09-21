import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { caseRecords, timelineEvents } from "@/db/schema";
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

    const timeline = await database
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
      .orderBy(asc(timelineEvents.occurredAt));

    return NextResponse.json({ case: caseRecord, timeline });
  } catch (error) {
    return errorResponse(error);
  }
}

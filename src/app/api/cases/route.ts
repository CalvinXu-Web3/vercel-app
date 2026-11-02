import { and, desc, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireReviewer } from "@/lib/authorization";
import { db } from "@/db/client";
import { caseMembers, caseRecords, organizationMembers, organizations } from "@/db/schema";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const actor = await requireReviewer();
    const database = db();
    const membershipFilter = actor.role === "admin" || actor.role === "reviewer"
      ? undefined
      : or(
          eq(caseRecords.createdBy, actor.id),
          eq(caseMembers.userId, actor.id),
          eq(organizationMembers.userId, actor.id),
        );
    const cases = await database
      .select({
        id: caseRecords.id,
        code: caseRecords.code,
        titleZh: caseRecords.titleZh,
        titleEn: caseRecords.titleEn,
        status: caseRecords.status,
        visibility: caseRecords.visibility,
        organizationName: organizations.name,
        caseRole: caseMembers.role,
        organizationRole: organizationMembers.role,
        updatedAt: caseRecords.updatedAt,
      })
      .from(caseRecords)
      .innerJoin(organizations, eq(caseRecords.organizationId, organizations.id))
      .leftJoin(
        caseMembers,
        and(eq(caseMembers.caseId, caseRecords.id), eq(caseMembers.userId, actor.id)),
      )
      .leftJoin(
        organizationMembers,
        and(
          eq(organizationMembers.organizationId, caseRecords.organizationId),
          eq(organizationMembers.userId, actor.id),
        ),
      )
      .where(membershipFilter)
      .orderBy(desc(caseRecords.updatedAt))
      .limit(100);

    return NextResponse.json({ cases });
  } catch (error) {
    return errorResponse(error);
  }
}

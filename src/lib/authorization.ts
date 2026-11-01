import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  caseMembers,
  caseRecords,
  organizationMembers,
} from "@/db/schema";
import {
  hasCasePermission,
  type CasePermission,
} from "@/lib/case-policy";
import { HttpError } from "@/lib/http";

export type Role = "contributor" | "reviewer" | "admin";

export type Actor = {
  id: string;
  role: Role;
};

function configuredIds(name: string) {
  return new Set(
    (process.env[name] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export async function requireContributor(): Promise<Actor> {
  if (
    !process.env.CLERK_SECRET_KEY ||
    !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  ) {
    throw new HttpError(503, "Authentication is not configured.");
  }

  const session = await auth();
  if (!session.isAuthenticated || !session.userId) {
    throw new HttpError(401, "Sign in is required.");
  }

  const adminIds = configuredIds("CRN_ADMIN_USER_IDS");
  const reviewerIds = configuredIds("CRN_REVIEWER_USER_IDS");
  const role: Role = adminIds.has(session.userId)
    ? "admin"
    : reviewerIds.has(session.userId)
      ? "reviewer"
      : "contributor";

  return { id: session.userId, role };
}

export async function requireReviewer(): Promise<Actor> {
  const actor = await requireContributor();
  if (actor.role !== "admin" && actor.role !== "reviewer") {
    throw new HttpError(403, "Reviewer access is required.");
  }
  return actor;
}

export async function requireCasePermission(
  caseId: string,
  permission: CasePermission,
) {
  if (!z.string().uuid().safeParse(caseId).success) {
    throw new HttpError(404, "Case not found.");
  }
  const actor = await requireContributor();
  const [record] = await db()
    .select({
      id: caseRecords.id,
      organizationId: caseRecords.organizationId,
      createdBy: caseRecords.createdBy,
      caseRole: caseMembers.role,
      organizationRole: organizationMembers.role,
    })
    .from(caseRecords)
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
    .where(eq(caseRecords.id, caseId))
    .limit(1);

  if (!record) throw new HttpError(404, "Case not found.");
  if (
    !hasCasePermission(
      {
        globalRole: actor.role,
        caseRole: record.caseRole,
        organizationRole: record.organizationRole,
        isCreator: record.createdBy === actor.id,
      },
      permission,
    )
  ) {
    throw new HttpError(403, "You do not have permission to access this case.");
  }

  return { actor, case: record };
}

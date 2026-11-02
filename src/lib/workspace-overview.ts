import { and, count, countDistinct, eq, inArray, or, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import {
  caseMembers,
  caseRecords,
  caseSubmissions,
  evidenceItems,
  organizationMembers,
  victimSignatures,
} from "@/db/schema";
import type { Actor } from "@/lib/authorization";

const activeSubmissionStatuses = ["submitted", "triage", "needs_information"] as const;
const reviewableCaseStatuses = ["submitted", "under_review"] as const;
const organizationReviewRoles = ["owner", "reviewer", "publisher"] as const;
const organizationPublishRoles = ["owner", "publisher"] as const;

export type WorkspaceOverview = {
  role: Actor["role"];
  accessibleCases: number;
  activeSubmissions: number;
  canReviewCases: boolean;
  canPublishCases: boolean;
  formalCasesAwaitingReview: number;
  caseSubmissionsAwaitingReview: number;
  evidenceAwaitingReview: number;
  signaturesAwaitingReview: number;
  casesAwaitingPublication: number;
};

export async function getWorkspaceOverview(actor: Actor): Promise<WorkspaceOverview> {
  const database = db();
  const hasGlobalReviewAccess = actor.role === "reviewer" || actor.role === "admin";

  const caseCount = async (filter: SQL | undefined): Promise<Array<{ value: number }>> => database
    .select({ value: countDistinct(caseRecords.id) })
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
    .where(filter);

  const accessibleCaseFilter = hasGlobalReviewAccess
    ? undefined
    : or(
        eq(caseRecords.createdBy, actor.id),
        eq(caseMembers.userId, actor.id),
        eq(organizationMembers.userId, actor.id),
      );
  const caseReviewAccessFilter = hasGlobalReviewAccess
    ? undefined
    : or(
        eq(caseMembers.role, "reviewer"),
        inArray(organizationMembers.role, organizationReviewRoles),
      );
  const casePublishAccessFilter = actor.role === "admin"
    ? undefined
    : inArray(organizationMembers.role, organizationPublishRoles);

  const [
    accessibleCaseRows,
    activeSubmissionRows,
    reviewAccessRows,
    formalReviewRows,
    publishAccessRows,
    publicationRows,
    caseSubmissionReviewRows,
    evidenceReviewRows,
    signatureReviewRows,
  ] = await Promise.all([
    caseCount(accessibleCaseFilter),
    database
      .select({ value: count() })
      .from(caseSubmissions)
      .where(and(
        eq(caseSubmissions.submitterId, actor.id),
        inArray(caseSubmissions.status, activeSubmissionStatuses),
      )),
    caseCount(caseReviewAccessFilter),
    caseCount(and(
        inArray(caseRecords.status, reviewableCaseStatuses),
        caseReviewAccessFilter,
      )),
    caseCount(casePublishAccessFilter),
    caseCount(and(eq(caseRecords.status, "approved"), casePublishAccessFilter)),
    hasGlobalReviewAccess
      ? database
          .select({ value: count() })
          .from(caseSubmissions)
          .where(inArray(caseSubmissions.status, ["submitted", "triage"]))
      : Promise.resolve([{ value: 0 }]),
    hasGlobalReviewAccess
      ? database
          .select({ value: count() })
          .from(evidenceItems)
          .where(eq(evidenceItems.status, "pending_review"))
      : Promise.resolve([{ value: 0 }]),
    hasGlobalReviewAccess
      ? database
          .select({ value: count() })
          .from(victimSignatures)
          .where(eq(victimSignatures.status, "pending_review"))
      : Promise.resolve([{ value: 0 }]),
  ]);

  return {
    role: actor.role,
    accessibleCases: accessibleCaseRows[0]?.value ?? 0,
    activeSubmissions: activeSubmissionRows[0]?.value ?? 0,
    canReviewCases: hasGlobalReviewAccess || (reviewAccessRows[0]?.value ?? 0) > 0,
    canPublishCases: actor.role === "admin" || (publishAccessRows[0]?.value ?? 0) > 0,
    formalCasesAwaitingReview: formalReviewRows[0]?.value ?? 0,
    caseSubmissionsAwaitingReview: caseSubmissionReviewRows[0]?.value ?? 0,
    evidenceAwaitingReview: evidenceReviewRows[0]?.value ?? 0,
    signaturesAwaitingReview: signatureReviewRows[0]?.value ?? 0,
    casesAwaitingPublication: publicationRows[0]?.value ?? 0,
  };
}

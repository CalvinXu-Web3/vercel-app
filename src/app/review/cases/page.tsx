import { redirect } from "next/navigation";
import { CaseSubmissionReviewManager } from "@/components/case-submission-review-manager";
import { requireReviewer } from "@/lib/authorization";
import { HttpError } from "@/lib/http";

export const dynamic = "force-dynamic";

export default async function CaseSubmissionReviewPage() {
  try {
    await requireReviewer();
  } catch (error) {
    if (error instanceof HttpError && (error.status === 401 || error.status === 403)) redirect("/");
    throw error;
  }
  return <CaseSubmissionReviewManager />;
}

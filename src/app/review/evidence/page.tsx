import { redirect } from "next/navigation";
import { EvidenceReviewManager } from "@/components/evidence-review-manager";
import { requireReviewer } from "@/lib/authorization";
import { HttpError } from "@/lib/http";

export const dynamic = "force-dynamic";

export default async function EvidenceReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ caseId?: string }>;
}) {
  const { caseId } = await searchParams;
  try {
    await requireReviewer();
  } catch (error) {
    if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
      redirect("/");
    }
    throw error;
  }

  return <EvidenceReviewManager caseId={caseId} />;
}

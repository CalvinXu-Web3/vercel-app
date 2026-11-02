import { redirect } from "next/navigation";
import { SignatureReviewManager } from "@/components/signature-review-manager";
import { requireReviewer } from "@/lib/authorization";
import { HttpError } from "@/lib/http";

export const dynamic = "force-dynamic";

export default async function SignatureReviewPage({
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

  return <SignatureReviewManager caseId={caseId} />;
}

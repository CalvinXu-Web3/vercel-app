import { redirect } from "next/navigation";
import { CaseSubmissionForm } from "@/components/case-submission-form";
import { requireContributor } from "@/lib/authorization";
import { HttpError } from "@/lib/http";

export const dynamic = "force-dynamic";

export default async function NewCaseSubmissionPage() {
  try {
    await requireContributor();
  } catch (error) {
    if (error instanceof HttpError && (error.status === 401 || error.status === 403)) redirect("/");
    throw error;
  }
  return <CaseSubmissionForm />;
}

import { redirect } from "next/navigation";
import { CaseWorkspaceEditor } from "@/components/case-workspace-editor";
import { requireCasePermission, requireReviewer } from "@/lib/authorization";
import { HttpError } from "@/lib/http";

export const dynamic = "force-dynamic";

export default async function CaseWorkspacePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  try {
    await requireReviewer();
    await requireCasePermission(caseId, "case:view");
  } catch (error) {
    if (error instanceof HttpError && (error.status === 401 || error.status === 403 || error.status === 404)) redirect("/workspace/cases");
    throw error;
  }
  return <CaseWorkspaceEditor caseId={caseId} />;
}

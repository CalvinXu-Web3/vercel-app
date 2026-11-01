import { PublicCaseDetail } from "@/components/public-case-detail";

export const dynamic = "force-dynamic";

export default async function PublicCasePage({ params }: { params: Promise<{ caseCode: string }> }) {
  const { caseCode } = await params;
  return <PublicCaseDetail caseCode={caseCode} />;
}

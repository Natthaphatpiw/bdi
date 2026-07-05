import { CaseResultScreen } from "@/components/case/CaseResultScreen";

export default async function WebCaseResultPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  return <CaseResultScreen sessionId={caseId} surface="web" homeHref="/" />;
}

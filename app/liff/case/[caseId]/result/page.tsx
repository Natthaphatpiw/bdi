import { CaseResultScreen } from "@/components/case/CaseResultScreen";

export default async function LiffCaseResultPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  return <CaseResultScreen sessionId={caseId} surface="line" homeHref="/liff" />;
}

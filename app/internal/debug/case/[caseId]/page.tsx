import type { Metadata } from "next";
import { InternalDebugCase } from "@/components/mvp/InternalDebugCase";

export const metadata: Metadata = {
  title: "Internal case debug",
  robots: { index: false, follow: false, nocache: true },
};

export default async function InternalCaseDebugPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const allowed = process.env.NODE_ENV === "development" || process.env.ADMIN_DEBUG === "true";
  if (!allowed) {
    return (
      <main className="grid min-h-screen place-items-center bg-canvas p-4">
        <section className="w-full max-w-md rounded-2xl border border-hairline bg-white p-6 text-center shadow-card">
          <h1 className="text-xl font-bold text-ink">ไม่เปิดใช้หน้าตรวจสอบภายใน</h1>
          <p className="mt-2 text-base text-ink-soft">หน้านี้เปิดเฉพาะ development หรือเมื่อผู้ดูแลระบบอนุญาต</p>
        </section>
      </main>
    );
  }
  const { caseId } = await params;
  return <InternalDebugCase caseId={caseId} />;
}

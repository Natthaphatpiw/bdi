// QR staff view — public read-only (เจ้าหน้าที่หน้าเคาน์เตอร์ไม่มีบัญชีเรา)
// token ผิด → 404 ไม่ leak · หมดอายุ/ถูกเพิกถอน → copy §7.6 · ทุกการเปิดถูก log
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { StaffPassportView } from "@/components/passport/StaffPassportView";
import { resolvePassportShare } from "@/lib/passportShare";
import { buildSamplePassport } from "@/lib/config/sample-personas";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "เอกสารประกอบการให้บริการ — รู้สิทธิ์ รู้สุข",
  robots: { index: false, follow: false },
};

export default async function StaffPassportPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ sample?: string }>;
}) {
  const { token } = await params;
  // ?sample=1 (งานพิมพ์ใบตัวอย่าง) — เงียบสนิทเมื่อไม่มี sim env
  const samplePrintOnly = (await searchParams).sample === "1" && env.guardianSimEnabled;

  // Sample mode (ทีมพิมพ์ใบตัวอย่างลงพื้นที่) — ทำงานเฉพาะ build ที่เปิด sim gate
  if (token.startsWith("sample-")) {
    if (!env.guardianSimEnabled) notFound();
    const sample = buildSamplePassport(token.slice("sample-".length));
    if (!sample) notFound();
    return (
      <main className="min-h-screen bg-canvas">
        <StaffPassportView passport={sample} sampleFooter />
      </main>
    );
  }
  void samplePrintOnly; // ใช้กับ token จริงด้านล่าง

  const ua = (await headers()).get("user-agent") ?? undefined;
  const resolved = await resolvePassportShare(token, ua);

  if (resolved.status === "not_found") notFound();

  if (resolved.status === "expired") {
    return (
      <main className="grid min-h-screen place-items-center bg-canvas px-6">
        <div className="w-full max-w-sm rounded-card border border-hairline bg-surface p-6 text-center shadow-card">
          <h1 className="text-lg font-bold text-ink">เอกสารฉบับนี้หมดอายุแล้ว</h1>
          <p className="mt-2 text-sm text-ink-soft">
            เอกสารฉบับนี้หมดอายุแล้ว กรุณาขอฉบับใหม่จากผู้ป่วย
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas">
      <StaffPassportView
        passport={resolved.passport}
        sampleFooter={samplePrintOnly}
        samplePrintOnly={samplePrintOnly}
      />
    </main>
  );
}

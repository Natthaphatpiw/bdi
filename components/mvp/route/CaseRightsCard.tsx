"use client";

import { BadgeCheck, ChevronDown } from "lucide-react";
import type { RouteCoverage } from "@/lib/mvp/contracts";
import { CoverageStatus } from "./routeUi";

export function CaseRightsCard({ rights }: { rights: RouteCoverage[] }) {
  return (
    <section className="rounded-2xl border border-hairline bg-white p-5 shadow-card" aria-labelledby="case-rights-heading">
      <div className="flex items-start gap-3"><BadgeCheck className="mt-0.5 h-6 w-6 shrink-0 text-rights" aria-hidden="true" /><div><h2 id="case-rights-heading" className="text-xl font-bold text-ink">สิทธิ์ที่เกี่ยวกับเคสนี้</h2><p className="mt-1 text-base text-ink-soft">แสดงเฉพาะบริการที่เกี่ยวข้องกับเส้นทางนี้</p></div></div>
      <div className="mt-4 space-y-2">{rights.length ? rights.map((coverage) => (
        <details key={coverage.serviceId} className="rounded-xl border border-hairline p-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"><span className="min-w-0 flex-1 font-bold text-ink">{coverage.serviceName}</span><span className="flex shrink-0 items-center gap-2"><CoverageStatus coverage={coverage} /><ChevronDown className="h-5 w-5 text-ink-muted" aria-hidden="true" /></span></summary>
          <div className="mt-3 border-t border-hairline pt-3 text-base leading-relaxed text-ink-soft"><p><strong className="text-ink">ค่าใช้จ่าย:</strong> {coverage.costSummary || "ยังไม่มีข้อมูลค่าใช้จ่ายที่ยืนยันได้"}</p>{coverage.conditions && <p className="mt-2"><strong className="text-ink">เงื่อนไข:</strong> {coverage.conditions}</p>}{coverage.referralRequired != null && <p className="mt-2"><strong className="text-ink">ใบส่งตัว:</strong> {coverage.referralRequired ? "ต้องตรวจสอบ/เตรียมตามเงื่อนไข" : "ข้อมูลระบุว่าไม่บังคับ แต่ควรโทรยืนยัน"}</p>}<p className="mt-2 text-sm text-ink-muted">สถานะข้อมูล: {coverage.verificationStatus} · มีหลักฐาน {coverage.evidenceIds.length} รายการ</p></div>
        </details>
      )) : <p className="text-base text-ink-muted">ยังต้องยืนยันข้อมูลสิทธิ์ส่วนนี้</p>}</div>
    </section>
  );
}

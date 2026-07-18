"use client";

import { ChevronDown, ExternalLink, FileText } from "lucide-react";
import type { RouteEvidence } from "@/lib/mvp/contracts";
import { cn } from "@/lib/cn";
import { openRouteUrl } from "./routeUi";

export function EvidenceAccordion({ evidence, open, onOpenChange, surface }: { evidence: RouteEvidence[]; open: boolean; onOpenChange: (open: boolean) => void; surface: "web" | "line" }) {
  return (
    <section id="route-evidence" className="scroll-mt-20 rounded-2xl border border-hairline bg-white p-5 shadow-card" aria-labelledby="evidence-heading">
      <details open={open} onToggle={(event) => onOpenChange(event.currentTarget.open)}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"><span className="flex items-center gap-2"><FileText className="h-6 w-6 text-info" aria-hidden="true" /><span id="evidence-heading" className="text-xl font-bold text-ink">หลักฐานและที่มาของคำแนะนำ</span></span><ChevronDown className="h-5 w-5 shrink-0 text-ink-muted" aria-hidden="true" /></summary>
        <div className="mt-4 space-y-3 border-t border-hairline pt-4">{evidence.length ? evidence.map((item) => <article key={item.id} className="rounded-xl border border-hairline p-3"><div className="flex flex-wrap items-center gap-2"><span className={cn("rounded-full px-2 py-1 text-xs font-bold", item.isOfficial ? "bg-rights-soft text-rights" : "bg-gray-100 text-review")}>{item.isOfficial ? "แหล่งข้อมูลทางการ" : "แหล่งข้อมูลประกอบ"}</span><span className="rounded-full bg-canvas px-2 py-1 text-xs font-bold text-ink-muted">{item.verificationStatus}</span></div><h3 className="mt-2 text-base font-bold text-ink">{item.title}</h3><p className="mt-1 text-sm text-ink-soft">{item.publisher}</p><dl className="mt-2 grid gap-1 text-sm text-ink-muted sm:grid-cols-2"><div><dt className="inline font-semibold">มีผล:</dt> <dd className="inline">{item.effectiveDate || "ไม่ระบุ"}</dd></div><div><dt className="inline font-semibold">ตรวจข้อมูล:</dt> <dd className="inline">{new Date(item.retrievedAt).toLocaleDateString("th-TH")}</dd></div></dl>{item.url && <button type="button" onClick={() => openRouteUrl(item.url as string, surface)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-base font-bold text-facility underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-facility">เปิดแหล่งข้อมูล <ExternalLink className="h-4 w-4" aria-hidden="true" /></button>}</article>) : <p className="text-base text-ink-muted">ยังไม่มีหลักฐานที่เปิดดูได้ กรุณาโทรยืนยันก่อนเดินทาง</p>}</div>
      </details>
    </section>
  );
}

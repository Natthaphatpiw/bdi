"use client";

import { CheckCircle2, FileCheck2, MapPin, Route as RouteIcon, ShieldAlert, ShieldCheck } from "lucide-react";
import type { VerifiedCareRoute } from "@/lib/mvp/contracts";
import { Sheet } from "@/components/ui/Sheet";

export function WhyThisRouteDrawer({ open, onOpenChange, route }: { open: boolean; onOpenChange: (open: boolean) => void; route: VerifiedCareRoute }) {
  const groups = [
    ["เหตุผลด้านความปลอดภัย", route.whyThisRoute.safety, ShieldAlert],
    ["เหตุผลด้านการดูแล", route.whyThisRoute.care, RouteIcon],
    ["เหตุผลด้านสิทธิ์", route.whyThisRoute.rights, ShieldCheck],
    ["เหตุผลด้านสถานที่", route.whyThisRoute.facility, MapPin],
    ["ความใหม่ของหลักฐาน", route.whyThisRoute.evidenceFreshness, FileCheck2],
  ] as const;
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="ทำไมแนะนำเส้นทางนี้">
      <p className="text-base leading-relaxed text-ink-soft">สรุปจากกฎความปลอดภัย ข้อมูลสิทธิ์ บริการ สถานที่ และหลักฐาน โดยไม่แสดงกระบวนการคิดภายใน</p>
      <div className="mt-4 space-y-4">{groups.map(([title, reasons, Icon]) => <section key={title} className="rounded-xl border border-hairline p-3"><h3 className="flex items-center gap-2 text-base font-bold text-ink"><Icon className="h-5 w-5 text-brand" aria-hidden="true" /> {title}</h3>{reasons.length ? <ul className="mt-2 space-y-2">{reasons.map((reason) => <li key={reason} className="flex gap-2 text-base leading-relaxed text-ink-soft"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-rights" aria-hidden="true" /> {reason}</li>)}</ul> : <p className="mt-2 text-base text-ink-muted">ยังต้องยืนยันข้อมูลส่วนนี้</p>}</section>)}</div>
    </Sheet>
  );
}

export function WhyThisRouteCard({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="rounded-2xl border border-brand/20 bg-brand-soft/50 p-5 shadow-card" aria-labelledby="why-heading">
      <div className="flex items-start gap-3"><RouteIcon className="mt-0.5 h-6 w-6 shrink-0 text-brand" aria-hidden="true" /><div className="min-w-0 flex-1"><h2 id="why-heading" className="text-xl font-bold text-ink">ทำไมแนะนำเส้นทางนี้</h2><p className="mt-1 text-base leading-relaxed text-ink-soft">ดูเหตุผลด้านความปลอดภัย บริการ สิทธิ์ สถานที่ และความใหม่ของหลักฐาน</p></div></div>
      <button type="button" onClick={onOpen} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-base font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"><RouteIcon className="h-5 w-5" aria-hidden="true" /> ทำไมแนะนำเส้นทางนี้</button>
    </section>
  );
}

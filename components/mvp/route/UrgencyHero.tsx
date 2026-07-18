"use client";

import { AlertTriangle, ChevronDown, Phone, ShieldAlert } from "lucide-react";
import type { Urgency, VerifiedCareRoute } from "@/lib/mvp/contracts";
import { MEDICAL_DISCLAIMER } from "@/lib/mvp/contracts";
import { cn } from "@/lib/cn";

const STYLE: Record<Urgency, { panel: string; badge: string; icon: string }> = {
  EMERGENCY_NOW: { panel: "border-safety/40 bg-safety-soft", badge: "bg-safety text-white", icon: "text-safety" },
  URGENT_TODAY: { panel: "border-orange-300 bg-orange-50", badge: "bg-orange-600 text-white", icon: "text-orange-700" },
  SOON_1_3_DAYS: { panel: "border-blue-200 bg-blue-50", badge: "bg-blue-700 text-white", icon: "text-blue-700" },
  ROUTINE_APPOINTMENT: { panel: "border-blue-200 bg-blue-50", badge: "bg-blue-700 text-white", icon: "text-blue-700" },
  SELF_CARE_WITH_MONITORING: { panel: "border-rights/25 bg-rights-soft", badge: "bg-rights text-white", icon: "text-rights" },
};

export function UrgencyHero({ route }: { route: VerifiedCareRoute }) {
  const style = STYLE[route.urgency];
  return (
    <section className={cn("rounded-2xl border p-5 shadow-card sm:p-6", style.panel)} aria-labelledby="urgency-heading">
      <div className="flex items-start gap-3"><AlertTriangle className={cn("mt-0.5 h-7 w-7 shrink-0", style.icon)} aria-hidden="true" /><div><span className={cn("inline-flex rounded-full px-3 py-1 text-sm font-bold", style.badge)}>{route.urgencyLabelTh}</span><h2 id="urgency-heading" className="mt-3 text-2xl font-bold leading-tight text-ink">สิ่งที่ควรทำตอนนี้</h2><p className="mt-2 max-w-2xl text-base leading-relaxed text-ink">{route.urgencyExplanationTh}</p></div></div>
      {route.redFlagsToWatch.length > 0 && <details className="mt-4 rounded-xl bg-white/80 p-3"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-bold text-safety focus-visible:outline focus-visible:outline-2 focus-visible:outline-safety">สัญญาณที่ต้องเฝ้าระวัง<ChevronDown className="h-5 w-5" aria-hidden="true" /></summary><ul className="mt-2 space-y-2 text-base text-ink">{route.redFlagsToWatch.map((flag) => <li key={flag} className="flex gap-2"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-safety" aria-hidden="true" />{flag}</li>)}</ul></details>}
    </section>
  );
}

export function EmergencyRouteHero({ route }: { route: VerifiedCareRoute }) {
  return (
    <section className="overflow-hidden rounded-2xl border-2 border-safety bg-white shadow-card">
      <div className="bg-safety p-5 text-white"><ShieldAlert className="h-9 w-9" aria-hidden="true" /><h1 className="mt-3 text-2xl font-bold">อาการที่เล่ามาอาจต้องได้รับความช่วยเหลือฉุกเฉิน</h1><p className="mt-2 text-base leading-relaxed">{route.emergencyInstruction || "โทร 1669 ทันที"}</p></div>
      <div className="p-5"><a href="tel:1669" className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-safety text-lg font-bold text-white"><Phone className="h-6 w-6" aria-hidden="true" /> โทร 1669 ทันที</a><p className="mt-4 text-sm text-ink-muted">{MEDICAL_DISCLAIMER}</p></div>
    </section>
  );
}

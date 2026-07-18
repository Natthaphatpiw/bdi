"use client";

import { AlertTriangle, Phone, ShieldAlert } from "lucide-react";
import type { SafetyState } from "@/lib/mvp/contracts";
import { MEDICAL_DISCLAIMER } from "@/lib/mvp/contracts";

export function EmergencyEscalation({ safety, onReset }: { safety: SafetyState; onReset: () => void }) {
  const tel = safety.hotline || "1669";
  return (
    <section className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border-2 border-safety bg-white shadow-card">
      <div className="bg-safety p-5 text-white"><ShieldAlert className="h-9 w-9" aria-hidden="true" /><h1 className="mt-3 text-2xl font-bold leading-tight">อาการที่เล่ามาอาจต้องได้รับความช่วยเหลือฉุกเฉิน</h1><p className="mt-2 text-base leading-relaxed">{safety.messageTh || `โทร ${tel} ทันที`}</p></div>
      <div className="p-5">
        {safety.matchedLabels.length > 0 && <div className="rounded-xl bg-safety-soft p-4"><p className="font-bold text-safety">สัญญาณที่ตรวจพบ</p><ul className="mt-2 space-y-2 text-base text-ink">{safety.matchedLabels.map((label) => <li key={label} className="flex gap-2"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-safety" aria-hidden="true" /> {label}</li>)}</ul></div>}
        <a href={`tel:${tel}`} className="mt-5 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-safety px-5 py-3 text-lg font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-safety"><Phone className="h-6 w-6" aria-hidden="true" /> โทร {tel} ทันที</a>
        <p className="mt-4 text-sm leading-relaxed text-ink-muted">{MEDICAL_DISCLAIMER}</p>
        <button type="button" onClick={onReset} className="mt-4 min-h-11 w-full rounded-xl border border-hairline px-4 text-base font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">เริ่มเคสใหม่</button>
      </div>
    </section>
  );
}

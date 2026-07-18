"use client";

import { ClipboardCheck, Loader2, ShieldCheck } from "lucide-react";
import type { MvpCaseRecord, MvpScheme } from "@/lib/mvp/contracts";
import { RELATIONS, SCHEMES, type ReviewDraft } from "./types";

export function EditableSlot({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`block text-sm font-bold text-ink-soft${wide ? " sm:col-span-2" : ""}`}>{label}{children}</label>;
}

const fieldClass = "mt-1 min-h-12 w-full rounded-xl border border-hairline bg-white px-3 text-base text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

export function CaseUnderstandingReview({ caseRecord, value, onChange, onConfirm, busy }: {
  caseRecord: MvpCaseRecord;
  value: ReviewDraft;
  onChange: (value: ReviewDraft) => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const symptomCount = value.symptoms.split(",").map((item) => item.trim()).filter(Boolean).length;
  return (
    <section className="mx-auto w-full max-w-2xl rounded-2xl border border-hairline bg-white p-4 shadow-card sm:p-6">
      <div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><ClipboardCheck className="h-5 w-5" aria-hidden="true" /></span><div><h1 className="text-2xl font-bold text-ink">เราเข้าใจเคสนี้ว่า</h1><p className="mt-1 text-base text-ink-soft">ตรวจและแก้ไขข้อมูลก่อนสร้างเส้นทางดูแล</p></div></div>
      <div className="mt-5 rounded-xl bg-canvas p-4"><p className="text-sm font-bold text-ink-muted">เรื่องที่เล่ามา (เก็บต้นฉบับไว้โดยไม่เขียนทับ)</p><p className="mt-1 whitespace-pre-wrap text-base leading-relaxed text-ink">{caseRecord.originalNarrative}</p></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <EditableSlot label="ผู้ป่วย"><select value={value.patientRelation} onChange={(event) => onChange({ ...value, patientRelation: event.target.value })} className={fieldClass}>{RELATIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}<option value="other">อื่น ๆ</option><option value="unknown">ไม่ทราบ</option></select></EditableSlot>
        <EditableSlot label="อายุ"><input type="number" min={0} max={125} inputMode="numeric" value={value.age} onChange={(event) => onChange({ ...value, age: event.target.value })} className={fieldClass} placeholder="ไม่ทราบได้" /></EditableSlot>
        <EditableSlot label="สิทธิ์"><select value={value.scheme} onChange={(event) => onChange({ ...value, scheme: event.target.value as MvpScheme })} className={fieldClass}>{SCHEMES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></EditableSlot>
        <EditableSlot label="พื้นที่"><input value={value.area} onChange={(event) => onChange({ ...value, area: event.target.value })} className={fieldClass} /></EditableSlot>
        <EditableSlot label={`อาการ (${symptomCount} รายการ ใช้ comma คั่น)`} wide><input value={value.symptoms} onChange={(event) => onChange({ ...value, symptoms: event.target.value })} className={fieldClass} /></EditableSlot>
        <EditableSlot label="ระยะเวลา" wide><input value={value.duration} onChange={(event) => onChange({ ...value, duration: event.target.value })} className={fieldClass} placeholder="เช่น 5 วัน หรือ ไม่ทราบ" /></EditableSlot>
        <EditableSlot label="สิ่งที่ต้องการความช่วยเหลือ" wide><textarea rows={3} value={value.userGoal} onChange={(event) => onChange({ ...value, userGoal: event.target.value })} className={`${fieldClass} py-3`} /></EditableSlot>
      </div>
      <button type="button" disabled={busy || !value.area.trim() || !value.userGoal.trim()} onClick={onConfirm} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-base font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50">{busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-5 w-5" aria-hidden="true" />}{busy ? "กำลังยืนยันเคส…" : "ยืนยันและสร้างเส้นทางดูแล"}</button>
    </section>
  );
}

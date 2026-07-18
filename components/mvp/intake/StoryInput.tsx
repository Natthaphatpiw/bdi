"use client";

import { ChevronLeft, Loader2, MapPin, ShieldCheck, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";
import { RELATIONS, SCHEMES, type StoryDraft } from "./types";

const AREAS = ["ลาดพร้าว", "บางกะปิ", "ห้วยขวาง", "วังทองหลาง"];

function Choice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={cn(
      "min-h-11 rounded-full border px-4 py-2 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
      selected ? "border-brand bg-brand text-white" : "border-hairline bg-white text-ink hover:border-brand/40 hover:bg-brand-soft/50",
    )}>{children}</button>
  );
}

export function StoryInput({ value, onChange, onSubmit, onBack, busy }: {
  value: StoryDraft;
  onChange: (value: StoryDraft) => void;
  onSubmit: () => void;
  onBack: () => void;
  busy: boolean;
}) {
  const valid = value.narrative.trim().length >= 8 && value.area.trim().length > 0;
  return (
    <section className="mx-auto w-full max-w-2xl rounded-2xl border border-hairline bg-white p-4 shadow-card sm:p-6">
      <button type="button" onClick={onBack} className="mb-3 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-base font-semibold text-ink-soft hover:bg-canvas focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"><ChevronLeft className="h-5 w-5" aria-hidden="true" /> กลับ</button>
      <h1 className="text-2xl font-bold text-ink">เล่าอาการหรือสิ่งที่ต้องการความช่วยเหลือ</h1>
      <p className="mt-2 text-base leading-relaxed text-ink-soft">เล่าครั้งเดียวตามภาษาของคุณ ระบบจะถามเพิ่มเฉพาะข้อมูลที่ทำให้เส้นทางเปลี่ยน</p>

      <label htmlFor="mvp-story" className="mt-5 block text-base font-bold text-ink">เรื่องที่เกิดขึ้น</label>
      <textarea id="mvp-story" value={value.narrative} maxLength={4000} rows={7} onChange={(event) => onChange({ ...value, narrative: event.target.value })} placeholder="เช่น พ่ออายุ 68 ปี เพลียมาก ปัสสาวะบ่อยและกระหายน้ำมา 5 วัน อยู่ลาดพร้าว…" className="mt-2 min-h-44 w-full resize-y rounded-xl border border-hairline bg-canvas px-4 py-3 text-base leading-relaxed text-ink outline-none placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/20" />
      <div className="mt-1 flex items-center justify-between gap-3 text-sm text-ink-muted"><span>ไม่ต้องกรอกเลขบัตรประชาชน</span><span aria-live="polite">{value.narrative.length}/4000</span></div>

      <fieldset className="mt-5">
        <legend className="flex items-center gap-2 text-base font-bold text-ink"><UserRound className="h-5 w-5 text-brand" aria-hidden="true" /> ผู้ป่วยคือใคร</legend>
        <div className="mt-2 flex flex-wrap gap-2">{RELATIONS.map((item) => <Choice key={item.value} selected={value.patientRelation === item.value} onClick={() => onChange({ ...value, patientRelation: item.value })}>{item.label}</Choice>)}</div>
      </fieldset>
      <fieldset className="mt-5">
        <legend className="flex items-center gap-2 text-base font-bold text-ink"><ShieldCheck className="h-5 w-5 text-brand" aria-hidden="true" /> สิทธิ์การรักษาที่ผู้ใช้ยืนยัน</legend>
        <div className="mt-2 flex flex-wrap gap-2">{SCHEMES.map((item) => <Choice key={item.value} selected={value.scheme === item.value} onClick={() => onChange({ ...value, scheme: item.value })}>{item.label}</Choice>)}</div>
      </fieldset>
      <fieldset className="mt-5">
        <legend className="flex items-center gap-2 text-base font-bold text-ink"><MapPin className="h-5 w-5 text-brand" aria-hidden="true" /> พื้นที่ที่สะดวก</legend>
        <div className="mt-2 flex flex-wrap gap-2">{AREAS.map((area) => <Choice key={area} selected={value.area === area} onClick={() => onChange({ ...value, area })}>{area}</Choice>)}</div>
        <label htmlFor="mvp-area" className="mt-3 block text-sm font-semibold text-ink-soft">หรือพิมพ์เขต/อำเภอ</label>
        <input id="mvp-area" value={value.area} maxLength={160} onChange={(event) => onChange({ ...value, area: event.target.value })} className="mt-1 min-h-12 w-full rounded-xl border border-hairline px-4 text-base text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" placeholder="เช่น ลาดพร้าว" />
      </fieldset>
      <button type="button" disabled={!valid || busy} onClick={onSubmit} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-base font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50">{busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}{busy ? "กำลังตรวจความปลอดภัย…" : "เริ่มตรวจเส้นทางดูแล"}</button>
    </section>
  );
}

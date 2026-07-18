"use client";

import { useState } from "react";
import { CircleHelp, Loader2 } from "lucide-react";
import type { ClarificationQuestion } from "@/lib/mvp/contracts";

const REASON_LABEL: Record<ClarificationQuestion["reasonCode"], string> = {
  SAFETY: "เพื่อความปลอดภัย",
  ROUTING: "เพื่อเลือกบริการและสถานที่",
  ELIGIBILITY: "เพื่อตรวจเงื่อนไขสิทธิ์",
  COST: "เพื่ออธิบายค่าใช้จ่ายอย่างถูกต้อง",
};

export function QuestionCard({ question, busy, onAnswer }: {
  question: ClarificationQuestion;
  busy: boolean;
  onAnswer: (value: string) => void;
}) {
  const [freeText, setFreeText] = useState("");
  return (
    <>
      <div className="mt-5 grid gap-2">
        {question.options.filter((option) => option.value !== "unknown").map((option) => (
          <button key={option.value} type="button" disabled={busy} onClick={() => onAnswer(option.value)} className="min-h-12 rounded-xl border border-hairline bg-white px-4 py-3 text-left text-base font-semibold text-ink hover:border-brand/40 hover:bg-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50">{option.label}</button>
        ))}
        <button type="button" disabled={busy} onClick={() => onAnswer("unknown")} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-dashed border-benefit/50 bg-benefit-soft/60 px-4 py-3 text-left text-base font-semibold text-benefit focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-benefit disabled:opacity-50"><CircleHelp className="h-5 w-5 shrink-0" aria-hidden="true" /> ไม่ทราบ / ยังไม่แน่ใจ</button>
      </div>
      {question.allowFreeText && (
        <div className="mt-4 border-t border-hairline pt-4">
          <label htmlFor={`clarification-${question.id}`} className="text-sm font-bold text-ink-soft">หรือพิมพ์คำตอบ</label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input id={`clarification-${question.id}`} value={freeText} maxLength={500} onChange={(event) => setFreeText(event.target.value)} className="min-h-12 min-w-0 flex-1 rounded-xl border border-hairline px-4 text-base text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
            <button type="button" disabled={busy || !freeText.trim()} onClick={() => onAnswer(freeText.trim())} className="min-h-12 rounded-xl bg-brand px-5 text-base font-bold text-white disabled:opacity-50">ตอบข้อนี้</button>
          </div>
        </div>
      )}
    </>
  );
}

export function ClarificationWizard({ question, index, total, busy, onAnswer }: {
  question: ClarificationQuestion;
  index: number;
  total: number;
  busy: boolean;
  onAnswer: (value: string) => void;
}) {
  return (
    <section className="mx-auto w-full max-w-xl rounded-2xl border border-hairline bg-white p-5 shadow-card sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-sm font-bold text-brand">{REASON_LABEL[question.reasonCode]}</p><h1 className="mt-1 text-xl font-bold leading-snug text-ink">{question.question}</h1></div>
        <span className="shrink-0 rounded-full bg-brand-soft px-3 py-1 text-sm font-bold text-brand-dark">{index + 1}/{Math.max(total, index + 1)}</span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-label="ความคืบหน้าการตอบคำถาม" aria-valuemin={1} aria-valuemax={Math.max(total, 1)} aria-valuenow={index + 1}><div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${Math.min(100, ((index + 1) / Math.max(total, 1)) * 100)}%` }} /></div>
      <QuestionCard question={question} busy={busy} onAnswer={onAnswer} />
      {busy && <p className="mt-4 flex items-center gap-2 text-sm text-ink-soft" role="status" aria-live="polite"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> กำลังบันทึกคำตอบและตรวจคำถามถัดไป</p>}
    </section>
  );
}

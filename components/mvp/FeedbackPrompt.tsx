"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, Loader2, MessageSquareText, ShieldCheck } from "lucide-react";
import type { FeedbackOutcome } from "@/lib/mvp/contracts";
import { submitAccessFeedback } from "@/lib/client/mvpApi";
import { cn } from "@/lib/cn";

const OUTCOMES: Array<{ value: FeedbackOutcome; label: string }> = [
  { value: "RECEIVED_AS_PLANNED", label: "ได้รับบริการตามแผน" },
  { value: "RECEIVED_WITH_EXTRA_COST", label: "ได้รับบริการ แต่มีค่าใช้จ่ายเพิ่ม" },
  { value: "RIGHT_NOT_ACCEPTED", label: "สถานที่ไม่รับสิทธิ์" },
  { value: "SERVICE_NOT_AVAILABLE", label: "ไม่มีบริการที่ระบุ" },
  { value: "FACILITY_CLOSED", label: "สถานที่ปิด" },
  { value: "MISSING_DOCUMENTS", label: "เอกสารไม่ครบ" },
  { value: "TRANSFERRED_ELSEWHERE", label: "ถูกส่งต่อไปที่อื่น" },
  { value: "DID_NOT_GO", label: "ยังไม่ได้ไป" },
  { value: "OTHER", label: "อื่น ๆ" },
];

export function FeedbackPrompt({ caseId }: { caseId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [step, setStep] = useState(1);
  const [outcome, setOutcome] = useState<FeedbackOutcome | null>(null);
  const [rightAccepted, setRightAccepted] = useState<boolean | null>(null);
  const [rightKnown, setRightKnown] = useState(false);
  const [discrepancy, setDiscrepancy] = useState("");
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!outcome) return;
    setSending(true);
    setError("");
    try {
      await submitAccessFeedback(caseId, {
        outcome,
        rightAccepted: rightKnown ? rightAccepted : null,
        discrepancy: discrepancy.trim() || null,
      });
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "บันทึกผลไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  }

  if (saved) {
    return (
      <section className="rounded-2xl border border-rights/25 bg-rights-soft p-5" role="status">
        <p className="flex items-center gap-2 text-lg font-bold text-rights"><CheckCircle2 className="h-6 w-6" aria-hidden="true" />ขอบคุณที่ช่วยยืนยันการเข้าถึงบริการ</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">ข้อมูลนี้เป็นข้อมูลตัวอย่างสำหรับการสาธิต และจะไม่แก้ข้อมูลทางการโดยตรง</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-hairline bg-white p-5 shadow-card" aria-labelledby="feedback-heading">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
      >
        <span className="flex items-start gap-3">
          <MessageSquareText className="mt-0.5 h-6 w-6 shrink-0 text-brand" aria-hidden="true" />
          <span>
            <span id="feedback-heading" className="block text-xl font-bold text-ink">ได้รับบริการตามเส้นทางที่แนะนำหรือไม่</span>
            <span className="mt-1 block text-base text-ink-soft">ตอบไม่เกิน 3 ขั้น เพื่อช่วยตรวจว่าข้อมูลใช้ได้จริง</span>
          </span>
        </span>
        <ChevronDown className={cn("h-5 w-5 shrink-0 transition", expanded && "rotate-180")} aria-hidden="true" />
      </button>

      {expanded && (
        <div className="mt-4 border-t border-hairline pt-4">
          <div className="mb-4 flex items-center gap-2" aria-label={`ขั้นตอน ${step} จาก 3`}>
            {[1, 2, 3].map((number) => <span key={number} className={cn("h-2 flex-1 rounded-full", number <= step ? "bg-brand" : "bg-hairline")} />)}
            <span className="ml-1 text-sm font-bold text-ink-muted">{step}/3</span>
          </div>

          {step === 1 && (
            <fieldset>
              <legend className="text-lg font-bold text-ink">1. ผลที่เกิดขึ้น</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {OUTCOMES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={outcome === item.value}
                    onClick={() => setOutcome(item.value)}
                    className={cn(
                      "min-h-12 rounded-xl border px-3 py-2 text-left text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand",
                      outcome === item.value ? "border-brand bg-brand-soft text-brand-dark" : "border-hairline text-ink",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <button type="button" disabled={!outcome} onClick={() => setStep(2)} className="mt-4 min-h-12 w-full rounded-xl bg-brand px-4 text-base font-bold text-white disabled:opacity-50">ถัดไป</button>
            </fieldset>
          )}

          {step === 2 && (
            <fieldset>
              <legend className="text-lg font-bold text-ink">2. ใช้สิทธิ์ได้หรือไม่</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {[
                  { label: "ใช้ได้", value: true, known: true },
                  { label: "ใช้ไม่ได้", value: false, known: true },
                  { label: "ไม่ทราบ / ไม่ได้ใช้", value: null, known: false },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    aria-pressed={rightKnown === item.known && rightAccepted === item.value}
                    onClick={() => { setRightAccepted(item.value); setRightKnown(item.known); }}
                    className={cn(
                      "min-h-12 rounded-xl border px-3 py-2 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand",
                      rightKnown === item.known && rightAccepted === item.value ? "border-brand bg-brand-soft text-brand-dark" : "border-hairline text-ink",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setStep(1)} className="min-h-12 rounded-xl border border-hairline px-4 text-base font-bold text-ink">ย้อนกลับ</button>
                <button type="button" onClick={() => setStep(3)} className="min-h-12 rounded-xl bg-brand px-4 text-base font-bold text-white">ถัดไป</button>
              </div>
            </fieldset>
          )}

          {step === 3 && (
            <div>
              <label htmlFor="feedback-discrepancy" className="text-lg font-bold text-ink">3. มีอะไรไม่ตรงกับข้อมูล</label>
              <textarea
                id="feedback-discrepancy"
                rows={3}
                maxLength={1000}
                value={discrepancy}
                onChange={(event) => setDiscrepancy(event.target.value)}
                placeholder="ไม่มีก็เว้นว่างได้ ห้ามใส่เลขบัตรประชาชน"
                className="mt-3 w-full rounded-xl border border-hairline px-3 py-2 text-base text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
              <p className="mt-2 flex gap-2 text-sm leading-relaxed text-ink-muted"><ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />โหมดสาธิต: บันทึกเป็นข้อมูลตัวอย่าง ไม่ใช่คำรับรองจากผู้ใช้จริง</p>
              {error && <p className="mt-2 rounded-xl bg-safety-soft p-3 text-sm text-safety" role="alert">{error}</p>}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setStep(2)} className="min-h-12 rounded-xl border border-hairline px-4 text-base font-bold text-ink">ย้อนกลับ</button>
                <button type="button" disabled={sending} onClick={() => void submit()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-base font-bold text-white disabled:opacity-50">
                  {sending && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}{sending ? "กำลังบันทึก…" : "ส่งผลการใช้บริการ"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

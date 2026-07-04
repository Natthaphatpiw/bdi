"use client";
// Structured slot-filling stepper (Claude-style): ONE panel, one question at a
// time — tap an answer and it advances to the next; each question has "อื่นๆ…"
// for a typed answer. Conditional questions (show_if) are skipped unless an
// earlier answer makes them relevant. Ends with a review + confirm step.
import { useMemo, useState } from "react";
import { ClipboardList, Check, ChevronLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { TurnQuestion } from "@/lib/types";

const OTHER = "__other__";

export function QuestionPanel({
  questions,
  onSubmit,
  disabled,
  submitted,
}: {
  questions: TurnQuestion[];
  onSubmit: (answers: Record<string, string>, summary: string) => void;
  disabled?: boolean;
  /** answered already (render read-only) */
  submitted?: boolean;
}) {
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [otherText, setOtherText] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [reviewing, setReviewing] = useState(false);

  const valueOf = (q: TurnQuestion): string => {
    const p = picked[q.field];
    if (p === OTHER) return (otherText[q.field] ?? "").trim();
    return p ?? "";
  };

  // Conditional visibility: a show_if question only appears when the referenced
  // answer matches one of any_of.
  const active = useMemo(
    () =>
      questions.filter((q) => {
        if (!q.show_if) return true;
        const ref = questions.find((x) => x.field === q.show_if!.field);
        const answer = ref ? valueOf(ref) : "";
        if (!answer) return false; // referenced question not answered yet → hide
        return q.show_if.any_of.some((v) => answer.includes(v) || v.includes(answer));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questions, picked, otherText]
  );

  const total = active.length;
  const idx = Math.min(step, total - 1);
  const current = active[idx];
  const complete = active.every((q) => valueOf(q).length > 0);

  function advance() {
    if (idx + 1 < total) setStep(idx + 1);
    else setReviewing(true);
  }

  function pick(q: TurnQuestion, opt: string) {
    setPicked((p) => ({ ...p, [q.field]: opt }));
    if (opt !== OTHER) setTimeout(advance, 160); // brief highlight, then advance
  }

  function submit() {
    if (!complete || disabled) return;
    const answers: Record<string, string> = {};
    for (const q of active) answers[q.field] = valueOf(q); // active only — skipped conditionals dropped
    const summary = active.map((q) => `${q.label}: ${valueOf(q)}`).join(" · ");
    onSubmit(answers, summary);
  }

  // ---- submitted (read-only) ------------------------------------------------
  if (submitted) {
    return (
      <div className="card-enter rounded-card border border-hairline border-l-4 border-l-brand bg-surface p-4 opacity-70 shadow-card">
        <div className="flex items-center gap-2 text-sm text-ink-soft">
          <Check className="h-4 w-4 text-brand" aria-hidden="true" />
          ตอบคำถามคัดกรองครบแล้ว
        </div>
      </div>
    );
  }

  return (
    <div className="card-enter rounded-card border border-hairline border-l-4 border-l-brand bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
        <h2 className="flex-1 text-sm font-semibold text-ink">
          ขอข้อมูลเพิ่ม เพื่อคัดกรองและจับคู่สิทธิ์ให้ตรงที่สุด
        </h2>
        {!reviewing && (
          <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand-dark">
            {idx + 1}/{total}
          </span>
        )}
      </div>

      {/* progress bar */}
      {!reviewing && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-canvas">
          <div
            className="h-full rounded-full bg-brand transition-all duration-300"
            style={{ width: `${((idx + (valueOf(current ?? questions[0]) ? 1 : 0)) / Math.max(total, 1)) * 100}%` }}
          />
        </div>
      )}

      {/* ---- review step ---- */}
      {reviewing ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs text-ink-muted">ตรวจคำตอบก่อนส่ง — แตะเพื่อแก้</p>
          {active.map((q, i) => (
            <button
              key={q.field}
              type="button"
              disabled={disabled}
              onClick={() => {
                setReviewing(false);
                setStep(i);
              }}
              className="flex items-center justify-between gap-2 rounded-btn border border-hairline px-3 py-2 text-left text-sm transition-colors hover:border-brand/50"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-ink-muted">{q.label}</span>
                <span className="font-medium text-ink">{valueOf(q) || "—"}</span>
              </span>
              <Pencil className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
            </button>
          ))}
          <Button size="lg" fullWidth className="mt-1" onClick={submit} disabled={!complete || disabled}>
            ยืนยันคำตอบ
          </Button>
        </div>
      ) : current ? (
        /* ---- single-question step ---- */
        <div key={current.field} className="card-enter mt-3 flex flex-col gap-2">
          <p className="text-base font-medium text-ink">{current.label}</p>
          {current.question && <p className="text-xs text-ink-muted">{current.question}</p>}

          <div className="mt-1 flex flex-wrap gap-2">
            {current.options.map((opt) => {
              const selected = picked[current.field] === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(current, opt)}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-btn border px-4 py-2 text-sm transition-colors",
                    selected
                      ? "border-brand bg-brand text-white"
                      : "border-hairline bg-surface text-ink hover:border-brand/50 active:bg-canvas"
                  )}
                >
                  {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  {opt}
                </button>
              );
            })}
            {current.allow_other !== false && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => setPicked((p) => ({ ...p, [current.field]: OTHER }))}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-btn border px-4 py-2 text-sm transition-colors",
                  picked[current.field] === OTHER
                    ? "border-brand bg-brand-soft text-brand-dark"
                    : "border-dashed border-hairline bg-surface text-ink-soft hover:border-brand/50"
                )}
              >
                อื่นๆ…
              </button>
            )}
          </div>

          {picked[current.field] === OTHER && (
            <div className="mt-1 flex gap-2">
              <input
                autoFocus
                type="text"
                value={otherText[current.field] ?? ""}
                disabled={disabled}
                placeholder={current.other_placeholder ?? "พิมพ์คำตอบ"}
                onChange={(e) => setOtherText((t) => ({ ...t, [current.field]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && valueOf(current) && advance()}
                className="min-w-0 flex-1 rounded-btn border border-hairline px-3 py-2 text-base text-ink focus:border-brand focus:outline-none"
              />
              <Button size="md" onClick={advance} disabled={!valueOf(current) || disabled}>
                ถัดไป
              </Button>
            </div>
          )}

          {idx > 0 && (
            <button
              type="button"
              onClick={() => setStep(idx - 1)}
              className="mt-1 inline-flex items-center gap-1 self-start text-xs text-ink-muted hover:text-ink"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              ข้อก่อนหน้า
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

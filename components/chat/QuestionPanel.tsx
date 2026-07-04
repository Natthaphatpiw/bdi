"use client";
// Structured slot-filling panel (Claude-style): every question is answered by
// tapping an option; each has "อื่นๆ…" for a typed answer. The deep analysis
// only runs after the user confirms all answers.
import { useState } from "react";
import { ClipboardList, Check } from "lucide-react";
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

  const valueOf = (q: TurnQuestion): string => {
    const p = picked[q.field];
    if (p === OTHER) return (otherText[q.field] ?? "").trim();
    return p ?? "";
  };
  const complete = questions.every((q) => valueOf(q).length > 0);

  function submit() {
    if (!complete || disabled) return;
    const answers: Record<string, string> = {};
    for (const q of questions) answers[q.field] = valueOf(q);
    const summary = questions.map((q) => `${q.label}: ${valueOf(q)}`).join(" · ");
    onSubmit(answers, summary);
  }

  return (
    <div
      className={cn(
        "card-enter rounded-card border border-hairline border-l-4 border-l-brand bg-surface p-4 shadow-card",
        submitted && "opacity-70"
      )}
    >
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
        <h2 className="font-semibold text-ink">ขอข้อมูลเพิ่มอีกนิด เพื่อคัดกรองและจับคู่สิทธิ์ให้ตรงที่สุด</h2>
      </div>

      <div className="mt-3 flex flex-col gap-4">
        {questions.map((q) => {
          const isOther = picked[q.field] === OTHER;
          return (
            <div key={q.field} className="flex flex-col gap-1.5">
              <p className="text-sm font-medium text-ink">{q.label}</p>
              <p className="text-xs text-ink-muted">{q.question}</p>
              <div className="flex flex-wrap gap-2">
                {q.options.map((opt) => {
                  const selected = picked[q.field] === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      disabled={disabled || submitted}
                      onClick={() => setPicked((p) => ({ ...p, [q.field]: opt }))}
                      className={cn(
                        "inline-flex min-h-10 items-center gap-1.5 rounded-btn border px-3.5 py-2 text-sm transition-colors",
                        selected
                          ? "border-brand bg-brand text-white"
                          : "border-hairline bg-surface text-ink hover:border-brand/50"
                      )}
                    >
                      {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                      {opt}
                    </button>
                  );
                })}
                {q.allow_other !== false && (
                  <button
                    type="button"
                    disabled={disabled || submitted}
                    onClick={() => setPicked((p) => ({ ...p, [q.field]: OTHER }))}
                    className={cn(
                      "inline-flex min-h-10 items-center rounded-btn border px-3.5 py-2 text-sm transition-colors",
                      isOther
                        ? "border-brand bg-brand-soft text-brand-dark"
                        : "border-dashed border-hairline bg-surface text-ink-soft hover:border-brand/50"
                    )}
                  >
                    อื่นๆ…
                  </button>
                )}
              </div>
              {isOther && (
                <input
                  autoFocus
                  type="text"
                  value={otherText[q.field] ?? ""}
                  disabled={disabled || submitted}
                  placeholder={q.other_placeholder ?? "พิมพ์คำตอบ"}
                  onChange={(e) => setOtherText((t) => ({ ...t, [q.field]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  className="mt-1 rounded-btn border border-hairline px-3 py-2 text-base text-ink focus:border-brand focus:outline-none"
                />
              )}
            </div>
          );
        })}
      </div>

      {!submitted && (
        <Button size="lg" fullWidth className="mt-4" onClick={submit} disabled={!complete || disabled}>
          ยืนยันคำตอบ
        </Button>
      )}
    </div>
  );
}

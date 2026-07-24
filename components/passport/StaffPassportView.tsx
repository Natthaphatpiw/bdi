"use client";
// มุมมองเจ้าหน้าที่ (QR → /p/[token]) — read-only เท่านั้น: ไม่มีปุ่มแก้ไข
// เนื้อหา = PassportCard ใบเดียวกับกระดาษ (no data amplification โดยโครงสร้าง)
// เพิ่มได้เฉพาะ "ดูประกาศอ้างอิง" แบบกางลิงก์ + ปุ่มพิมพ์
import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Printer } from "lucide-react";
import { PassportCard } from "./PassportCard";
import { Button } from "@/components/ui/Button";
import type { PassportData } from "@/lib/types";

export function StaffPassportView({
  passport,
  sampleFooter = false,
  samplePrintOnly = false,
}: {
  passport: PassportData;
  sampleFooter?: boolean;
  samplePrintOnly?: boolean;
}) {
  const [showSources, setShowSources] = useState(false);
  const citations = passport.citations ?? [];

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-3 px-4 py-5">
      <header className="no-print">
        <h1 className="text-lg font-bold text-ink">เอกสารประกอบการให้บริการ</h1>
        <p className="text-sm text-ink-soft">
          ผู้ป่วยเป็นผู้แชร์เอกสารนี้ให้คุณ — อ่านอย่างเดียว ไม่สามารถแก้ไขได้
        </p>
      </header>

      <div className="passport-print print-area">
        <PassportCard data={passport} sampleFooter={sampleFooter} samplePrintOnly={samplePrintOnly} />
      </div>

      {citations.length > 0 && (
        <section className="no-print rounded-card border border-hairline bg-surface p-3 shadow-card">
          <button
            type="button"
            className="flex w-full items-center justify-between text-sm font-semibold text-ink"
            onClick={() => setShowSources((s) => !s)}
            aria-expanded={showSources}
          >
            ดูประกาศอ้างอิง ({citations.length})
            {showSources ? (
              <ChevronUp className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden />
            )}
          </button>
          {showSources && (
            <ul className="mt-2 space-y-2">
              {citations.map((c, i) => (
                <li key={i} className="text-sm">
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-start gap-1 text-brand underline"
                  >
                    <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    {c.title}
                  </a>
                  {c.publisher && <p className="text-xs text-ink-muted">{c.publisher}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Button
        variant="outline"
        fullWidth
        className="no-print"
        leftIcon={<Printer className="h-4 w-4" aria-hidden />}
        onClick={() => window.print()}
      >
        พิมพ์ / บันทึก PDF
      </Button>
    </div>
  );
}

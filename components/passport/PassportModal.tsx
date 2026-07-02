"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Download, RefreshCw, IdCard } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { PassportCard } from "./PassportCard";
import { generatePassport } from "@/lib/client/api";
import { useToast } from "@/store/toast";
import type { PassportData, PassportMissingField } from "@/lib/types";

type Phase = "loading" | "need_info" | "preview" | "error";

export function PassportModal({
  open,
  onClose,
  sessionId,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string | null;
}) {
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>("loading");
  const [missing, setMissing] = useState<PassportMissingField[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [passport, setPassport] = useState<PassportData | null>(null);
  const [errMsg, setErrMsg] = useState("");
  const [downloading, setDownloading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const run = useCallback(
    async (extra?: Record<string, string>) => {
      if (!sessionId) return;
      setPhase("loading");
      try {
        const res = await generatePassport(sessionId, extra);
        if (res.status === "ready" && res.passport) {
          setPassport(res.passport);
          setPhase("preview");
        } else {
          setMissing(res.missing ?? []);
          setPhase("need_info");
        }
      } catch (e) {
        setErrMsg(e instanceof Error ? e.message : "สร้างไม่สำเร็จ");
        setPhase("error");
      }
    },
    [sessionId]
  );

  // kick off once when opened; reset when closed
  useEffect(() => {
    if (open && !startedRef.current) {
      startedRef.current = true;
      setAnswers({});
      void run();
    } else if (!open) {
      startedRef.current = false;
      setPhase("loading");
      setPassport(null);
      setMissing([]);
      setAnswers({});
      setErrMsg("");
    }
  }, [open, run]);

  function submitInfo() {
    const merged = { ...answers };
    // ensure every asked field has a value before resubmitting
    const blank = missing.find((m) => !merged[m.field]?.trim());
    if (blank) {
      toast(`กรุณากรอก: ${blank.label}`, "error");
      return;
    }
    void run(merged);
  }

  async function download() {
    if (!cardRef.current || !passport) return;
    setDownloading(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#ffffff",
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `case-passport-${passport.ref_code}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast("บันทึกรูป Case Passport แล้ว", "success");
    } catch (e) {
      console.error("[passport] download:", (e as Error).message);
      toast("บันทึกรูปไม่สำเร็จ ลองใหม่อีกครั้ง", "error");
    } finally {
      setDownloading(false);
    }
  }

  const title =
    phase === "preview" ? "Case Passport พร้อมแล้ว" : phase === "need_info" ? "ขอข้อมูลเพิ่มอีกนิด" : "Case Passport";

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={title}>
      {phase === "loading" && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand" aria-hidden="true" />
          <p className="text-sm text-ink-soft">กำลังสร้าง Case Passport จากบทสนทนา…</p>
        </div>
      )}

      {phase === "error" && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-ink-soft">{errMsg}</p>
          <Button onClick={() => void run(answers)}>ลองใหม่</Button>
        </div>
      )}

      {phase === "need_info" && (
        <div className="flex flex-col gap-4 py-1">
          <p className="text-sm text-ink-soft">
            เพื่อสร้างใบสรุปที่สมบูรณ์ ขอข้อมูลเพิ่มเติมดังนี้
          </p>
          {missing.map((m) => (
            <div key={m.field} className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">{m.label}</label>
              <p className="text-xs text-ink-muted">{m.question}</p>
              {m.type === "select" && m.options?.length ? (
                <div className="flex flex-wrap gap-2">
                  {m.options.map((opt) => (
                    <Chip
                      key={opt}
                      selected={answers[m.field] === opt}
                      onClick={() => setAnswers((a) => ({ ...a, [m.field]: opt }))}
                    >
                      {opt}
                    </Chip>
                  ))}
                </div>
              ) : (
                <input
                  type={m.type === "number" ? "number" : "text"}
                  value={answers[m.field] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [m.field]: e.target.value }))}
                  className="rounded-btn border border-hairline px-3 py-2 text-base text-ink focus:border-brand focus:outline-none"
                  placeholder={m.label}
                />
              )}
            </div>
          ))}
          <Button size="lg" fullWidth onClick={submitInfo}>
            ยืนยันและสร้าง
          </Button>
        </div>
      )}

      {phase === "preview" && passport && (
        <div className="flex flex-col gap-3 py-1">
          <PassportCard ref={cardRef} data={passport} />
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="lg"
              onClick={() => void run(answers)}
              leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
            >
              สร้างใหม่
            </Button>
            <Button
              size="lg"
              fullWidth
              onClick={download}
              disabled={downloading}
              leftIcon={
                downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="h-4 w-4" aria-hidden="true" />
                )
              }
            >
              {downloading ? "กำลังบันทึก…" : "ดาวน์โหลดรูป"}
            </Button>
          </div>
          <p className="text-center text-xs text-ink-muted">
            บันทึกรูปไว้ในเครื่อง แล้วนำไปยื่นที่จุดคัดกรองของสถานพยาบาลได้เลย
          </p>
        </div>
      )}
    </Sheet>
  );
}

export const PassportTriggerIcon = IdCard;

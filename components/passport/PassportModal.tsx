"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Download, RefreshCw, IdCard, MapPin, Printer, QrCode, X } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { PassportCard } from "./PassportCard";
import {
  generatePassport,
  createPassportShareToken,
  revokePassportShareToken,
  ApiClientError,
} from "@/lib/client/api";
import { useShareQr } from "@/components/mvp/passport/useShareQr";
import { AUDIENCE_LABELS } from "@/lib/passportVariants";
import { useToast } from "@/store/toast";
import type { PassportAudience, PassportData, PassportMissingField } from "@/lib/types";

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
  const [saveImageUrl, setSaveImageUrl] = useState<string | null>(null);
  const [audience, setAudience] = useState<PassportAudience | undefined>(undefined);
  const [share, setShare] = useState<{ token_id: string; url: string; expires_at: string } | null>(null);
  const [sharing, setSharing] = useState(false);
  const { dataUrl: qrDataUrl } = useShareQr(share ? `${typeof window !== "undefined" ? window.location.origin : ""}${share.url}` : null);
  const cardRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const run = useCallback(
    async (extra?: Record<string, string>, nextAudience?: PassportAudience) => {
      if (!sessionId) return;
      setPhase("loading");
      setShare(null);
      try {
        const res = await generatePassport(sessionId, extra, nextAudience);
        if (res.status === "ready" && res.passport) {
          setPassport(res.passport);
          setAudience(res.passport.audience);
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

  async function shareToStaff() {
    if (!passport || sharing) return;
    setSharing(true);
    try {
      const res = await createPassportShareToken(sessionId, passport, audience);
      setShare({ token_id: res.token_id, url: res.url, expires_at: res.expires_at });
    } catch (e) {
      toast(e instanceof ApiClientError ? e.message : "สร้าง QR ไม่สำเร็จ", "error");
    } finally {
      setSharing(false);
    }
  }

  async function revokeShare() {
    if (!share) return;
    try {
      await revokePassportShareToken(share.token_id);
      setShare(null);
      toast("ยกเลิกลิงก์เจ้าหน้าที่แล้ว", "success");
    } catch (e) {
      toast(e instanceof ApiClientError ? e.message : "ยกเลิกไม่สำเร็จ", "error");
    }
  }

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
      setSaveImageUrl(null);
      setAudience(undefined);
      setShare(null);
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

      // 1) Web Share API with a file — on iOS/Android (incl. LINE in-app
      // browser) this opens the native sheet where "บันทึกรูปภาพ" saves
      // straight to the photo gallery. <a download> does NOT work there:
      // LINE's WebView ignores it and iOS Safari saves to Files, not Photos.
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `case-passport-${passport.ref_code}.png`, {
        type: "image/png",
      });
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
        share?: (data: ShareData) => Promise<void>;
      };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: "Case Passport" });
          toast("เลือก 'บันทึกรูปภาพ' เพื่อเก็บลงเครื่อง", "success");
          return;
        } catch (e) {
          if ((e as Error).name === "AbortError") return; // user closed the sheet
          // otherwise fall through to the next strategy
        }
      }

      // 2) Touch device without file-share → full-screen preview the user can
      // long-press to save (works in LINE WebView and mobile Safari).
      if (window.matchMedia("(pointer: coarse)").matches) {
        setSaveImageUrl(dataUrl);
        return;
      }

      // 3) Desktop — regular download.
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `case-passport-${passport.ref_code}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
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
          {/* "เตรียมไปที่ไหน" — pharmacy หายไปเองเมื่อมี red flag (server เป็นผู้คุมรายการ) */}
          {passport.available_audiences && passport.available_audiences.length > 1 && (
            <div className="no-print">
              <label
                htmlFor="passport-audience"
                className="mb-1 flex items-center gap-1.5 text-sm font-medium text-ink"
              >
                <MapPin className="h-4 w-4 text-brand" aria-hidden />
                เตรียมไปที่ไหน
              </label>
              <select
                id="passport-audience"
                value={audience ?? passport.audience ?? "general"}
                onChange={(e) => {
                  const next = e.target.value as PassportAudience;
                  setAudience(next);
                  void run(answers, next);
                }}
                className="min-h-11 w-full rounded-btn border border-hairline bg-surface px-3 text-base text-ink focus:border-brand focus:outline-none"
              >
                {passport.available_audiences.map((a) => (
                  <option key={a} value={a}>
                    {AUDIENCE_LABELS[a]}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="print-area">
            <PassportCard ref={cardRef} data={passport} />
          </div>

          {share && (
            <div className="no-print rounded-card border border-hairline bg-surface p-3 text-center shadow-card">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt="QR สำหรับเจ้าหน้าที่" className="mx-auto h-44 w-44" />
              ) : (
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-brand" aria-hidden />
              )}
              <p className="mt-1 text-xs text-ink-soft">
                ให้เจ้าหน้าที่สแกนเพื่อเปิดเอกสารฉบับอ่านอย่างเดียว · หมดอายุอัตโนมัติใน 30 วัน
              </p>
              <button
                type="button"
                onClick={() => void revokeShare()}
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-safety underline"
              >
                <X className="h-3 w-3" aria-hidden />
                ยกเลิกลิงก์นี้
              </button>
            </div>
          )}

          <div className="no-print grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="lg"
              onClick={() => void shareToStaff()}
              disabled={sharing}
              leftIcon={
                sharing ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <QrCode className="h-4 w-4" aria-hidden />
                )
              }
            >
              QR เจ้าหน้าที่
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => window.print()}
              leftIcon={<Printer className="h-4 w-4" aria-hidden />}
            >
              พิมพ์ / PDF
            </Button>
          </div>

          <div className="no-print flex gap-2">
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
          <p className="no-print text-center text-xs text-ink-muted">
            บันทึกไว้เพื่อเตรียมตัวและช่วยเล่าเรื่องให้บุคลากรทางการแพทย์ เอกสารนี้ไม่ใช่ใบส่งตัวหรือใบรับรองแพทย์
          </p>
        </div>
      )}

      {/* long-press-to-save overlay for WebViews that block file share/download */}
      {saveImageUrl && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-black/85 p-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={saveImageUrl}
            alt="Case Passport"
            className="max-h-[70vh] w-auto max-w-full rounded-lg bg-white"
          />
          <p className="text-center text-sm font-medium text-white">
            แตะค้างที่รูป แล้วเลือก &quot;บันทึกรูปภาพ / เพิ่มลงในรูปภาพ&quot;
          </p>
          <Button variant="outline" size="lg" onClick={() => setSaveImageUrl(null)}>
            ปิด
          </Button>
        </div>
      )}
    </Sheet>
  );
}

export const PassportTriggerIcon = IdCard;

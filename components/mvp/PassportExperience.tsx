"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Copy, Link2, Loader2, Printer, RefreshCw, Trash2 } from "lucide-react";
import type { CasePassportSnapshot } from "@/lib/mvp/contracts";
import { Sheet } from "@/components/ui/Sheet";
import {
  createPassport,
  createPassportShare,
  getSharedPassport,
  revokePassportShare,
} from "@/lib/client/mvpApi";
import { cn } from "@/lib/cn";
import { PassportDocument, ShareQrImage, thaiDate } from "@/components/mvp/passport/PassportDocument";
import { useShareQr } from "@/components/mvp/passport/useShareQr";

export function PassportExperience({
  open,
  onOpenChange,
  caseId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [passportId, setPassportId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<CasePassportSnapshot | null>(null);
  const [shareConsent, setShareConsent] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [share, setShare] = useState<{ url: string; expiresAt: string } | null>(null);
  const autoGenerationStarted = useRef(false);
  const shareQr = useShareQr(share?.url ?? null);

  const generate = useCallback(async (allowShare = false) => {
    setLoading(true);
    setError("");
    try {
      const response = await createPassport(caseId, allowShare);
      setPassportId(response.passport.id);
      setSnapshot(response.passport.snapshot);
      setShare(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "สร้าง Case Passport ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    if (!open) {
      autoGenerationStarted.current = false;
      return;
    }
    if (!snapshot && !loading && !autoGenerationStarted.current) {
      autoGenerationStarted.current = true;
      void generate(false);
    }
  }, [generate, loading, open, snapshot]);

  async function createShare() {
    if (!shareConsent) return;
    setShareBusy(true);
    setError("");
    try {
      const shareable = await createPassport(caseId, true);
      setPassportId(shareable.passport.id);
      setSnapshot(shareable.passport.snapshot);
      const response = await createPassportShare(shareable.passport.id);
      const absoluteUrl = response.url.startsWith("http") ? response.url : `${window.location.origin}${response.url}`;
      setShare({ url: absoluteUrl, expiresAt: response.expiresAt });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "สร้างลิงก์ไม่สำเร็จ");
    } finally {
      setShareBusy(false);
    }
  }

  async function revokeShare() {
    if (!passportId) return;
    setShareBusy(true);
    try {
      await revokePassportShare(passportId);
      setShare(null);
      setShareConsent(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เพิกถอนลิงก์ไม่สำเร็จ");
    } finally {
      setShareBusy(false);
    }
  }

  async function copyShare() {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share.url);
    } catch {
      setError("คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกข้อความลิงก์แล้วคัดลอก");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Case Passport">
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 11mm; }
          body * { visibility: hidden !important; }
          .mvp-passport-print, .mvp-passport-print * { visibility: visible !important; }
          .mvp-passport-print { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; }
          .no-print { display: none !important; }
          .avoid-break { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
      {loading && !snapshot && (
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-brand" aria-hidden="true" />
          <p className="text-base font-semibold text-ink">กำลังจัดข้อมูลสรุปก่อนเข้ารับบริการ</p>
          <p className="text-sm text-ink-muted">ตรวจข้อมูลความปลอดภัย สิทธิ์ เส้นทาง และหลักฐาน</p>
        </div>
      )}
      {error && (
        <div className="mb-3 rounded-xl bg-safety-soft p-3 text-sm text-safety" role="alert">
          <p>{error}</p>
          {!snapshot && <button type="button" onClick={() => void generate(false)} className="mt-2 min-h-11 rounded-xl border border-safety/30 bg-white px-4 font-bold text-safety">ลองสร้างอีกครั้ง</button>}
        </div>
      )}
      {snapshot && (
        <div className="space-y-4">
          <PassportDocument snapshot={snapshot} shareQr={share && shareQr.dataUrl ? { dataUrl: shareQr.dataUrl, expiresAt: share.expiresAt } : null} />
          <div className="no-print grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => void generate(false)} disabled={loading} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-hairline px-4 text-base font-bold text-ink disabled:opacity-50"><RefreshCw className={cn("h-5 w-5", loading && "animate-spin")} aria-hidden="true" />สร้างเวอร์ชันใหม่</button>
            <button type="button" onClick={() => window.print()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-base font-bold text-white"><Printer className="h-5 w-5" aria-hidden="true" />พิมพ์ / บันทึก PDF</button>
          </div>
          <section className="no-print rounded-2xl border border-hairline p-4" aria-labelledby="passport-share-heading">
            <h2 id="passport-share-heading" className="flex items-center gap-2 text-lg font-bold text-ink"><Link2 className="h-5 w-5 text-brand" aria-hidden="true" />แชร์ข้อมูลชั่วคราว</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">ลิงก์หมดอายุภายใน 72 ชั่วโมงและเพิกถอนได้ ระบบแชร์เฉพาะข้อมูลตามขอบเขตที่อนุญาต</p>
            {!share ? (
              <>
                <label className="mt-3 flex min-h-12 cursor-pointer items-start gap-3 rounded-xl bg-canvas p-3">
                  <input type="checkbox" checked={shareConsent} onChange={(event) => setShareConsent(event.target.checked)} className="mt-0.5 h-6 w-6 shrink-0 rounded border-hairline text-brand focus:ring-brand" />
                  <span className="text-base text-ink">ฉันยินยอมให้สร้างลิงก์ชั่วคราวสำหรับข้อมูลสรุปนี้</span>
                </label>
                <button type="button" disabled={!shareConsent || shareBusy} onClick={() => void createShare()} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-base font-bold text-white disabled:opacity-50">{shareBusy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}สร้างลิงก์แชร์</button>
              </>
            ) : (
              <div className="mt-3 rounded-xl bg-rights-soft p-3">
                <p className="font-bold text-rights">ลิงก์พร้อมใช้ถึง {thaiDate(share.expiresAt)}</p>
                <p className="mt-2 break-all rounded-lg bg-white p-2 text-sm text-ink">{share.url}</p>
                <div className="mt-3 rounded-xl bg-white p-3">
                  {shareQr.dataUrl ? <ShareQrImage qr={{ dataUrl: shareQr.dataUrl, expiresAt: share.expiresAt }} compact /> : <div className="flex min-h-32 items-center justify-center gap-2 text-sm font-semibold text-ink-muted" role="status">{shareQr.loading && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}{shareQr.loading ? "กำลังสร้าง QR…" : "ไม่สามารถสร้าง QR ได้ โปรดใช้ลิงก์ด้านบน"}</div>}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => void copyShare()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rights/30 bg-white px-3 font-bold text-rights"><Copy className="h-4 w-4" aria-hidden="true" />คัดลอกลิงก์</button>
                  <button type="button" disabled={shareBusy} onClick={() => void revokeShare()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-safety/30 bg-white px-3 font-bold text-safety"><Trash2 className="h-4 w-4" aria-hidden="true" />เพิกถอน</button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </Sheet>
  );
}

export function SharedPassportView({ token }: { token: string }) {
  const [snapshot, setSnapshot] = useState<CasePassportSnapshot | null>(null);
  const [error, setError] = useState("");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const shareQr = useShareQr(shareUrl);

  useEffect(() => {
    setShareUrl(window.location.href);
    let active = true;
    getSharedPassport(token)
      .then((response) => { if (active) setSnapshot(response.passport.snapshot); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "เปิดข้อมูลสรุปไม่สำเร็จ"); });
    return () => { active = false; };
  }, [token]);

  if (error) return <main className="grid min-h-screen place-items-center bg-canvas p-4"><section className="w-full max-w-md rounded-2xl border border-hairline bg-white p-6 text-center shadow-card"><AlertTriangle className="mx-auto h-9 w-9 text-safety" aria-hidden="true" /><h1 className="mt-3 text-xl font-bold text-ink">ไม่สามารถเปิด Case Passport นี้</h1><p className="mt-2 text-base text-ink-soft">{error}</p><p className="mt-3 text-sm text-ink-muted">ลิงก์อาจหมดอายุหรือถูกเพิกถอนแล้ว</p></section></main>;
  if (!snapshot) return <main className="grid min-h-screen place-items-center bg-canvas p-4" role="status"><div className="flex flex-col items-center gap-3"><Loader2 className="h-8 w-8 animate-spin text-brand" aria-hidden="true" /><p className="text-base font-semibold text-ink">กำลังเปิดข้อมูลสรุปที่ได้รับอนุญาต…</p></div></main>;
  return (
    <main className="min-h-screen bg-canvas px-3 py-5 sm:px-6">
      <style jsx global>{`@media print { @page { size: A4; margin: 11mm; } body { background: white !important; } .no-print { display: none !important; } .avoid-break { break-inside: avoid; page-break-inside: avoid; } }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[794px] items-center justify-between gap-3 rounded-xl border border-hairline bg-white p-3">
        <p className="text-sm text-ink-soft">ลิงก์นี้ไม่ถูกจัดทำดัชนีและไม่เก็บในแคชสาธารณะ</p>
        <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-brand px-4 font-bold text-white"><Printer className="h-4 w-4" aria-hidden="true" />พิมพ์</button>
      </div>
      <PassportDocument snapshot={snapshot} shared shareQr={shareQr.dataUrl ? { dataUrl: shareQr.dataUrl } : null} />
    </main>
  );
}

"use client";
// DocumentsScreen — consent-gated PDF upload + processing status + ask-from-doc.
// Polls documents that are still processing until they become ready/failed.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Upload, Trash2, ShieldCheck, MessageCircle } from "lucide-react";
import type { Consent, DocumentRecord } from "@/lib/types";
import {
  getConsents,
  postConsent,
  listDocuments,
  uploadDocument,
  getDocument,
  deleteDocument,
  ApiClientError,
} from "@/lib/client/api";
import { useToast } from "@/store/toast";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

interface Props {
  surface: "web" | "line";
  basePath: string;
}

function errMsg(e: unknown, fallback: string): string {
  return e instanceof ApiClientError ? e.message : fallback;
}

function StatusBadge({ status }: { status: DocumentRecord["status"] }) {
  switch (status) {
    case "ready":
      return <Badge tone="rights">พร้อม</Badge>;
    case "failed":
      return <Badge tone="safety">ล้มเหลว</Badge>;
    default:
      return <Badge tone="benefit">กำลังประมวลผล</Badge>;
  }
}

export function DocumentsScreen({ basePath }: Props) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [docConsent, setDocConsent] = useState<boolean | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const refreshConsents = useCallback(async () => {
    try {
      const res = await getConsents();
      const doc = res.consents.find((c: Consent) => c.scope === "doc");
      setDocConsent(doc?.granted ?? false);
    } catch (e) {
      toast(errMsg(e, "โหลดการยินยอมไม่สำเร็จ"), "error");
      setDocConsent(false);
    }
  }, [toast]);

  const refreshDocs = useCallback(async () => {
    try {
      const res = await listDocuments();
      setDocs(res.documents);
    } catch (e) {
      toast(errMsg(e, "โหลดรายการเอกสารไม่สำเร็จ"), "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refreshConsents();
    void refreshDocs();
  }, [refreshConsents, refreshDocs]);

  // Poll documents that are still processing.
  useEffect(() => {
    const pending = docs.filter((d) => d.status === "uploaded" || d.status === "processing");
    if (pending.length === 0) return;
    const timer = setInterval(async () => {
      try {
        const updated = await Promise.all(pending.map((d) => getDocument(d.document_id)));
        setDocs((prev) =>
          prev.map((d) => updated.find((u) => u.document_id === d.document_id) ?? d)
        );
      } catch {
        /* keep polling silently; transient errors are fine */
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [docs]);

  async function grantConsent() {
    setConsentBusy(true);
    try {
      await postConsent({ scope: "doc", granted: true });
      await refreshConsents();
      toast("ยินยอมแล้ว สามารถอัปโหลดเอกสารได้", "success");
    } catch (e) {
      toast(errMsg(e, "บันทึกการยินยอมไม่สำเร็จ"), "error");
    } finally {
      setConsentBusy(false);
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setUploading(true);
    try {
      const rec = await uploadDocument(file);
      setDocs((prev) => [rec, ...prev.filter((d) => d.document_id !== rec.document_id)]);
      toast("อัปโหลดสำเร็จ กำลังประมวลผล…", "success");
    } catch (err) {
      toast(errMsg(err, "อัปโหลดไม่สำเร็จ"), "error");
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(id: string) {
    try {
      await deleteDocument(id);
      setDocs((prev) => prev.filter((d) => d.document_id !== id));
      toast("ลบเอกสารแล้ว", "success");
    } catch (e) {
      toast(errMsg(e, "ลบเอกสารไม่สำเร็จ"), "error");
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <FileText className="text-brand" size={22} aria-hidden />
        <h1 className="text-lg font-semibold text-ink">เอกสาร / กรมธรรม์</h1>
      </header>

      {docConsent === false && (
        <section className="rounded-card bg-brand-soft border border-brand p-4 space-y-3">
          <div className="flex items-start gap-2">
            <ShieldCheck className="text-brand-dark shrink-0 mt-0.5" size={20} aria-hidden />
            <p className="text-sm text-ink-soft">
              เพื่ออ่านและตอบคำถามจากเอกสารของคุณ เราต้องขออนุญาตประมวลผลไฟล์ที่อัปโหลด
              ข้อมูลจะถูกเก็บแบบเข้ารหัสและลบได้ทุกเมื่อ
            </p>
          </div>
          <Button
            variant="primary"
            fullWidth
            onClick={grantConsent}
            disabled={consentBusy}
            leftIcon={<ShieldCheck size={18} aria-hidden />}
          >
            {consentBusy ? "กำลังบันทึก…" : "ยินยอมให้ประมวลผลเอกสาร"}
          </Button>
        </section>
      )}

      {docConsent === true && (
        <section className="rounded-card bg-surface shadow-card p-4 space-y-3">
          <p className="text-sm text-ink-soft">
            อัปโหลดไฟล์ PDF เช่น กรมธรรม์ประกัน เพื่อให้ผู้ช่วยตอบคำถามจากเอกสารได้
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={onPickFile}
          />
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            leftIcon={<Upload size={18} aria-hidden />}
          >
            {uploading ? "กำลังอัปโหลด…" : "เลือกไฟล์ PDF"}
          </Button>
        </section>
      )}

      <section className="space-y-3">
        {loading ? (
          <>
            <Skeleton variant="card" />
            <Skeleton variant="card" />
          </>
        ) : docs.length === 0 ? (
          <EmptyState
            icon={<FileText size={32} className="text-ink-muted" aria-hidden />}
            title="ยังไม่มีเอกสาร"
            body={
              docConsent
                ? "อัปโหลดไฟล์ PDF เพื่อเริ่มถามคำถามจากเอกสาร"
                : "ยินยอมให้ประมวลผลเอกสารก่อน เพื่ออัปโหลดและถามจากเอกสาร"
            }
          />
        ) : (
          docs.map((d) => (
            <article
              key={d.document_id}
              className="rounded-card bg-surface shadow-card p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-ink truncate">
                    {d.filename || d.doc_type || "เอกสาร PDF"}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={d.status} />
                    {typeof d.chunk_count === "number" && d.chunk_count > 0 && (
                      <span className="text-xs text-ink-muted">{d.chunk_count} ส่วน</span>
                    )}
                  </div>
                </div>
                <IconButton
                  icon={<Trash2 size={18} aria-hidden />}
                  label="ลบเอกสาร"
                  tone="danger"
                  onClick={() => onDelete(d.document_id)}
                />
              </div>

              {d.status === "ready" && (
                <Button
                  variant="outline"
                  fullWidth
                  leftIcon={<MessageCircle size={18} aria-hidden />}
                  onClick={() =>
                    router.push(`${basePath}/chat?doc=${encodeURIComponent(d.document_id)}`)
                  }
                >
                  ถามจากเอกสารนี้
                </Button>
              )}

              {d.status === "failed" && (
                <p className="text-sm text-safety">
                  ประมวลผลเอกสารไม่สำเร็จ ลองอัปโหลดไฟล์ใหม่อีกครั้ง
                </p>
              )}
            </article>
          ))
        )}
      </section>

      <p className="text-xs text-ink-muted text-center pt-2">
        ข้อมูลเอกสารถูกเก็บแบบเข้ารหัส และลบได้ทุกเมื่อ
      </p>
    </div>
  );
}

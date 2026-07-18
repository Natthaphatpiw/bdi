"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { getDebugCase } from "@/lib/client/mvpApi";

export function InternalDebugCase({ caseId }: { caseId: string }) {
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setError("");
    getDebugCase(caseId)
      .then((response) => { if (active) setData(response); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "โหลดข้อมูลตรวจสอบไม่สำเร็จ"); });
    return () => { active = false; };
  }, [caseId, reloadKey]);

  return (
    <main className="min-h-screen bg-canvas p-4 sm:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm font-bold text-benefit">หน้าภายใน · ไม่ใช่หน้าผู้ใช้</p><h1 className="mt-1 text-2xl font-bold text-ink">ข้อมูลเคสสำหรับตรวจสอบ</h1><p className="mt-1 break-all text-sm text-ink-muted">Case ID: {caseId}</p></div>
          <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-hairline bg-white px-4 font-bold text-ink"><RefreshCw className="h-4 w-4" aria-hidden="true" />รีเฟรช</button>
        </div>
        {error && <div className="mt-4 flex gap-2 rounded-xl bg-safety-soft p-4 text-safety" role="alert"><AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />{error}</div>}
        {!data && !error ? <div className="mt-6 flex items-center gap-3 rounded-xl border border-hairline bg-white p-5" role="status"><Loader2 className="h-5 w-5 animate-spin text-brand" aria-hidden="true" />กำลังโหลดข้อมูลที่ API อนุญาต…</div> : null}
        {data ? <pre className="mt-6 max-h-[75vh] overflow-auto rounded-xl bg-ink p-4 text-xs leading-relaxed text-white" aria-label="ข้อมูลเคสแบบ JSON">{JSON.stringify(data, null, 2)}</pre> : null}
      </div>
    </main>
  );
}

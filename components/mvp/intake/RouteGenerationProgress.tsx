"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

const STAGES = ["ทำความเข้าใจเรื่องเล่า", "ตรวจความปลอดภัย", "ตรวจสิทธิ์", "จับคู่สถานที่", "สร้างเส้นทาง"];

export function RouteGenerationProgress({ stage }: { stage: number }) {
  return (
    <section className="mx-auto w-full max-w-xl rounded-2xl border border-hairline bg-white p-5 shadow-card sm:p-6" role="status" aria-live="polite">
      <h1 className="text-2xl font-bold text-ink">กำลังสร้างเส้นทางดูแลของคุณ</h1><p className="mt-2 text-base text-ink-soft">ระบบกำลังตรวจข้อมูลตามลำดับ โปรดรอสักครู่</p>
      <ol className="mt-5 space-y-3">{STAGES.map((label, index) => {
        const done = index < stage;
        const active = index === stage;
        return <li key={label} className={cn("flex min-h-12 items-center gap-3 rounded-xl border px-4 py-3", done && "border-rights/25 bg-rights-soft text-rights", active && "border-brand/30 bg-brand-soft text-brand-dark", !done && !active && "border-hairline bg-canvas text-ink-muted")}>
          {done ? <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" /> : active ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden="true" /> : <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-current text-xs">{index + 1}</span>}
          <span className="font-semibold">{label}</span>{done && <span className="ml-auto text-sm font-semibold">เสร็จแล้ว</span>}{active && <span className="ml-auto text-sm font-semibold">กำลังตรวจ</span>}
        </li>;
      })}</ol>
    </section>
  );
}

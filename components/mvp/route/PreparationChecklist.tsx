"use client";

import { ClipboardCheck } from "lucide-react";
import type { VerifiedCareRoute } from "@/lib/mvp/contracts";
import { cn } from "@/lib/cn";

export function PreparationChecklist({ items, checked, onToggle }: {
  items: VerifiedCareRoute["preparationItems"];
  checked: Record<string, boolean>;
  onToggle: (itemId: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-hairline bg-white p-5 shadow-card" aria-labelledby="preparation-heading">
      <div className="flex items-start gap-3"><ClipboardCheck className="mt-0.5 h-6 w-6 shrink-0 text-brand" aria-hidden="true" /><div><h2 id="preparation-heading" className="text-xl font-bold text-ink">ต้องเตรียมอะไร</h2><p className="mt-1 text-base text-ink-soft">ติ๊กเก็บไว้ได้ รายการจะยังอยู่เมื่อกลับมาหน้านี้</p></div></div>
      {items.length ? <ul className="mt-4 space-y-2">{items.map((item) => <li key={item.id}><label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-hairline p-3 hover:bg-canvas"><input type="checkbox" checked={Boolean(checked[item.id])} onChange={() => onToggle(item.id)} className="mt-0.5 h-6 w-6 shrink-0 rounded border-hairline text-brand focus:ring-brand" /><span className="min-w-0 flex-1"><span className={cn("block text-base font-bold text-ink", checked[item.id] && "line-through opacity-60")}>{item.label}</span><span className="mt-0.5 block text-sm leading-relaxed text-ink-muted">{item.reason}</span></span><span className="shrink-0 rounded-full bg-canvas px-2 py-1 text-xs font-bold text-ink-soft">{item.requiredStatus === "REQUIRED" ? "จำเป็น" : item.requiredStatus === "RECOMMENDED" ? "แนะนำ" : "ถ้ามี"}</span></label></li>)}</ul> : <p className="mt-4 text-base text-ink-muted">ยังไม่มีรายการเฉพาะเคสนี้</p>}
    </section>
  );
}

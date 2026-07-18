"use client";
// เปลือกร่วมของสถานีเช็คสุขภาพ: progress dots 1/4..4/4 + หัวเรื่อง + เนื้อหา
import type { ReactNode } from "react";

interface Props {
  index: number; // 0-based
  total: number;
  title: string;
  instruction: string;
  children: ReactNode;
}

export function StationShell({ index, total, title, instruction, children }: Props) {
  return (
    <section className="card-enter rounded-card border border-hairline bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={
                i === index
                  ? "h-2 w-6 rounded-full bg-brand"
                  : i < index
                    ? "h-2 w-2 rounded-full bg-brand/50"
                    : "h-2 w-2 rounded-full bg-hairline"
              }
            />
          ))}
        </div>
        <p className="text-xs font-semibold text-ink-muted">
          สถานี {index + 1}/{total}
        </p>
      </div>
      <h2 className="mt-3 text-lg font-bold text-ink">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">{instruction}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

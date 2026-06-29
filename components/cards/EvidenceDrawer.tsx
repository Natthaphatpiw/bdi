"use client";

import { ExternalLink } from "lucide-react";
import type { EvidenceCard } from "@/lib/types";
import { Sheet } from "@/components/ui/Sheet";
import { Badge } from "@/components/ui/Badge";
import { liffOpenWindow } from "@/lib/client/liff";

interface EvidenceDrawerProps {
  card: EvidenceCard;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  surface: "web" | "line";
}

function openExternal(url: string, surface: "web" | "line") {
  if (surface === "line") {
    void liffOpenWindow(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function EvidenceDrawer({ card, open, onOpenChange, surface }: EvidenceDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="ที่มา & ความน่าเชื่อถือ">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Badge tone="info">ตัดสินสิทธิ์ด้วย rule engine</Badge>
          <Badge tone="review">ไม่วินิจฉัยแทนแพทย์</Badge>
        </div>

        {card.sources.length > 0 && (
          <ul className="flex flex-col gap-2">
            {card.sources.map((src, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => openExternal(src.url, surface)}
                  className="flex w-full items-start gap-2 rounded-btn border border-hairline bg-surface p-3 text-left tap-lg hover:bg-canvas"
                >
                  <ExternalLink
                    className="mt-0.5 h-4 w-4 shrink-0 text-facility"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-ink-muted">{src.publisher}</span>
                    <span className="block text-sm font-medium text-facility underline">
                      {src.title}
                    </span>
                  </span>
                  {src.review_required && <Badge tone="review">รอตรวจสอบ</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}

        {card.rule_traces && card.rule_traces.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-ink-soft">เกณฑ์ที่ใช้ตัดสิน</h3>
            <ul className="flex flex-col gap-2">
              {card.rule_traces.map((trace, i) => (
                <li
                  key={i}
                  className="rounded-btn border border-hairline bg-canvas p-2.5 text-xs text-ink-soft"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink">{trace.rule}</span>
                    <Badge
                      tone={
                        trace.status === "ELIGIBLE"
                          ? "benefit"
                          : trace.status === "NOT_ELIGIBLE"
                            ? "safety"
                            : "review"
                      }
                    >
                      {trace.status === "ELIGIBLE"
                        ? "ผ่าน"
                        : trace.status === "NOT_ELIGIBLE"
                          ? "ไม่ผ่าน"
                          : "ต้องตอบเพิ่ม"}
                    </Badge>
                  </div>
                  {trace.passed.length > 0 && (
                    <p className="mt-1">✅ {trace.passed.join(", ")}</p>
                  )}
                  {trace.failed && trace.failed.length > 0 && (
                    <p className="mt-0.5">⛔ {trace.failed.join(", ")}</p>
                  )}
                  {trace.asked && trace.asked.length > 0 && (
                    <p className="mt-0.5">❓ {trace.asked.join(", ")}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-ink-muted">{card.disclaimer}</p>
      </div>
    </Sheet>
  );
}

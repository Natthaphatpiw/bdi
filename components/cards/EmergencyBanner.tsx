"use client";
// Emergency banner — compact by design, and when the user scrolls past it the
// full card collapses out of view while a slim fixed strip (icon + call button)
// keeps the escalation one tap away without hijacking the layout.
import { useEffect, useRef, useState } from "react";
import { ShieldAlert, Phone, ChevronDown } from "lucide-react";
import type { SafetyCard } from "@/lib/types";

interface EmergencyBannerProps {
  card: SafetyCard;
  surface: "web" | "line";
}

export function EmergencyBanner({ card }: EmergencyBannerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [outOfView, setOutOfView] = useState(false);
  const [dismissedStrip, setDismissedStrip] = useState(false);

  const tel = card.actions?.find((a) => a.tel)?.tel ?? "1669";

  // watch the full banner; when it leaves the viewport show the slim strip
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => setOutOfView(!entry.isIntersecting),
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <>
      {/* full banner (in normal flow — does not follow the scroll) */}
      <div ref={ref} className="w-full rounded-card border border-safety/60 bg-safety-soft p-3.5">
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-safety" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-safety">{card.title}</h2>
            <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-ink">{card.body}</p>
          </div>
        </div>
        <a href={`tel:${tel}`} className="mt-2.5 block">
          <span className="flex min-h-11 w-full items-center justify-center gap-2 rounded-btn bg-safety text-sm font-semibold text-white transition-transform active:scale-[0.99]">
            <Phone className="h-4 w-4" aria-hidden="true" />
            โทร {tel} ทันที
          </span>
        </a>
      </div>

      {/* slim strip when scrolled past — small, dismissible, never blocks content */}
      {outOfView && !dismissedStrip && (
        <div className="fixed inset-x-0 top-0 z-40 flex items-center gap-2 border-b border-safety/40 bg-safety-soft/95 px-3 py-1.5 pt-safe backdrop-blur">
          <ShieldAlert className="h-4 w-4 shrink-0 text-safety" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-safety">
            {card.title}
          </span>
          <a
            href={`tel:${tel}`}
            className="flex shrink-0 items-center gap-1 rounded-full bg-safety px-3 py-1 text-xs font-semibold text-white"
          >
            <Phone className="h-3 w-3" aria-hidden="true" />
            โทร {tel}
          </a>
          <button
            type="button"
            aria-label="ย่อแถบแจ้งเตือน"
            onClick={() => setDismissedStrip(true)}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-safety/70 hover:bg-safety/10"
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}

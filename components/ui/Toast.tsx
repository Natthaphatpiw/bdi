"use client";

import { cn } from "@/lib/cn";
import { useToastStore, type ToastTone } from "@/store/toast";

const toneClasses: Record<ToastTone, string> = {
  info: "bg-ink",
  error: "bg-safety",
  success: "bg-brand",
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          aria-live="polite"
          className={cn(
            "max-w-[90%] rounded-btn px-4 py-2 text-sm text-white shadow-card",
            toneClasses[t.tone],
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

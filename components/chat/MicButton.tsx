"use client";
import { Loader2, Mic } from "lucide-react";
import { cn } from "@/lib/cn";

function fmt(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m + ":" + String(s).padStart(2, "0");
}

const BARS = [0.4, 0.7, 1, 0.7, 0.4];

export function MicButton({
  state,
  level = 0,
  seconds = 0,
  onStart,
  onStop,
  onCancel,
  mode = "toggle",
}: {
  state: "idle" | "listening" | "transcribing";
  level?: number;
  seconds?: number;
  onStart: () => void;
  onStop: () => void;
  onCancel?: () => void;
  mode?: "hold" | "toggle";
}) {
  if (state === "transcribing") {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-brand text-white">
          <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
        </div>
        <span className="text-sm text-ink-soft">กำลังถอดเสียง…</span>
      </div>
    );
  }

  const listening = state === "listening";

  const holdHandlers =
    mode === "hold"
      ? {
          onPointerDown: () => onStart(),
          onPointerUp: () => onStop(),
          onPointerLeave: () => {
            if (listening) onStop();
          },
        }
      : {};

  const onClick =
    mode === "toggle"
      ? () => (listening ? onStop() : onStart())
      : undefined;

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        aria-label={listening ? "หยุดพูด" : "เริ่มพูด"}
        onClick={onClick}
        {...holdHandlers}
        className={cn(
          "relative grid h-16 w-16 place-items-center rounded-full text-white transition-colors",
          listening ? "bg-safety animate-pulse-ring" : "bg-brand"
        )}
      >
        {listening ? (
          <div className="flex items-end gap-1" aria-hidden="true">
            {BARS.map((base, i) => (
              <span
                key={i}
                className="w-1 rounded-full bg-white"
                style={{ height: Math.max(4, base * (8 + level * 28)) + "px" }}
              />
            ))}
          </div>
        ) : (
          <Mic className="h-7 w-7" aria-hidden="true" />
        )}
      </button>
      {listening && (
        <span className="font-medium tabular-nums text-safety">{fmt(seconds)}</span>
      )}
    </div>
  );
}

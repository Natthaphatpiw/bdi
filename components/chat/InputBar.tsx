"use client";
// Pill-style composer (ChatGPT/LINE-like): one rounded container holding
// [+ attach] [textarea] [mic] [send/stop]. Send becomes a Stop button while
// the assistant is working.
import { useEffect, useRef } from "react";
import { Mic, Plus, Send, Square } from "lucide-react";
import { cn } from "@/lib/cn";

export function InputBar({
  value,
  onChange,
  onSend,
  onMic,
  onAttach,
  onStop,
  disabled,
  sending,
  placeholder = "พิมพ์ข้อความ…",
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onMic: () => void;
  onAttach?: () => void;
  onStop?: () => void;
  disabled?: boolean;
  sending?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow the textarea up to max-h (32 = 8rem).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 128) + "px";
  }, [value]);

  const canSend = value.trim().length > 0 && !disabled && !sending;

  return (
    <div className="sticky bottom-0 z-20 bg-canvas px-1 pb-safe pt-1">
      <div className="mb-2 flex items-end gap-1 rounded-[26px] border border-hairline bg-surface py-1.5 pl-1.5 pr-1.5 shadow-card">
        {onAttach && (
          <button
            type="button"
            aria-label="แนบเอกสาร"
            onClick={onAttach}
            disabled={disabled}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-canvas disabled:opacity-40"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        <textarea
          ref={ref}
          rows={1}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          className="max-h-32 min-w-0 flex-1 resize-none self-center border-0 bg-transparent px-2 py-2 text-base text-ink outline-none placeholder:text-ink-muted disabled:opacity-50"
        />
        <button
          type="button"
          aria-label="พูด"
          onClick={onMic}
          disabled={disabled || sending}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-brand transition-colors hover:bg-brand-soft disabled:opacity-40"
        >
          <Mic className="h-5 w-5" aria-hidden="true" />
        </button>
        {sending ? (
          <button
            type="button"
            aria-label="หยุด"
            onClick={onStop}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-white transition-transform active:scale-95"
          >
            <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            aria-label="ส่ง"
            onClick={onSend}
            disabled={!canSend}
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-full transition-all active:scale-95",
              canSend ? "bg-brand text-white" : "bg-canvas text-ink-muted"
            )}
          >
            <Send className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

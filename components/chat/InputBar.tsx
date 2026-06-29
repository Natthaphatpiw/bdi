"use client";
import { useEffect, useRef } from "react";
import { Mic, Paperclip, Send } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";

export function InputBar({
  value,
  onChange,
  onSend,
  onMic,
  onAttach,
  disabled,
  placeholder = "พิมพ์คำถาม…",
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onMic: () => void;
  onAttach?: () => void;
  disabled?: boolean;
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

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className="sticky bottom-0 z-20 flex items-end gap-2 border-t border-hairline bg-surface p-2 pb-safe">
      {onAttach && (
        <IconButton
          icon={<Paperclip className="h-5 w-5" aria-hidden="true" />}
          label="แนบเอกสาร"
          tone="neutral"
          onClick={onAttach}
          disabled={disabled}
        />
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
        className="max-h-32 flex-1 resize-none rounded-btn border border-hairline px-3 py-2 text-base text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none disabled:opacity-50"
      />
      <IconButton
        icon={<Mic className="h-5 w-5" aria-hidden="true" />}
        label="พูด"
        tone="brand"
        onClick={onMic}
        disabled={disabled}
      />
      <IconButton
        icon={<Send className="h-5 w-5" aria-hidden="true" />}
        label="ส่ง"
        tone="brand"
        onClick={onSend}
        disabled={!canSend}
      />
    </div>
  );
}

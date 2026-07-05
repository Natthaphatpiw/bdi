"use client";
import { useRef, useState } from "react";
import { Bot, MessageCircle, Plus, Send, Square, X } from "lucide-react";
import { askCaseChat } from "@/lib/client/api";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/cn";
import { useToast } from "@/store/toast";

type LocalMsg = { role: "user" | "assistant"; content: string };

export function CaseChatWidget({
  sessionId,
  surface,
}: {
  sessionId: string;
  surface: "web" | "line";
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<LocalMsg[]>([
    {
      role: "assistant",
      content: "ถามต่อจาก Dashboard นี้ได้เลย เช่น ต้องเตรียมเอกสารอะไร หรือถ้าไปวันธรรมดาไม่ได้ควรทำอย่างไร",
    },
  ]);
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function send() {
    const question = input.trim();
    if (!question || sending) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    try {
      const resp = await askCaseChat(sessionId, messages, question, controller.signal);
      setMessages((prev) => [...prev, { role: "assistant", content: resp.text }]);
    } catch (e) {
      if (controller.signal.aborted) {
        setMessages((prev) => [...prev, { role: "assistant", content: "หยุดการตอบแล้ว" }]);
      } else {
        toast(e instanceof Error ? e.message : "ถามต่อไม่สำเร็จ", "error");
      }
    } finally {
      abortRef.current = null;
      setSending(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
    setSending(false);
  }

  function newChat() {
    stop();
    setMessages([
      {
        role: "assistant",
        content: "เริ่มคำถามใหม่ได้เลย ฉันยังอ้างอิงจาก Dashboard เคสนี้เหมือนเดิม",
      },
    ]);
    setInput("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-brand text-white shadow-lg transition-transform active:scale-95",
          surface === "line" ? "bottom-24" : "bottom-6"
        )}
        aria-label="เปิดผู้ช่วยถามต่อ"
      >
        <MessageCircle className="h-6 w-6" aria-hidden="true" />
      </button>

      {open && (
        <div
          className={cn(
            "fixed right-3 z-40 flex w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-card border border-hairline bg-surface shadow-sheet",
            surface === "line" ? "bottom-40 max-h-[62vh]" : "bottom-24 max-h-[70vh]"
          )}
        >
          <div className="flex items-center gap-2 border-b border-hairline px-3 py-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-soft text-brand">
              <Bot className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">ผู้ช่วยเคสนี้</p>
              <p className="text-xs text-ink-muted">ใช้ข้อมูลจาก Dashboard ปัจจุบัน</p>
            </div>
            <IconButton icon={<Plus className="h-4 w-4" />} label="แชทใหม่" tone="neutral" onClick={newChat} />
            <IconButton icon={<X className="h-4 w-4" />} label="ปิด" tone="neutral" onClick={() => setOpen(false)} />
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto bg-canvas/60 p-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[88%] rounded-btn px-3 py-2 text-sm leading-relaxed",
                  m.role === "user"
                    ? "ml-auto bg-brand text-white"
                    : "mr-auto border border-hairline bg-surface text-ink"
                )}
              >
                {m.content}
              </div>
            ))}
            {sending && (
              <div className="mr-auto max-w-[88%] rounded-btn border border-hairline bg-surface px-3 py-2 text-sm text-ink-muted">
                กำลังตอบ…
              </div>
            )}
          </div>

          <div className="border-t border-hairline bg-surface p-2">
            <div className="flex items-end gap-2">
              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="ถามต่อจากผลลัพธ์นี้…"
                className="min-h-10 flex-1 resize-none rounded-btn border border-hairline px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
              />
              {sending ? (
                <Button variant="outline" size="md" onClick={stop} leftIcon={<Square className="h-4 w-4" />}>
                  หยุด
                </Button>
              ) : (
                <Button size="md" onClick={() => void send()} disabled={!input.trim()} leftIcon={<Send className="h-4 w-4" />}>
                  ส่ง
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

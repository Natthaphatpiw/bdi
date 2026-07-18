"use client";

import { Fragment, useMemo, useState } from "react";
import { AlertTriangle, Loader2, MessageCircle, Phone, Send, Sparkles } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { askFollowUp } from "@/lib/client/mvpApi";
import { cn } from "@/lib/cn";

type Message = { role: "user" | "assistant"; content: string };

const QUICK_QUESTIONS = [
  "ต้องเตรียมเอกสารอะไร",
  "มีค่าใช้จ่ายไหม",
  "ถ้าที่แรกปิดทำอย่างไร",
  "ทำไมแนะนำที่นี่",
];

function InlineText({ text }: { text: string }) {
  const cleaned = text
    .replace(/\[([^\]]+)\]\((?:https?:\/\/)?[^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
  const parts = cleaned.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={`${part}-${index}`} className="font-bold text-ink">{part.slice(2, -2)}</strong>
        ) : (
          <Fragment key={`${part}-${index}`}>{part.replace(/^#+\s*/, "")}</Fragment>
        ),
      )}
    </>
  );
}

/** Render a deliberately small, non-HTML markdown subset. No raw HTML, links,
 * scripts, or provider output can be injected into the DOM. */
function SafeRichText({ text }: { text: string }) {
  const blocks = useMemo(() => {
    const lines = text.replace(/\r/g, "").split("\n");
    const output: Array<{ type: "p" | "ul" | "ol"; lines: string[] }> = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const unordered = /^[-*•]\s+(.+)/.exec(line);
      const ordered = /^\d+[.)]\s+(.+)/.exec(line);
      const type = unordered ? "ul" : ordered ? "ol" : "p";
      const content = unordered?.[1] ?? ordered?.[1] ?? line;
      const previous = output.at(-1);
      if (previous?.type === type && type !== "p") previous.lines.push(content);
      else output.push({ type, lines: [content] });
    }
    return output;
  }, [text]);

  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        if (block.type === "ul") return <ul key={index} className="list-disc space-y-1 pl-5">{block.lines.map((line) => <li key={line}><InlineText text={line} /></li>)}</ul>;
        if (block.type === "ol") return <ol key={index} className="list-decimal space-y-1 pl-5">{block.lines.map((line) => <li key={line}><InlineText text={line} /></li>)}</ol>;
        return <p key={index}><InlineText text={block.lines[0]} /></p>;
      })}
    </div>
  );
}

export function FollowUpAssistant({
  caseId,
  surface,
  onEmergency,
}: {
  caseId: string;
  surface: "web" | "line";
  onEmergency?: (safety: { hotline: string; message: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [emergency, setEmergency] = useState<{ hotline: string; message: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "ถามต่อจากข้อมูลในเคสนี้ได้เลย ฉันจะตอบสั้น ๆ และจะไม่สร้างข้อมูลที่ไม่มีหลักฐานในเคส",
    },
  ]);

  async function sendQuestion(question: string) {
    const trimmed = question.trim();
    if (!trimmed || sending) return;
    const history = messages.slice(-8);
    setMessages((current) => [...current, { role: "user", content: trimmed }]);
    setInput("");
    setError("");
    setSending(true);
    try {
      const response = await askFollowUp(caseId, trimmed, history);
      if (response.safety.emergency) {
        const emergencySafety = {
          hotline: response.safety.hotline || "1669",
          message: response.safety.messageTh || "อาการใหม่อาจต้องได้รับความช่วยเหลือฉุกเฉิน โทร 1669 ทันที",
        };
        setEmergency(emergencySafety);
        onEmergency?.(emergencySafety);
      }
      setMessages((current) => [...current, { role: "assistant", content: response.answer }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ถามต่อไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="เปิดผู้ช่วยถามต่อจากเคส"
        className={cn(
          "fixed right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-brand text-white shadow-lg transition hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          surface === "line" ? "bottom-40" : "bottom-24 md:bottom-6",
        )}
      >
        <MessageCircle className="h-6 w-6" aria-hidden="true" />
      </button>

      <Sheet open={open} onOpenChange={setOpen} title="ผู้ช่วยเคสนี้">
        <div className="flex max-h-[70vh] flex-col">
          <p className="flex items-start gap-2 rounded-xl bg-brand-soft p-3 text-sm leading-relaxed text-brand-dark">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            ใช้เฉพาะข้อมูลจากเคส เส้นทาง และหลักฐานที่ตรวจไว้แล้ว
          </p>

          {emergency && (
            <div className="mt-3 rounded-xl border border-safety/40 bg-safety-soft p-3" role="alert">
              <p className="flex gap-2 font-bold text-safety"><AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />{emergency.message}</p>
              <a href={`tel:${emergency.hotline}`} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-safety px-4 font-bold text-white">
                <Phone className="h-5 w-5" aria-hidden="true" /> โทร {emergency.hotline} ทันที
              </a>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2" aria-label="คำถามแนะนำ">
            {QUICK_QUESTIONS.map((question) => (
              <button
                key={question}
                type="button"
                disabled={sending}
                onClick={() => void sendQuestion(question)}
                className="min-h-11 rounded-full border border-brand/25 bg-white px-3 py-2 text-sm font-bold text-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50"
              >
                {question}
              </button>
            ))}
          </div>

          <div className="mt-3 min-h-32 flex-1 space-y-2 overflow-y-auto rounded-xl bg-canvas p-3" aria-live="polite">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={cn(
                  "max-w-[90%] rounded-xl px-3 py-2 text-base leading-relaxed",
                  message.role === "user" ? "ml-auto bg-brand text-white" : "mr-auto border border-hairline bg-white text-ink",
                )}
              >
                {message.role === "assistant" ? <SafeRichText text={message.content} /> : message.content}
              </div>
            ))}
            {sending && <p className="mr-auto flex max-w-[90%] items-center gap-2 rounded-xl border border-hairline bg-white px-3 py-2 text-base text-ink-soft" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />กำลังตรวจคำตอบจากเคส…</p>}
            {error && <p className="rounded-xl bg-safety-soft px-3 py-2 text-sm text-safety" role="alert">{error}</p>}
          </div>

          <label htmlFor="case-follow-up" className="mt-3 text-sm font-bold text-ink-soft">ถามต่อจากผลลัพธ์นี้</label>
          <div className="mt-1 flex items-end gap-2">
            <textarea
              id="case-follow-up"
              rows={2}
              maxLength={1000}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendQuestion(input);
                }
              }}
              className="min-h-12 min-w-0 flex-1 resize-none rounded-xl border border-hairline px-3 py-2 text-base text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              placeholder="เช่น ถ้าที่แรกปิดควรทำอย่างไร"
            />
            <button
              type="button"
              aria-label="ส่งคำถาม"
              disabled={sending || !input.trim()}
              onClick={() => void sendQuestion(input)}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Send className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </Sheet>
    </>
  );
}

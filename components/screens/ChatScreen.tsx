"use client";
// ChatScreen — the core conversational screen. Surface-agnostic (web + LIFF).
// Ensures a session, streams turns via turnStream (falls back to turn()),
// and renders user/assistant items with cards, "AI เข้าใจว่า…", pending Q&A,
// plus a voice overlay and a sticky input bar.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IdCard, SquarePen } from "lucide-react";
import { ChatBubble } from "@/components/chat/ChatBubble";
import { UnderstoodChips } from "@/components/chat/UnderstoodChips";
import { QuickReplies } from "@/components/chat/QuickReplies";
import { QuestionPanel } from "@/components/chat/QuestionPanel";
import { InputBar } from "@/components/chat/InputBar";
import { VoiceOverlay } from "@/components/chat/VoiceOverlay";
import { ThinkingDots } from "@/components/chat/ThinkingDots";
import { CardStack } from "@/components/cards/CardStack";
import { PassportModal } from "@/components/passport/PassportModal";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import {
  createSession,
  getMessages,
  turn,
  turnStream,
  type TurnInputClient,
} from "@/lib/client/api";
import type { Card, TurnQuestion, Understood } from "@/lib/types";
import { useUi } from "@/store/ui";
import { useToast } from "@/store/toast";
import { useAuth } from "@/lib/client/auth";

interface PendingPrompt {
  question: string;
  quickReplies?: string[];
}

type ChatItem =
  | { kind: "user"; id: number; text: string }
  | {
      kind: "assistant";
      id: number;
      cards: Card[];
      understood?: Understood;
      pending?: PendingPrompt;
      questions?: TurnQuestion[];
      questionsAnswered?: boolean;
      thinking: boolean;
      error?: string;
      stopped?: boolean;
    };

export interface ChatScreenProps {
  surface: "web" | "line";
  basePath: string;
  initialText?: string;
  intentHint?: string;
  sessionId?: string;
  documentId?: string;
}

let itemSeq = 0;
const nextId = () => ++itemSeq;

// Maps an intent hint (from home-screen tiles) to a Thai opening message,
// so a fresh chat opened via ?intent=… starts the right conversation.
function intentSeed(intent?: string): string {
  switch (intent) {
    case "symptom":
      return "อยากปรึกษาอาการค่ะ";
    case "rights":
      return "ขอเช็กสิทธิของฉันหน่อยค่ะ";
    default:
      return "";
  }
}

export function ChatScreen({
  surface,
  basePath,
  initialText,
  intentHint,
  sessionId: sessionIdProp,
  documentId,
}: ChatScreenProps) {
  const router = useRouter();
  const toast = useToast();
  const { ready } = useAuth();
  const setSessionId = useUi((s) => s.setSessionId);

  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [passportOpen, setPassportOpen] = useState(false);
  const [activeSession, setActiveSession] = useState<string | null>(null);

  // Keep the latest session id available to send() without re-creating it.
  const sessionRef = useRef<string | null>(null);
  // Guards so init + auto-send run exactly once.
  const initialisedRef = useRef(false);
  const autoSentRef = useRef(false);
  // Abort controller for the in-flight turn (stop button).
  const abortRef = useRef<AbortController | null>(null);
  // Scroll anchor.
  const bottomRef = useRef<HTMLDivElement>(null);

  // --- send a turn ----------------------------------------------------------
  const send = useCallback(
    async (rawText: string, answers?: Record<string, string>) => {
      const text = rawText.trim();
      if (!text) return;
      const sid = sessionRef.current;
      if (!sid) {
        toast("ยังเชื่อมต่อไม่สำเร็จ ลองอีกครั้ง", "error");
        return;
      }

      const assistantId = nextId();
      setMessages((prev) => [
        ...prev,
        { kind: "user", id: nextId(), text },
        { kind: "assistant", id: assistantId, cards: [], thinking: true },
      ]);
      setSending(true);

      const patchAssistant = (
        fn: (item: Extract<ChatItem, { kind: "assistant" }>) => Extract<ChatItem, { kind: "assistant" }>
      ) =>
        setMessages((prev) =>
          prev.map((m) => (m.kind === "assistant" && m.id === assistantId ? fn(m) : m))
        );

      const turnInput: TurnInputClient = answers
        ? { type: "answers", answers, text }
        : documentId
          ? { type: "document", text, document_id: documentId }
          : { type: "text", text };

      const controller = new AbortController();
      abortRef.current = controller;
      const aborted = () => controller.signal.aborted;

      try {
        await turnStream(
          sid,
          turnInput,
          {
            onUnderstood: (u) => patchAssistant((m) => ({ ...m, understood: u })),
            onCard: (card) =>
              patchAssistant((m) => ({ ...m, thinking: false, cards: [...m.cards, card] })),
            onPending: (question, quickReplies) =>
              patchAssistant((m) => ({ ...m, thinking: false, pending: { question, quickReplies } })),
            onQuestions: (questions) =>
              patchAssistant((m) => ({ ...m, thinking: false, questions })),
            onError: (message) => {
              toast(message, "error");
              patchAssistant((m) => ({ ...m, thinking: false, error: message }));
            },
            onDone: () => setSending(false),
          },
          controller.signal
        );
      } catch {
        if (aborted()) {
          patchAssistant((m) => ({ ...m, thinking: false, stopped: m.cards.length === 0 }));
        } else {
          // Streaming unavailable — fall back to the non-stream endpoint.
          try {
            const resp = await turn(sid, turnInput, controller.signal);
            patchAssistant((m) => ({
              ...m,
              thinking: false,
              understood: resp.understood,
              cards: resp.cards,
              questions: resp.questions,
              pending: resp.pending_question
                ? { question: resp.pending_question, quickReplies: resp.quick_replies }
                : undefined,
            }));
          } catch (err) {
            if (aborted()) {
              patchAssistant((m) => ({ ...m, thinking: false, stopped: m.cards.length === 0 }));
            } else {
              const message =
                err instanceof Error && err.message ? err.message : "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง";
              toast(message, "error");
              patchAssistant((m) => ({ ...m, thinking: false, error: message }));
            }
          }
        }
      } finally {
        setSending(false);
        abortRef.current = null;
      }
    },
    [documentId, toast]
  );

  // Stop the in-flight turn (ChatGPT-style).
  const stop = useCallback(() => {
    abortRef.current?.abort();
    setSending(false);
  }, []);

  // --- session init + history hydration -------------------------------------
  useEffect(() => {
    if (!ready || initialisedRef.current) return;
    initialisedRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        if (sessionIdProp) {
          // Resume a prior session and hydrate its messages.
          sessionRef.current = sessionIdProp;
          if (!cancelled) {
            setActiveSession(sessionIdProp);
            setSessionId(sessionIdProp);
          }
          const { messages: history } = await getMessages(sessionIdProp);
          if (cancelled) return;
          const hydrated: ChatItem[] = history.map((m) =>
            m.role === "user"
              ? { kind: "user", id: nextId(), text: m.content }
              : {
                  kind: "assistant",
                  id: nextId(),
                  cards: m.cards ?? [],
                  thinking: false,
                }
          );
          setMessages(hydrated);
        } else {
          // Always start a FRESH session — reusing an old one lets stale slots
          // (e.g. a previously-guessed age/scheme) pollute the new conversation.
          const { session_id } = await createSession(surface === "line" ? "line" : "web");
          if (cancelled) return;
          sessionRef.current = session_id;
          setActiveSession(session_id);
          setSessionId(session_id);
        }
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error && err.message ? err.message : "เริ่มการสนทนาไม่สำเร็จ";
        toast(message, "error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, sessionIdProp, surface, setSessionId, toast]);

  // --- auto-send the initial query once a session exists ---------------------
  useEffect(() => {
    if (autoSentRef.current) return;
    if (!activeSession) return;
    // Don't auto-seed when resuming an existing/persisted conversation.
    if (sessionIdProp) return;
    const seed = initialText?.trim() || intentSeed(intentHint);
    if (!seed) return;
    autoSentRef.current = true;
    void send(seed);
  }, [activeSession, initialText, intentHint, sessionIdProp, send]);

  // --- auto-scroll to bottom on new content ----------------------------------
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    void send(text);
    setInput("");
  };

  // Answer a QuestionPanel: mark it answered, then send the structured answers.
  const answerQuestions = useCallback(
    (itemId: number, answers: Record<string, string>, summary: string) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.kind === "assistant" && m.id === itemId ? { ...m, questionsAnswered: true } : m
        )
      );
      void send(summary, answers);
    },
    [send]
  );

  // Start over with a clean session (prevents stale slots from old chats).
  const newChat = useCallback(async () => {
    if (sending) stop();
    try {
      const { session_id } = await createSession(surface === "line" ? "line" : "web");
      sessionRef.current = session_id;
      setActiveSession(session_id);
      setSessionId(session_id);
      setMessages([]);
      setInput("");
      autoSentRef.current = true; // don't re-fire the seeded first message
    } catch {
      toast("เริ่มแชตใหม่ไม่สำเร็จ ลองอีกครั้ง", "error");
    }
  }, [sending, stop, surface, setSessionId, toast]);

  const hasConversation = messages.some((m) => m.kind === "assistant" && m.cards.length > 0);

  return (
    <div className="flex min-h-[60vh] flex-col">
      {hasConversation && activeSession && (
        <div className="sticky top-0 z-10 -mx-4 mb-2 flex items-center gap-2 border-b border-hairline bg-canvas/90 px-4 py-2 backdrop-blur">
          <div className="min-w-0 flex-1">
            <Button
              variant="outline"
              size="md"
              fullWidth
              onClick={() => setPassportOpen(true)}
              leftIcon={<IdCard className="h-4 w-4" aria-hidden="true" />}
            >
              สร้าง Case Passport
            </Button>
          </div>
          <IconButton
            icon={<SquarePen className="h-5 w-5" aria-hidden="true" />}
            label="เริ่มแชตใหม่"
            tone="neutral"
            onClick={() => void newChat()}
          />
        </div>
      )}

      <div className="flex-1 space-y-2 pb-4">
        {messages.length === 0 && (
          <p className="px-1 py-8 text-center text-sm text-ink-muted">
            พิมพ์หรือพูดเพื่อเริ่มปรึกษาได้เลยค่ะ
          </p>
        )}

        {messages.map((item) => {
          if (item.kind === "user") {
            return (
              <ChatBubble key={item.id} role="user">
                {item.text}
              </ChatBubble>
            );
          }

          return (
            <div key={item.id} className="space-y-2">
              {item.understood && <UnderstoodChips data={item.understood} />}

              {item.thinking && item.cards.length === 0 && !item.error ? (
                <ThinkingDots />
              ) : item.cards.length > 0 ? (
                <CardStack
                  cards={item.cards}
                  surface={surface}
                  onQuickAnswer={(t) => setInput(t)}
                />
              ) : null}

              {item.error && (
                <ChatBubble role="assistant">
                  <span className="text-safety">{item.error}</span>
                </ChatBubble>
              )}

              {item.stopped && (
                <p className="px-1 text-sm text-ink-muted">หยุดการประมวลผลแล้ว</p>
              )}

              {item.questions && item.questions.length > 0 && (
                <QuestionPanel
                  questions={item.questions}
                  submitted={item.questionsAnswered}
                  disabled={sending}
                  onSubmit={(answers, summary) => answerQuestions(item.id, answers, summary)}
                />
              )}

              {item.pending && (
                <div className="space-y-2">
                  <ChatBubble role="assistant">{item.pending.question}</ChatBubble>
                  <QuickReplies
                    options={item.pending.quickReplies ?? []}
                    onPick={(s) => void send(s)}
                  />
                </div>
              )}
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      <InputBar
        value={input}
        onChange={setInput}
        onSend={handleSend}
        onMic={() => setVoiceOpen(true)}
        onAttach={() => router.push(`${basePath}/documents`)}
        onStop={stop}
        sending={sending}
        placeholder={documentId ? "ถามจากเอกสารนี้…" : "พิมพ์อาการหรือคำถาม…"}
      />

      <VoiceOverlay
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        onResult={(t) => {
          setVoiceOpen(false);
          void send(t);
        }}
      />

      <PassportModal open={passportOpen} onClose={() => setPassportOpen(false)} sessionId={activeSession} />
    </div>
  );
}

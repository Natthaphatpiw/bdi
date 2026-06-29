"use client";
import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { useVoice } from "@/hooks/useVoice";
import { useToast } from "@/store/toast";
import { useUi } from "@/store/ui";
import { stt } from "@/lib/client/api";
import { MicButton } from "./MicButton";

export function VoiceOverlay({
  open,
  onClose,
  onResult,
}: {
  open: boolean;
  onClose: () => void;
  onResult: (text: string) => void;
}) {
  const voice = useVoice();
  const toast = useToast();
  const voiceMode = useUi((s) => s.voiceMode);

  const [transcript, setTranscript] = useState("");
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const startedRef = useRef(false);

  // Start listening when the overlay opens; fully reset when it closes.
  useEffect(() => {
    if (open) {
      if (!startedRef.current) {
        startedRef.current = true;
        setTranscript("");
        void voice.start();
      }
    } else {
      startedRef.current = false;
      voice.reset();
      setTranscript("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Surface mic / voice errors and bail out.
  useEffect(() => {
    if (open && voice.state === "error" && voice.error) {
      toast(voice.error, "error");
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.state, voice.error, open]);

  async function handleStop() {
    const blob = await voice.stop();
    if (!blob) {
      voice.reset();
      return;
    }
    try {
      const { text } = await stt(blob);
      setTranscript(text);
      voice.reset();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ถอดเสียงไม่สำเร็จ";
      toast(msg, "error");
      onClose();
    }
  }

  function handleCancel() {
    voice.cancel();
    onClose();
  }

  function handleSend() {
    const text = transcript.trim();
    if (!text) return;
    voice.reset();
    onResult(text);
    onClose();
  }

  const showTranscript = transcript.length > 0 && voice.state === "idle";

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) handleCancel();
      }}
      title="กำลังฟัง…"
    >
      <div className="flex animate-rise flex-col items-center gap-4 py-2">
        {!showTranscript && voice.state === "listening" && (
          <p className="text-sm text-ink-soft">กำลังฟัง… พูดได้เลย แล้วแตะหยุดเมื่อเสร็จ</p>
        )}
        {showTranscript ? (
          <>
            <textarea
              ref={taRef}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-btn border border-hairline px-3 py-2 text-base text-ink focus:border-brand focus:outline-none"
            />
            <div className="flex w-full gap-2">
              <Button
                variant="outline"
                size="lg"
                fullWidth
                onClick={() => taRef.current?.focus()}
              >
                แก้
              </Button>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={handleSend}
                disabled={!transcript.trim()}
              >
                ส่ง
              </Button>
            </div>
          </>
        ) : (
          <>
            <MicButton
              state={voice.state === "error" ? "idle" : voice.state}
              level={voice.level}
              seconds={voice.seconds}
              onStart={() => void voice.start()}
              onStop={() => void handleStop()}
              onCancel={handleCancel}
              mode={voiceMode}
            />
            <div className="flex w-full gap-2">
              <Button
                variant="ghost"
                size="lg"
                fullWidth
                onClick={handleCancel}
              >
                ยกเลิก
              </Button>
              {voice.state === "listening" && (
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  onClick={() => void handleStop()}
                >
                  หยุด
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

"use client";
// สถานี 3 — พิมพ์ประโยค (privacy-first, Guardrail §9.7):
//  - เก็บเฉพาะ timing ของ `input` events + ขนาด diff + ผลเทียบประโยค target
//  - ห้ามใช้ keydown/keyup (virtual keyboard มือถือให้ key 229 ไม่น่าเชื่อถือ)
//  - ข้อความที่พิมพ์อยู่ใน state ฝั่ง client เท่านั้น ไม่ถูกส่งขึ้น server
import { useRef, useState } from "react";
import { Check, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StationShell } from "./StationShell";
import { TYPING_SENTENCE } from "@/lib/guardian/config";
import { sentenceAccuracy } from "@/lib/guardian/features";
import { vibrate } from "@/lib/guardian/alert";
import type { TypingSample } from "@/lib/guardian/types";

interface Props {
  index: number;
  total: number;
  onComplete: (samples: TypingSample[], accuracy: number) => void;
}

export function TypingStation({ index, total, onComplete }: Props) {
  const [running, setRunning] = useState(false);
  const [text, setText] = useState("");
  const samplesRef = useRef<TypingSample[]>([]);
  const prevLen = useRef(0);
  const t0 = useRef(0);

  function start() {
    samplesRef.current = [];
    prevLen.current = 0;
    t0.current = performance.now();
    setText("");
    setRunning(true);
  }

  function handleInput(value: string) {
    const now = performance.now();
    samplesRef.current.push({
      t: Math.round(now - t0.current),
      len: value.length,
      del: value.length < prevLen.current,
    });
    prevLen.current = value.length;
    setText(value);
  }

  function finish() {
    vibrate(80);
    onComplete(samplesRef.current, sentenceAccuracy(text, TYPING_SENTENCE));
  }

  return (
    <StationShell
      index={index}
      total={total}
      title="พิมพ์ประโยค"
      instruction="พิมพ์ประโยคด้านล่างด้วยจังหวะปกติของคุณ ระบบวัดเฉพาะจังหวะการพิมพ์ ไม่เก็บเนื้อหา"
    >
      <p className="rounded-card bg-brand-soft px-4 py-3 text-center text-lg font-bold text-brand-dark">
        “{TYPING_SENTENCE}”
      </p>
      {!running ? (
        <Button size="lg" fullWidth className="mt-4" leftIcon={<Play className="h-5 w-5" aria-hidden />} onClick={start}>
          เริ่ม
        </Button>
      ) : (
        <div className="mt-4">
          <textarea
            value={text}
            onChange={(e) => handleInput(e.target.value)}
            rows={3}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="พิมพ์ประโยคด้านบนที่นี่"
            className="w-full rounded-card border border-hairline bg-canvas px-4 py-3 text-base leading-relaxed text-ink outline-none focus:border-brand focus:bg-surface"
            aria-label="ช่องพิมพ์ประโยคทดสอบ"
          />
          <Button
            size="lg"
            fullWidth
            className="mt-3"
            disabled={text.trim().length < Math.floor(TYPING_SENTENCE.length * 0.5)}
            leftIcon={<Check className="h-5 w-5" aria-hidden />}
            onClick={finish}
          >
            พิมพ์เสร็จแล้ว
          </Button>
        </div>
      )}
    </StationShell>
  );
}

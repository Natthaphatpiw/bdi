"use client";
// สถานี 2 — แตะตามจุด: จุดวงกลมสุ่มตำแหน่ง 12 จุด เก็บ target/touch/reaction/miss
// (raw ต่อจุด: tx,ty,px,py,rt,miss — spec §6.2)
import { useCallback, useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StationShell } from "./StationShell";
import { TAP_TARGET_COUNT } from "@/lib/guardian/config";
import { vibrate } from "@/lib/guardian/alert";
import type { TapSample } from "@/lib/guardian/types";

const TARGET_DIAMETER = 56; // px — แตะง่ายสำหรับทุกวัย
const NEXT_DELAY_MS = 250;

interface Props {
  index: number;
  total: number;
  onComplete: (samples: TapSample[]) => void;
}

interface Target {
  x: number; // px ภายในพื้นที่เล่น
  y: number;
  shownAt: number;
}

export function TapTargetStation({ index, total, onComplete }: Props) {
  const [running, setRunning] = useState(false);
  const [count, setCount] = useState(0);
  const [target, setTarget] = useState<Target | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const samplesRef = useRef<TapSample[]>([]);
  const t0 = useRef(0);
  const doneRef = useRef(false);

  const placeTarget = useCallback(() => {
    const area = areaRef.current;
    if (!area) return;
    const rect = area.getBoundingClientRect();
    const pad = TARGET_DIAMETER / 2 + 6;
    const x = pad + Math.random() * Math.max(1, rect.width - pad * 2);
    const y = pad + Math.random() * Math.max(1, rect.height - pad * 2);
    setTarget({ x, y, shownAt: performance.now() });
  }, []);

  useEffect(() => {
    if (running && !target && count < TAP_TARGET_COUNT) {
      const t = setTimeout(placeTarget, NEXT_DELAY_MS);
      return () => clearTimeout(t);
    }
  }, [running, target, count, placeTarget]);

  function start() {
    samplesRef.current = [];
    doneRef.current = false;
    t0.current = performance.now();
    setCount(0);
    setRunning(true);
    placeTarget();
  }

  function handleTap(e: React.PointerEvent<HTMLDivElement>) {
    if (!running || !target || doneRef.current) return;
    const rect = areaRef.current!.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const dist = Math.hypot(px - target.x, py - target.y);
    const now = performance.now();
    samplesRef.current.push({
      t: Math.round(now - t0.current),
      tx: Math.round(target.x),
      ty: Math.round(target.y),
      px: Math.round(px),
      py: Math.round(py),
      rt: Math.round(now - target.shownAt),
      miss: dist > TARGET_DIAMETER / 2 + 8,
    });
    const next = count + 1;
    setCount(next);
    setTarget(null);
    if (next >= TAP_TARGET_COUNT) {
      doneRef.current = true;
      setRunning(false);
      vibrate(80);
      onComplete(samplesRef.current);
    }
  }

  return (
    <StationShell
      index={index}
      total={total}
      title="แตะตามจุด"
      instruction={`จะมีจุดวงกลมโผล่ทีละจุด ${TAP_TARGET_COUNT} จุด — แตะให้ตรงและไวที่สุดเท่าที่สบายมือ`}
    >
      {!running ? (
        <Button size="lg" fullWidth leftIcon={<Play className="h-5 w-5" aria-hidden />} onClick={start}>
          เริ่ม
        </Button>
      ) : (
        <div>
          <p className="mb-2 text-center text-sm font-semibold tabular-nums text-ink-soft">
            {count}/{TAP_TARGET_COUNT}
          </p>
          <div
            ref={areaRef}
            onPointerDown={handleTap}
            className="relative h-[52vh] min-h-[300px] w-full touch-none select-none overflow-hidden rounded-card border border-hairline bg-canvas"
            role="application"
            aria-label="พื้นที่แตะตามจุด"
          >
            {target && (
              <span
                className="absolute grid place-items-center rounded-full bg-brand text-white shadow-card"
                style={{
                  width: TARGET_DIAMETER,
                  height: TARGET_DIAMETER,
                  left: target.x - TARGET_DIAMETER / 2,
                  top: target.y - TARGET_DIAMETER / 2,
                }}
                aria-hidden="true"
              >
                ●
              </span>
            )}
          </div>
        </div>
      )}
    </StationShell>
  );
}

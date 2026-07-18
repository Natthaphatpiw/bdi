"use client";
// สถานีที่ใช้ DeviceMotion (ถือนิ่ง / เดิน 20 ก้าว) — permission ขอจาก user
// gesture ของปุ่ม "เริ่ม" เท่านั้น (iOS 13+), มี graceful degradation เมื่อ
// อุปกรณ์/หน้านี้อ่าน motion ไม่ได้ (spec §6.3)
import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StationShell } from "./StationShell";
import {
  requestMotionPermission,
  startMotionCapture,
  type MotionCapture,
} from "@/lib/guardian/motion";
import { vibrate } from "@/lib/guardian/alert";
import { liffOpenWindow } from "@/lib/client/liff";
import type { MotionSample } from "@/lib/guardian/types";

interface Props {
  index: number;
  total: number;
  title: string;
  instruction: string;
  mode: "hold_still" | "gait";
  durationSeconds: number;
  /** samples = null เมื่อข้ามสถานี */
  onComplete: (samples: MotionSample[] | null) => void;
  surface: "web" | "line";
}

type Phase = "idle" | "starting" | "running" | "unavailable";

export function MotionStation({
  index,
  total,
  title,
  instruction,
  mode,
  durationSeconds,
  onComplete,
  surface,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds);
  const captureRef = useRef<MotionCapture | null>(null);
  const completedRef = useRef(false);

  function finish() {
    if (completedRef.current) return;
    completedRef.current = true;
    const samples = captureRef.current?.stop() ?? [];
    captureRef.current = null;
    vibrate(80);
    onComplete(samples);
  }

  useEffect(() => {
    if (phase !== "running") return;
    if (secondsLeft <= 0) {
      finish();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, secondsLeft]);

  // เก็บกวาด listener ถ้าออกจากสถานีกลางคัน
  useEffect(
    () => () => {
      captureRef.current?.stop();
      captureRef.current = null;
    },
    []
  );

  async function start() {
    setPhase("starting");
    const granted = await requestMotionPermission();
    if (!granted) {
      setPhase("unavailable");
      return;
    }
    const result = await startMotionCapture();
    if (!result.ok || !result.capture) {
      setPhase("unavailable");
      return;
    }
    captureRef.current = result.capture;
    completedRef.current = false;
    setSecondsLeft(durationSeconds);
    setPhase("running");
  }

  return (
    <StationShell index={index} total={total} title={title} instruction={instruction}>
      {phase === "idle" && (
        <Button size="lg" fullWidth leftIcon={<Play className="h-5 w-5" aria-hidden />} onClick={() => void start()}>
          เริ่ม
        </Button>
      )}

      {phase === "starting" && (
        <div className="grid place-items-center py-6">
          <Loader2 className="h-7 w-7 animate-spin text-brand" aria-hidden />
          <p className="mt-2 text-sm text-ink-soft">กำลังขอสิทธิ์อ่านการเคลื่อนไหว…</p>
        </div>
      )}

      {phase === "running" && (
        <div className="text-center">
          <p className="text-6xl font-bold tabular-nums text-brand" role="timer">
            {secondsLeft}
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {mode === "hold_still" ? "ถือเครื่องนิ่ง ๆ ระดับอก" : "เดินตรง ๆ ตามปกติ"}
          </p>
          {mode === "gait" && (
            <Button
              variant="outline"
              fullWidth
              className="mt-4"
              leftIcon={<Square className="h-4 w-4" aria-hidden />}
              onClick={finish}
            >
              ครบ 20 ก้าวแล้ว — หยุด
            </Button>
          )}
        </div>
      )}

      {phase === "unavailable" && (
        <div className="rounded-btn border border-hairline bg-canvas p-4">
          <p className="text-sm font-semibold text-ink">
            อุปกรณ์นี้ยังไม่รองรับการวัดการเคลื่อนไหวในหน้านี้
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            สถานีอื่นยังทำได้ตามปกติ หรือเปิดหน้านี้ในเบราว์เซอร์ของเครื่องเพื่อวัดให้ครบ
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {surface === "line" && (
              <Button
                variant="outline"
                fullWidth
                leftIcon={<ExternalLink className="h-4 w-4" aria-hidden />}
                onClick={() => void liffOpenWindow(window.location.href)}
              >
                เปิดในเบราว์เซอร์เพื่อวัดให้ครบ
              </Button>
            )}
            <Button variant="outline" fullWidth onClick={() => onComplete(null)}>
              ข้ามไปก่อน
            </Button>
          </div>
        </div>
      )}
    </StationShell>
  );
}

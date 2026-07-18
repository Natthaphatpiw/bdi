"use client";
// "รถกำลังมา" — Waiting Screen (spec §5.4): เช็คลิสต์ค้างไว้ + กล่องฝึกหายใจ
// 4-4-4 สำหรับผู้ดูแล + ข้อความให้กำลังใจหมุนเวียน (§11.5) + ปุ่มแจ้งครอบครัว
// ผ่าน liff.shareTargetPicker (fallback: คัดลอกข้อความ + เปิด LINE)
import { useEffect, useState } from "react";
import { Share2, Wind } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { liffShare } from "@/lib/client/liff";
import { useToast } from "@/store/toast";

const ENCOURAGEMENTS = [
  "คุณทำถูกต้องแล้ว ความช่วยเหลือกำลังมา",
  "การที่คุณอยู่ตรงนี้ คือสิ่งที่ดีที่สุดสำหรับผู้ป่วยแล้ว",
];

const BREATH_PHASES = [
  { label: "หายใจเข้า", seconds: 4 },
  { label: "ค้างไว้", seconds: 4 },
  { label: "หายใจออก", seconds: 4 },
];

interface Props {
  surface: "web" | "line";
  familyMessage: string;
  onFamilyNotified: () => void;
}

function BreathingBox() {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [second, setSecond] = useState(1);

  useEffect(() => {
    const t = setInterval(() => {
      setSecond((s) => {
        if (s >= BREATH_PHASES[phaseIdx].seconds) {
          setPhaseIdx((p) => (p + 1) % BREATH_PHASES.length);
          return 1;
        }
        return s + 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phaseIdx]);

  const phase = BREATH_PHASES[phaseIdx];
  const scale = phase.label === "หายใจเข้า" ? 1 + second * 0.08 : phase.label === "หายใจออก" ? 1.32 - second * 0.08 : 1.32;

  return (
    <div className="rounded-card border border-hairline bg-brand-soft p-4 text-center">
      <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-brand-dark">
        <Wind className="h-4 w-4" aria-hidden />
        สำหรับผู้ดูแล — หายใจไปพร้อมกัน
      </p>
      <div className="mx-auto mt-3 grid h-28 w-28 place-items-center">
        <div
          className="grid h-20 w-20 place-items-center rounded-full bg-brand text-white transition-transform duration-1000 ease-in-out motion-reduce:transition-none"
          style={{ transform: `scale(${scale})` }}
        >
          <span className="text-xl font-bold tabular-nums" role="timer">
            {second}
          </span>
        </div>
      </div>
      <p className="mt-3 text-base font-bold text-brand-dark">{phase.label} {phase.seconds} วินาที</p>
      <p className="mt-1 text-xs text-ink-soft">หายใจเข้า 4 วินาที — ค้าง 4 — ออก 4 ทำไปพร้อมกันนะ</p>
    </div>
  );
}

export function WaitingCare({ surface, familyMessage, onFamilyNotified }: Props) {
  const toast = useToast();
  const [msgIdx, setMsgIdx] = useState(0);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % ENCOURAGEMENTS.length), 7000);
    return () => clearInterval(t);
  }, []);

  async function notifyFamily() {
    setSharing(true);
    try {
      let shared = false;
      if (surface === "line") shared = await liffShare(familyMessage);
      if (!shared) {
        // fallback: คัดลอกข้อความ + เปิด LINE ให้ผู้ใช้ส่งต่อเอง
        try {
          await navigator.clipboard.writeText(familyMessage);
          toast("คัดลอกข้อความแล้ว — เปิด LINE เพื่อส่งให้ครอบครัว", "success");
        } catch {
          toast("คัดลอกไม่สำเร็จ ลองกดค้างเพื่อเลือกข้อความ", "error");
        }
        window.open("https://line.me/R/nv/chat", "_blank");
      }
      onFamilyNotified();
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p
        className="rounded-card bg-rights-soft px-4 py-3 text-center text-sm font-semibold text-rights"
        aria-live="polite"
      >
        {ENCOURAGEMENTS[msgIdx]}
      </p>
      <BreathingBox />
      <Button
        size="lg"
        fullWidth
        variant="line"
        leftIcon={<Share2 className="h-5 w-5" aria-hidden />}
        onClick={() => void notifyFamily()}
        disabled={sharing}
      >
        แจ้งครอบครัว
      </Button>
    </div>
  );
}

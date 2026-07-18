"use client";
// BEFAST Quick Check (~30 วินาที) — 3 การ์ด F-A-S + คำถามเวลาเริ่มอาการ (§4,
// copy §11.2–11.3). ตอบ "ใช่" ข้อใดข้อหนึ่ง → ถาม onset แล้วเข้า Emergency Mode
// ทันที; ตอบ "ไม่ใช่" ทั้งหมด → หน้า "ยังไม่พบสัญญาณเร่งด่วน" (ไม่มีคำสรุปโรค)
// กล้องหน้าเป็น preview เท่านั้น — ไม่วิเคราะห์ภาพ ไม่บันทึกภาพ
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Camera, CameraOff, Clock3, Loader2 } from "lucide-react";
import {
  BEFAST_CARDS,
  BEFAST_SPEECH_SENTENCE,
  ONSET_OPTIONS,
  ONSET_QUESTION,
  befastTriageText,
} from "@/lib/guardian/choices";
import { BEFAST_RECHECK_MINUTES } from "@/lib/guardian/config";
import { useGuardian } from "@/lib/guardian/store";
import { trackGuardianOutcome, updateGuardianEvent } from "@/lib/guardian/client";
import { saveEmergencyContext } from "@/lib/guardian/context";
import { vibrate } from "@/lib/guardian/alert";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/store/toast";
import type { BefastAnswer, BefastResult } from "@/lib/guardian/types";

interface Props {
  surface: "web" | "line";
}

type Step = "f" | "a" | "s" | "onset" | "negative";

const ARM_HOLD_SECONDS = 10;

function ProgressDots({ step }: { step: Step }) {
  const order: Step[] = ["f", "a", "s", "onset"];
  const idx = order.indexOf(step === "negative" ? "onset" : step);
  return (
    <div className="flex items-center justify-center gap-2" aria-hidden="true">
      {order.map((s, i) => (
        <span
          key={s}
          className={
            i <= idx ? "h-2 w-6 rounded-full bg-brand" : "h-2 w-2 rounded-full bg-hairline"
          }
        />
      ))}
    </div>
  );
}

export function BefastCheck({ surface }: Props) {
  const router = useRouter();
  const toast = useToast();
  const open = useGuardian((s) => s.befastOpen);
  const chosenSymptom = useGuardian((s) => s.chosenSymptom);
  const eventId = useGuardian((s) => s.eventId);
  const closeBefast = useGuardian((s) => s.closeBefast);
  const setPendingStory = useGuardian((s) => s.setPendingStory);
  const setRecheck = useGuardian((s) => s.setRecheck);

  const [step, setStep] = useState<Step>("f");
  const [answers, setAnswers] = useState<BefastResult>({});

  // --- กล้องหน้า (preview เท่านั้น) ---
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  async function toggleCamera() {
    if (cameraOn) {
      stopCamera();
      return;
    }
    setCameraBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraOn(true);
    } catch {
      toast("เปิดกล้องไม่ได้ ใช้กระจกส่องแทนได้เลย");
    } finally {
      setCameraBusy(false);
    }
  }

  // --- countdown การ์ดแขน ---
  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const t = setTimeout(() => {
      if (countdown === 1) vibrate(80);
      setCountdown(countdown - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // reset ทุกครั้งที่เปิด
  useEffect(() => {
    if (open) {
      setStep("f");
      setAnswers({});
      setCountdown(null);
    } else {
      stopCamera();
    }
  }, [open, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  if (!open) return null;

  const homePath = surface === "line" ? "/liff" : "/";
  const card = step === "f" || step === "a" || step === "s"
    ? BEFAST_CARDS.find((c) => c.key === step)!
    : null;

  function answerCard(key: "f" | "a" | "s", value: BefastAnswer) {
    stopCamera();
    setCountdown(null);
    const next = { ...answers, [key]: value };
    setAnswers(next);
    if (value === "yes") {
      // พบความผิดปกติ → ข้ามการ์ดที่เหลือ ถาม onset ทันที (ใช้ต่อในสคริปต์ 1669)
      setStep("onset");
      return;
    }
    if (key === "f") setStep("a");
    else if (key === "a") setStep("s");
    else setStep("onset");
  }

  function chooseOnset(onset: string) {
    const result: BefastResult = { ...answers, onset };
    setAnswers(result);
    const abnormal = BEFAST_CARDS.filter((c) => result[c.key] === "yes").map((c) => c.title);
    const hasAbnormal = abnormal.length > 0;

    if (eventId) {
      void updateGuardianEvent(eventId, {
        payload: { befast: { f: result.f, a: result.a, s: result.s }, onset },
      }).catch(() => undefined);
    }

    if (hasAbnormal) {
      trackGuardianOutcome(eventId, "emergency_opened", { via: "befast" });
      const symptomText = [chosenSymptom, `เช็คเบื้องต้นพบความผิดปกติที่${abnormal.join("และ")}`]
        .filter(Boolean)
        .join(" · ");
      saveEmergencyContext({
        eventId: eventId ?? undefined,
        symptom: symptomText,
        onset,
        befast: { f: result.f, a: result.a, s: result.s },
        enteredAt: new Date().toISOString(),
      });
      closeBefast();
      router.push("/guardian/emergency");
    } else {
      trackGuardianOutcome(eventId, "befast_negative");
      setStep("negative");
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && closeBefast()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/50" />
        <Dialog.Content
          className="fixed inset-0 z-[71] flex flex-col overflow-y-auto bg-canvas"
          aria-describedby={undefined}
        >
          <div className="bg-brand px-5 pb-4 pt-safe text-white">
            <div className="mx-auto w-full max-w-xl pt-4">
              <Dialog.Title className="text-lg font-bold">
                เช็คสัญญาณเบื้องต้น (ประมาณ 30 วินาที)
              </Dialog.Title>
              <p className="mt-0.5 text-sm text-white/85">
                ทำตามทีละข้อ ตอบตามที่เห็นจริงได้เลย
              </p>
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-8 pt-4">
            <ProgressDots step={step} />

            {card && (
              <section className="card-enter rounded-card border border-hairline bg-surface p-5 shadow-card">
                <p className="text-xs font-bold uppercase tracking-wide text-brand">
                  {card.letter} · {card.title}
                </p>
                <h2 className="mt-1 text-lg font-bold leading-snug text-ink">{card.instruction}</h2>

                {step === "f" && (
                  <div className="mt-3">
                    <video
                      ref={videoRef}
                      muted
                      playsInline
                      className={
                        cameraOn
                          ? "aspect-[3/4] w-full rounded-card border border-hairline object-cover [transform:scaleX(-1)]"
                          : "hidden"
                      }
                    />
                    <Button
                      variant="outline"
                      fullWidth
                      className="mt-2"
                      onClick={() => void toggleCamera()}
                      disabled={cameraBusy}
                      leftIcon={
                        cameraBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : cameraOn ? (
                          <CameraOff className="h-4 w-4" aria-hidden />
                        ) : (
                          <Camera className="h-4 w-4" aria-hidden />
                        )
                      }
                    >
                      {cameraOn ? "ปิดกล้อง" : "เปิดกล้องหน้าเพื่อส่องดู"}
                    </Button>
                    <p className="mt-1.5 text-xs text-ink-muted">
                      กล้องใช้ส่องดูเท่านั้น ระบบไม่วิเคราะห์และไม่บันทึกภาพ
                    </p>
                  </div>
                )}

                {step === "a" && (
                  <div className="mt-3 text-center">
                    {countdown === null ? (
                      <Button
                        variant="outline"
                        fullWidth
                        onClick={() => setCountdown(ARM_HOLD_SECONDS)}
                        leftIcon={<Clock3 className="h-4 w-4" aria-hidden />}
                      >
                        เริ่มจับเวลา {ARM_HOLD_SECONDS} วินาที
                      </Button>
                    ) : countdown > 0 ? (
                      <p className="py-2 text-5xl font-bold tabular-nums text-brand" role="timer">
                        {countdown}
                      </p>
                    ) : (
                      <p className="py-2 text-lg font-semibold text-brand">ครบเวลาแล้ว — สังเกตแขนทั้งสองข้าง</p>
                    )}
                  </div>
                )}

                {step === "s" && (
                  <p className="mt-3 rounded-card bg-brand-soft px-4 py-3 text-center text-xl font-bold text-brand-dark">
                    “{BEFAST_SPEECH_SENTENCE}”
                  </p>
                )}

                <p className="mt-4 text-base font-semibold text-ink">{card.question}</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Button
                    size="lg"
                    variant="danger"
                    onClick={() => answerCard(card.key, "yes")}
                  >
                    ใช่
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => answerCard(card.key, "no")}>
                    ไม่ใช่
                  </Button>
                </div>
              </section>
            )}

            {step === "onset" && (
              <section className="card-enter rounded-card border border-hairline bg-surface p-5 shadow-card">
                <h2 className="text-lg font-bold text-ink">{ONSET_QUESTION}</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  ข้อนี้สำคัญมาก — เวลาเริ่มอาการช่วยทีมแพทย์ตัดสินใจได้เร็วขึ้น
                </p>
                <div className="mt-3 flex flex-col gap-2.5">
                  {ONSET_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => chooseOnset(opt)}
                      className="min-h-14 rounded-btn border border-hairline bg-surface px-4 py-3 text-left text-base font-semibold text-ink transition-colors hover:border-brand/50"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {step === "negative" && (
              <section className="card-enter rounded-card border border-hairline bg-surface p-5 shadow-card">
                <h2 className="text-lg font-bold text-ink">ยังไม่พบสัญญาณเร่งด่วนจากการเช็คนี้</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  ยังไม่พบสัญญาณเร่งด่วนจากการเช็คนี้ — แต่ร่างกายคุณส่งสัญญาณบางอย่างมา
                  เราแนะนำให้เช็คซ้ำอีกครั้งใน 1 ชั่วโมง และถ้ามีอาการเพิ่ม
                  ให้กลับมากดเช็คได้ทันที
                </p>
                <div className="mt-4 flex flex-col gap-2.5">
                  <Button
                    size="lg"
                    fullWidth
                    onClick={() => {
                      setPendingStory(befastTriageText(chosenSymptom ?? undefined));
                      closeBefast();
                      router.push(homePath);
                    }}
                  >
                    เล่าอาการให้ระบบช่วยดูต่อ
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    fullWidth
                    onClick={() => {
                      setRecheck(Date.now() + BEFAST_RECHECK_MINUTES * 60 * 1000, chosenSymptom);
                      closeBefast();
                      toast("ตั้งเตือนเช็คซ้ำแล้ว — จะมีการ์ดแจ้งบนหน้าหลัก", "success");
                    }}
                  >
                    เตือนฉันเช็คซ้ำใน 1 ชั่วโมง
                  </Button>
                </div>
              </section>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

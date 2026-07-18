"use client";
// Anomaly Popup — "ตัวจุดคำถาม" (spec §3, copy §11.1). Full-screen sheet that
// slides up, locks background scroll, haptic + optional soft tone on open.
// สีแดงใช้เฉพาะแถบหัว (บริบทฉุกเฉินเท่านั้นทั้งแอป). The popup never diagnoses:
// it asks one question and the user chooses their own path.
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { HeartPulse } from "lucide-react";
import { PATTERN_CONFIGS } from "@/lib/guardian/choices";
import { useGuardian } from "@/lib/guardian/store";
import { trackGuardianOutcome, updateGuardianEvent } from "@/lib/guardian/client";
import { saveEmergencyContext } from "@/lib/guardian/context";
import { playAlertTone, vibrate } from "@/lib/guardian/alert";
import { useToast } from "@/store/toast";
import { useUi } from "@/store/ui";
import type { GuardianChoice } from "@/lib/guardian/types";

interface Props {
  surface: "web" | "line";
}

export function AnomalyPopup({ surface }: Props) {
  const router = useRouter();
  const toast = useToast();
  const guardianSound = useUi((s) => s.guardianSound);
  const activePattern = useGuardian((s) => s.activePattern);
  const eventId = useGuardian((s) => s.eventId);
  const closePopup = useGuardian((s) => s.closePopup);
  const startBefast = useGuardian((s) => s.startBefast);
  const setPendingStory = useGuardian((s) => s.setPendingStory);
  const announced = useRef(false);

  const config = activePattern ? PATTERN_CONFIGS[activePattern] : null;
  const open = !!config;

  useEffect(() => {
    if (open && !announced.current) {
      announced.current = true;
      vibrate([120, 60, 120]);
      if (guardianSound) playAlertTone();
    }
    if (!open) announced.current = false;
  }, [open, guardianSound]);

  if (!config) return null;

  const homePath = surface === "line" ? "/liff" : "/";

  function choose(choice: GuardianChoice) {
    if (eventId) {
      void updateGuardianEvent(eventId, { chosen_symptom: choice.label }).catch(() => undefined);
    }
    switch (choice.route) {
      case "emergency": {
        trackGuardianOutcome(eventId, "emergency_opened", { via: "popup" });
        saveEmergencyContext({
          eventId: eventId ?? undefined,
          pattern: config!.pattern,
          symptom: choice.label,
          enteredAt: new Date().toISOString(),
        });
        closePopup();
        router.push("/guardian/emergency");
        break;
      }
      case "befast": {
        trackGuardianOutcome(eventId, "befast_started");
        startBefast(choice.label);
        break;
      }
      case "triage": {
        trackGuardianOutcome(eventId, "routed_triage", { symptom: choice.label });
        setPendingStory(choice.triageText ?? choice.label);
        closePopup();
        router.push(homePath);
        break;
      }
      case "dismiss": {
        trackGuardianOutcome(eventId, "dismissed");
        closePopup();
        toast("รับทราบ ระบบจะเฝ้าดูแลต่อให้");
        break;
      }
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && closePopup()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/50" />
        <Dialog.Content
          className="fixed inset-0 z-[71] flex flex-col overflow-y-auto bg-canvas animate-rise motion-reduce:animate-none"
          aria-describedby={undefined}
        >
          {/* แถบหัวสีแดงเข้ม — สีแดงสงวนไว้ให้บริบทฉุกเฉิน */}
          <div className="bg-safety px-5 pb-5 pt-safe text-white">
            <div className="mx-auto flex w-full max-w-xl items-start gap-3 pt-5">
              <HeartPulse className="mt-1 h-7 w-7 shrink-0" aria-hidden="true" />
              <div>
                <Dialog.Title className="text-xl font-bold leading-snug">
                  {config.title}
                </Dialog.Title>
                <p className="mt-1 text-sm text-white/85">
                  ใช้เวลาไม่ถึงนาที — เลือกข้อที่ตรงกับตอนนี้ที่สุด
                </p>
              </div>
            </div>
          </div>

          <div className="mx-auto w-full max-w-xl flex-1 px-4 pb-8 pt-5">
            <h2 className="text-lg font-bold text-ink">{config.question}</h2>
            <div className="mt-4 flex flex-col gap-3">
              {config.choices.map((choice) => {
                const isDismiss = choice.route === "dismiss";
                return (
                  <button
                    key={choice.id}
                    type="button"
                    onClick={() => choose(choice)}
                    className={
                      isDismiss
                        ? "min-h-14 rounded-card border border-hairline bg-surface px-5 py-4 text-left text-base font-semibold text-ink-soft shadow-card transition-colors hover:border-ink-muted"
                        : "min-h-14 rounded-card border border-hairline bg-surface px-5 py-4 text-left text-base font-semibold text-ink shadow-card transition-colors hover:border-safety/50"
                    }
                  >
                    {choice.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-6 text-center text-xs leading-relaxed text-ink-muted">
              ระบบสังเกตจากการใช้งานเครื่องเท่านั้น ไม่ใช่การวินิจฉัย
              คุณเป็นผู้ตัดสินใจทุกขั้นตอน
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

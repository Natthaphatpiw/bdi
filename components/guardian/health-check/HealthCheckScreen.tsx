"use client";
// "เช็คสุขภาพ 2 นาที" — orchestrator (spec §6): Consent Gate → 4 สถานี →
// อัปโหลด → หน้าออกผล. Consent มาก่อนเสมอ: ไม่มี consent record ที่ active
// ระบบไม่ขอ sensor permission ใด ๆ (Guardrail §9.3)
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HeartPulse, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConsentGate } from "./ConsentGate";
import { MotionStation } from "./MotionStation";
import { TapTargetStation } from "./TapTargetStation";
import { TypingStation } from "./TypingStation";
import { ResultScreen } from "./ResultScreen";
import {
  completeHealthCheck,
  drainSampleQueue,
  getGuardianConsent,
  grantGuardianConsent,
  queueStationSamples,
  startHealthCheck,
} from "@/lib/guardian/client";
import { setMotionConsent } from "@/lib/guardian/motion";
import {
  computeGaitFeatures,
  computeMotionFeatures,
  computeTapFeatures,
  computeTypingFeatures,
} from "@/lib/guardian/features";
import {
  GAIT_MAX_SECONDS,
  HOLD_STILL_SECONDS,
  SAMPLES_CHUNK_BYTES,
} from "@/lib/guardian/config";
import { useGuardian } from "@/lib/guardian/store";
import { useAuth } from "@/lib/client/auth";
import { useToast } from "@/store/toast";
import { ApiClientError } from "@/lib/client/api";
import type {
  HealthCheckCompleteResponse,
  MotionSample,
  StationId,
  TapSample,
  TypingSample,
} from "@/lib/guardian/types";

interface Props {
  surface: "web" | "line";
  basePath: string;
}

type Phase = "loading" | "consent" | "ready" | "stations" | "finishing" | "result" | "error";

const STATION_ORDER: StationId[] = ["hold_still", "tap_target", "typing", "gait"];

function deviceInfo(): Record<string, unknown> {
  return {
    ua: navigator.userAgent,
    platform: navigator.platform ?? "",
    screen: `${window.screen.width}x${window.screen.height}`,
    dpr: window.devicePixelRatio ?? 1,
  };
}

/** แตก samples เป็น chunk ต่อเนื่อง (seq) ให้แต่ละ chunk ไม่เกิน ~150KB */
function chunkSamples(samples: unknown[]): unknown[][] {
  const chunks: unknown[][] = [];
  let current: unknown[] = [];
  let size = 2;
  for (const s of samples) {
    const len = JSON.stringify(s).length + 1;
    if (current.length && size + len > SAMPLES_CHUNK_BYTES) {
      chunks.push(current);
      current = [];
      size = 2;
    }
    current.push(s);
    size += len;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export function HealthCheckScreen({ surface, basePath }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { ready } = useAuth();
  const setPendingStory = useGuardian((s) => s.setPendingStory);

  const [phase, setPhase] = useState<Phase>("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stationIdx, setStationIdx] = useState(0);
  const [result, setResult] = useState<HealthCheckCompleteResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // ตรวจ consent เมื่อ auth พร้อม — ก่อนหน้านั้นไม่แตะ sensor ใด ๆ
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    getGuardianConsent()
      .then((status) => {
        if (cancelled) return;
        if (status.active && status.consent_id) {
          setMotionConsent(status.consent_id);
          setPhase("ready");
        } else {
          setMotionConsent(null);
          setPhase("consent");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMsg("โหลดสถานะความยินยอมไม่สำเร็จ");
          setPhase("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  // ออกจากหน้านี้ → ปิด gate ฝั่ง client (ไม่ให้ capture ข้ามหน้า)
  useEffect(() => () => setMotionConsent(null), []);

  async function acceptConsent() {
    try {
      const { consent_id } = await grantGuardianConsent();
      setMotionConsent(consent_id);
      setPhase("ready");
    } catch (e) {
      toast(e instanceof ApiClientError ? e.message : "บันทึกความยินยอมไม่สำเร็จ", "error");
    }
  }

  async function begin() {
    setPhase("loading");
    try {
      const res = await startHealthCheck(deviceInfo());
      setSessionId(res.session_id);
      setStationIdx(0);
      setPhase("stations");
    } catch (e) {
      setErrorMsg(e instanceof ApiClientError ? e.message : "เริ่มรอบเช็คไม่สำเร็จ");
      setPhase("error");
    }
  }

  const uploadStation = useCallback(
    (
      station: StationId,
      samples: unknown[],
      features: Record<string, number>,
      startedAt: string,
      endedAt: string,
      sampleRateHz?: number
    ) => {
      if (!sessionId || !samples.length) return;
      const chunks = chunkSamples(samples);
      chunks.forEach((chunk, seq) => {
        queueStationSamples({
          session_id: sessionId,
          station,
          seq,
          sample_rate_hz: sampleRateHz,
          started_at: startedAt,
          ended_at: endedAt,
          samples: chunk,
          features, // client คำนวณจาก samples ทั้งชุด แนบซ้ำทุก chunk
        });
      });
    },
    [sessionId]
  );

  function nextStation() {
    if (stationIdx + 1 < STATION_ORDER.length) {
      setStationIdx(stationIdx + 1);
    } else {
      void finishAll();
    }
  }

  async function finishAll() {
    if (!sessionId) return;
    setPhase("finishing");
    try {
      await drainSampleQueue();
      const res = await completeHealthCheck(sessionId);
      setResult(res);
      setPhase("result");
    } catch (e) {
      setErrorMsg(e instanceof ApiClientError ? e.message : "สรุปผลไม่สำเร็จ");
      setPhase("error");
    }
  }

  function motionRate(samples: MotionSample[]): number | undefined {
    if (samples.length < 2) return undefined;
    const dur = samples[samples.length - 1].t - samples[0].t;
    return dur > 0 ? Math.round(((samples.length - 1) * 1000) / dur) : undefined;
  }

  function handleMotionDone(station: "hold_still" | "gait", samples: MotionSample[] | null) {
    if (samples?.length) {
      const endedAt = new Date().toISOString();
      const startedAt = new Date(Date.now() - (samples[samples.length - 1]?.t ?? 0)).toISOString();
      const features =
        station === "hold_still"
          ? computeMotionFeatures(samples)
          : computeGaitFeatures(samples);
      uploadStation(
        station,
        samples,
        features as unknown as Record<string, number>,
        startedAt,
        endedAt,
        motionRate(samples)
      );
    }
    nextStation();
  }

  function handleTapDone(samples: TapSample[]) {
    const endedAt = new Date().toISOString();
    const startedAt = new Date(Date.now() - (samples[samples.length - 1]?.t ?? 0)).toISOString();
    uploadStation(
      "tap_target",
      samples,
      computeTapFeatures(samples) as unknown as Record<string, number>,
      startedAt,
      endedAt
    );
    nextStation();
  }

  function handleTypingDone(samples: TypingSample[], accuracy: number) {
    const endedAt = new Date().toISOString();
    const startedAt = new Date(Date.now() - (samples[samples.length - 1]?.t ?? 0)).toISOString();
    uploadStation(
      "typing",
      samples,
      computeTypingFeatures(samples, accuracy) as unknown as Record<string, number>,
      startedAt,
      endedAt
    );
    nextStation();
  }

  const station = STATION_ORDER[stationIdx];

  return (
    <div className="flex flex-col gap-4">
      {phase === "loading" && (
        <div className="grid min-h-[50vh] place-items-center">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand" aria-hidden />
            <p className="mt-3 text-sm text-ink-soft">กำลังเตรียมข้อมูล…</p>
          </div>
        </div>
      )}

      {phase === "consent" && (
        <ConsentGate onAccept={acceptConsent} onLater={() => router.push(basePath || "/")} />
      )}

      {phase === "ready" && (
        <section className="card-enter rounded-card border border-hairline bg-surface p-5 shadow-card">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-soft">
            <HeartPulse className="h-7 w-7 text-brand" aria-hidden />
          </div>
          <h1 className="mt-3 text-center text-xl font-bold text-ink">เช็คสุขภาพ 2 นาที</h1>
          <p className="mt-2 text-center text-sm leading-relaxed text-ink-soft">
            4 สถานีสั้น ๆ — ถือนิ่ง · แตะตามจุด · พิมพ์ประโยค · เดิน 20 ก้าว
            ทำเสร็จแล้วระบบจะเก็บเป็นเส้นฐานของคุณ ไว้เทียบการเปลี่ยนแปลงกับตัวเอง
          </p>
          <Button size="lg" fullWidth className="mt-4" onClick={() => void begin()}>
            เริ่มเช็คเลย
          </Button>
        </section>
      )}

      {phase === "stations" && sessionId && (
        <>
          {station === "hold_still" && (
            <MotionStation
              key="hold_still"
              index={0}
              total={4}
              title="ถือนิ่ง"
              instruction={`ถือเครื่องนิ่ง ๆ ระดับอก ${HOLD_STILL_SECONDS} วินาที หายใจตามปกติ`}
              mode="hold_still"
              durationSeconds={HOLD_STILL_SECONDS}
              surface={surface}
              onComplete={(s) => handleMotionDone("hold_still", s)}
            />
          )}
          {station === "tap_target" && (
            <TapTargetStation key="tap_target" index={1} total={4} onComplete={handleTapDone} />
          )}
          {station === "typing" && (
            <TypingStation key="typing" index={2} total={4} onComplete={handleTypingDone} />
          )}
          {station === "gait" && (
            <MotionStation
              key="gait"
              index={3}
              total={4}
              title="เดิน 20 ก้าว"
              instruction="ถือเครื่องไว้ในมือ เดินตรง ๆ ประมาณ 20 ก้าว แล้วกดหยุด (หรือรอครบเวลา)"
              mode="gait"
              durationSeconds={GAIT_MAX_SECONDS}
              surface={surface}
              onComplete={(s) => handleMotionDone("gait", s)}
            />
          )}
        </>
      )}

      {phase === "finishing" && (
        <div className="grid min-h-[50vh] place-items-center">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand" aria-hidden />
            <p className="mt-3 text-sm text-ink-soft">กำลังบันทึกและสรุปผล…</p>
          </div>
        </div>
      )}

      {phase === "result" && result && (
        <ResultScreen
          result={result}
          onTellSymptoms={() => {
            setPendingStory(
              "ช่วงนี้รู้สึกไม่ค่อยเหมือนเดิม ผลเช็คสุขภาพประจำเดือนต่างจากปกติของฉัน อยากเล่าอาการให้ช่วยดู"
            );
            router.push(basePath || "/");
          }}
          onDone={() => router.push(basePath || "/")}
        />
      )}

      {phase === "error" && (
        <div className="card-enter rounded-card border border-hairline bg-surface p-6 text-center shadow-card">
          <p className="text-sm text-ink-soft">{errorMsg || "เกิดข้อผิดพลาด"}</p>
          <Button fullWidth className="mt-4" onClick={() => location.reload()}>
            ลองใหม่
          </Button>
        </div>
      )}
    </div>
  );
}

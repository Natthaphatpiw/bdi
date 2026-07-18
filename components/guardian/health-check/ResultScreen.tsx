"use client";
// หน้าออกผลเช็คสุขภาพ (spec §6.4)
//  - ครั้งแรก: "นี่คือเส้นฐานสุขภาพของคุณ" — สเกลเชิงคุณภาพ ไม่ใช่คะแนนแข่งขัน
//  - ครั้งถัดไป: เทียบ baseline ด้วย z-score ต่อ metric ("ใกล้เคียง/ต่างพอสมควร")
//  - เบี่ยงหลาย metric → การ์ดโทนอำพัน (§11.10) ชวนเล่าอาการ — ห้ามพูดชื่อโรค
import { useEffect, useState } from "react";
import { Activity, Footprints, Hand, History, Keyboard, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { HistorySparkline } from "./HistorySparkline";
import { getHealthCheckHistory } from "@/lib/guardian/client";
import { COMPARE_METRICS, MEDICAL_DISCLAIMER, Z_DEVIATION } from "@/lib/guardian/config";
import type {
  HealthCheckCompleteResponse,
  HealthCheckHistoryEntry,
  StationId,
} from "@/lib/guardian/types";

interface Props {
  result: HealthCheckCompleteResponse;
  onTellSymptoms: () => void;
  onDone: () => void;
}

const STATION_CARDS: {
  station: StationId;
  label: string;
  icon: React.ReactNode;
  describe: (f: Record<string, number>) => string;
}[] = [
  {
    station: "hold_still",
    label: "ความนิ่งของมือ",
    icon: <Hand className="h-5 w-5" aria-hidden />,
    describe: (f) => `แรงสั่นเฉลี่ย ${f.rms_mag ?? "—"} · ความถี่เด่น ${f.dominant_freq_hz ?? "—"} Hz`,
  },
  {
    station: "tap_target",
    label: "ความแม่นยำการแตะ",
    icon: <Activity className="h-5 w-5" aria-hidden />,
    describe: (f) =>
      `เบี่ยงจากเป้าเฉลี่ย ${f.mean_offset_px ?? "—"} px · ตอบสนอง ${f.mean_reaction_ms ?? "—"} ms`,
  },
  {
    station: "typing",
    label: "จังหวะการพิมพ์",
    icon: <Keyboard className="h-5 w-5" aria-hidden />,
    describe: (f) => `จังหวะเฉลี่ย ${f.iki_mean_ms ?? "—"} ms ต่อครั้ง`,
  },
  {
    station: "gait",
    label: "จังหวะการเดิน",
    icon: <Footprints className="h-5 w-5" aria-hidden />,
    describe: (f) => `${f.step_count ?? "—"} ก้าว · ${f.cadence_spm ?? "—"} ก้าว/นาที`,
  },
];

const SPARKLINES: { station: StationId; metric: string; label: string }[] = [
  { station: "hold_still", metric: "rms_mag", label: "ความนิ่งของมือ" },
  { station: "tap_target", metric: "mean_offset_px", label: "ความแม่นยำการแตะ (px)" },
  { station: "typing", metric: "iki_mean_ms", label: "จังหวะการพิมพ์ (ms)" },
  { station: "gait", metric: "cadence_spm", label: "จังหวะการเดิน (ก้าว/นาที)" },
];

function stationDeviation(
  station: StationId,
  zscores: Record<string, number> | undefined
): "near" | "far" | "unknown" {
  if (!zscores) return "unknown";
  const zs = COMPARE_METRICS[station]
    .map((m) => zscores[`${station}.${m}`])
    .filter((z): z is number => typeof z === "number");
  if (!zs.length) return "unknown";
  return zs.some((z) => Math.abs(z) >= Z_DEVIATION) ? "far" : "near";
}

export function ResultScreen({ result, onTellSymptoms, onDone }: Props) {
  const { summary, is_baseline: isBaseline } = result;
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HealthCheckHistoryEntry[] | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);

  useEffect(() => {
    if (!showHistory || history) return;
    setHistoryBusy(true);
    getHealthCheckHistory()
      .then((res) => setHistory(res.entries))
      .catch(() => setHistory([]))
      .finally(() => setHistoryBusy(false));
  }, [showHistory, history]);

  return (
    <div className="card-enter flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-bold text-ink">
          {isBaseline ? "นี่คือเส้นฐานสุขภาพของคุณ" : "ผลเทียบกับเส้นฐานของคุณ"}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {isBaseline
            ? "ครั้งถัดไประบบจะเทียบการเปลี่ยนแปลงกับตัวคุณเอง ไม่เทียบกับใครทั้งนั้น"
            : "เทียบกับข้อมูลของตัวคุณเองเท่านั้น"}
        </p>
      </header>

      <div className="flex flex-col gap-2.5">
        {STATION_CARDS.map((card) => {
          const f = summary.features?.[card.station];
          const done = summary.stations_completed.includes(card.station);
          const deviation = isBaseline ? "unknown" : stationDeviation(card.station, summary.zscores);
          return (
            <div
              key={card.station}
              className="flex items-center gap-3 rounded-card border border-hairline bg-surface p-4 shadow-card"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                {card.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{card.label}</p>
                <p className="text-xs text-ink-muted">
                  {done && f ? card.describe(f) : "ข้ามไว้ในรอบนี้"}
                </p>
              </div>
              {!isBaseline && done && deviation !== "unknown" && (
                <span
                  className={
                    deviation === "near"
                      ? "shrink-0 rounded-full bg-rights-soft px-2.5 py-1 text-[11px] font-semibold text-rights"
                      : "shrink-0 rounded-full bg-benefit-soft px-2.5 py-1 text-[11px] font-semibold text-benefit"
                  }
                >
                  {deviation === "near" ? "ใกล้เคียงเส้นฐานของคุณ" : "ต่างจากเส้นฐานพอสมควร"}
                </span>
              )}
              {isBaseline && done && (
                <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand-dark">
                  บันทึกเป็นเส้นฐานแล้ว
                </span>
              )}
            </div>
          );
        })}
      </div>

      {summary.deviated && (
        <section className="rounded-card border border-benefit/40 bg-benefit-soft p-4">
          <p className="text-sm leading-relaxed text-ink">
            ผลรอบนี้ต่างจากเส้นฐานของคุณอยู่บ้าง อาจมาจากความเหนื่อยหรือหลายปัจจัย —
            ถ้าช่วงนี้มีอาการอะไร ลองเล่าให้ระบบช่วยดูได้เลย
          </p>
          <Button
            size="lg"
            fullWidth
            className="mt-3"
            leftIcon={<MessageCircle className="h-5 w-5" aria-hidden />}
            onClick={onTellSymptoms}
          >
            เล่าอาการตอนนี้
          </Button>
        </section>
      )}

      <Button
        variant="outline"
        fullWidth
        leftIcon={<History className="h-4 w-4" aria-hidden />}
        onClick={() => setShowHistory((v) => !v)}
      >
        {showHistory ? "ซ่อนประวัติ" : "ดูประวัติ"}
      </Button>

      {showHistory && (
        <div className="flex flex-col gap-2">
          {historyBusy && (
            <div className="grid place-items-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-brand" aria-hidden />
            </div>
          )}
          {history &&
            SPARKLINES.map((s) => (
              <HistorySparkline
                key={`${s.station}.${s.metric}`}
                entries={history}
                station={s.station}
                metric={s.metric}
                label={s.label}
              />
            ))}
        </div>
      )}

      <Button size="lg" fullWidth onClick={onDone}>
        เสร็จสิ้น
      </Button>
      <p className="pb-2 text-center text-xs text-ink-muted">{MEDICAL_DISCLAIMER}</p>
    </div>
  );
}

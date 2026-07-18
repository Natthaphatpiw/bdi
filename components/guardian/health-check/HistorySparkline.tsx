"use client";
// Sparkline ย้อนหลังต่อ metric — SVG เส้นเดียว ไม่มี lib กราฟ
import type { HealthCheckHistoryEntry, StationId } from "@/lib/guardian/types";

interface Props {
  entries: HealthCheckHistoryEntry[]; // ใหม่ → เก่า (จาก API)
  station: StationId;
  metric: string;
  label: string;
}

const W = 280;
const H = 48;
const PAD = 6;

export function HistorySparkline({ entries, station, metric, label }: Props) {
  const values = [...entries]
    .reverse() // เก่า → ใหม่
    .map((e) => e.summary?.features?.[station]?.[metric])
    .filter((v): v is number => typeof v === "number");

  if (values.length < 2) {
    return (
      <div className="rounded-btn border border-hairline bg-canvas px-3 py-2.5">
        <p className="text-xs font-semibold text-ink-soft">{label}</p>
        <p className="mt-1 text-xs text-ink-muted">ยังมีข้อมูลไม่พอสำหรับกราฟ — ทำเช็คครั้งถัดไปเพื่อดูแนวโน้ม</p>
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = PAD + (i * (W - PAD * 2)) / (values.length - 1);
      const y = H - PAD - ((v - min) * (H - PAD * 2)) / span;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = values[values.length - 1];

  return (
    <div className="rounded-btn border border-hairline bg-canvas px-3 py-2.5">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold text-ink-soft">{label}</p>
        <p className="text-xs tabular-nums text-ink-muted">ล่าสุด {Math.round(last * 100) / 100}</p>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1 h-12 w-full"
        role="img"
        aria-label={`กราฟแนวโน้ม ${label} จาก ${values.length} ครั้งล่าสุด`}
      >
        <polyline points={points} fill="none" stroke="#16315B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {values.map((v, i) => {
          const x = PAD + (i * (W - PAD * 2)) / (values.length - 1);
          const y = H - PAD - ((v - min) * (H - PAD * 2)) / span;
          return <circle key={i} cx={x} cy={y} r={i === values.length - 1 ? 3 : 2} fill="#16315B" />;
        })}
      </svg>
    </div>
  );
}

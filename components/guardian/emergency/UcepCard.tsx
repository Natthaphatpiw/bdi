"use client";
// UCEP Fallback Card — การ์ดเรือธง (spec §5.4, copy §11.6): เมื่อรถไม่ว่าง/รอนาน
// ผู้ใช้มีสิทธิเข้า ER ที่ใกล้ที่สุดได้ทุกแห่งรวมเอกชน ไม่ต้องสำรองจ่ายใน 72 ชม.
// ER ใกล้สุด 3 แห่งจาก seed list (ข้อมูล facility จริงยังไม่มี flag ER) เรียงตาม
// ระยะจากพิกัดผู้ใช้ — ทำงานได้แม้ไม่มีพิกัด (ใช้ลำดับตั้งต้น)
import { Navigation, Phone, Car } from "lucide-react";
import { haversineKm } from "@/lib/mvp/geo";
import { ER_SEED, mapsDirectionsUrl, type ErFacility } from "@/lib/guardian/er-seed";
import { Button } from "@/components/ui/Button";

interface Props {
  lat?: number;
  lng?: number;
}

export function nearestErs(lat?: number, lng?: number, count = 3): (ErFacility & { distance_km?: number })[] {
  if (lat == null || lng == null) return ER_SEED.slice(0, count);
  return ER_SEED.map((er) => ({
    ...er,
    distance_km: haversineKm({ lat, lng }, { lat: er.lat, lng: er.lng }),
  }))
    .sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999))
    .slice(0, count);
}

export function UcepCard({ lat, lng }: Props) {
  const ers = nearestErs(lat, lng);
  const rideUrl = process.env.NEXT_PUBLIC_RIDE_APP_URL || mapsDirectionsUrl(ers[0].lat, ers[0].lng);

  return (
    <section className="rounded-card border-2 border-benefit/50 bg-benefit-soft p-4">
      <h2 className="text-lg font-bold text-benefit">ไม่ต้องรอ — คุณมีสิทธิ UCEP</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink">
        กรณีเจ็บป่วยฉุกเฉินวิกฤต คุณมีสิทธิเข้ารักษาที่โรงพยาบาลที่ใกล้ที่สุดได้ทุกแห่ง
        รวมโรงพยาบาลเอกชน โดยไม่ต้องสำรองจ่ายภายใน 72 ชั่วโมงแรก
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {ers.map((er) => (
          <div
            key={er.id}
            className="flex items-center gap-3 rounded-btn border border-hairline bg-surface px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{er.name}</p>
              <p className="text-xs text-ink-muted">
                {er.kindLabel}
                {er.distance_km != null ? ` · ${er.distance_km} กม.` : ""}
                {er.note ? ` · ${er.note}` : ""}
              </p>
            </div>
            <a
              href={mapsDirectionsUrl(er.lat, er.lng)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-btn bg-facility px-3 text-sm font-semibold text-white"
            >
              <Navigation className="h-4 w-4" aria-hidden />
              นำทาง
            </a>
          </div>
        ))}
      </div>

      <a href={rideUrl} target="_blank" rel="noreferrer" className="mt-3 block">
        <Button size="lg" fullWidth leftIcon={<Car className="h-5 w-5" aria-hidden />}>
          เรียกรถไปโรงพยาบาล
        </Button>
      </a>

      <p className="mt-3 rounded-btn bg-surface px-3 py-2.5 text-sm font-semibold leading-relaxed text-ink">
        ถึงโรงพยาบาลแล้ว ยื่นบัตรประชาชน และแจ้งว่า
        “ผู้ป่วยฉุกเฉินวิกฤต ขอใช้สิทธิ UCEP”
      </p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold">
        <a href="tel:1669" className="inline-flex items-center gap-1 text-safety underline">
          <Phone className="h-3.5 w-3.5" aria-hidden />
          โทร 1669 อีกครั้ง
        </a>
        <a href="tel:1646" className="inline-flex items-center gap-1 text-safety underline">
          <Phone className="h-3.5 w-3.5" aria-hidden />
          กรุงเทพฯ โทร 1646 ศูนย์เอราวัณ
        </a>
        <a href="tel:1330" className="inline-flex items-center gap-1 text-brand underline">
          <Phone className="h-3.5 w-3.5" aria-hidden />
          สอบถามสิทธิ โทร 1330
        </a>
      </div>
    </section>
  );
}

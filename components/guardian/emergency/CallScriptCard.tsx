"use client";
// การ์ด "สิ่งที่ควรบอกเจ้าหน้าที่" (spec §5.2, template §11.4) — ระบบ compose
// สคริปต์ 1669 ให้ล่วงหน้า อ่านตามได้เลย. Geolocation ขอแบบอธิบายเหตุผล และ
// ถ้าถูกปฏิเสธ flow ไม่พัง (ช่องที่อยู่ยังใช้ได้).
import { useEffect, useState } from "react";
import { Copy, MapPin, Check, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/store/toast";

export interface GeoState {
  status: "asking" | "granted" | "denied" | "unsupported";
  lat?: number;
  lng?: number;
  accuracy?: number;
}

interface Props {
  geo: GeoState;
  address: string;
  onAddressChange: (v: string) => void;
  age?: number;
  symptom?: string;
  onset?: string;
  conditionsMeds: string;
  onConditionsMedsChange: (v: string) => void;
  phone: string;
  onPhoneChange: (v: string) => void;
  /** persist เบอร์/โรคประจำตัวลง profiles เมื่อผู้ใช้พิมพ์เสร็จ */
  onPersistContact: () => void;
}

export function buildCallScript(p: {
  address: string;
  lat?: number;
  lng?: number;
  age?: number;
  symptom?: string;
  onset?: string;
  conditionsMeds: string;
  phone: string;
}): string {
  const coords =
    p.lat != null && p.lng != null ? ` (พิกัด ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})` : "";
  return [
    `จุดเกิดเหตุ: ${p.address || "—"}${coords}`,
    `ผู้ป่วย: อายุ ${p.age ?? "—"} ปี`,
    `อาการ: ${p.symptom || "อาการผิดปกติเฉียบพลัน"} เริ่มเมื่อ ${p.onset || "ไม่แน่ใจ"}`,
    `โรคประจำตัว/ยา: ${p.conditionsMeds || "—"}`,
    `เบอร์ติดต่อกลับ: ${p.phone || "—"}`,
  ].join("\n");
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-xs font-semibold text-ink-muted">{children}</p>;
}

export function CallScriptCard(props: Props) {
  const toast = useToast();
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedCoords, setCopiedCoords] = useState(false);

  useEffect(() => {
    if (!copiedAll) return;
    const t = setTimeout(() => setCopiedAll(false), 2500);
    return () => clearTimeout(t);
  }, [copiedAll]);
  useEffect(() => {
    if (!copiedCoords) return;
    const t = setTimeout(() => setCopiedCoords(false), 2500);
    return () => clearTimeout(t);
  }, [copiedCoords]);

  async function copyText(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      toast("คัดลอกไม่สำเร็จ ลองกดค้างเพื่อเลือกข้อความแทน", "error");
      return false;
    }
  }

  const { geo } = props;

  return (
    <section className="rounded-card border border-hairline bg-surface p-4 shadow-card">
      <h2 className="text-base font-bold text-ink">สิ่งที่ควรบอกเจ้าหน้าที่</h2>
      <p className="mt-0.5 text-sm text-ink-muted">อ่านตามนี้ได้เลย ระบบเตรียมให้แล้ว</p>

      <div className="mt-3 flex flex-col gap-3">
        <div>
          <FieldLabel>ตำแหน่งของคุณ</FieldLabel>
          {geo.status === "asking" && (
            <p className="flex items-center gap-1.5 text-sm text-ink-soft">
              <LocateFixed className="h-4 w-4 animate-pulse text-brand" aria-hidden />
              กำลังขอตำแหน่ง เพื่อบอกจุดเกิดเหตุกับเจ้าหน้าที่…
            </p>
          )}
          {geo.status === "granted" && geo.lat != null && geo.lng != null && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
              <MapPin className="h-4 w-4 text-brand" aria-hidden />
              <span className="font-mono tabular-nums">
                {geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}
              </span>
              {geo.accuracy != null && (
                <span className="text-xs text-ink-muted">±{Math.round(geo.accuracy)} ม.</span>
              )}
              <button
                type="button"
                className="inline-flex min-h-9 items-center gap-1 rounded-btn border border-hairline px-2.5 text-xs font-semibold text-ink"
                onClick={() =>
                  void copyText(`${geo.lat!.toFixed(5)}, ${geo.lng!.toFixed(5)}`).then(
                    (ok) => ok && setCopiedCoords(true)
                  )
                }
              >
                {copiedCoords ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                {copiedCoords ? "คัดลอกแล้ว" : "คัดลอกพิกัด"}
              </button>
            </div>
          )}
          {(geo.status === "denied" || geo.status === "unsupported") && (
            <p className="text-sm text-ink-muted">
              ไม่ได้รับตำแหน่งอัตโนมัติ — พิมพ์ที่อยู่ด้านล่างแทนได้เลย
            </p>
          )}
          <input
            value={props.address}
            onChange={(e) => props.onAddressChange(e.target.value)}
            placeholder="ที่อยู่/จุดสังเกตใกล้เคียง เช่น บ้านเลขที่ ซอย ถนน"
            className="mt-2 min-h-12 w-full rounded-btn border border-hairline bg-surface px-3 text-base text-ink outline-none focus:border-brand"
            aria-label="ที่อยู่จุดเกิดเหตุ"
          />
        </div>

        <div className="rounded-btn bg-canvas px-3 py-2.5 text-sm leading-relaxed text-ink">
          <p>
            <span className="text-ink-muted">ผู้ป่วย:</span>{" "}
            <span className="font-semibold">อายุ {props.age ?? "—"} ปี</span>
          </p>
          <p className="mt-1">
            <span className="text-ink-muted">อาการ:</span>{" "}
            <span className="font-semibold">{props.symptom || "อาการผิดปกติเฉียบพลัน"}</span>
          </p>
          <p className="mt-1">
            <span className="text-ink-muted">เริ่มเมื่อ:</span>{" "}
            <span className="font-semibold">{props.onset || "ไม่แน่ใจ"}</span>
          </p>
        </div>

        <div>
          <FieldLabel>โรคประจำตัว / ยาที่กินประจำ</FieldLabel>
          <input
            value={props.conditionsMeds}
            onChange={(e) => props.onConditionsMedsChange(e.target.value)}
            onBlur={props.onPersistContact}
            placeholder="—"
            className="min-h-12 w-full rounded-btn border border-hairline bg-surface px-3 text-base text-ink outline-none focus:border-brand"
            aria-label="โรคประจำตัวหรือยาที่กินประจำ"
          />
        </div>

        <div>
          <FieldLabel>เบอร์โทรกลับ</FieldLabel>
          <input
            value={props.phone}
            onChange={(e) => props.onPhoneChange(e.target.value)}
            onBlur={props.onPersistContact}
            type="tel"
            inputMode="tel"
            placeholder="เบอร์มือถือที่เจ้าหน้าที่โทรกลับได้"
            className="min-h-12 w-full rounded-btn border border-hairline bg-surface px-3 text-base text-ink outline-none focus:border-brand"
            aria-label="เบอร์โทรกลับ"
          />
        </div>

        <Button
          size="lg"
          fullWidth
          variant="outline"
          leftIcon={copiedAll ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          onClick={() =>
            void copyText(
              buildCallScript({
                address: props.address,
                lat: geo.lat,
                lng: geo.lng,
                age: props.age,
                symptom: props.symptom,
                onset: props.onset,
                conditionsMeds: props.conditionsMeds,
                phone: props.phone,
              })
            ).then((ok) => ok && setCopiedAll(true))
          }
        >
          {copiedAll ? "คัดลอกแล้ว" : "คัดลอกทั้งหมด"}
        </Button>

        <p className="text-xs leading-relaxed text-ink-muted">
          พูดช้า ๆ ทีละบรรทัด เจ้าหน้าที่อาจถามซ้ำ — เป็นขั้นตอนปกติ ไม่ได้แปลว่าช้า
          และอย่าวางสายจนกว่าเจ้าหน้าที่จะบอก
        </p>
      </div>
    </section>
  );
}

"use client";
// Emergency Co-pilot (spec §5) — full-screen takeover, no bottom nav.
// ทุกการโทรเกิดจากผู้ใช้แตะปุ่ม tel: เองเสมอ (ห้าม auto-dial — Guardrail §9.1)
// การ์ดสคริปต์/เช็คลิสต์เป็น static — ใช้ได้แม้ geolocation ถูกปฏิเสธหรือ
// เครือข่ายมีปัญหาบางส่วน (Guardrail §9.6)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FileText, Loader2, Phone, Siren, Ambulance, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { PassportCard } from "@/components/passport/PassportCard";
import { CallScriptCard, type GeoState } from "./CallScriptCard";
import { WaitingCare } from "./WaitingCare";
import { UcepCard, nearestErs } from "./UcepCard";
import { MEDICAL_DISCLAIMER } from "@/lib/guardian/config";
import { loadEmergencyContext } from "@/lib/guardian/context";
import { trackGuardianOutcome, generateEmergencyPassport } from "@/lib/guardian/client";
import { getProfile, putProfile, createSession, ApiClientError } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { useUi } from "@/store/ui";
import { useToast } from "@/store/toast";
import type { EmergencyContext } from "@/lib/guardian/types";
import type { PassportData } from "@/lib/types";

const CHECKLIST = [
  "อย่าวางสายจนกว่าเจ้าหน้าที่จะบอก",
  "ปลดล็อกประตู เปิดไฟหน้าบ้าน ให้คนไปรอชี้จุด",
  "จัดผู้ป่วยนอนในท่าที่หายใจสะดวก งดอาหารและน้ำทุกชนิด",
  "เตรียมบัตรประชาชนและยาที่กินประจำใส่ถุงไว้",
];

const THIS_YEAR = new Date().getFullYear();

type AmbulanceStatus = null | "coming" | "unavailable";

interface Props {
  surface: "web" | "line";
}

export function EmergencyScreen({ surface }: Props) {
  const toast = useToast();
  const { ready, displayName } = useAuth();
  const sessionId = useUi((s) => s.sessionId);
  const setSessionId = useUi((s) => s.setSessionId);

  const [ctx, setCtx] = useState<EmergencyContext | null>(null);
  const [geo, setGeo] = useState<GeoState>({ status: "asking" });
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [conditionsMeds, setConditionsMeds] = useState("");
  const [age, setAge] = useState<number | undefined>(undefined);
  const [status, setStatus] = useState<AmbulanceStatus>(null);
  const [passport, setPassport] = useState<PassportData | null>(null);
  const [passportBusy, setPassportBusy] = useState(false);
  const eventIdRef = useRef<string | undefined>(undefined);

  // emergency context จาก popup/BEFAST (sessionStorage — ไม่มีก็ยังใช้หน้าได้)
  useEffect(() => {
    const loaded = loadEmergencyContext();
    setCtx(loaded);
    eventIdRef.current = loaded?.eventId;
  }, []);

  // ขอ geolocation ตอนเข้าหน้า (เหตุผลแสดงในการ์ดสคริปต์) — ปฏิเสธได้ ไม่ block
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGeo({ status: "unsupported" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({
          status: "granted",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        trackGuardianOutcome(eventIdRef.current, "emergency_opened", { geo_ok: true });
      },
      () => {
        setGeo({ status: "denied" });
        trackGuardianOutcome(eventIdRef.current, "emergency_opened", { geo_ok: false });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }, []);

  // prefill จาก profiles เมื่อ auth พร้อม
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    getProfile()
      .then((p) => {
        if (cancelled) return;
        if (p.birth_year) setAge(THIS_YEAR - p.birth_year);
        if (p.area_code) setAddress((cur) => cur || p.area_code || "");
        if (p.emergency_phone) setPhone((cur) => cur || p.emergency_phone || "");
        if (p.conditions_meds) setConditionsMeds((cur) => cur || p.conditions_meds || "");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ready]);

  const persistContact = useCallback(() => {
    if (!ready) return;
    void putProfile({
      emergency_phone: phone.trim() || null,
      conditions_meds: conditionsMeds.trim() || null,
    }).catch(() => undefined);
  }, [ready, phone, conditionsMeds]);

  const familyMessage = useMemo(() => {
    const who = displayName || "ฉัน";
    const where =
      address ||
      (geo.lat != null && geo.lng != null
        ? `พิกัด ${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}`
        : "บ้าน");
    const going =
      status === "unavailable"
        ? `เดินทางไป รพ. ${nearestErs(geo.lat, geo.lng)[0]?.name ?? "ที่ใกล้ที่สุด"}`
        : "รอรถพยาบาล 1669";
    const symptoms = ctx?.symptom || "ผิดปกติเฉียบพลัน";
    return `🚨 ฉุกเฉิน — ${who} กำลังมีอาการ ${symptoms} ตอนนี้อยู่ที่ ${where} กำลัง${going} โทรกลับเบอร์นี้ได้เลย`;
  }, [displayName, address, geo.lat, geo.lng, status, ctx?.symptom]);

  async function createErPassport() {
    setPassportBusy(true);
    try {
      let sid = sessionId;
      if (!sid) {
        const created = await createSession(surface === "line" ? "line" : "web");
        sid = created.session_id;
        setSessionId(sid);
      }
      const result = await generateEmergencyPassport(sid, {
        symptom: ctx?.symptom,
        onset: ctx?.onset,
        befast: ctx?.befast,
        conditions_meds: conditionsMeds.trim() || undefined,
        contact_phone: phone.trim() || undefined,
      });
      if (result.status === "ready" && result.passport) {
        setPassport(result.passport);
        trackGuardianOutcome(eventIdRef.current, "er_passport_created");
      } else {
        toast("สร้างเอกสารไม่สำเร็จ ลองใหม่อีกครั้ง", "error");
      }
    } catch (e) {
      toast(e instanceof ApiClientError ? e.message : "สร้างเอกสารไม่สำเร็จ ลองใหม่อีกครั้ง", "error");
    } finally {
      setPassportBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas pb-10">
      {/* 5.1 แถบบนสุด — โทรทันที (ผู้ใช้แตะเองเสมอ) */}
      <div className="bg-safety px-4 pb-4 pt-safe text-white">
        <div className="mx-auto w-full max-w-xl pt-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-white/90">
            <Siren className="h-4 w-4" aria-hidden />
            โหมดฉุกเฉิน
          </p>
          <a
            href="tel:1669"
            onClick={() => trackGuardianOutcome(eventIdRef.current, "tel_1669_tapped")}
            className="mt-2 flex min-h-16 w-full items-center justify-center gap-2 rounded-card bg-white px-4 text-center text-lg font-bold text-safety shadow-card animate-pulse-ring motion-reduce:animate-none"
          >
            <Phone className="h-6 w-6 shrink-0" aria-hidden />
            โทร 1669 — การแพทย์ฉุกเฉิน (ฟรี ตลอด 24 ชม.)
          </a>
          <a
            href="tel:1646"
            onClick={() => trackGuardianOutcome(eventIdRef.current, "tel_1646_tapped")}
            className="mt-2 block text-center text-sm font-medium text-white underline"
          >
            อยู่กรุงเทพฯ โทร 1646 ศูนย์เอราวัณ ได้อีกช่องทาง
          </a>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pt-4">
        {/* 5.2 สคริปต์ 1669 */}
        <CallScriptCard
          geo={geo}
          address={address}
          onAddressChange={setAddress}
          age={age}
          symptom={ctx?.symptom}
          onset={ctx?.onset}
          conditionsMeds={conditionsMeds}
          onConditionsMedsChange={setConditionsMeds}
          phone={phone}
          onPhoneChange={setPhone}
          onPersistContact={persistContact}
        />

        {/* 5.3 เช็คลิสต์ระหว่างสาย/หลังวางสาย */}
        <section className="rounded-card border border-hairline bg-surface p-4 shadow-card">
          <h2 className="text-base font-bold text-ink">ระหว่างสายและหลังวางสาย</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {CHECKLIST.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm leading-relaxed text-ink">
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-safety"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* 5.4 สถานะรถพยาบาล */}
        <section className="rounded-card border border-hairline bg-surface p-4 shadow-card">
          <h2 className="text-base font-bold text-ink">รถพยาบาลเป็นอย่างไรบ้าง</h2>
          <div className="mt-3 grid grid-cols-1 gap-2.5">
            <Button
              size="lg"
              fullWidth
              variant={status === "coming" ? "primary" : "outline"}
              leftIcon={<Ambulance className="h-5 w-5" aria-hidden />}
              onClick={() => setStatus("coming")}
            >
              รถกำลังมา
            </Button>
            <Button
              size="lg"
              fullWidth
              variant={status === "unavailable" ? "primary" : "outline"}
              leftIcon={<AlertTriangle className="h-5 w-5" aria-hidden />}
              onClick={() => {
                setStatus("unavailable");
                trackGuardianOutcome(eventIdRef.current, "ucep_shown");
              }}
            >
              รถไม่ว่าง หรือรอนานผิดปกติ
            </Button>
          </div>
        </section>

        {status === "coming" && (
          <WaitingCare
            surface={surface}
            familyMessage={familyMessage}
            onFamilyNotified={() => trackGuardianOutcome(eventIdRef.current, "family_notified")}
          />
        )}

        {status === "unavailable" && <UcepCard lat={geo.lat} lng={geo.lng} />}

        {/* 5.5 ER Passport */}
        <Button
          size="lg"
          fullWidth
          variant="outline"
          leftIcon={
            passportBusy ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <FileText className="h-5 w-5" aria-hidden />
            )
          }
          disabled={passportBusy || !ready}
          onClick={() => void createErPassport()}
        >
          สร้างเอกสารยื่นห้องฉุกเฉิน (ER Passport)
        </Button>

        <p className="text-center text-xs text-ink-muted">{MEDICAL_DISCLAIMER}</p>
        <Link
          href={surface === "line" ? "/liff" : "/"}
          className="pb-4 text-center text-sm font-medium text-brand underline"
        >
          กลับสู่หน้าหลัก
        </Link>
      </div>

      <Sheet open={!!passport} onOpenChange={(v) => !v && setPassport(null)} title="ER Passport">
        {passport && (
          <div className="pb-4">
            <PassportCard data={passport} />
            <p className="mt-3 text-center text-xs text-ink-muted">
              ยื่นหน้าจอนี้ให้พยาบาลคัดกรองได้เลย
            </p>
          </div>
        )}
      </Sheet>
    </div>
  );
}

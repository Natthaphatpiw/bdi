"use client";
// Guardian layer host — mounted once inside Providers so the Anomaly Popup /
// BEFAST overlays can appear over any screen. Also owns the ?g=tremor|drops|fall
// simulation entry (2s after load, sim builds only) — spec §2.
import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AnomalyPopup } from "./AnomalyPopup";
import { BefastCheck } from "./BefastCheck";
import { SimSheet } from "./SimSheet";
import { useGuardian } from "@/lib/guardian/store";
import { patternFromQuery, makeSimSignal } from "@/lib/guardian/sim";
import { triggerGuardian } from "@/lib/guardian/trigger";

interface Props {
  surface: "web" | "line";
  children: ReactNode;
}

export function GuardianProvider({ surface, children }: Props) {
  const pathname = usePathname();
  const setLastSurface = useGuardian((s) => s.setLastSurface);
  const queryFired = useRef(false);

  // จำ surface ล่าสุดไว้ให้หน้า /guardian/emergency เลือก auth ได้ถูกฝั่ง
  useEffect(() => {
    if (!pathname?.startsWith("/guardian")) setLastSurface(surface);
  }, [surface, pathname, setLastSurface]);

  // ?g=tremor|drops|fall — ยิง signal หลังหน้าโหลด 2 วิ (เฉพาะ sim build)
  useEffect(() => {
    if (queryFired.current || pathname?.startsWith("/guardian")) return;
    const pattern = patternFromQuery(window.location.search);
    if (!pattern) return;
    queryFired.current = true;
    const t = setTimeout(() => void triggerGuardian(makeSimSignal(pattern)), 2000);
    return () => clearTimeout(t);
  }, [pathname]);

  return (
    <>
      {children}
      <SimSheet />
      <AnomalyPopup surface={surface} />
      <BefastCheck surface={surface} />
    </>
  );
}

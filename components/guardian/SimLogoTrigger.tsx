"use client";
// Hidden control gesture: long-press the app logo for 3s to open the Guardian
// signal sheet. Compiled out of the interaction path entirely unless
// NEXT_PUBLIC_GUARDIAN_SIM=1 (spec §2 — invisible in normal builds).
import { useRef, type ReactNode } from "react";
import { isSimEnabled } from "@/lib/guardian/sim";
import { useGuardian } from "@/lib/guardian/store";

const HOLD_MS = 3000;
const MOVE_TOLERANCE_PX = 12;

export function SimLogoTrigger({ children }: { children: ReactNode }) {
  const setSimSheetOpen = useGuardian((s) => s.setSimSheetOpen);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  if (!isSimEnabled()) return <>{children}</>;

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  };

  return (
    <span
      className="inline-flex select-none"
      onPointerDown={(e) => {
        origin.current = { x: e.clientX, y: e.clientY };
        timer.current = setTimeout(() => {
          cancel();
          setSimSheetOpen(true);
        }, HOLD_MS);
      }}
      onPointerMove={(e) => {
        if (!origin.current) return;
        const dx = e.clientX - origin.current.x;
        const dy = e.clientY - origin.current.y;
        if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) cancel();
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </span>
  );
}

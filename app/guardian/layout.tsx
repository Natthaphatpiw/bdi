"use client";
// Guardian routes live outside both shells (no AppHeader / BottomTabBar —
// Emergency Mode is a full-screen takeover). Auth surface follows the surface
// the user came from (persisted by GuardianProvider in the main shells).
import type { ReactNode } from "react";
import { Providers } from "@/app/providers";
import { Toaster } from "@/components/ui/Toast";
import { useGuardian } from "@/lib/guardian/store";

export default function GuardianLayout({ children }: { children: ReactNode }) {
  const surface = useGuardian((s) => s.lastSurface);
  return (
    <Providers surface={surface}>
      <Toaster />
      {children}
    </Providers>
  );
}

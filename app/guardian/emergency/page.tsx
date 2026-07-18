"use client";
import { EmergencyScreen } from "@/components/guardian/emergency/EmergencyScreen";
import { useGuardian } from "@/lib/guardian/store";

export default function GuardianEmergencyPage() {
  const surface = useGuardian((s) => s.lastSurface);
  return <EmergencyScreen surface={surface} />;
}

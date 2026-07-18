"use client";
// Guardian signal sheet (sim-only). Neutral title, no product-facing wording —
// closes first, waits 1.5s so the phone can be held naturally, then fires the
// same triggerGuardian() a real detection engine would call.
import { Activity, Smartphone, Zap } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { useGuardian } from "@/lib/guardian/store";
import { isSimEnabled, makeSimSignal } from "@/lib/guardian/sim";
import { triggerGuardian } from "@/lib/guardian/trigger";
import type { GuardianPattern } from "@/lib/guardian/types";

const FIRE_DELAY_MS = 1500;

const OPTIONS: { pattern: GuardianPattern; label: string; icon: React.ReactNode }[] = [
  { pattern: "tremor", label: "จำลองสัญญาณ: สั่น", icon: <Activity className="h-5 w-5" aria-hidden /> },
  { pattern: "drops", label: "จำลองสัญญาณ: หลุดมือซ้ำ", icon: <Smartphone className="h-5 w-5" aria-hidden /> },
  { pattern: "fall", label: "จำลองสัญญาณ: กระแทก", icon: <Zap className="h-5 w-5" aria-hidden /> },
];

export function SimSheet() {
  const open = useGuardian((s) => s.simSheetOpen);
  const setOpen = useGuardian((s) => s.setSimSheetOpen);

  if (!isSimEnabled()) return null;

  function fire(pattern: GuardianPattern) {
    setOpen(false);
    setTimeout(() => {
      void triggerGuardian(makeSimSignal(pattern));
    }, FIRE_DELAY_MS);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen} title="Guardian">
      <div className="flex flex-col gap-2 pb-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.pattern}
            type="button"
            onClick={() => fire(opt.pattern)}
            className="flex min-h-14 items-center gap-3 rounded-btn border border-hairline bg-surface px-4 text-left text-base font-semibold text-ink transition-colors hover:border-brand/40"
          >
            <span className="text-brand">{opt.icon}</span>
            {opt.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

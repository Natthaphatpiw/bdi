"use client";

import { ShieldAlert, Phone } from "lucide-react";
import type { SafetyCard } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { liffOpenWindow } from "@/lib/client/liff";

interface EmergencyBannerProps {
  card: SafetyCard;
  surface: "web" | "line";
}

function openExternal(url: string, surface: "web" | "line") {
  if (surface === "line") {
    void liffOpenWindow(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function EmergencyBanner({ card, surface }: EmergencyBannerProps) {
  return (
    <div className="w-full rounded-card border-2 border-safety bg-safety-soft p-4">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-safety" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-safety">{card.title}</h2>
          <p className="mt-1 whitespace-pre-line text-ink">{card.body}</p>
        </div>
      </div>

      {card.actions && card.actions.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {card.actions.map((action, i) => {
            if (action.tel) {
              return (
                <a key={i} href={`tel:${action.tel}`} className="block">
                  <Button variant="danger" size="lg" fullWidth leftIcon={<Phone className="h-5 w-5" />}>
                    {action.label}
                  </Button>
                </a>
              );
            }
            if (action.url) {
              const url = action.url;
              return (
                <Button
                  key={i}
                  variant="danger"
                  size="lg"
                  fullWidth
                  onClick={() => openExternal(url, surface)}
                >
                  {action.label}
                </Button>
              );
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
}

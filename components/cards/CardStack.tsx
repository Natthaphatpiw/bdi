"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import type { Card, SafetyCard, EvidenceCard } from "@/lib/types";
import { Chip } from "@/components/ui/Chip";
import { EmergencyBanner } from "./EmergencyBanner";
import { ActionCard } from "./ActionCard";
import { EvidenceDrawer } from "./EvidenceDrawer";

interface CardStackProps {
  cards: Card[];
  onQuickAnswer?: (text: string) => void;
  surface: "web" | "line";
}

function isEmergency(card: Card): card is SafetyCard {
  return card.type === "safety" && card.level === "emergency";
}

// Canonical display order — cards stream in as tools finish (any order), but we
// always render them in this order so the layout stays stable.
const ORDER: Record<string, number> = {
  safety: 0,
  care: 1,
  value_unlock: 2,
  rights: 3,
  benefit: 4,
  facility: 5,
  next_steps: 6,
};

export function CardStack({ cards, onQuickAnswer, surface }: CardStackProps) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const emergency = cards.find(isEmergency);
  const evidence = cards.find((c): c is EvidenceCard => c.type === "evidence");
  const body = cards
    .filter((c) => !isEmergency(c) && c.type !== "evidence")
    .sort((a, b) => (ORDER[a.type] ?? 9) - (ORDER[b.type] ?? 9));

  return (
    <div className="flex flex-col gap-3">
      {emergency && (
        <div className="card-enter">
          <EmergencyBanner card={emergency} surface={surface} />
        </div>
      )}

      {body.map((card) => (
        <div key={card.type} className="card-enter">
          <ActionCard card={card} surface={surface} onQuickAnswer={onQuickAnswer} />
        </div>
      ))}

      {evidence && (
        <>
          <div className="card-enter">
            <Chip tone="info" onClick={() => setEvidenceOpen(true)}>
              <span className="inline-flex items-center gap-1">
                <Search className="h-3.5 w-3.5" aria-hidden="true" />
                ดูที่มา ({evidence.sources.length})
              </span>
            </Chip>
          </div>
          <EvidenceDrawer
            card={evidence}
            open={evidenceOpen}
            onOpenChange={setEvidenceOpen}
            surface={surface}
          />
        </>
      )}
    </div>
  );
}

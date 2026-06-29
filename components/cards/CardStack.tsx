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

export function CardStack({ cards, onQuickAnswer, surface }: CardStackProps) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const emergency = cards.find(isEmergency);
  const evidence = cards.find((c): c is EvidenceCard => c.type === "evidence");
  const body = cards.filter((c) => !isEmergency(c) && c.type !== "evidence");

  return (
    <div className="flex flex-col gap-3">
      {emergency && (
        <div className="card-enter sticky top-2 z-20">
          <EmergencyBanner card={emergency} surface={surface} />
        </div>
      )}

      {body.map((card, i) => (
        <div key={i} className="card-enter">
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

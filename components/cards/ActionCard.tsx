"use client";

import type { ReactNode } from "react";
import {
  HeartPulse,
  BadgeCheck,
  Coins,
  MapPin,
  Check,
  ListChecks,
  AlertTriangle,
  Phone,
  Navigation,
} from "lucide-react";
import type {
  Card,
  CareCard,
  RightsCard,
  BenefitCard,
  FacilityCard,
  NextStepsCard,
  SafetyCard,
  EligibilityStatus,
} from "@/lib/types";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Badge } from "@/components/ui/Badge";
import { liffOpenWindow } from "@/lib/client/liff";

interface ActionCardProps {
  card: Card;
  surface: "web" | "line";
  onQuickAnswer?: (text: string) => void;
}

function openExternal(url: string, surface: "web" | "line") {
  if (surface === "line") {
    void liffOpenWindow(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

const ACCENT: Record<string, string> = {
  care: "border-l-brand",
  rights: "border-l-brand",
  benefit: "border-l-benefit",
  facility: "border-l-facility",
  next_steps: "border-l-hairline",
  warn: "border-l-benefit",
};

function CardFrame({
  accent,
  icon,
  title,
  children,
}: {
  accent: string;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-card border-l-4 bg-surface p-4 shadow-card",
        accent,
      )}
    >
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="font-h2 font-semibold text-ink">{title}</h2>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function BenefitStatusBadge({ status }: { status: EligibilityStatus }) {
  if (status === "ELIGIBLE") {
    return <Badge tone="benefit">✅ มีสิทธิ์</Badge>;
  }
  if (status === "INDETERMINATE") {
    return <Badge tone="benefit">❓ ต้องตอบเพิ่ม</Badge>;
  }
  return <Badge tone="review">ไม่เข้าเกณฑ์</Badge>;
}

function CareBody({ card }: { card: CareCard }) {
  return (
    <CardFrame
      accent={ACCENT.care}
      icon={<HeartPulse className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />}
      title={card.title}
    >
      <p className="whitespace-pre-line text-ink">{card.body}</p>
      {card.department && (
        <div className="mt-3">
          <Chip tone="brand">แผนก: {card.department}</Chip>
        </div>
      )}
    </CardFrame>
  );
}

function RightsBody({ card }: { card: RightsCard }) {
  return (
    <CardFrame
      accent={ACCENT.rights}
      icon={<BadgeCheck className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />}
      title={card.title}
    >
      <ul className="flex flex-col gap-2">
        {card.items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-ink">{item.name}</span>
            <span className="shrink-0 text-right">
              <span className="font-medium text-ink">
                {item.copay === "0" || item.copay === "" ? "ฟรี" : item.copay}
              </span>
              {item.interval && (
                <span className="ml-1 text-sm text-ink-muted">({item.interval})</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </CardFrame>
  );
}

function BenefitBody({
  card,
  onQuickAnswer,
}: {
  card: BenefitCard;
  onQuickAnswer?: (text: string) => void;
}) {
  return (
    <CardFrame
      accent={ACCENT.benefit}
      icon={<Coins className="h-5 w-5 shrink-0 text-benefit" aria-hidden="true" />}
      title={card.title}
    >
      <ul className="flex flex-col gap-3">
        {card.items.map((item, i) => (
          <li key={i} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ink">{item.name}</span>
              <BenefitStatusBadge status={item.status} />
              {item.value && <span className="font-medium text-ink">{item.value}</span>}
            </div>

            {item.status === "INDETERMINATE" && item.ask_th && (
              <div className="flex flex-col gap-1.5">
                <p className="text-sm text-ink-soft">{item.ask_th}</p>
                {onQuickAnswer && (
                  <div>
                    <Button
                      variant="outline"
                      size="md"
                      onClick={() => onQuickAnswer(item.ask_th as string)}
                    >
                      ตอบคำถามนี้
                    </Button>
                  </div>
                )}
              </div>
            )}

            {item.apply_at && (
              <p className="text-sm text-ink-soft">ยื่นที่ {item.apply_at}</p>
            )}

            {item.documents && item.documents.length > 0 && (
              <div className="no-scrollbar flex gap-2 overflow-x-auto">
                {item.documents.map((doc, j) => (
                  <Chip key={j} tone="info">
                    {doc}
                  </Chip>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </CardFrame>
  );
}

function FacilityBody({
  card,
  surface,
}: {
  card: FacilityCard;
  surface: "web" | "line";
}) {
  return (
    <CardFrame
      accent={ACCENT.facility}
      icon={<MapPin className="h-5 w-5 shrink-0 text-facility" aria-hidden="true" />}
      title={card.title}
    >
      <ul className="flex flex-col gap-4">
        {card.items.map((f) => (
          <li
            key={f.facility_id}
            className="flex flex-col gap-2 border-b border-hairline pb-4 last:border-b-0 last:pb-0"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink">{f.name}</span>
              {f.level && <span className="text-sm text-ink-muted">{f.level}</span>}
              {f.distance_km != null && (
                <Badge tone="facility">{f.distance_km} กม.</Badge>
              )}
              {f.review_required && <Badge tone="review">รอตรวจสอบ</Badge>}
            </div>

            {f.accepts.length > 0 && (
              <div className="no-scrollbar flex gap-2 overflow-x-auto">
                {f.accepts.map((a, i) => (
                  <Chip key={i} tone="info">
                    {a}
                  </Chip>
                ))}
              </div>
            )}

            {f.note && <p className="text-sm text-ink-muted">{f.note}</p>}

            <div className="flex flex-wrap gap-2">
              {f.phone && (
                <a href={`tel:${f.phone}`} className="inline-block">
                  <Button
                    variant="outline"
                    size="md"
                    leftIcon={<Phone className="h-4 w-4" />}
                  >
                    โทร
                  </Button>
                </a>
              )}
              {f.map_url && (
                <Button
                  variant="line"
                  size="md"
                  leftIcon={<Navigation className="h-4 w-4" />}
                  onClick={() => openExternal(f.map_url as string, surface)}
                >
                  นำทาง
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </CardFrame>
  );
}

function NextStepsBody({ card }: { card: NextStepsCard }) {
  return (
    <CardFrame
      accent={ACCENT.next_steps}
      icon={<ListChecks className="h-5 w-5 shrink-0 text-ink-soft" aria-hidden="true" />}
      title={card.title}
    >
      <ul className="flex flex-col gap-2.5">
        {card.checklist.map((step, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-soft">
              <Check className="h-3.5 w-3.5 text-brand-dark" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 text-ink">{step}</span>
          </li>
        ))}
      </ul>
    </CardFrame>
  );
}

function WarnSafetyBody({ card }: { card: SafetyCard }) {
  return (
    <CardFrame
      accent={ACCENT.warn}
      icon={<AlertTriangle className="h-5 w-5 shrink-0 text-benefit" aria-hidden="true" />}
      title={card.title}
    >
      <p className="whitespace-pre-line text-ink">{card.body}</p>
      {card.actions && card.actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {card.actions.map((action, i) => {
            if (action.tel) {
              return (
                <a key={i} href={`tel:${action.tel}`} className="inline-block">
                  <Button variant="outline" size="md" leftIcon={<Phone className="h-4 w-4" />}>
                    {action.label}
                  </Button>
                </a>
              );
            }
            return null;
          })}
        </div>
      )}
    </CardFrame>
  );
}

export function ActionCard({ card, surface, onQuickAnswer }: ActionCardProps) {
  switch (card.type) {
    case "safety":
      // emergency safety is handled by EmergencyBanner; render warn here in amber.
      if (card.level === "warn") {
        return <WarnSafetyBody card={card} />;
      }
      return null;
    case "care":
      return <CareBody card={card} />;
    case "rights":
      return <RightsBody card={card} />;
    case "benefit":
      return <BenefitBody card={card} onQuickAnswer={onQuickAnswer} />;
    case "facility":
      return <FacilityBody card={card} surface={surface} />;
    case "next_steps":
      return <NextStepsBody card={card} />;
    case "evidence":
      // evidence is rendered separately by EvidenceDrawer.
      return null;
    default:
      return null;
  }
}

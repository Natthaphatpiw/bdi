"use client";

import { useState, type ReactNode } from "react";
import {
  HeartPulse,
  BadgeCheck,
  Coins,
  MapPin,
  Check,
  CircleHelp,
  ListChecks,
  AlertTriangle,
  Phone,
  Navigation,
  Wallet,
  ChevronDown,
  ChevronUp,
  Hospital,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import type {
  Card,
  CareCard,
  RightsCard,
  BenefitCard,
  FacilityCard,
  NextStepsCard,
  SafetyCard,
  ValueUnlockCard,
  OptionsCard,
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
  rights: "border-l-rights",
  benefit: "border-l-benefit",
  facility: "border-l-facility",
  options: "border-l-rights",
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
        <h2 className="text-[17px] font-semibold leading-snug text-ink">{title}</h2>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

// keep long lists breathable: show a few, expand on demand
function ShowMoreButton({
  hidden,
  expanded,
  onToggle,
}: {
  hidden: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (hidden <= 0 && !expanded) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-dark"
    >
      {expanded ? (
        <>
          <ChevronUp className="h-4 w-4" aria-hidden="true" />
          ย่อรายการ
        </>
      ) : (
        <>
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
          แสดงอีก {hidden} รายการ
        </>
      )}
    </button>
  );
}

function BenefitStatusBadge({ status }: { status: EligibilityStatus }) {
  if (status === "ELIGIBLE") {
    return (
      <Badge tone="rights">
        <span className="inline-flex items-center gap-1">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          มีสิทธิ์
        </span>
      </Badge>
    );
  }
  if (status === "INDETERMINATE") {
    return (
      <Badge tone="benefit">
        <span className="inline-flex items-center gap-1">
          <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
          ต้องตอบเพิ่ม
        </span>
      </Badge>
    );
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
  const [expanded, setExpanded] = useState(false);
  const MAX = 3;
  const items = expanded ? card.items : card.items.slice(0, MAX);
  return (
    <CardFrame
      accent={ACCENT.rights}
      icon={<BadgeCheck className="h-5 w-5 shrink-0 text-rights" aria-hidden="true" />}
      title={card.title}
    >
      <ul className="flex flex-col gap-3">
        {items.map((item, i) => {
          const coveredWithoutListedCopay = item.copay === "0" || item.copay === "ไม่มีค่าใช้จ่าย";
          return (
            <li key={i} className="flex items-start gap-2">
              <Check className="mt-1 h-4 w-4 shrink-0 text-rights" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="break-words text-ink">{item.name}</p>
                <p className="mt-0.5 text-sm text-ink-soft">
                  <span className={coveredWithoutListedCopay ? "font-medium text-rights" : "text-ink-soft"}>
                    {coveredWithoutListedCopay
                      ? "อยู่ภายใต้สิทธิ์สำหรับบริการนี้ ตามเงื่อนไขที่ระบุ"
                      : item.copay || "ยังไม่มีข้อมูลค่าใช้จ่ายที่ยืนยันได้"}
                  </span>
                  {item.interval ? <span className="text-ink-muted"> · {item.interval}</span> : null}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <ShowMoreButton
        hidden={card.items.length - MAX}
        expanded={expanded}
        onToggle={() => setExpanded((e) => !e)}
      />
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
  const [expanded, setExpanded] = useState(false);
  const MAX = 2;
  const shown = expanded ? card.items : card.items.slice(0, MAX);
  return (
    <CardFrame
      accent={ACCENT.benefit}
      icon={<Coins className="h-5 w-5 shrink-0 text-benefit" aria-hidden="true" />}
      title={card.title}
    >
      <p className="text-sm text-ink-soft">สิ่งที่สิทธิของคุณครอบคลุม — เช็กเกณฑ์เบื้องต้นจากข้อมูลที่คุณให้</p>
      <ul className="mt-3 flex flex-col gap-3">
        {shown.map((item, i) => (
          <li key={i} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink">{item.name}</span>
              <BenefitStatusBadge status={item.status} />
              {item.value && <span className="font-medium text-ink">{item.value}</span>}
            </div>

            {item.details && (
              <ul className="flex flex-col gap-1">
                {item.details.map((dt, j) => (
                  <li key={j} className="flex items-start gap-1.5 text-sm text-ink-soft">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-benefit" aria-hidden="true" />
                    <span className="min-w-0 flex-1 break-words">{dt}</span>
                  </li>
                ))}
              </ul>
            )}

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
              <p className="text-xs text-ink-muted">ติดต่อ/ยื่นที่ {item.apply_at}</p>
            )}
          </li>
        ))}
      </ul>
      <ShowMoreButton
        hidden={card.items.length - MAX}
        expanded={expanded}
        onToggle={() => setExpanded((e) => !e)}
      />
    </CardFrame>
  );
}

function ValueUnlockBody({ card }: { card: ValueUnlockCard }) {
  // separate "money you can claim" from "services free at point of use" so the
  // big number is never confused with the free-service lines.
  const money = card.lines.filter((l) => l.amount_label);
  const free = card.lines.filter((l) => !l.amount_label);
  const bothGroups = money.length > 0 && free.length > 0;
  return (
    <CardFrame
      accent="border-l-benefit"
      icon={<Wallet className="h-5 w-5 shrink-0 text-benefit" aria-hidden="true" />}
      title={card.title}
    >
      {card.total_label && (
        <p className="text-2xl font-bold leading-tight text-benefit">{card.total_label}</p>
      )}
      {card.subtitle && (
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{card.subtitle}</p>
      )}
      {money.length > 0 && (
        <div className="mt-3">
          {bothGroups && (
            <p className="mb-1.5 text-xs font-semibold text-ink-muted">เงิน/วงเงินที่มีสิทธิ์ได้รับ</p>
          )}
          <ul className="flex flex-col gap-2">
            {money.map((line, i) => (
              <li key={i} className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">{line.label}</p>
                  {line.note && <p className="text-xs text-ink-muted">{line.note}</p>}
                </div>
                <span
                  className={cn(
                    "shrink-0 text-sm font-semibold",
                    line.tentative ? "text-ink-muted" : "text-benefit"
                  )}
                >
                  {line.amount_label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {free.length > 0 && (
        <div className="mt-3">
          {bothGroups && (
            <p className="mb-1.5 text-xs font-semibold text-ink-muted">บริการภายใต้สิทธิ์ตามเงื่อนไขที่ระบุ</p>
          )}
          <ul className="flex flex-col gap-2">
            {free.map((line, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-benefit" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">{line.label}</p>
                  {line.note && <p className="text-xs text-ink-muted">{line.note}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {card.footnote && <p className="mt-3 text-xs text-ink-muted">{card.footnote}</p>}
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
              {(f.type_label || f.level) && <span className="text-sm text-ink-muted">{f.type_label ?? f.level}</span>}
              {f.distance_km != null && (
                <Badge tone="facility">{f.distance_km} กม.</Badge>
              )}
              {(f.labels?.length ? f.labels : f.review_required ? ["รอตรวจสอบ"] : []).slice(0, 4).map((label) => (
                <Badge key={label} tone={label === "รอตรวจสอบ" ? "review" : "facility"}>
                  {label}
                </Badge>
              ))}
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
            {f.services && f.services.length > 0 && (
              <ul className="flex flex-col gap-1">
                {f.services.slice(0, 3).map((s) => (
                  <li key={s} className="flex items-start gap-1.5 text-sm text-ink-soft">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-facility" aria-hidden="true" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            )}
            {f.reasons && f.reasons.length > 0 && (
              <div className="rounded-btn bg-facility-soft px-3 py-2 text-sm text-facility">
                <p className="font-semibold">แนะนำเพราะ:</p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {f.reasons.slice(0, 4).map((r) => (
                    <li key={r}>✓ {r}</li>
                  ))}
                </ul>
              </div>
            )}

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
              {f.source_url && (
                <Button
                  variant="outline"
                  size="md"
                  leftIcon={<ExternalLink className="h-4 w-4" />}
                  onClick={() => openExternal(f.source_url as string, surface)}
                >
                  ดูหลักฐาน
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </CardFrame>
  );
}

function OptionsBody({ card, surface }: { card: OptionsCard; surface: "web" | "line" }) {
  return (
    <CardFrame
      accent={ACCENT.options}
      icon={<ShieldCheck className="h-5 w-5 shrink-0 text-rights" aria-hidden="true" />}
      title={card.title}
    >
      {card.subtitle && <p className="text-sm text-ink-soft">{card.subtitle}</p>}
      <div className="mt-3 flex flex-col gap-4">
        <section>
          <h3 className="text-sm font-semibold text-ink">โรงพยาบาลเอกชน / คลินิก / แล็บ</h3>
          <ul className="mt-2 flex flex-col gap-3">
            {card.private_facilities.slice(0, 3).map((f) => (
              <li key={f.id} className="rounded-btn border border-hairline p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Hospital className="h-4 w-4 text-facility" aria-hidden="true" />
                  <span className="font-medium text-ink">{f.name}</span>
                  <Badge tone="facility">
                    {f.kind === "private_hospital" ? "รพ.เอกชน" : f.kind === "clinic" ? "คลินิก" : "แล็บ"}
                  </Badge>
                  {f.accepts_sss && <Badge tone="rights">รับประกันสังคม</Badge>}
                  {f.accepts_insurance && <Badge tone="benefit">เบิกประกันเอกชนได้</Badge>}
                </div>
                {f.services && (
                  <p className="mt-1 text-sm text-ink-soft">{f.services.slice(0, 2).join(" · ")}</p>
                )}
                {f.reasons && <p className="mt-1 text-xs text-ink-muted">แนะนำเพราะ: {f.reasons.join(" · ")}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {f.phone && (
                    <a href={`tel:${f.phone.split(" ")[0]}`} className="inline-block">
                      <Button variant="outline" size="md" leftIcon={<Phone className="h-4 w-4" />}>
                        โทร
                      </Button>
                    </a>
                  )}
                  {f.source_url && (
                    <Button
                      variant="outline"
                      size="md"
                      leftIcon={<ExternalLink className="h-4 w-4" />}
                      onClick={() => openExternal(f.source_url as string, surface)}
                    >
                      ที่มา
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="text-sm font-semibold text-ink">ประกันสุขภาพที่ควรนำไปเปรียบเทียบ</h3>
          <ul className="mt-2 flex flex-col gap-3">
            {card.insurance_plans.slice(0, 3).map((p) => (
              <li key={p.id} className="rounded-btn border border-hairline p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{p.plan_name}</span>
                  <Badge tone="benefit">{p.plan_type}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">{p.insurer}</p>
                <ul className="mt-2 flex flex-col gap-1">
                  {p.coverage.slice(0, 2).map((c) => (
                    <li key={c} className="flex items-start gap-1.5 text-sm text-ink-soft">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-benefit" aria-hidden="true" />
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs font-medium text-safety">{p.exclusions_note}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {card.disclaimer && <p className="mt-3 text-xs text-ink-muted">{card.disclaimer}</p>}
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
    case "options":
      return <OptionsBody card={card} surface={surface} />;
    case "next_steps":
      return <NextStepsBody card={card} />;
    case "value_unlock":
      return <ValueUnlockBody card={card} />;
    case "evidence":
      // evidence is rendered separately by EvidenceDrawer.
      return null;
    default:
      return null;
  }
}

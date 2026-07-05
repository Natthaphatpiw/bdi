"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  ChevronDown,
  ExternalLink,
  FileSearch,
  Hospital,
  IdCard,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { CaseChatWidget } from "@/components/case/CaseChatWidget";
import { PassportModal } from "@/components/passport/PassportModal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { getCase } from "@/lib/client/api";
import { liffOpenWindow } from "@/lib/client/liff";
import type {
  BenefitCard,
  Card,
  CareCard,
  CaseSnapshot,
  EvidenceCard,
  FacilityCard,
  NextStepsCard,
  OptionsCard,
  RightsCard,
  SafetyCard,
  ValueUnlockCard,
} from "@/lib/types";

function cardOf<T extends Card["type"]>(cards: Card[], type: T): Extract<Card, { type: T }> | undefined {
  return cards.find((c): c is Extract<Card, { type: T }> => c.type === type);
}

function openExternal(url: string, surface: "web" | "line") {
  if (surface === "line") void liffOpenWindow(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-hairline bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-lg font-bold text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function SchemeLabel({ value, needsVerification }: { value?: string; needsVerification?: boolean }) {
  if (!value) return needsVerification ? <Chip tone="info">สิทธิ์ยังไม่ยืนยัน</Chip> : null;
  const label = value === "UCS" ? "บัตรทอง" : value === "SSS" ? "ประกันสังคม" : value === "CSMBS" ? "ข้าราชการ" : value;
  return <Chip tone="info">{needsVerification ? `${label} (ต้องตรวจสอบ)` : label}</Chip>;
}

function UnderstandingStrip({ snapshot }: { snapshot: CaseSnapshot }) {
  const u = snapshot.understood;
  const chips = [
    u.patient_role,
    typeof u.age === "number" ? `อายุ ${u.age}` : undefined,
    u.area,
    u.condition_hint,
    ...(u.symptoms ?? []),
  ].filter(Boolean) as string[];
  return (
    <div className="rounded-card border border-hairline bg-surface p-3 shadow-card">
      <p className="text-xs font-semibold text-ink-muted">AI เข้าใจว่า</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <SchemeLabel
          value={u.scheme as string | undefined}
          needsVerification={Boolean(u.scheme_needs_verification || u.scheme_unknown)}
        />
        {chips.map((c) => (
          <Chip key={c} tone="brand">
            {c}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function TodaySection({
  care,
  next,
  safety,
}: {
  care?: CareCard;
  next?: NextStepsCard;
  safety?: SafetyCard;
}) {
  const steps = next?.checklist?.length
    ? next.checklist
    : care?.department
      ? [`พบแพทย์ที่แผนก${care.department}`, "ใช้สิทธิ์ตามสถานพยาบาลที่แนะนำ", "ถ้ามีอาการรุนแรง โทร 1669"]
      : ["พบแพทย์หรือเจ้าหน้าที่สาธารณสุขเพื่อประเมินซ้ำ", "เตรียมบัตรประชาชนและข้อมูลสิทธิ์", "ถ้ามีอาการรุนแรง โทร 1669"];
  return (
    <Section
      title="วันนี้ควรทำอะไร"
      icon={<Sparkles className="h-5 w-5 text-brand" aria-hidden="true" />}
    >
      {safety?.level === "emergency" && (
        <div className="mb-3 rounded-btn bg-safety-soft p-3 text-safety">
          <p className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            มีสัญญาณที่ควรเข้ารับการช่วยเหลือเร่งด่วน
          </p>
          <p className="mt-1 text-sm">{safety.body}</p>
        </div>
      )}
      <ol className="flex flex-col gap-2">
        {steps.slice(0, 4).map((step, i) => (
          <li key={step} className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-white">
              {i + 1}
            </span>
            <span className="text-ink">{step}</span>
          </li>
        ))}
      </ol>
      {care && (
        <div className="mt-4 rounded-btn bg-canvas p-3">
          <p className="text-sm font-semibold text-ink">ผลคัดกรองเบื้องต้น</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{care.body}</p>
          {care.department && <Badge tone="info" className="mt-2">แผนก: {care.department}</Badge>}
        </div>
      )}
      <p className="mt-3 text-xs leading-relaxed text-ink-muted">
        ระบบนี้เป็นการคัดกรองเบื้องต้น ไม่ใช่การวินิจฉัย ถ้ามีอาการรุนแรง เช่น หมดสติ หายใจไม่ออก เจ็บหน้าอก โทร 1669
      </p>
    </Section>
  );
}

function RightsSection({
  rights,
  benefit,
  understood,
}: {
  rights?: RightsCard;
  benefit?: BenefitCard;
  understood?: CaseSnapshot["understood"];
}) {
  const hasScheme = Boolean(understood?.scheme);
  const needsVerification = Boolean(understood?.scheme_needs_verification);
  return (
    <Section title="สิทธิ์ที่เกี่ยวกับเคสนี้" icon={<BadgeCheck className="h-5 w-5 text-rights" aria-hidden="true" />}>
      {!hasScheme && (
        <div className="mb-3 rounded-btn border border-dashed border-hairline bg-canvas px-3 py-2 text-sm text-ink-soft">
          <p className="font-semibold text-ink">ยังไม่ยืนยันสิทธิ์หลัก</p>
          <p className="mt-1">
            ระบบจะไม่ฟันธงว่าเป็นบัตรทอง/ประกันสังคมจนกว่าจะมีข้อมูลพอ แนะนำตรวจสอบสิทธิ์กับ สปสช. 1330 หรือประกันสังคม 1506
          </p>
        </div>
      )}
      {hasScheme && needsVerification && (
        <div className="mb-3 rounded-btn bg-benefit-soft px-3 py-2 text-sm text-benefit">
          สิทธิ์นี้ประเมินจากคำตอบเบื้องต้น ควรตรวจสอบสถานะและโรงพยาบาลตามสิทธิ์ก่อนใช้บริการ
        </div>
      )}
      {rights?.items?.length ? (
        <ul className="flex flex-col gap-2">
          {rights.items.map((item) => (
            <li key={item.name} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-rights" aria-hidden="true" />
              <div>
                <p className="font-medium text-ink">{item.name}</p>
                <p className="text-sm text-ink-muted">{item.copay || "ไม่มีค่าใช้จ่าย"}{item.interval ? ` · ${item.interval}` : ""}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">
          {hasScheme ? "ยังไม่มีรายการสิทธิ์เฉพาะเคสนี้" : "ต้องตอบ/ตรวจสอบสิทธิ์เพิ่มก่อนแสดงรายการที่ใช้ได้จริง"}
        </p>
      )}
      {benefit?.items?.length ? (
        <div className="mt-4 flex flex-col gap-2">
          {benefit.items.map((item) => (
            <div key={item.name} className="rounded-btn border border-hairline p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-ink">{item.name}</p>
                <Badge tone={item.status === "ELIGIBLE" ? "rights" : item.status === "INDETERMINATE" ? "benefit" : "review"}>
                  {item.status === "ELIGIBLE" ? "ใช้ได้" : item.status === "INDETERMINATE" ? "ต้องตอบเพิ่ม" : "ไม่เข้าเกณฑ์"}
                </Badge>
              </div>
              {item.details?.length ? (
                <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-soft">
                  {item.details.map((d) => <li key={d}>- {d}</li>)}
                </ul>
              ) : item.value ? (
                <p className="mt-1 text-sm text-ink-soft">{item.value}</p>
              ) : null}
              {item.ask_th && <p className="mt-2 text-sm font-medium text-benefit">{item.ask_th}</p>}
            </div>
          ))}
        </div>
      ) : null}
    </Section>
  );
}

function ValueSection({ value }: { value?: ValueUnlockCard }) {
  if (!value) return null;
  return (
    <Section title="มูลค่าสิทธิ์ที่อาจยังไม่ได้ใช้" icon={<Wallet className="h-5 w-5 text-benefit" aria-hidden="true" />}>
      {value.total_label && <p className="text-2xl font-bold text-benefit">{value.total_label}</p>}
      {value.subtitle && <p className="mt-1 text-sm text-ink-soft">{value.subtitle}</p>}
      <ul className="mt-3 flex flex-col gap-2">
        {value.lines.map((line) => (
          <li key={line.label} className="flex items-start justify-between gap-3 rounded-btn bg-benefit-soft/60 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{line.label}</p>
              {line.note && <p className="text-xs text-ink-muted">{line.note}</p>}
            </div>
            {line.amount_label && <span className="shrink-0 text-sm font-bold text-benefit">{line.amount_label}</span>}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function FacilitiesSection({ card, surface }: { card?: FacilityCard; surface: "web" | "line" }) {
  return (
    <Section title="ไปที่ไหน" icon={<MapPin className="h-5 w-5 text-facility" aria-hidden="true" />}>
      {!card?.items?.length ? (
        <p className="text-sm text-ink-muted">ยังไม่มีสถานพยาบาลที่จับคู่ได้</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {card.items.map((f) => (
            <li key={f.facility_id} className="rounded-btn border border-hairline p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-ink">{f.name}</p>
                {f.type_label && <Badge tone="facility">{f.type_label}</Badge>}
                {f.distance_km != null && <Badge tone="facility">{f.distance_km} กม.</Badge>}
                {(f.labels ?? []).slice(0, 5).map((l) => <Badge key={l} tone={l === "รอตรวจสอบ" ? "review" : "info"}>{l}</Badge>)}
              </div>
              {f.accepts.length > 0 && <p className="mt-1 text-sm text-ink-soft">สิทธิ์ที่รับ: {f.accepts.join(", ")}</p>}
              {f.services?.length ? <p className="mt-1 text-sm text-ink-soft">บริการที่เกี่ยวข้อง: {f.services.slice(0, 3).join(" · ")}</p> : null}
              {f.reasons?.length ? (
                <div className="mt-2 rounded-btn bg-facility-soft px-3 py-2 text-sm text-facility">
                  <p className="font-semibold">แนะนำเพราะ:</p>
                  {f.reasons.slice(0, 4).map((r) => <p key={r}>✓ {r}</p>)}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {f.phone && <a href={`tel:${f.phone}`}><Button variant="outline" leftIcon={<Phone className="h-4 w-4" />}>โทร</Button></a>}
                {f.map_url && <Button variant="line" leftIcon={<Navigation className="h-4 w-4" />} onClick={() => openExternal(f.map_url as string, surface)}>นำทาง</Button>}
                {f.source_url && <Button variant="outline" leftIcon={<FileSearch className="h-4 w-4" />} onClick={() => openExternal(f.source_url as string, surface)}>ดูหลักฐาน</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function OptionsSection({ card, surface }: { card?: OptionsCard; surface: "web" | "line" }) {
  if (!card) return null;
  return (
    <Section title="ประกันสุขภาพและทางเลือกเอกชน" icon={<ShieldCheck className="h-5 w-5 text-rights" aria-hidden="true" />}>
      {card.subtitle && <p className="text-sm text-ink-soft">{card.subtitle}</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-bold text-ink">โรงพยาบาลเอกชน / คลินิก</h3>
          <ul className="mt-2 flex flex-col gap-3">
            {card.private_facilities.slice(0, 4).map((f) => (
              <li key={f.id} className="rounded-btn border border-hairline p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Hospital className="h-4 w-4 text-facility" aria-hidden="true" />
                  <p className="font-semibold text-ink">{f.name}</p>
                </div>
                <p className="mt-1 text-xs text-ink-muted">{f.district} · {f.kind === "private_hospital" ? "โรงพยาบาลเอกชน" : f.kind === "clinic" ? "คลินิก" : "แล็บ"}</p>
                {f.reasons?.length ? <p className="mt-1 text-sm text-ink-soft">แนะนำเพราะ: {f.reasons.join(" · ")}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {f.phone && <a href={`tel:${f.phone.split(" ")[0]}`}><Button variant="outline" size="md" leftIcon={<Phone className="h-4 w-4" />}>โทร</Button></a>}
                  {f.source_url && <Button variant="outline" size="md" leftIcon={<ExternalLink className="h-4 w-4" />} onClick={() => openExternal(f.source_url as string, surface)}>ที่มา</Button>}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-bold text-ink">ประกันสุขภาพที่ควรเปรียบเทียบ</h3>
          <ul className="mt-2 flex flex-col gap-3">
            {card.insurance_plans.slice(0, 4).map((p) => (
              <li key={p.id} className="rounded-btn border border-hairline p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-ink">{p.plan_name}</p>
                  <Badge tone="benefit">{p.plan_type}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink-muted">{p.insurer}</p>
                {p.best_for && <p className="mt-1 text-sm text-ink-soft">{p.best_for}</p>}
                <p className="mt-2 text-xs font-medium text-safety">{p.exclusions_note}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {card.disclaimer && <p className="mt-3 text-xs text-ink-muted">{card.disclaimer}</p>}
    </Section>
  );
}

function EvidenceSection({ evidence }: { evidence?: EvidenceCard }) {
  const [open, setOpen] = useState(false);
  if (!evidence) return null;
  return (
    <Section title="หลักฐาน / ที่มา" icon={<FileSearch className="h-5 w-5 text-info" aria-hidden="true" />}>
      <Button variant="outline" leftIcon={<ChevronDown className="h-4 w-4" />} onClick={() => setOpen((v) => !v)}>
        ดูที่มาของคำแนะนำนี้
      </Button>
      {open && (
        <div className="mt-3 flex flex-col gap-2">
          {evidence.sources.length ? evidence.sources.map((s) => (
            <a key={`${s.url}-${s.title}`} href={s.url} target="_blank" rel="noreferrer" className="rounded-btn border border-hairline p-3 text-sm hover:border-brand/50">
              <span className="font-semibold text-ink">{s.title}</span>
              <span className="mt-0.5 block text-xs text-ink-muted">{s.publisher}</span>
            </a>
          )) : <p className="text-sm text-ink-muted">ยังไม่มี source เพิ่มเติม</p>}
          <p className="text-xs text-ink-muted">{evidence.disclaimer}</p>
        </div>
      )}
    </Section>
  );
}

export function CaseResultScreen({
  sessionId,
  surface,
  homeHref,
}: {
  sessionId: string;
  surface: "web" | "line";
  homeHref: string;
}) {
  const [snapshot, setSnapshot] = useState<CaseSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [passportOpen, setPassportOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCase(sessionId)
      .then((data) => {
        if (!cancelled) setSnapshot(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "โหลดเคสไม่สำเร็จ");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const cards = snapshot?.cards ?? [];
  const parsed = useMemo(() => ({
    safety: cardOf(cards, "safety"),
    care: cardOf(cards, "care"),
    rights: cardOf(cards, "rights"),
    benefit: cardOf(cards, "benefit"),
    value: cardOf(cards, "value_unlock"),
    facility: cardOf(cards, "facility"),
    next: cardOf(cards, "next_steps"),
    options: cardOf(cards, "options"),
    evidence: cardOf(cards, "evidence"),
  }), [cards]);

  if (loading) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <div className="flex flex-col items-center gap-3 text-ink-soft">
          <Loader2 className="h-7 w-7 animate-spin text-brand" aria-hidden="true" />
          <p className="text-sm">กำลังโหลด Result Dashboard…</p>
        </div>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="rounded-card border border-hairline bg-surface p-5 text-center shadow-card">
        <p className="font-semibold text-ink">{error || "ไม่พบเคสนี้"}</p>
        <Link href={homeHref} className="mt-3 inline-block">
          <Button>กลับหน้าแรก</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink">Result Dashboard</h1>
            <p className="mt-1 text-sm text-ink-soft">
              แผนสิทธิ์ บริการ สถานพยาบาล และหลักฐานที่ทำต่อได้ทันที
            </p>
          </div>
          <Button leftIcon={<IdCard className="h-4 w-4" aria-hidden="true" />} onClick={() => setPassportOpen(true)}>
            สร้าง Case Passport
          </Button>
        </div>
        <UnderstandingStrip snapshot={snapshot} />
      </div>

      {!cards.length ? (
        <div className="rounded-card border border-hairline bg-surface p-5 text-center shadow-card">
          <p className="font-semibold text-ink">ยังไม่มีผลลัพธ์ของเคสนี้</p>
          <p className="mt-1 text-sm text-ink-muted">กลับไปกรอกข้อมูลใหม่เพื่อสร้าง Dashboard</p>
          <Link href={homeHref} className="mt-3 inline-block">
            <Button>กลับหน้าแรก</Button>
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <TodaySection care={parsed.care} next={parsed.next} safety={parsed.safety} />
          <RightsSection rights={parsed.rights} benefit={parsed.benefit} understood={snapshot.understood} />
          <ValueSection value={parsed.value} />
          <FacilitiesSection card={parsed.facility} surface={surface} />
          <OptionsSection card={parsed.options} surface={surface} />
          <EvidenceSection evidence={parsed.evidence} />
        </div>
      )}

      <PassportModal open={passportOpen} onClose={() => setPassportOpen(false)} sessionId={sessionId} />
      <CaseChatWidget sessionId={sessionId} surface={surface} />
    </div>
  );
}

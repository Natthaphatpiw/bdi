"use client";

import { ArrowRight, Building2, HeartPulse, PencilLine, ShieldCheck, Stethoscope } from "lucide-react";
import type { MvpScheme } from "@/lib/mvp/contracts";
import { DEMO_CASES, type DemoScenarioId } from "@/lib/mvp/demo-cases";

export interface DemoScenario {
  id: DemoScenarioId;
  eyebrow: string;
  title: string;
  description: string;
  narrative: string;
  patientRelation: string;
  scheme: MvpScheme;
  area: string;
}

const SCHEME_LABELS: Record<MvpScheme, string> = {
  UCS: "บัตรทอง",
  SSS: "ประกันสังคม",
  CSMBS: "สิทธิ์ข้าราชการ",
  PRIVATE: "ประกันเอกชน",
  UNKNOWN: "ยังไม่ทราบสิทธิ์",
};

export const DEMO_SCENARIOS: DemoScenario[] = DEMO_CASES.map((item, index) => ({
  id: item.scenarioId,
  eyebrow: `เคสตัวอย่าง ${String.fromCharCode(65 + index)}${index === 0 ? " · แนะนำ" : ""}`,
  title: item.titleTh,
  description: `${item.shortLabelTh} · ${item.areaName} · ${SCHEME_LABELS[item.scheme]}`,
  narrative: item.narrativeTh,
  patientRelation: item.patientRelation,
  scheme: item.scheme,
  area: item.areaName,
}));

const ICONS = [HeartPulse, Building2, Stethoscope] as const;

export function DemoWelcome({
  onSelectScenario,
  onOwnStory,
  busy,
}: {
  onSelectScenario: (scenario: DemoScenario) => void;
  onOwnStory: () => void;
  busy: boolean;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <section className="overflow-hidden rounded-3xl border border-brand/15 bg-gradient-to-br from-brand-soft via-white to-facility-soft p-5 shadow-card sm:p-8">
        <div className="flex max-w-2xl flex-col items-start">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-brand-dark shadow-sm">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            เส้นทางดูแลที่ตรวจสอบได้
          </span>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-ink sm:text-4xl">
            เล่าอาการครั้งเดียว ได้เส้นทางดูแลที่ทำตามได้
          </h1>
          <p className="mt-3 text-base leading-relaxed text-ink-soft sm:text-lg">
            ช่วยคัดกรอง ตรวจสิทธิ์ และจับคู่สถานที่ที่เหมาะกับเคสของคุณ
          </p>
          <div className="mt-6 grid w-full gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onSelectScenario(DEMO_SCENARIOS[0])}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-base font-bold text-white shadow-sm transition hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
            >
              ทดลองด้วยเคสตัวอย่าง
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onOwnStory}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-brand/30 bg-white px-5 py-3 text-base font-bold text-brand-dark transition hover:bg-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
            >
              <PencilLine className="h-5 w-5" aria-hidden="true" />
              พิมพ์เรื่องของฉันเอง
            </button>
          </div>
        </div>
      </section>

      <section aria-labelledby="demo-scenarios-title">
        <div className="mb-3">
          <h2 id="demo-scenarios-title" className="text-xl font-bold text-ink">
            เลือกเคสเพื่อทดลองทันที
          </h2>
          <p className="mt-1 text-base text-ink-soft">แตะหนึ่งครั้ง ระบบจะเตรียมเคสและพาไปยังขั้นตอนที่จำเป็น</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {DEMO_SCENARIOS.map((scenario, index) => {
            const Icon = ICONS[index];
            return (
              <button
                key={scenario.id}
                type="button"
                disabled={busy}
                onClick={() => onSelectScenario(scenario)}
                className="group min-h-44 rounded-2xl border border-hairline bg-white p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:border-brand/35 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="mt-3 block text-sm font-semibold text-brand-dark">{scenario.eyebrow}</span>
                <span className="mt-1 block text-lg font-bold leading-snug text-ink">{scenario.title}</span>
                <span className="mt-2 block text-sm leading-relaxed text-ink-soft">{scenario.description}</span>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-brand">
                  เริ่มเคสนี้ <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

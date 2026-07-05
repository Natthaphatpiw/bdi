// Deterministic private options for a case result. These are intentionally read
// from verified JSON files, not invented by the LLM.
import insuranceData from "./data/insurancePlans.json";
import privateFacilitiesData from "./data/privateFacilities.json";
import type { OptionsCard, Scheme, Understood } from "./types";

type PrivateFacility = {
  id: string;
  name_th: string;
  type: "private_hospital" | "clinic" | "lab";
  district?: string;
  phone?: string;
  hours_note_th?: string;
  services_th?: string[];
  price_note_th?: string;
  accepts_sss?: boolean;
  accepts_insurance?: boolean;
  source_url?: string;
  publisher?: string;
};

type InsurancePlan = {
  id: string;
  insurer: string;
  plan_name: string;
  type: string;
  age_min?: number;
  age_max?: number;
  coverage_segments_th: string[];
  premium_note_th?: string;
  exclusions_note_th: string;
  best_for_th?: string;
  source_url?: string;
  publisher?: string;
};

const KIND_LABEL: Record<PrivateFacility["type"], string> = {
  private_hospital: "โรงพยาบาลเอกชน",
  clinic: "คลินิก",
  lab: "แล็บ/ศูนย์ตรวจ",
};

function conditionNeed(u: Understood): RegExp {
  const text = `${u.condition_hint ?? ""} ${(u.symptoms ?? []).join(" ")}`;
  if (/ไต|ปัสสาวะเป็นฟอง|บวม/.test(text)) return /ไต|ฟอกไต|ตรวจสุขภาพ|อายุรกรรม|แล็บ|เลือด/i;
  if (/ความดัน|หัวใจ|เจ็บหน้าอก/.test(text)) return /หัวใจ|ความดัน|อายุรกรรม|ตรวจสุขภาพ|ฉุกเฉิน/i;
  if (/เบาหวาน|น้ำตาล|ปัสสาวะบ่อย|กระหายน้ำ|ชาปลายมือ/.test(text)) {
    return /เบาหวาน|น้ำตาล|อายุรกรรม|ตรวจสุขภาพ|แล็บ|เลือด|ไต/i;
  }
  return /ตรวจสุขภาพ|อายุรกรรม|โรคทั่วไป|ฉุกเฉิน/i;
}

function scoreFacility(f: PrivateFacility, u: Understood, scheme?: Scheme): number {
  let score = 0;
  if (u.area && f.district?.includes(u.area)) score += 5;
  if (scheme === "SSS" && f.accepts_sss) score += 4;
  if (f.accepts_insurance) score += 1;
  const need = conditionNeed(u);
  if ((f.services_th ?? []).some((s) => need.test(s))) score += 3;
  if (f.source_url) score += 1;
  if (f.type === "clinic" || f.type === "lab") score += 1;
  return score;
}

function facilityReasons(f: PrivateFacility, u: Understood, scheme?: Scheme): string[] {
  const reasons: string[] = [];
  if (u.area && f.district?.includes(u.area)) reasons.push("อยู่ในพื้นที่ของคุณ");
  if (scheme === "SSS" && f.accepts_sss) reasons.push("มีข้อมูลว่ารับสิทธิ์ประกันสังคม");
  if (f.accepts_insurance) reasons.push("เหมาะกับผู้มีประกันสุขภาพเอกชน");
  if ((f.services_th ?? []).some((s) => conditionNeed(u).test(s))) reasons.push("มีบริการที่เกี่ยวข้องกับเคสนี้");
  if (f.source_url) reasons.push("มีแหล่งข้อมูลอ้างอิง");
  if (!reasons.length) reasons.push("เป็นทางเลือกเอกชนที่อยู่ในย่านใกล้เคียง");
  return reasons.slice(0, 4);
}

function scorePlan(p: InsurancePlan, u: Understood): number {
  let score = 0;
  const age = u.age;
  if (age == null) score += 1;
  else if ((p.age_min ?? 0) <= age && (p.age_max == null || p.age_max >= age)) score += 5;
  if (/OPD|ผู้ป่วยนอก/.test([p.type, ...p.coverage_segments_th].join(" "))) score += 2;
  if (/เหมาจ่าย|วงเงิน/.test(p.coverage_segments_th.join(" "))) score += 2;
  if ((age ?? 0) >= 60 && (p.age_max ?? 0) >= 80) score += 3;
  if (/โรคร้าย|ไต|เบาหวาน/.test(p.coverage_segments_th.join(" "))) score += 1;
  return score;
}

function planReasons(p: InsurancePlan, u: Understood): string[] {
  const reasons: string[] = [];
  const age = u.age;
  if (age != null && (p.age_min ?? 0) <= age && (p.age_max == null || p.age_max >= age)) {
    reasons.push("ช่วงอายุสมัครได้ตามข้อมูลผลิตภัณฑ์");
  }
  if (/เหมาจ่าย|วงเงิน/.test(p.coverage_segments_th.join(" "))) reasons.push("มีวงเงินค่ารักษาชัดเจน");
  if (/OPD|ผู้ป่วยนอก/.test([p.type, ...p.coverage_segments_th].join(" "))) reasons.push("มีตัวเลือกผู้ป่วยนอกหรือเสริม OPD");
  if (/โรคร้าย|ไต|เบาหวาน/.test(p.coverage_segments_th.join(" "))) reasons.push("เกี่ยวข้องกับความเสี่ยงโรคเรื้อรัง/โรคร้ายแรง");
  if (!reasons.length) reasons.push("ใช้เป็นตัวเลือกเปรียบเทียบกับสิทธิ์รัฐเดิม");
  return reasons.slice(0, 3);
}

export function buildOptionsCard(u: Understood, scheme?: Scheme): OptionsCard {
  const facilities = [...(privateFacilitiesData.facilities as PrivateFacility[])]
    .sort((a, b) => scoreFacility(b, u, scheme) - scoreFacility(a, u, scheme))
    .slice(0, 5)
    .map((f) => ({
      id: f.id,
      name: f.name_th,
      kind: f.type,
      district: f.district,
      phone: f.phone,
      hours: f.hours_note_th,
      services: (f.services_th ?? []).slice(0, 3),
      price_note: f.price_note_th,
      accepts_sss: f.accepts_sss,
      accepts_insurance: f.accepts_insurance,
      reasons: facilityReasons(f, u, scheme),
      source_url: f.source_url,
      publisher: f.publisher,
    }));

  const plans = [...(insuranceData.plans as InsurancePlan[])]
    .sort((a, b) => scorePlan(b, u) - scorePlan(a, u))
    .slice(0, 4)
    .map((p) => ({
      id: p.id,
      insurer: p.insurer,
      plan_name: p.plan_name,
      plan_type: p.type,
      coverage: p.coverage_segments_th.slice(0, 4),
      premium_note: p.premium_note_th,
      exclusions_note: p.exclusions_note_th,
      best_for: p.best_for_th,
      reasons: planReasons(p, u),
      source_url: p.source_url,
      publisher: p.publisher,
    }));

  return {
    type: "options",
    title: "ประกันสุขภาพและทางเลือกเอกชน",
    subtitle: "ตัวเลือกเสริมจากสิทธิ์รัฐ ไม่ใช่การขายหรือรับรองผลิตภัณฑ์",
    private_facilities: facilities,
    insurance_plans: plans,
    caveats: insuranceData.general_caveats_th,
    disclaimer:
      "ประกันสุขภาพเอกชนมักไม่คุ้มครองโรคหรืออาการที่เป็นมาก่อนทำประกัน โปรดอ่านเงื่อนไขกรมธรรม์และเปรียบเทียบหลายบริษัทก่อนตัดสินใจ",
  };
}

export function optionCitations(card: OptionsCard) {
  const rows = [
    ...card.private_facilities.map((f) => ({
      title: f.name,
      url: f.source_url,
      publisher: f.publisher ?? KIND_LABEL[f.kind],
    })),
    ...card.insurance_plans.map((p) => ({
      title: `${p.insurer}: ${p.plan_name}`,
      url: p.source_url,
      publisher: p.publisher ?? p.insurer,
    })),
  ];
  return rows.filter((r): r is { title: string; url: string; publisher: string } => !!r.url);
}

// =============================================================================
// Case Passport Variants — "มุมมองผู้รับ" ต่อข้อมูลเคสเดียวกัน (ภาคเสริม 4)
// กฎเหล็ก: ห้าม fork logic การตัดสินสิทธิ์มาไว้ที่นี่ — ทุกการตัดสินเกิดที่
// rule engine + KG แล้วเท่านั้น ไฟล์นี้ทำหน้าที่ เลือก/จัดเรียง/ติด citation
// =============================================================================
import { benefitById } from "./kg";
import { matchPharmacyProgram, PHARMACY_PROGRAM_SOURCE } from "./config/pharmacy-program";
import type {
  PassportAudience,
  PassportCitation,
  PassportVariantBlocks,
  PrescreenResult,
  Scheme,
  Understood,
  ValueUnlockCard,
} from "./types";

// ---- copy pack (§7 — คำต่อคำ) ------------------------------------------------
export const RESPONSIBILITY_BOX =
  "เอกสารนี้สรุปข้อมูลจากผู้ป่วยและการคัดกรองเบื้องต้นด้วยระบบ เพื่อประกอบการให้บริการ ไม่ใช่คำวินิจฉัยหรือใบส่งตัว — การประเมินและการรักษาเป็นดุลยพินิจของผู้ประกอบวิชาชีพ";

export const PHARMACY_BANNER_IN_PROGRAM =
  "อาการเข้าข่ายโครงการเจ็บป่วยเล็กน้อย รับยาที่ร้านยาคุณภาพตามสิทธิบัตรทอง";
export const PHARMACY_BANNER_SELF_PAY =
  "อาการนี้อยู่นอกเงื่อนไขโครงการเจ็บป่วยเล็กน้อย — ชำระเอง หรือสอบถามเงื่อนไขกับร้านยาโดยตรง";

export const PRIMARY_MECHANISM_TITLE = "การใช้สิทธิ์ครั้งนี้";
export const PRIMARY_SERVICES_TITLE = "บริการที่พึงได้ตามช่วงวัยและภาวะ";

export const AUDIENCE_LABELS: Record<PassportAudience, string> = {
  general: "ทั่วไป",
  pharmacy: "ร้านยาคุณภาพ",
  primary_care: "คลินิกชุมชนอบอุ่น / รพ.สต.",
  dental: "คลินิกทันตกรรม",
  er: "ห้องฉุกเฉิน (ER)",
};

// ---- audience decision (deterministic) ---------------------------------------
export interface AudienceInput {
  mode?: "emergency";
  /** level ของ facility แนะนำอันดับ 1 จาก KG (pharmacy|warm_clinic|health_center|hospital|dental_clinic) */
  facilityTop1Level?: string;
  symptoms: string[];
  conditionHint?: string;
  hasRedFlag: boolean;
}

const DENTAL_RE = /ฟัน|เหงือก|ทันตกรรม|ขูดหินปูน/;

export function decideAudience(input: AudienceInput): PassportAudience {
  if (input.mode === "emergency") return "er";
  const text = input.symptoms.join(" ") + " " + (input.conditionHint ?? "");
  if (DENTAL_RE.test(text)) return "dental";
  const level = input.facilityTop1Level ?? "";
  if (level === "pharmacy" && !input.hasRedFlag) return "pharmacy";
  if (level === "warm_clinic" || level === "health_center") return "primary_care";
  if (level === "dental_clinic") return "dental";
  if (level === "hospital") return "primary_care";
  return "general";
}

/** Guardrail §6.1: red flag → pharmacy หายไปจากรายการเลย (ไม่ใช่ disabled) */
export function availableAudiences(hasRedFlag: boolean): PassportAudience[] {
  const all: PassportAudience[] = ["general", "pharmacy", "primary_care", "dental", "er"];
  return hasRedFlag ? all.filter((a) => a !== "pharmacy") : all;
}

// ---- variant blocks ----------------------------------------------------------
export interface VariantContext {
  audience: PassportAudience;
  slots: Understood;
  scheme?: Scheme;
  prescreen: PrescreenResult | null;
  /** safety gate (deterministic) ของข้อความเคสเป็นลบ */
  safetyGateNegative: boolean;
  conditionsMeds?: string;
  valueUnlock?: Pick<ValueUnlockCard, "lines"> | null;
  /** คำตอบ "ปีนี้ใช้สิทธิ์ทำฟันไปแล้วเท่าไหร่" (บาท | 'ยังไม่เคยใช้' | 'ไม่แน่ใจ') */
  dentalUsedThisYear?: string;
}

export interface VariantResult {
  blocks: PassportVariantBlocks;
  citations: PassportCitation[];
}

/** เพดานทันตกรรมรายปี — "อ่าน" จากข้อความสิทธิประโยชน์ใน KG (ไม่ hardcode เลข) */
export function dentalCeilingFromKg(
  scheme: Scheme | undefined
): { ceiling: number; citation: PassportCitation } | null {
  if (scheme !== "SSS") return null; // สิทธิ์อื่นไม่มีเพดานรวมรายปีในประกาศ
  const benefit = benefitById("BEN_SSS_SICKNESS");
  if (!benefit) return null;
  const m = (benefit.value ?? "").match(/ทำฟัน[^;]*?วงเงิน\s*([\d,]+)\s*บาทต่อปี/);
  if (!m) return null;
  return {
    ceiling: Number(m[1].replace(/,/g, "")),
    citation: {
      title: benefit.source_title ?? benefit.name,
      url: benefit.source_url ?? "",
      publisher: benefit.publisher,
    },
  };
}

function dentalBlocks(ctx: VariantContext, citations: PassportCitation[]): PassportVariantBlocks["dental"] {
  const kg = dentalCeilingFromKg(ctx.scheme);
  let allowanceLine: string | undefined;
  if (kg) {
    citations.push(kg.citation);
    const used = (ctx.dentalUsedThisYear ?? "").trim();
    const usedNum = /^\d+$/.test(used.replace(/,/g, "")) ? Number(used.replace(/,/g, "")) : null;
    if (/ยังไม่เคย/.test(used)) {
      allowanceLine = `วงเงินทันตกรรมประกันสังคมปีนี้ คงเหลือโดยประมาณ ${kg.ceiling.toLocaleString()} บาท (ยืนยันยอดจริงกับสำนักงานประกันสังคมหรือสถานพยาบาล)`;
    } else if (usedNum != null) {
      const remaining = Math.max(0, kg.ceiling - usedNum);
      allowanceLine = `วงเงินทันตกรรมประกันสังคมปีนี้ คงเหลือโดยประมาณ ${remaining.toLocaleString()} บาท (ยืนยันยอดจริงกับสำนักงานประกันสังคมหรือสถานพยาบาล)`;
    } else {
      allowanceLine = `วงเงินทันตกรรมประกันสังคมปีนี้ สูงสุด ${kg.ceiling.toLocaleString()} บาท (ยืนยันยอดจริงกับสำนักงานประกันสังคมหรือสถานพยาบาล)`;
    }
  }

  // เงื่อนไขการเบิก + เอกสาร — เลือกจาก benefit ของสิทธิ์นั้นใน KG
  const claimConditions: string[] = [];
  const documents: string[] = ["บัตรประชาชนตัวจริง"];
  const dentalBenefitId =
    ctx.scheme === "SSS" ? "BEN_SSS_SICKNESS" : ctx.scheme === "CSMBS" ? "BEN_CSMBS_DENTAL" : "BEN_UCS_DENTAL";
  const benefit = benefitById(dentalBenefitId);
  if (benefit) {
    if (ctx.scheme === "SSS") {
      claimConditions.push(
        "คลินิกคู่สัญญาที่มีป้าย 'ทำฟันไม่ต้องสำรองจ่าย' หักจากวงเงินได้ทันที — คลินิกนอกโครงการต้องสำรองจ่ายแล้วเบิกคืนที่ สปส."
      );
      if (benefit.documents) documents.push(...benefit.documents.split(/[;+]/).map((d) => d.trim()).filter((d) => d && !documents.includes(d)));
    } else {
      const segs = (benefit.value ?? "").split(/;\s*/).slice(0, 2).map((s) => s.trim());
      claimConditions.push(...segs);
    }
    if (benefit.source_url) {
      citations.push({
        title: benefit.source_title ?? benefit.name,
        url: benefit.source_url,
        publisher: benefit.publisher,
      });
    }
  }
  return { allowance_line: allowanceLine, approx: true, claim_conditions: claimConditions.slice(0, 3), documents: documents.slice(0, 4) };
}

export function buildVariantBlocks(ctx: VariantContext): VariantResult {
  const blocks: PassportVariantBlocks = {};
  const citations: PassportCitation[] = [];

  const hasRedFlag =
    !ctx.safetyGateNegative ||
    (ctx.prescreen?.red_flags?.length ?? 0) > 0 ||
    !!ctx.prescreen?.escalate_hotline;

  // 7.2 — บรรทัดสัญญาณอันตราย (ลบ): พิมพ์เฉพาะเมื่อผ่านจริงและเป็นลบทั้งหมด
  if (!hasRedFlag && ctx.prescreen) {
    blocks.safety_check = { negative: true, checked_at: new Date().toISOString() };
  }

  if (ctx.audience === "pharmacy") {
    const matched = matchPharmacyProgram(ctx.slots.symptoms ?? []);
    const schemeOk = ctx.scheme === "UCS";
    const inProgram = schemeOk && matched.length > 0;
    blocks.pharmacy_program = {
      in_program: inProgram,
      scheme_ok: schemeOk,
      matched,
      banner: inProgram ? PHARMACY_BANNER_IN_PROGRAM : PHARMACY_BANNER_SELF_PAY,
    };
    if (inProgram) {
      citations.push({
        title: PHARMACY_PROGRAM_SOURCE.title,
        url: PHARMACY_PROGRAM_SOURCE.url,
        publisher: PHARMACY_PROGRAM_SOURCE.publisher,
      });
    }
  }

  if (ctx.audience === "primary_care") {
    const anywhere = benefitById("BEN_UCS_30BAHT_ANYWHERE");
    const mechanismBody =
      ctx.scheme === "UCS"
        ? ctx.slots.scheme_registered_province
          ? "ใช้กลไก 30 บาทรักษาทุกที่ด้วยบัตรประชาชนใบเดียว — เข้ารับบริการที่หน่วยบริการที่เข้าร่วมได้โดยไม่ต้องย้ายสิทธิ์และไม่ต้องใช้ใบส่งตัว"
          : "ใช้สิทธิบัตรทองที่หน่วยบริการประจำตามสิทธิ์ หรือหน่วยบริการที่เข้าร่วม 30 บาทรักษาทุกที่"
        : ctx.scheme === "SSS"
          ? "ใช้สิทธิประกันสังคมที่สถานพยาบาลตามบัตรรับรองสิทธิ — กรณีฉุกเฉินเข้าที่ใกล้ที่สุดได้ใน 72 ชั่วโมงแรก"
          : ctx.scheme === "CSMBS"
            ? "สิทธิข้าราชการ/เบิกได้ — เบิกจ่ายตรงที่สถานพยาบาลรัฐด้วยบัตรประชาชน"
            : "ยังไม่ยืนยันสิทธิ์ — ตรวจสอบสิทธิ์ได้ที่ สปสช. 1330 ก่อนเข้ารับบริการ";
    if (ctx.scheme === "UCS" && anywhere?.source_url) {
      citations.push({
        title: anywhere.source_title ?? anywhere.name,
        url: anywhere.source_url,
        publisher: anywhere.publisher,
      });
    }
    const chronicRows: { label: string; value: string }[] = [
      { label: "โรคประจำตัว/ยา", value: ctx.conditionsMeds || "—" },
    ];
    if (ctx.slots.condition_hint) {
      chronicRows.unshift({ label: "ภาวะที่เกี่ยวข้อง", value: String(ctx.slots.condition_hint) });
    }
    // "รายการที่ควรได้รับ" — เลือกจาก value_unlock ของเคส (rule engine เป็นผู้ตัดสิน)
    const services = (ctx.valueUnlock?.lines ?? [])
      .map((l) => l.label)
      .filter((label) => !/รวม|สอบถาม/.test(label))
      .slice(0, 4);
    blocks.primary_care = {
      mechanism_title: PRIMARY_MECHANISM_TITLE,
      mechanism_body: mechanismBody,
      chronic_rows: chronicRows,
      services_title: PRIMARY_SERVICES_TITLE,
      services,
    };
  }

  if (ctx.audience === "dental") {
    blocks.dental = dentalBlocks(ctx, citations);
  }

  return { blocks, citations };
}

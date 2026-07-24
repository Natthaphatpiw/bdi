// Case Passport Variants (ภาคเสริม 4) — audience deterministic, บล็อกต่อ variant,
// guardrail pharmacy×red-flag, เพดานทันตกรรมต้องมาจาก KG (ไม่ hardcode)
import { describe, expect, it } from "vitest";
import {
  availableAudiences,
  buildVariantBlocks,
  decideAudience,
  dentalCeilingFromKg,
  PHARMACY_BANNER_IN_PROGRAM,
  PHARMACY_BANNER_SELF_PAY,
} from "@/lib/passportVariants";
import { matchPharmacyProgram } from "@/lib/config/pharmacy-program";
import { hashToken } from "@/lib/passportShare";
import { buildSamplePassport } from "@/lib/config/sample-personas";
import type { PrescreenResult } from "@/lib/types";

const BENIGN: PrescreenResult = {
  disease: null, condition_id: "", department: null, severity: "Visit Hospital / Clinic",
  escalate_hotline: null, red_flags: [], rails_applied: [],
  safety_note: "", source: "mock",
};

describe("audience decision (deterministic)", () => {
  it("emergency mode → er เสมอ", () => {
    expect(decideAudience({ mode: "emergency", symptoms: [], hasRedFlag: true })).toBe("er");
  });
  it("เคสทันตกรรม → dental ไม่ว่าปลายทาง facility จะเป็นอะไร", () => {
    expect(decideAudience({ symptoms: ["ปวดฟันกราม"], hasRedFlag: false, facilityTop1Level: "pharmacy" })).toBe("dental");
  });
  it("ปลายทางร้านยา → pharmacy เฉพาะเมื่อไม่มี red flag", () => {
    expect(decideAudience({ symptoms: ["ไข้"], hasRedFlag: false, facilityTop1Level: "pharmacy" })).toBe("pharmacy");
    expect(decideAudience({ symptoms: ["ไข้"], hasRedFlag: true, facilityTop1Level: "pharmacy" })).not.toBe("pharmacy");
  });
  it("คลินิกอบอุ่น/ศบส. → primary_care", () => {
    expect(decideAudience({ symptoms: ["เพลีย"], hasRedFlag: false, facilityTop1Level: "warm_clinic" })).toBe("primary_care");
    expect(decideAudience({ symptoms: ["เพลีย"], hasRedFlag: false, facilityTop1Level: "health_center" })).toBe("primary_care");
  });
});

describe("guardrail §6.1 — pharmacy กับ red flag อยู่ร่วมโลกกันไม่ได้", () => {
  it("red flag → pharmacy หายไปจากรายการเลย", () => {
    expect(availableAudiences(true)).not.toContain("pharmacy");
    expect(availableAudiences(false)).toContain("pharmacy");
  });
});

describe("โครงการร้านยา 32 อาการ (config + SourceDocument)", () => {
  it("อาการในลิสต์ match", () => {
    expect(matchPharmacyProgram(["ไข้", "เจ็บคอ"]).length).toBeGreaterThan(0);
    expect(matchPharmacyProgram(["ท้องเสีย"]).length).toBeGreaterThan(0);
  });
  it("อาการนอกลิสต์ไม่ match (ชาปลายนิ้ว ไม่ใช่ 32 อาการ)", () => {
    expect(matchPharmacyProgram(["ชาปลายนิ้วมือ"])).toEqual([]);
  });
  it("นอกลิสต์/นอกสิทธิ์ → banner ชำระเอง; ครบเงื่อนไข → banner โครงการ", () => {
    const inProgram = buildVariantBlocks({
      audience: "pharmacy", slots: { symptoms: ["ไข้", "เจ็บคอ"] }, scheme: "UCS",
      prescreen: BENIGN, safetyGateNegative: true,
    });
    expect(inProgram.blocks.pharmacy_program?.banner).toBe(PHARMACY_BANNER_IN_PROGRAM);
    expect(inProgram.citations.length).toBeGreaterThan(0);

    const wrongScheme = buildVariantBlocks({
      audience: "pharmacy", slots: { symptoms: ["ไข้"] }, scheme: "SSS",
      prescreen: BENIGN, safetyGateNegative: true,
    });
    expect(wrongScheme.blocks.pharmacy_program?.banner).toBe(PHARMACY_BANNER_SELF_PAY);

    const outOfList = buildVariantBlocks({
      audience: "pharmacy", slots: { symptoms: ["ชาปลายนิ้วมือ"] }, scheme: "UCS",
      prescreen: BENIGN, safetyGateNegative: true,
    });
    expect(outOfList.blocks.pharmacy_program?.banner).toBe(PHARMACY_BANNER_SELF_PAY);
  });
});

describe("บรรทัดสัญญาณอันตราย (7.2) — พิมพ์เฉพาะเมื่อเป็นลบจริง", () => {
  it("เคสมี red flag → ไม่มี safety_check", () => {
    const withFlag = buildVariantBlocks({
      audience: "pharmacy", slots: { symptoms: ["ไข้"] }, scheme: "UCS",
      prescreen: { ...BENIGN, red_flags: ["เจ็บแน่นหน้าอก"], escalate_hotline: "1669" },
      safetyGateNegative: true,
    });
    expect(withFlag.blocks.safety_check).toBeUndefined();
    const negative = buildVariantBlocks({
      audience: "pharmacy", slots: { symptoms: ["ไข้"] }, scheme: "UCS",
      prescreen: BENIGN, safetyGateNegative: true,
    });
    expect(negative.blocks.safety_check?.negative).toBe(true);
  });
});

describe("วงเงินทันตกรรม — อ่านจาก KG เท่านั้น + label โดยประมาณ/สูงสุด", () => {
  it("SSS: เพดานมาจาก KG พร้อม citation (ไม่ hardcode ในโค้ด)", () => {
    const kg = dentalCeilingFromKg("SSS");
    expect(kg).not.toBeNull();
    expect(kg!.ceiling).toBeGreaterThan(0);
    expect(kg!.citation.url).toContain("sso.go.th");
  });
  it("UCS/CSMBS: ไม่มีเพดานรวมรายปี → ไม่มี allowance line", () => {
    expect(dentalCeilingFromKg("UCS")).toBeNull();
    const blocks = buildVariantBlocks({
      audience: "dental", slots: { symptoms: ["ปวดฟัน"] }, scheme: "UCS",
      prescreen: BENIGN, safetyGateNegative: true,
    });
    expect(blocks.blocks.dental?.allowance_line).toBeUndefined();
    expect(blocks.blocks.dental?.claim_conditions.length).toBeGreaterThan(0);
  });
  it("คงเหลือ = เพดาน − ที่ใช้ไป และทุกกรณีมีคำกำกับยืนยันยอดจริง", () => {
    const ceiling = dentalCeilingFromKg("SSS")!.ceiling;
    const never = buildVariantBlocks({
      audience: "dental", slots: {}, scheme: "SSS", prescreen: BENIGN,
      safetyGateNegative: true, dentalUsedThisYear: "ยังไม่เคยใช้",
    }).blocks.dental!.allowance_line!;
    expect(never).toContain(`คงเหลือโดยประมาณ ${ceiling.toLocaleString()}`);
    expect(never).toContain("ยืนยันยอดจริง");

    const used = buildVariantBlocks({
      audience: "dental", slots: {}, scheme: "SSS", prescreen: BENIGN,
      safetyGateNegative: true, dentalUsedThisYear: "300",
    }).blocks.dental!.allowance_line!;
    expect(used).toContain(`คงเหลือโดยประมาณ ${(ceiling - 300).toLocaleString()}`);

    const unsure = buildVariantBlocks({
      audience: "dental", slots: {}, scheme: "SSS", prescreen: BENIGN,
      safetyGateNegative: true, dentalUsedThisYear: "ไม่แน่ใจ",
    }).blocks.dental!.allowance_line!;
    expect(unsure).toContain("สูงสุด");
  });
});

describe("token + sample personas", () => {
  it("token hash คงที่และไม่ใช่ token ดิบ", () => {
    const h = hashToken("test-token-abc");
    expect(h).toHaveLength(64);
    expect(h).not.toContain("test-token");
    expect(hashToken("test-token-abc")).toBe(h);
  });
  it("persona 3 ชุดสร้างใบได้ครบ ด้วย variant ที่ถูกต้อง", () => {
    expect(buildSamplePassport("fon")?.audience).toBe("dental");
    expect(buildSamplePassport("fon")?.variant?.dental?.allowance_line).toContain("คงเหลือโดยประมาณ");
    expect(buildSamplePassport("keng")?.variant?.pharmacy_program?.banner).toBe(PHARMACY_BANNER_IN_PROGRAM);
    expect(buildSamplePassport("mae")?.variant?.primary_care?.mechanism_title).toBe("การใช้สิทธิ์ครั้งนี้");
    expect(buildSamplePassport("unknown")).toBeNull();
  });
});

// Persona สมมติ 3 ชุดสำหรับพิมพ์ใบตัวอย่างลงพื้นที่ (ภาคเสริม 4 §5)
// ใช้ได้เฉพาะเมื่อ NEXT_PUBLIC_GUARDIAN_SIM=1 (ตรวจที่ผู้เรียก) และทุกใบติด
// footer "เอกสารตัวอย่าง · ข้อมูลสมมติเพื่อการนำเสนอ" — ข้อยกเว้นที่อนุญาตตาม
// PDPA เพราะเป็นเอกสารภาคสนามที่มีข้อมูลคล้ายบุคคล
// ใบถูกประกอบผ่าน buildVariantBlocks ตัวจริง — ไม่ fork logic
import { availableAudiences, buildVariantBlocks } from "@/lib/passportVariants";
import { computeValueUnlock } from "@/lib/valueUnlock";
import type { PassportData, PrescreenResult, Scheme, Understood } from "@/lib/types";

const BENIGN_PRESCREEN: PrescreenResult = {
  disease: null,
  condition_id: "",
  department: null,
  severity: "Visit Hospital / Clinic",
  escalate_hotline: null,
  red_flags: [],
  rails_applied: [],
  safety_note: "ข้อมูลทั่วไป ไม่ใช่การวินิจฉัย — หากอาการแย่ลงพบแพทย์",
  source: "mock",
};

interface SamplePersona {
  key: string;
  audience: PassportData["audience"];
  scheme: Scheme;
  slots: Understood;
  patient: PassportData["patient"];
  chief: string;
  onsetNote?: string;
  conditionsMeds?: string;
  dentalUsed?: string;
}

const PERSONAS: SamplePersona[] = [
  {
    key: "fon",
    audience: "dental",
    scheme: "SSS",
    slots: { age: 34, area: "ลาดพร้าว", symptoms: ["ปวดฟันกราม", "เสียวฟันเวลาเคี้ยว"] },
    patient: { role: "ผู้ป่วยเอง", age: 34, scheme: "ประกันสังคม", area: "ลาดพร้าว" },
    chief: "ปวดฟันกรามล่างขวา เสียวเวลาเคี้ยว มาสามวัน",
    dentalUsed: "ยังไม่เคยใช้",
  },
  {
    key: "keng",
    audience: "pharmacy",
    scheme: "UCS",
    slots: {
      age: 28,
      area: "บางนา",
      symptoms: ["ไข้", "เจ็บคอ", "คัดจมูก"],
      scheme_registered_province: "บุรีรัมย์",
    },
    patient: { role: "ผู้ป่วยเอง", age: 28, scheme: "บัตรทอง", area: "บางนา" },
    chief: "มีไข้ต่ำ ๆ เจ็บคอ คัดจมูกตั้งแต่เมื่อคืน หลังเลิกกะ",
  },
  {
    key: "mae",
    audience: "primary_care",
    scheme: "UCS",
    slots: {
      age: 62,
      area: "บางนา",
      symptoms: ["เพลีย", "ตาพร่ามัว"],
      condition_hint: "เบาหวาน",
      scheme_registered_province: "ขอนแก่น",
    },
    patient: { role: "ผู้ดูแล", age: 62, scheme: "บัตรทอง", area: "บางนา" },
    chief: "เบาหวานเดิม ช่วงนี้เพลียและตาพร่ามัวมากขึ้น",
    conditionsMeds: "เบาหวานชนิดที่ 2 · ยา Metformin เช้า-เย็น",
  },
];

export function buildSamplePassport(key: string): PassportData | null {
  const p = PERSONAS.find((x) => x.key === key);
  if (!p) return null;
  const { blocks, citations } = buildVariantBlocks({
    audience: p.audience!,
    slots: p.slots,
    scheme: p.scheme,
    prescreen: BENIGN_PRESCREEN,
    safetyGateNegative: true,
    conditionsMeds: p.conditionsMeds,
    valueUnlock: computeValueUnlock(
      { age: p.slots.age, scheme: p.scheme },
      { age: p.slots.age, scheme: p.scheme, thai_nationality: true, receives_state_pension_or_benapd: false }
    ),
    dentalUsedThisYear: p.dentalUsed,
  });
  return {
    ref_code: `CP-ตัวอย่าง-${p.key.toUpperCase()}`,
    generated_at: new Date().toISOString(),
    patient: p.patient,
    chief_complaint: p.chief,
    symptoms: (p.slots.symptoms as string[]) ?? [],
    condition: p.slots.condition_hint as string | undefined,
    rights_summary:
      p.scheme === "UCS" && p.slots.scheme_registered_province
        ? ["30 บาทรักษาทุกที่ — ใช้สิทธิ์บัตรทองที่หน่วยบริการในเครือข่ายได้ทั่วประเทศ ไม่ต้องย้ายสิทธิ์"]
        : [],
    prepared_documents: ["บัตรประชาชนตัวจริงของผู้ป่วย"],
    audience: p.audience,
    available_audiences: availableAudiences(false),
    variant: blocks,
    citations,
    hotlines: [{ number: p.scheme === "SSS" ? "1506" : "1330", name: p.scheme === "SSS" ? "สายด่วนประกันสังคม" : "สายด่วน สปสช." }],
    disclaimer:
      "ข้อมูลนี้เป็นการคัดกรองและนำทางเบื้องต้น ไม่ใช่ใบรับรองแพทย์ ใบส่งตัว หรือการวินิจฉัย โปรดให้บุคลากรทางการแพทย์ประเมินอีกครั้ง",
  };
}

// Deterministic safety pre-check — runs BEFORE any LLM. Keyword/phrase match for
// life-threatening presentations → forces an Emergency card (1669) on top.
import type { SafetyCard } from "./types";

// Phrases that should always trigger emergency routing (lay Thai).
const EMERGENCY_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /เจ็บ(แน่น)?หน้าอก|แน่นหน้าอก|จุกอก/, label: "เจ็บแน่นหน้าอก" },
  { re: /หมดสติ|ไม่รู้สึกตัว|เรียกไม่ตื่น|สลบ/, label: "หมดสติ" },
  { re: /ชัก|เกร็งกระตุก/, label: "ชัก" },
  { re: /แขนขาอ่อนแรง|พูดไม่ชัด|ปากเบี้ยว|หน้าเบี้ยว|อัมพาต|ครึ่งซีก/, label: "อาการอัมพาต/สโตรก" },
  { re: /หายใจไม่ออก|หอบเหนื่อยมาก|หายใจลำบาก/, label: "หายใจลำบาก" },
  { re: /เลือดออก(ไม่หยุด|มาก)|ตกเลือด/, label: "เลือดออกมาก" },
  { re: /ชาครึ่งซีก|ตามองไม่เห็นเฉียบพลัน/, label: "อาการทางระบบประสาทเฉียบพลัน" },
  { re: /สับสนเฉียบพลัน|พูดจาสับสนทันที|จำคนไม่ได้ทันที/, label: "สับสนเฉียบพลัน" },
  { re: /แพ้รุนแรง|หน้าบวมลิ้นบวม|คอบวม.*หายใจ/, label: "อาการแพ้รุนแรง" },
  { re: /กินยา(เกินขนาด|พิษ)|ฆ่าตัวตาย|ทำร้ายตัวเอง/, label: "ภาวะวิกฤตต้องการความช่วยเหลือด่วน" },
];

export interface PreCheck {
  emergency: boolean;
  matched: string[];
  card?: SafetyCard;
}

export function safetyPreCheck(text: string): PreCheck {
  const matched: string[] = [];
  for (const p of EMERGENCY_PATTERNS) {
    if (hasNonNegatedMatch(text || "", p.re)) matched.push(p.label);
  }
  if (!matched.length) return { emergency: false, matched: [] };
  return {
    emergency: true,
    matched,
    card: {
      type: "safety",
      level: "emergency",
      title: "อาการที่เล่ามาอาจต้องได้รับความช่วยเหลือฉุกเฉิน",
      body: `พบสัญญาณเสี่ยง: ${matched.join(", ")} โทร 1669 ทันที และทำตามคำแนะนำของเจ้าหน้าที่`,
      actions: [{ label: "โทร 1669 ทันที", tel: "1669", style: "danger" }],
    },
  };
}

function hasNonNegatedMatch(text: string, pattern: RegExp): boolean {
  const matcher = new RegExp(pattern.source, pattern.flags.replace("g", "") + "g");
  for (const match of text.matchAll(matcher)) {
    const before = text.slice(Math.max(0, (match.index ?? 0) - 24), match.index ?? 0);
    if (/(?:ไม่|ไม่มี|ไม่ได้|มิได้|ปฏิเสธ)(?:เคย|มี|รู้สึก|อาการ)?[^.!?\n]{0,12}$/.test(before)) {
      continue;
    }
    return true;
  }
  return false;
}

/** Build an emergency safety card from a red-flag hotline (prescreen rails). */
export function emergencyCardFromHotline(note: string, hotline: string, redFlags: string[]): SafetyCard {
  return {
    type: "safety",
    level: "emergency",
    title: "ควรไปพบแพทย์ฉุกเฉินทันที",
    body: `${redFlags.length ? `อาการเสี่ยง: ${redFlags.join(", ")}. ` : ""}${note}`,
    actions: [{ label: `โทร ${hotline}`, tel: hotline, style: "danger" }],
  };
}

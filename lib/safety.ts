// Deterministic safety pre-check — runs BEFORE any LLM. Keyword/phrase match for
// life-threatening presentations → forces an Emergency card (1669) on top.
import type { SafetyCard } from "./types";

// Phrases that should always trigger emergency routing (lay Thai + common EN).
// `exclude` = บริบทใกล้เคียงที่ไม่ใช่ภาวะฉุกเฉิน (กันเคสอย่าง "เจ็บหน้าอกเวลากด
// กล้ามเนื้อหลังออกกำลัง") — ตรวจในหน้าต่างข้อความรอบ match
const EMERGENCY_PATTERNS: { re: RegExp; label: string; exclude?: RegExp; crisis?: boolean }[] = [
  {
    re: /เจ็บ(แน่น)?หน้าอก|แน่นหน้าอก|จุกอก|ร้าวไป(แขน|กราม)|chest pain|tight(ness)? in (my )?chest/i,
    label: "เจ็บแน่นหน้าอก",
    exclude: /เวลากด|ตอนกด|กดแล้วเจ็บ|จากกล้ามเนื้อ|กล้ามเนื้อ(อักเสบ)?หลังออกกำลัง|หลังออกกำลังกาย|เวลาขยับตัว|ยกของหนัก/,
  },
  { re: /หมดสติ|ไม่รู้สึกตัว|เรียกไม่ตื่น|เรียกไม่รู้ตัว|สลบ|unconscious|passed out|fainted/i, label: "หมดสติ" },
  { re: /ชัก|เกร็งกระตุก|seizure|convulsion/i, label: "ชัก" },
  {
    re: /แขนขาอ่อนแรง|อ่อนแรง(ข้างเดียว|ครึ่งซีก|ซีกเดียว)|พูดไม่ชัด|ปากเบี้ยว|หน้าเบี้ยว|อัมพาต|ครึ่งซีก|stroke|slurred speech|face droop/i,
    label: "อาการอัมพาต/สโตรก",
  },
  {
    re: /หายใจไม่ออก|หอบเหนื่อยมาก|หายใจลำบาก|หายใจไม่ทัน|หอบรุนแรง|can'?t breathe|difficulty breathing|short(ness)? of breath/i,
    label: "หายใจลำบาก",
  },
  {
    re: /เลือดออก(ไม่หยุด|มาก|เยอะ)|ตกเลือด|อาเจียนเป็นเลือด|ถ่ายเป็นเลือด(มาก|เยอะ|ไม่หยุด)?|ไอเป็นเลือด(มาก|เยอะ)|vomit(ing)? blood|bleeding (a lot|heavily|won'?t stop)/i,
    label: "เลือดออกมาก",
  },
  { re: /ชาครึ่งซีก|ตามองไม่เห็นเฉียบพลัน|มองไม่เห็น(ข้างหนึ่ง)?(เฉียบพลัน|ทันที|กะทันหัน)/, label: "อาการทางระบบประสาทเฉียบพลัน" },
  {
    re: /ปวด(หัว|ศีรษะ)(รุนแรง|หนัก(มาก)?|แบบ)?(ที่สุดในชีวิต|เฉียบพลัน|กะทันหัน|ไม่เคยเป็น(มาก่อน)?)|ปวดหัวรุนแรงเฉียบพลัน|worst headache/i,
    label: "ปวดศีรษะรุนแรงเฉียบพลัน",
  },
  { re: /สับสนเฉียบพลัน|พูดจาสับสนทันที|จำคนไม่ได้ทันที|ซึมลง(มาก|เร็ว|ผิดปกติ)|ซึม.*(เหงื่อแตก|ตัวเย็น)|เหงื่อแตก.*ตัวเย็น/, label: "ซึมลง/สับสนเฉียบพลัน" },
  {
    re: /แพ้รุนแรง|หน้าบวมลิ้นบวม|(หน้า|ลิ้น|คอ)บวม.*(หายใจ|แน่น)|ลมพิษ.*(หายใจ|แน่นหน้าอก)|anaphyla/i,
    label: "อาการแพ้รุนแรง",
  },
  {
    re: /ตั้งครรภ์.{0,30}(ปวดท้อง(มาก|รุนแรง)?|เลือดออก)|(ปวดท้อง(มาก|รุนแรง)?|เลือดออก).{0,30}ตั้งครรภ์|ท้อง(อยู่)?.{0,20}เลือดออก(ทางช่องคลอด)?/,
    label: "ตั้งครรภ์ร่วมกับอาการอันตราย",
  },
  {
    re: /(ลูก|เด็ก|น้อง|หลาน).{0,30}(ไข้สูง.{0,20}(ซึม|ไม่ค่อยรู้ตัว|ปลุกยาก)|ชัก)|(ไข้สูง.{0,20}(ซึม|ปลุกยาก)).{0,20}(ลูก|เด็ก)/,
    label: "เด็กไข้สูงร่วมกับซึม/ชัก",
  },
  {
    re: /กินยา(เกินขนาด|พิษ)|ฆ่าตัวตาย|ทำร้ายตัวเอง|ไม่อยากมีชีวิต|อยากตาย|overdose|suicid/i,
    label: "ภาวะวิกฤตต้องการความช่วยเหลือด่วน",
    crisis: true,
  },
];

export interface PreCheck {
  emergency: boolean;
  matched: string[];
  card?: SafetyCard;
}

export function safetyPreCheck(text: string): PreCheck {
  const matched: string[] = [];
  let crisis = false;
  for (const p of EMERGENCY_PATTERNS) {
    if (hasNonNegatedMatch(text || "", p.re, p.exclude)) {
      matched.push(p.label);
      if (p.crisis) crisis = true;
    }
  }
  if (!matched.length) return { emergency: false, matched: [] };
  return {
    emergency: true,
    matched,
    card: {
      type: "safety",
      level: "emergency",
      title: "อาการที่เล่ามาอาจต้องได้รับความช่วยเหลือฉุกเฉิน",
      body: crisis
        ? `พบสัญญาณเสี่ยง: ${matched.join(", ")} โทร 1669 ทันที และสายด่วนสุขภาพจิต 1323 พร้อมรับฟังตลอด 24 ชม. คุณไม่ได้อยู่คนเดียวนะครับ`
        : `พบสัญญาณเสี่ยง: ${matched.join(", ")} โทร 1669 ทันที และทำตามคำแนะนำของเจ้าหน้าที่`,
      actions: crisis
        ? [
            { label: "โทร 1669 ทันที", tel: "1669", style: "danger" },
            { label: "สายด่วนสุขภาพจิต 1323", tel: "1323", style: "primary" },
          ]
        : [{ label: "โทร 1669 ทันที", tel: "1669", style: "danger" }],
    },
  };
}

function hasNonNegatedMatch(text: string, pattern: RegExp, exclude?: RegExp): boolean {
  const flags = pattern.flags.replace("g", "") + "g";
  const matcher = new RegExp(pattern.source, flags);
  for (const match of text.matchAll(matcher)) {
    const idx = match.index ?? 0;
    const before = text.slice(Math.max(0, idx - 24), idx);
    if (/(?:ไม่|ไม่มี|ไม่ได้|มิได้|ปฏิเสธ)(?:เคย|มี|รู้สึก|อาการ)?[^.!?\n]{0,12}$/.test(before)) {
      continue;
    }
    // บริบทที่ไม่ใช่ภาวะฉุกเฉิน (เช่น เจ็บหน้าอกเวลากดกล้ามเนื้อหลังออกกำลัง)
    if (exclude) {
      const window = text.slice(Math.max(0, idx - 30), idx + match[0].length + 40);
      if (exclude.test(window)) continue;
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

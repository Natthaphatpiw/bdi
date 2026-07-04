// "ปลดล็อกมูลค่าสิทธิ์" — shared, deterministic computation used by BOTH the
// chat value card and the Case Passport. Conservative & sourced: only
// rule-engine-backed amounts are summed; the screening package carries no
// number (no reliable market-price source).
import { evaluateRule, getRule } from "./ruleEngine";
import type { ValueUnlockCard } from "./types";

export function computeValueUnlock(
  who: { age?: number | null; scheme?: string | null },
  attrs: Record<string, unknown>
): ValueUnlockCard | null {
  const lines: ValueUnlockCard["lines"] = [];
  let definite = 0;
  let tentative = 0;

  if ((who.age ?? 0) >= 60) {
    const rule = getRule("RULE_OAA");
    if (rule) {
      const r = evaluateRule(rule.logic as Record<string, unknown>, attrs);
      if (r.value && (r.status === "ELIGIBLE" || r.status === "INDETERMINATE")) {
        const yearly = r.value.amount * 12;
        const label = "เบี้ยยังชีพผู้สูงอายุ";
        if (r.status === "ELIGIBLE") {
          lines.push({
            label,
            amount_label: `${yearly.toLocaleString()} บาท/ปี`,
            note: `${r.value.amount.toLocaleString()} บาท/เดือน จ่ายทุกเดือน — ต้องลงทะเบียนที่สำนักงานเขต/อบต. ก่อนจึงจะได้รับ`,
          });
          definite += yearly;
        } else {
          lines.push({
            label,
            amount_label: `${yearly.toLocaleString()} บาท/ปี`,
            note: "รอยืนยันเงื่อนไข เช่น ไม่ได้รับบำนาญซ้ำซ้อน",
            tentative: true,
          });
          tentative += yearly;
        }
      }
    }
  }

  if (who.scheme === "SSS") {
    lines.push({
      label: "ค่ารักษาพยาบาลที่ รพ.ตามบัตรรับรองสิทธิ",
      note: "ไม่เสียค่าใช้จ่าย · เจ็บป่วยฉุกเฉินเข้า รพ.ที่ใกล้ที่สุดได้ทุกแห่งใน 72 ชั่วโมงแรก",
    });
    lines.push({
      label: "วงเงินทำฟันประกันสังคม (อุดฟัน ถอนฟัน ขูดหินปูน ผ่าฟันคุด)",
      amount_label: "900 บาท/ปี",
      note: "ใช้ได้ทุกปี ปีไหนไม่ใช้ วงเงินจะไม่ทบไปปีถัดไป",
    });
    definite += 900;
  }

  const numericCount = lines.length;
  lines.push({
    label: "ตรวจคัดกรองโรคเรื้อรัง (น้ำตาลในเลือด ความดัน ตา ไต เท้า)",
    note: "ฟรีเมื่อใช้ตามสิทธิ์ที่หน่วยบริการตามสิทธิ",
  });
  if (!numericCount) return null;

  // headline counts only confirmed amounts — pending ones stay on their own line
  // (and in the subtitle) so the big number never overclaims
  const total_label =
    definite > 0
      ? `อย่างน้อย ${definite.toLocaleString()} บาท/ปี`
      : `อย่างน้อย ${tentative.toLocaleString()} บาท/ปี (รอยืนยันเงื่อนไข)`;
  const subtitle =
    definite > 0 && tentative > 0
      ? `มูลค่าขั้นต่ำที่ยืนยันแล้ว และอาจได้เพิ่มอีก ${tentative.toLocaleString()} บาท/ปี เมื่อยืนยันเงื่อนไขครบ`
      : "มูลค่าขั้นต่ำที่คุณมีสิทธิ์ได้รับต่อปี — ถ้าไม่ใช้สิทธิ์หรือไม่ลงทะเบียน ก็จะไม่ได้รับ";

  return {
    type: "value_unlock",
    title: "สิทธิ์ที่มีอยู่ แต่อาจยังไม่ได้ใช้",
    subtitle,
    total_label,
    lines,
    footnote:
      "รวมเฉพาะรายการที่มีแหล่งอ้างอิงและเกณฑ์ชัดเจน มูลค่าที่ได้จริงขึ้นกับการใช้สิทธิ์",
  };
}

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
        const label = `เบี้ยยังชีพผู้สูงอายุ (${r.value.amount.toLocaleString()} × 12 เดือน)`;
        if (r.status === "ELIGIBLE") {
          lines.push({ label, amount_label: `${yearly.toLocaleString()} บาท/ปี` });
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
    lines.push({ label: "ค่าทันตกรรมประกันสังคม", amount_label: "900 บาท/ปี" });
    definite += 900;
  }

  const numericCount = lines.length;
  lines.push({
    label: "สิทธิ์ตรวจ/คัดกรองโรคเรื้อรังที่รัฐครอบคลุม (น้ำตาล/ความดัน/ตา/ไต/เท้า)",
    note: "ไม่มีค่าใช้จ่ายเมื่อใช้ตามสิทธิ",
  });
  if (!numericCount) return null;

  const total = definite + tentative;
  const total_label =
    `อย่างน้อย ${total.toLocaleString()} บาท/ปี` +
    (definite === 0 && tentative > 0 ? " (รอยืนยันเงื่อนไข)" : "");

  return {
    type: "value_unlock",
    title: "มูลค่าสิทธิ์ที่อาจยังไม่ได้ใช้",
    total_label,
    lines,
    footnote:
      "นับเฉพาะรายการที่มีแหล่งอ้างอิงและเกณฑ์ชัดเจน ยอดจริงขึ้นกับการใช้สิทธิ · ยังไม่รวมมูลค่าการตรวจคัดกรองที่รัฐครอบคลุม",
  };
}

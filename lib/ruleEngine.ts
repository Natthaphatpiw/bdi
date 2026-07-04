// Deterministic eligibility engine — 3-valued logic (ELIGIBLE / NOT_ELIGIBLE /
// INDETERMINATE). Port of app/rule_engine.py. The LLM NEVER decides eligibility;
// it only verbalizes the trace this returns.
import rulesData from "./data/rules.json";
import type { EligibilityStatus, RuleEvaluation, RuleTraceLeaf } from "./types";

type Logic = Record<string, unknown>;
type Attrs = Record<string, unknown>;
type TriState = boolean | null;

interface RuleRow {
  rule_id: string;
  benefit_id: string | null;
  summary_th: string | null;
  logic: Logic;
}
const RULES: RuleRow[] = rulesData as RuleRow[];

function compare(actual: unknown, op: string, expected: unknown): TriState {
  try {
    switch (op) {
      case "==":
        return actual === expected;
      case "!=":
        return actual !== expected;
      case "in":
        return Array.isArray(expected) ? expected.includes(actual) : false;
      case ">=":
      case "<=":
      case ">":
      case "<": {
        const a = Number(actual);
        const e = Number(expected);
        if (Number.isNaN(a) || Number.isNaN(e)) return null;
        return op === ">=" ? a >= e : op === "<=" ? a <= e : op === ">" ? a > e : a < e;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function evalLeaf(node: Logic, attrs: Attrs, trace: RuleTraceLeaf[]): TriState {
  const attr = node.attr as string;
  const op = node.op as string;
  const expected = node.value;
  const known = attr in attrs && attrs[attr] !== null && attrs[attr] !== undefined;
  let res: TriState;
  // "exists" checks a datum we may simply not have asked yet — absent means
  // UNKNOWN (ask the user), never a definitive fail. Treating it as false made
  // RULE_OAA jump to NOT_ELIGIBLE for users who were never asked their area.
  if (op === "exists") res = known ? true : null;
  else if (!known) res = null; // UNKNOWN → must ask
  else res = compare(attrs[attr], op, expected);
  trace.push({
    attr,
    op,
    expected,
    actual: known ? attrs[attr] : "(unknown)",
    result: res,
  });
  return res;
}

function evalNode(node: Logic, attrs: Attrs, trace: RuleTraceLeaf[]): TriState {
  if ("attr" in node) return evalLeaf(node, attrs, trace);
  if ("all" in node) {
    const rs = (node.all as Logic[]).map((c) => evalNode(c, attrs, trace));
    if (rs.some((r) => r === false)) return false;
    if (rs.some((r) => r === null)) return null;
    return true;
  }
  if ("any" in node) {
    const rs = (node.any as Logic[]).map((c) => evalNode(c, attrs, trace));
    if (rs.some((r) => r === true)) return true;
    if (rs.some((r) => r === null)) return null;
    return false;
  }
  if ("not" in node) {
    const sub = node.not as Logic | Logic[];
    const r = evalNode(Array.isArray(sub) ? sub[0] : sub, attrs, trace);
    return r === null ? null : !r;
  }
  return null;
}

function pickAgeBand(
  vab: Record<string, unknown>,
  age: number
): { band: string; amount: number; unit: string } | null {
  const unit = (vab.unit as string) || "";
  for (const [k, v] of Object.entries(vab)) {
    if (typeof v !== "number") continue;
    if (k.endsWith("+") && age >= parseInt(k.slice(0, -1), 10))
      return { band: k, amount: v, unit };
    if (k.includes("-")) {
      const [lo, hi] = k.split("-").map((n) => parseInt(n, 10));
      if (!Number.isNaN(lo) && !Number.isNaN(hi) && age >= lo && age <= hi)
        return { band: k, amount: v, unit };
    }
  }
  return null;
}

export function evaluateRule(logic: Logic, attrs: Attrs): RuleEvaluation {
  let group: Logic = logic;
  if ("all" in logic) group = { all: logic.all };
  else if ("any" in logic) group = { any: logic.any };
  else if ("not" in logic) group = { not: logic.not };

  const trace: RuleTraceLeaf[] = [];
  const res = evalNode(group, attrs, trace);
  const status: EligibilityStatus =
    res === true ? "ELIGIBLE" : res === false ? "NOT_ELIGIBLE" : "INDETERMINATE";
  const missing = [...new Set(trace.filter((t) => t.result === null).map((t) => t.attr))].sort();

  let value: RuleEvaluation["value"] = null;
  const vab = logic.value_by_age_band as Record<string, unknown> | undefined;
  if (vab && typeof attrs.age === "number") value = pickAgeBand(vab, attrs.age as number);

  let note = (logic.note as string) ?? null;
  if (logic.conditional)
    note =
      (note ? note + " | " : "") +
      "มีเงื่อนไข means-test ในระเบียบแต่ยังไม่บังคับใช้ (ดูข้อ conditional)";

  return {
    status,
    trace,
    missing_attrs: missing,
    required_attrs: (logic.required_attrs as string[]) ?? [],
    value,
    note,
  };
}

export function getRules(): RuleRow[] {
  return RULES;
}

export function getRule(ruleId: string): RuleRow | undefined {
  return RULES.find((r) => r.rule_id === ruleId);
}

/** Evaluate all rules that grant a given benefit. */
export function evaluateBenefit(benefitId: string, attrs: Attrs): RuleEvaluation[] {
  return RULES.filter((r) => r.benefit_id === benefitId).map((r) => {
    const out = evaluateRule(r.logic, attrs);
    out.rule_id = r.rule_id;
    out.summary = r.summary_th ?? undefined;
    return out;
  });
}

/** Human-readable Thai question for a missing attribute (slot-filling hints). */
export const ATTR_QUESTIONS_TH: Record<string, string> = {
  age: "คุณ/ผู้ป่วยอายุเท่าไหร่คะ",
  thai_nationality: "เป็นผู้มีสัญชาติไทยใช่ไหมคะ",
  registered_in_area: "มีชื่อในทะเบียนบ้านเขตไหนคะ",
  receives_state_pension_or_benapd:
    "ได้รับบำนาญหรือเบี้ยหวัดจากราชการอยู่หรือเปล่าคะ",
  resides_in_state_welfare_institution: "พักอยู่ในสถานสงเคราะห์ของรัฐหรือเปล่าคะ",
  receives_regular_state_salary_or_income:
    "มีเงินเดือน/รายได้ประจำจากรัฐหรือรัฐวิสาหกิจหรือเปล่าคะ",
  scheme: "ใช้สิทธิอะไรคะ (บัตรทอง / ประกันสังคม / ข้าราชการ)",
  sss_section: "เป็นผู้ประกันตนมาตราอะไรคะ (33 / 39 / 40)",
  contribution_months_in_last_15:
    "ส่งเงินสมทบประกันสังคมมาแล้วกี่เดือนใน 15 เดือนที่ผ่านมาคะ",
  has_disability_id_card: "มีบัตรประจำตัวคนพิการหรือยังคะ",
  annual_income: "รายได้ต่อปีประมาณเท่าไหร่คะ",
  barthel_adl_score: "คะแนนประเมินการช่วยเหลือตัวเอง (ADL) อยู่ที่เท่าไหร่คะ",
};

export function questionFor(attr: string): string {
  return ATTR_QUESTIONS_TH[attr] ?? `ขอข้อมูลเพิ่มเติมเรื่อง "${attr}" หน่อยได้ไหมคะ`;
}

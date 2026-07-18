import type {
  ClarificationQuestion,
  ExtractedCase,
  MvpCaseRecord,
  MvpScheme,
  SafetyState,
} from "./contracts";

export function computeRequiredSlotQuestions(
  extracted: ExtractedCase,
  safety: SafetyState,
  answered: Record<string, string> = {},
): ClarificationQuestion[] {
  if (safety.emergency) return [];
  const questions: ClarificationQuestion[] = [];
  const add = (question: ClarificationQuestion) => {
    if (!answered[question.slotKey] && questions.length < 8) questions.push(question);
  };

  if (extracted.patientRelation === "unknown") {
    add(question("patient_relation", "ผู้ป่วยคือใคร", "ROUTING", [
      ["ตัวฉันเอง", "self"],
      ["พ่อ", "father"],
      ["แม่", "mother"],
      ["ญาติ/คนในครอบครัว", "relative"],
    ]));
  }
  if (!extracted.symptoms.some((symptom) => symptom.present) && !extracted.userGoal.trim()) {
    add({
      ...question("user_goal", "วันนี้ต้องการให้ช่วยเรื่องใด", "ROUTING", [["ไม่ทราบ", "unknown"]]),
      allowFreeText: true,
    });
  }
  if (!extracted.area.name) {
    add({
      ...question("area", "ต้องการรับบริการในเขต/อำเภอใด", "ROUTING", [["ไม่ทราบ", "unknown"]]),
      allowFreeText: true,
    });
  }
  if (extracted.scheme === "UNKNOWN" && extracted.fieldConfidence.scheme !== 1) {
    add(question("scheme", "สิทธิรักษาหลักที่ผู้ป่วยยืนยันคืออะไร", "ELIGIBILITY", [
      ["บัตรทอง", "UCS"],
      ["ประกันสังคม", "SSS"],
      ["ข้าราชการ", "CSMBS"],
      ["ไม่ทราบ", "UNKNOWN"],
    ]));
  }
  const medical = extracted.symptoms.some((symptom) => symptom.present);
  if (medical && extracted.age === null && extracted.ageGroup === "unknown") {
    add({
      ...question("age", "ผู้ป่วยอายุเท่าไร หรืออยู่ในช่วงอายุใด", "ROUTING", [
        ["ต่ำกว่า 18 ปี", "child"],
        ["18–59 ปี", "adult"],
        ["60 ปีขึ้นไป", "older_adult"],
        ["ไม่ทราบ", "unknown"],
      ]),
      allowFreeText: true,
    });
  }
  if (medical && extracted.duration.unit === "unknown") {
    add(question("duration", "อาการนี้เป็นมานานเท่าไร", "ROUTING", [
      ["ไม่เกิน 24 ชั่วโมง", "hours"],
      ["1–3 วัน", "days:2"],
      ["4–7 วัน", "days:5"],
      ["มากกว่า 1 สัปดาห์", "weeks:2"],
      ["ไม่ทราบ", "unknown"],
    ]));
  }
  if (medical && !answered.critical_red_flags) {
    add(question(
      "critical_red_flags",
      "ตอนนี้มีหมดสติ หายใจลำบากรุนแรง เจ็บหน้าอกรุนแรง ชัก หรือแขนขาอ่อนแรงเฉียบพลันหรือไม่",
      "SAFETY",
      [
        ["มีอาการใดอาการหนึ่ง", "present"],
        ["ไม่มี", "absent"],
        ["ไม่ทราบ", "unknown"],
      ],
    ));
  }
  return questions.slice(0, 8);
}

export function deriveCaseStatus(
  current: MvpCaseRecord["status"],
  safety: SafetyState,
  questions: ClarificationQuestion[],
): MvpCaseRecord["status"] {
  if (current === "closed") return current;
  if (safety.emergency) return "emergency_escalated";
  return questions.length ? "collecting_information" : "ready_for_review";
}

export function isConfirmedScheme(value: string): value is MvpScheme {
  return ["UCS", "SSS", "CSMBS", "PRIVATE", "UNKNOWN"].includes(value);
}

function question(
  slotKey: string,
  text: string,
  reasonCode: ClarificationQuestion["reasonCode"],
  options: Array<[string, string]>,
): ClarificationQuestion {
  const withUnknown = options.some(([, value]) => value === "unknown" || value === "UNKNOWN")
    ? options
    : [...options, ["ไม่ทราบ", "unknown"] as [string, string]];
  return {
    id: `question:${slotKey}`,
    slotKey,
    question: text,
    reasonCode,
    options: withUnknown.map(([label, value]) => ({ label, value })),
    allowFreeText: false,
    required: true,
  };
}

import type { MvpScheme } from "@/lib/mvp/contracts";

export interface StoryDraft {
  narrative: string;
  patientRelation: string;
  scheme: MvpScheme;
  area: string;
}

export interface ReviewDraft {
  patientRelation: string;
  age: string;
  scheme: MvpScheme;
  area: string;
  symptoms: string;
  duration: string;
  userGoal: string;
}

export const RELATIONS = [
  { value: "self", label: "ผู้ป่วยเอง" },
  { value: "father", label: "พ่อ" },
  { value: "mother", label: "แม่" },
  { value: "child", label: "ลูก" },
  { value: "relative", label: "ญาติ" },
] as const;

export const SCHEMES: Array<{ value: MvpScheme; label: string }> = [
  { value: "UCS", label: "บัตรทอง" },
  { value: "SSS", label: "ประกันสังคม" },
  { value: "CSMBS", label: "ข้าราชการ" },
  { value: "UNKNOWN", label: "ไม่ทราบ / ยังไม่แน่ใจ" },
];

import demoCaseData from "@/data/knowledge/v1/demo-cases.json";
import type { ExtractedCase, MvpScheme, Urgency } from "./contracts";

export type DemoScenarioId = "hero-father-diabetes" | "ucs-away-from-home" | "sss-dental";

type PatientRelation = ExtractedCase["patientRelation"];

interface DemoCaseJsonRecord {
  id: string;
  title_th: string;
  short_label_th: string;
  narrative_th: string;
  prefill: {
    patient_relation: PatientRelation;
    age?: number;
    scheme: MvpScheme;
    area_code: string;
    area_name: string;
    user_goal_th: string;
  };
  precomputed_result: {
    urgency: Urgency;
    possible_condition_ids: string[];
    recommended_service_ids: string[];
    recommended_department_th: string;
    primary_facility_id: string | null;
    backup_facility_id: string | null;
  };
  expected_clarification_keys: string[];
  active: boolean;
}

export interface DemoCaseDefinition {
  scenarioId: DemoScenarioId;
  recordId: string;
  aliases: string[];
  titleTh: string;
  shortLabelTh: string;
  narrativeTh: string;
  patientRelation: PatientRelation;
  age: number | null;
  scheme: MvpScheme;
  areaCode: string;
  areaName: string;
  userGoalTh: string;
  urgency: Urgency;
  conditionIds: string[];
  serviceIds: string[];
  departmentTh: string;
  primaryFacilityId: string | null;
  backupFacilityId: string | null;
  expectedClarificationKeys: string[];
}

const CASE_META: Array<{
  scenarioId: DemoScenarioId;
  recordId: string;
  aliases: string[];
}> = [
  {
    scenarioId: "hero-father-diabetes",
    recordId: "demo:case:a",
    aliases: ["case-a", "hero", "father-diabetes"],
  },
  {
    scenarioId: "ucs-away-from-home",
    recordId: "demo:case:b",
    aliases: ["case-b", "ucs-away"],
  },
  {
    scenarioId: "sss-dental",
    recordId: "demo:case:c",
    aliases: ["case-c", "dental"],
  },
];

const rawCases = demoCaseData.records as DemoCaseJsonRecord[];

/** Single typed projection used by both booth UI and deterministic fallback. */
export const DEMO_CASES: DemoCaseDefinition[] = CASE_META.map((meta) => {
  const record = rawCases.find((item) => item.id === meta.recordId && item.active);
  if (!record) throw new Error(`Missing active demo case ${meta.recordId}`);
  return {
    scenarioId: meta.scenarioId,
    recordId: record.id,
    aliases: [record.id, ...meta.aliases],
    titleTh: record.title_th,
    shortLabelTh: record.short_label_th,
    narrativeTh: record.narrative_th,
    patientRelation: record.prefill.patient_relation,
    age: record.prefill.age ?? null,
    scheme: record.prefill.scheme,
    areaCode: record.prefill.area_code,
    areaName: record.prefill.area_name,
    userGoalTh: record.prefill.user_goal_th,
    urgency: record.precomputed_result.urgency,
    conditionIds: [...record.precomputed_result.possible_condition_ids],
    serviceIds: [...record.precomputed_result.recommended_service_ids],
    departmentTh: record.precomputed_result.recommended_department_th,
    primaryFacilityId: record.precomputed_result.primary_facility_id,
    backupFacilityId: record.precomputed_result.backup_facility_id,
    expectedClarificationKeys: [...record.expected_clarification_keys],
  };
});

export function demoCaseByScenarioId(id: string | null | undefined): DemoCaseDefinition | null {
  const normalized = (id ?? "").trim().toLowerCase();
  return DEMO_CASES.find(
    (item) => item.scenarioId === normalized || item.aliases.includes(normalized),
  ) ?? null;
}

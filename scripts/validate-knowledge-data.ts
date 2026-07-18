import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const knowledgeDir = resolve(dirname(fileURLToPath(import.meta.url)), "../data/knowledge/v1");

const fileNames = [
  "sources.json",
  "rights.json",
  "areas.json",
  "conditions.json",
  "symptoms.json",
  "services.json",
  "coverages.json",
  "facilities.json",
  "facility-rights.json",
  "facility-services.json",
  "benefits.json",
  "eligibility-rules.json",
  "safety-rules.json",
  "demo-cases.json",
  "demo-feedback.json",
] as const;

type FileName = (typeof fileNames)[number];
type MetadataRecord = {
  id: string;
  source_id: string;
  effective_from: string;
  effective_to: string | null;
  verification_status: string;
  [key: string]: unknown;
};

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const nullableDate = date.nullable();
const id = z.string().regex(/^[a-z][a-z0-9-]*(?::[A-Za-z0-9][A-Za-z0-9._-]*)+$/, "expected namespaced stable id");
const verificationStatus = z.enum(["VERIFIED", "NEEDS_CONFIRMATION", "EXPIRED", "DEMO_ONLY"]);

const metadataShape = {
  id,
  source_id: id,
  effective_from: date,
  effective_to: nullableDate,
  verification_status: verificationStatus,
};

const metadataRecord = z.object(metadataShape).passthrough();
const sourceRecord = z
  .object({
    ...metadataShape,
    title: z.string().min(1),
    publisher: z.string().min(1),
    url: z.string().url().nullable(),
    document_type: z.string().min(1),
    published_at: nullableDate,
    effective_date: nullableDate,
    retrieved_at: z.string().datetime({ offset: true }),
    content_hash: z.string().nullable(),
    is_official: z.boolean(),
  })
  .strict();

const rightRecord = z
  .object({
    ...metadataShape,
    code: z.enum(["UCS", "SSS", "CSMBS"]),
    name_th: z.string().min(1),
    description_th: z.string().min(1),
    active: z.boolean(),
  })
  .strict();

const areaRecord = z
  .object({
    ...metadataShape,
    area_code: z.string().min(1),
    name_th: z.string().min(1),
    level: z.string().min(1),
    parent_id: id.nullable(),
  })
  .strict();

const conditionRecord = z
  .object({
    ...metadataShape,
    icd10: z.string().nullable(),
    name_th: z.string().min(1),
    category: z.string().min(1),
    safety_note_th: z.string().min(1),
    recommended_service_ids: z.array(id),
    active: z.boolean(),
  })
  .strict();

const symptomRecord = z
  .object({
    ...metadataShape,
    name_th: z.string().min(1),
    aliases: z.array(z.string().min(1)),
    condition_ids: z.array(id),
    red_flag: z.boolean(),
    red_flag_level: z.enum(["EMERGENCY_NOW"]).nullable(),
    active: z.boolean(),
  })
  .strict();

const serviceRecord = z
  .object({
    ...metadataShape,
    name_th: z.string().min(1),
    type: z.string().min(1),
    care_level: z.enum(["PRIMARY", "SECONDARY", "TERTIARY", "EMERGENCY"]),
    description_th: z.string().min(1),
    eligible_age_min: z.number().int().nonnegative().nullable(),
    eligible_age_max: z.number().int().nonnegative().nullable(),
    interval_months: z.number().int().positive().nullable(),
    active: z.boolean(),
  })
  .strict();

const coverageRecord = z
  .object({
    ...metadataShape,
    service_id: id,
    right_id: id,
    coverage_status: z.enum(["COVERED", "COVERED_CONDITIONAL", "NOT_COVERED", "UNKNOWN"]),
    copay_type: z.enum(["FREE", "FIXED", "VARIABLE", "UNKNOWN"]),
    copay_amount: z.number().nonnegative().nullable(),
    copay_text_th: z.string().min(1),
    conditions_th: z.string().nullable(),
    referral_required: z.boolean().nullable(),
  })
  .strict();

const openingHours = z.object({
  timezone: z.literal("Asia/Bangkok"),
  weekly: z.record(z.array(z.tuple([z.string(), z.string()]))).nullable(),
  note_th: z.string().min(1),
});

const facilityRecord = z
  .object({
    ...metadataShape,
    hcode: z.string().nullable(),
    name_th: z.string().min(1),
    facility_type: z.string().min(1),
    care_level: z.enum(["PRIMARY", "SECONDARY", "TERTIARY", "EMERGENCY"]),
    address_th: z.string().nullable(),
    area_id: id,
    lat: z.number().min(-90).max(90).nullable(),
    lng: z.number().min(-180).max(180).nullable(),
    phone: z.string().nullable(),
    website_url: z.string().url().nullable(),
    map_url: z.string().url().nullable(),
    opening_hours: openingHours,
    call_before_visit: z.boolean(),
    data_updated_at: z.string().datetime({ offset: true }),
    active: z.boolean(),
  })
  .strict();

const facilityRightRecord = z
  .object({
    ...metadataShape,
    facility_id: id,
    right_id: id,
    acceptance_status: z.enum(["ACCEPTED", "CONDITIONAL", "UNKNOWN"]),
    conditions_th: z.string().nullable(),
    verified_at: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

const facilityServiceRecord = z
  .object({
    ...metadataShape,
    facility_id: id,
    service_id: id,
    availability_status: z.enum(["AVAILABLE", "AVAILABLE_CONDITIONAL", "UNAVAILABLE", "UNKNOWN"]),
    conditions_th: z.string().nullable(),
    verified_at: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

const benefitRecord = z
  .object({
    ...metadataShape,
    name_th: z.string().min(1),
    description_th: z.string().min(1),
    value_text_th: z.string().min(1),
    case_relevance_tags: z.array(z.string().min(1)),
    agency_id: id,
    eligibility_rule_ids: z.array(id).min(1),
    active: z.boolean(),
  })
  .strict();

const predicate = z.object({ attr: z.string().min(1), op: z.string().min(1), value: z.unknown() }).strict();
const eligibilityRuleRecord = z
  .object({
    ...metadataShape,
    benefit_id: id,
    description_th: z.string().min(1),
    logic_json: z.object({ all: z.array(predicate).min(1) }).strict(),
    required_attrs: z.array(z.string().min(1)).min(1),
    active: z.boolean(),
  })
  .strict();

const safetyRuleRecord = z
  .object({
    ...metadataShape,
    keywords: z.array(z.string().min(1)).min(1),
    normalized_symptom_id: id,
    urgency_floor: z.literal("EMERGENCY_NOW"),
    hotline: z.literal("1669"),
    message_th: z.string().min(1),
    exclusions: z.array(z.string().min(1)),
    negation_patterns: z.array(z.string().min(1)).min(1),
    active: z.boolean(),
  })
  .strict();

const demoCaseRecord = metadataRecord.extend({
  title_th: z.string().min(1),
  short_label_th: z.string().min(1),
  narrative_th: z.string().min(1),
  prefill: z
    .object({
      patient_relation: z.enum(["self", "father", "mother", "child", "relative", "other", "unknown"]),
      age: z.number().int().min(0).max(125),
      scheme: z.enum(["UCS", "SSS", "CSMBS"]),
      area_code: z.string().min(1),
      area_name: z.string().min(1),
      user_goal_th: z.string().min(1),
      receives_state_pension: z.boolean().optional(),
      receives_regular_state_income: z.boolean().optional(),
      registered_area: z.string().min(1).optional(),
      insured_status: z.string().min(1).optional(),
    })
    .strict(),
  precomputed_result: z
    .object({
      emergency_detected: z.boolean(),
      urgency: z.enum([
        "EMERGENCY_NOW",
        "URGENT_TODAY",
        "SOON_1_3_DAYS",
        "ROUTINE_APPOINTMENT",
        "SELF_CARE_WITH_MONITORING",
      ]),
      possible_condition_ids: z.array(id),
      recommended_service_ids: z.array(id).min(1),
      recommended_department_th: z.string().min(1),
      primary_facility_id: id.nullable(),
      backup_facility_id: id.nullable(),
      benefit_decisions: z.array(
        z.object({
          benefit_id: id,
          result: z.enum(["ELIGIBLE", "NOT_ELIGIBLE", "INDETERMINATE"]),
          reason_th: z.string().min(1),
        }).strict(),
      ),
      degraded_notice_th: z.string().min(1),
    })
    .strict(),
  expected_clarification_keys: z.array(z.string()),
  active: z.boolean(),
});

const demoFeedbackRecord = metadataRecord.extend({
  case_id: id,
  facility_id: id,
  outcome: z.enum([
    "RECEIVED_AS_PLANNED",
    "RECEIVED_WITH_EXTRA_COST",
    "RIGHT_NOT_ACCEPTED",
    "SERVICE_NOT_AVAILABLE",
    "FACILITY_CLOSED",
    "MISSING_DOCUMENTS",
    "TRANSFERRED_ELSEWHERE",
    "DID_NOT_GO",
    "OTHER",
  ]),
  right_accepted: z.boolean().nullable(),
  service_received: z.boolean().nullable(),
  unexpected_cost: z.boolean().nullable(),
  cost_amount: z.number().nonnegative().nullable(),
  missing_documents: z.array(z.string()),
  transferred_to: z.string().nullable(),
  notes: z.string().nullable(),
  submitted_at: z.string().datetime({ offset: true }),
  moderation_status: z.literal("DEMO_APPROVED"),
  is_demo: z.literal(true),
  sample_data_label_th: z.literal("ข้อมูลตัวอย่างสำหรับการสาธิต"),
});

const schemas: Record<FileName, z.ZodTypeAny> = {
  "sources.json": sourceRecord,
  "rights.json": rightRecord,
  "areas.json": areaRecord,
  "conditions.json": conditionRecord,
  "symptoms.json": symptomRecord,
  "services.json": serviceRecord,
  "coverages.json": coverageRecord,
  "facilities.json": facilityRecord,
  "facility-rights.json": facilityRightRecord,
  "facility-services.json": facilityServiceRecord,
  "benefits.json": benefitRecord,
  "eligibility-rules.json": eligibilityRuleRecord,
  "safety-rules.json": safetyRuleRecord,
  "demo-cases.json": demoCaseRecord,
  "demo-feedback.json": demoFeedbackRecord,
};

const envelope = (recordSchema: z.ZodTypeAny) =>
  z
    .object({
      schemaVersion: z.literal("1.0.0"),
      generatedAt: z.string().datetime({ offset: true }),
      records: z.array(recordSchema),
    })
    .strict();

const loaded = new Map<FileName, MetadataRecord[]>();
const errors: string[] = [];

function records(name: FileName): MetadataRecord[] {
  return loaded.get(name) ?? [];
}

function ids(name: FileName): Set<string> {
  return new Set(records(name).map((record) => record.id));
}

function requireId(owner: MetadataRecord, field: string, target: Set<string>, targetName: string): void {
  const value = owner[field];
  if (typeof value === "string" && !target.has(value)) {
    errors.push(`${owner.id}.${field} references missing ${targetName} ${value}`);
  }
}

function requireIds(owner: MetadataRecord, field: string, target: Set<string>, targetName: string): void {
  const values = owner[field];
  if (!Array.isArray(values)) return;
  for (const value of values) {
    if (typeof value === "string" && !target.has(value)) {
      errors.push(`${owner.id}.${field} references missing ${targetName} ${value}`);
    }
  }
}

async function main(): Promise<void> {
  for (const name of fileNames) {
    const path = resolve(knowledgeDir, name);
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      errors.push(`${name}: cannot read/parse JSON: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    const result = envelope(schemas[name]).safeParse(parsedJson);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(`${name}:${issue.path.join(".") || "root"}: ${issue.message}`);
      }
      continue;
    }
    loaded.set(name, result.data.records as MetadataRecord[]);
  }

  const allIds = new Map<string, string>();
  for (const name of fileNames) {
    const local = new Set<string>();
    for (const record of records(name)) {
      if (local.has(record.id)) errors.push(`${name}: duplicate id ${record.id}`);
      local.add(record.id);
      const previous = allIds.get(record.id);
      if (previous) errors.push(`duplicate id ${record.id} appears in ${previous} and ${name}`);
      else allIds.set(record.id, name);

      const from = Date.parse(`${record.effective_from}T00:00:00Z`);
      const to = record.effective_to ? Date.parse(`${record.effective_to}T00:00:00Z`) : null;
      if (!Number.isFinite(from) || (to !== null && !Number.isFinite(to))) {
        errors.push(`${record.id}: invalid effective date`);
      } else if (to !== null && to < from) {
        errors.push(`${record.id}: effective_to precedes effective_from`);
      }
    }
  }

  const sourceIds = ids("sources.json");
  for (const name of fileNames) {
    for (const record of records(name)) {
      if (!sourceIds.has(record.source_id)) errors.push(`${record.id}: missing source ${record.source_id}`);
    }
  }

  const rightIds = ids("rights.json");
  const areaIds = ids("areas.json");
  const areaCodes = new Set(records("areas.json").map((record) => record.area_code).filter((value): value is string => typeof value === "string"));
  const conditionIds = ids("conditions.json");
  const symptomIds = ids("symptoms.json");
  const serviceIds = ids("services.json");
  const facilityIds = ids("facilities.json");
  const benefitIds = ids("benefits.json");
  const ruleIds = ids("eligibility-rules.json");
  const demoCaseIds = ids("demo-cases.json");

  for (const record of records("areas.json")) {
    const parent = record.parent_id;
    if (typeof parent === "string" && !areaIds.has(parent)) errors.push(`${record.id}: missing parent area ${parent}`);
  }
  for (const record of records("conditions.json")) requireIds(record, "recommended_service_ids", serviceIds, "service");
  for (const record of records("symptoms.json")) requireIds(record, "condition_ids", conditionIds, "condition");
  for (const record of records("coverages.json")) {
    requireId(record, "service_id", serviceIds, "service");
    requireId(record, "right_id", rightIds, "right");
    if (record.copay_type === "FREE" && record.verification_status !== "VERIFIED") {
      errors.push(`${record.id}: FREE coverage must be VERIFIED`);
    }
  }
  for (const record of records("facilities.json")) requireId(record, "area_id", areaIds, "area");
  for (const record of records("facility-rights.json")) {
    requireId(record, "facility_id", facilityIds, "facility");
    requireId(record, "right_id", rightIds, "right");
  }
  for (const record of records("facility-services.json")) {
    requireId(record, "facility_id", facilityIds, "facility");
    requireId(record, "service_id", serviceIds, "service");
  }
  for (const record of records("benefits.json")) requireIds(record, "eligibility_rule_ids", ruleIds, "eligibility rule");
  for (const record of records("eligibility-rules.json")) {
    requireId(record, "benefit_id", benefitIds, "benefit");
    const required = new Set(Array.isArray(record.required_attrs) ? record.required_attrs.filter((v): v is string => typeof v === "string") : []);
    const logic = record.logic_json as { all?: Array<{ attr?: string }> } | undefined;
    for (const predicateValue of logic?.all ?? []) {
      if (predicateValue.attr && !required.has(predicateValue.attr)) {
        errors.push(`${record.id}: predicate attr ${predicateValue.attr} is absent from required_attrs`);
      }
    }
  }
  for (const record of records("safety-rules.json")) {
    requireId(record, "normalized_symptom_id", symptomIds, "symptom");
    const patterns = Array.isArray(record.negation_patterns) ? record.negation_patterns : [];
    for (const pattern of patterns) {
      if (typeof pattern !== "string") continue;
      try {
        new RegExp(pattern, "iu");
      } catch {
        errors.push(`${record.id}: invalid negation regex ${pattern}`);
      }
    }
  }
  for (const record of records("demo-cases.json")) {
    const prefill = record.prefill as Record<string, unknown> | undefined;
    if (typeof prefill?.area_code === "string" && !areaCodes.has(prefill.area_code)) {
      errors.push(`${record.id}: missing demo area code ${prefill.area_code}`);
    }
    const result = record.precomputed_result as Record<string, unknown> | undefined;
    for (const value of (result?.possible_condition_ids as unknown[]) ?? []) {
      if (typeof value === "string" && !conditionIds.has(value)) errors.push(`${record.id}: missing demo condition ${value}`);
    }
    for (const value of (result?.recommended_service_ids as unknown[]) ?? []) {
      if (typeof value === "string" && !serviceIds.has(value)) errors.push(`${record.id}: missing demo service ${value}`);
    }
    for (const field of ["primary_facility_id", "backup_facility_id"] as const) {
      const value = result?.[field];
      if (typeof value === "string" && !facilityIds.has(value)) errors.push(`${record.id}: missing demo facility ${value}`);
    }
    const decisions = (result?.benefit_decisions as Array<Record<string, unknown>> | undefined) ?? [];
    for (const decision of decisions) {
      const value = decision.benefit_id;
      if (typeof value === "string" && !benefitIds.has(value)) errors.push(`${record.id}: missing demo benefit ${value}`);
    }
  }
  for (const record of records("demo-feedback.json")) {
    requireId(record, "case_id", demoCaseIds, "demo case");
    requireId(record, "facility_id", facilityIds, "facility");
    if (record.verification_status !== "DEMO_ONLY") errors.push(`${record.id}: demo feedback must be DEMO_ONLY`);
  }

  if (errors.length > 0) {
    console.error(`Knowledge validation failed with ${errors.length} issue(s):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  const recordCount = [...loaded.values()].reduce((sum, value) => sum + value.length, 0);
  console.log(`Knowledge validation passed: ${fileNames.length} files, ${recordCount} records, no orphan links.`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});

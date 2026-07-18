import { randomUUID } from "crypto";
import {
  MEDICAL_DISCLAIMER,
  PassportExclusionSchema,
  PassportSnapshotSchema,
  REQUIRED_PASSPORT_EXCLUSIONS,
  type CasePassportSnapshot,
  type MvpCaseRecord,
  type PassportConsentScope,
  type PassportExclusion,
  type VerifiedCareRoute,
} from "./contracts";

export interface PassportConsent {
  scope: PassportConsentScope[];
  shareAllowed: boolean;
  sensitiveFieldsExcluded: PassportExclusion[];
}

export const DEFAULT_SHARED_PASSPORT_EXCLUSIONS = [
  ...REQUIRED_PASSPORT_EXCLUSIONS,
  "original_narrative",
  "medications",
  "allergies",
] as const satisfies readonly PassportExclusion[];

export function buildPassportSnapshot(input: {
  record: MvpCaseRecord;
  version: number;
  consent: PassportConsent;
  code?: string;
  createdAt?: string;
  expiresAt?: string;
}): CasePassportSnapshot {
  const { record, version } = input;
  const route = requireRoute(record);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const consent = normalizePassportConsent(input.consent);
  const duration = durationText(record.extracted.duration);
  const redFlagAnswers: Array<{ question: string; answer: string; status: "PRESENT" | "ABSENT" | "UNKNOWN" }> = [
    ...record.safety.matchedLabels.map((label) => ({ question: label, answer: "พบในเรื่องที่เล่า", status: "PRESENT" as const })),
    ...record.extracted.negatedSymptoms
      .filter((label) => !record.safety.matchedLabels.includes(label))
      .map((label) => ({ question: label, answer: "ผู้ใช้ระบุว่าไม่มี", status: "ABSENT" as const })),
  ];
  const criticalAnswer = record.answers.critical_red_flags;
  if (criticalAnswer === "absent") {
    redFlagAnswers.push({ question: "หมดสติ หายใจลำบากรุนแรง เจ็บหน้าอกรุนแรง ชัก หรือแขนขาอ่อนแรงเฉียบพลัน", answer: "ผู้ใช้ตอบว่าไม่มี", status: "ABSENT" });
  } else if (criticalAnswer === "unknown") {
    redFlagAnswers.push({ question: "สัญญาณอันตรายสำคัญ", answer: "ผู้ใช้ตอบว่าไม่ทราบ", status: "UNKNOWN" });
  } else if (criticalAnswer === "present" && !record.safety.matchedLabels.length) {
    redFlagAnswers.push({ question: "สัญญาณอันตรายสำคัญ", answer: "ผู้ใช้ตอบว่ามีอย่างน้อยหนึ่งอาการ", status: "PRESENT" });
  }
  if (!redFlagAnswers.length) redFlagAnswers.push({ question: "สัญญาณอันตรายสำคัญ", answer: "ยังไม่มีข้อมูลยืนยันครบทุกข้อ", status: "UNKNOWN" });

  const snapshot = PassportSnapshotSchema.parse(redactNationalIds({
    passport: {
      code: input.code ?? `RR-${createdAt.slice(2, 10).replaceAll("-", "")}-${randomUUID().slice(0, 6).toUpperCase()}`,
      version,
      createdAt,
      updatedAt: createdAt,
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      purpose: "PRE_VISIT_HANDOFF",
      language: "th",
    },
    consent,
    patient: {
      relationToReporter: relationDisplay(record.extracted.patientRelation),
      age: record.extracted.age,
      ageDisplay: record.extracted.age == null ? "ไม่ทราบอายุ" : `${record.extracted.age} ปี`,
      sex: sexDisplay(record.extracted.sex),
      scheme: {
        code: record.extracted.scheme,
        displayName: schemeDisplay(record.extracted.scheme),
        verificationStatus: record.extracted.scheme === "UNKNOWN" ? "UNVERIFIED" : "USER_CONFIRMED",
      },
      area: record.extracted.area.name ?? "ยังไม่ระบุพื้นที่",
    },
    narrative: {
      originalStory: redactSensitive(record.originalNarrative),
      normalizedSummary: normalizedSummary(record),
      symptoms: record.extracted.symptoms.map((symptom) => ({
        name: symptom.normalizedName ?? symptom.text,
        ...(duration ? { duration } : {}),
        present: symptom.present,
        source: "USER",
      })),
    },
    safety: {
      urgency: route.urgency,
      urgencyLabelTh: route.urgencyLabelTh,
      emergencyDetected: route.emergency,
      redFlagAnswers,
      watchFor: route.redFlagsToWatch,
      escalationInstruction: route.emergencyInstruction,
    },
    prescreen: {
      possibleConditions: route.possibleConditions.map((condition) => ({ nameTh: condition.nameTh, confidence: condition.confidence })),
      recommendedCareLevel: route.recommendedCareLevel,
      recommendedDepartment: route.recommendedDepartment,
      recommendedServices: route.recommendedServices,
      disclaimer: MEDICAL_DISCLAIMER,
    },
    rights: route.rights
      .filter((right) => !/private|insurance|ประกันเอกชน/i.test(`${right.serviceId} ${right.serviceName}`))
      .map((right) => ({
        serviceId: right.serviceId,
        serviceName: right.serviceName,
        coverageStatus: right.coverageStatus,
        costSummary: right.costSummary,
        conditions: right.conditions,
        evidenceIds: right.evidenceIds,
      })),
    route: {
      primary: route.primary
        ? {
            facilityId: route.primary.facilityId,
            facilityName: route.primary.facilityName,
            serviceName: route.primary.serviceName,
            address: route.primary.address,
            phone: route.primary.phone,
            mapUrl: route.primary.mapUrl,
            openingStatus: route.primary.openingStatus === "HOURS_UNKNOWN" ? "UNKNOWN" : route.primary.openingStatus,
            openingText: route.primary.openingText,
            rightAcceptance: route.primary.rightAcceptanceText,
            callBeforeVisit: route.primary.callBeforeVisit,
            whySelected: route.primary.whySelected,
            lastVerifiedAt: route.primary.lastVerifiedAt,
          }
        : null,
      backup: route.backup
        ? {
            facilityId: route.backup.facilityId,
            facilityName: route.backup.facilityName,
            whenToUse: route.backupWhenToUse ?? "เมื่อเส้นทางหลักไม่พร้อมให้บริการ",
            phone: route.backup.phone,
            mapUrl: route.backup.mapUrl,
          }
        : null,
    },
    preparation: {
      documents: route.preparationItems.map((item) => ({ label: item.label, requiredStatus: item.requiredStatus, reason: item.reason })),
      healthInformation: [
        { label: "ระยะเวลาที่มีอาการ", value: duration },
        { label: "โรคประจำตัวที่แจ้ง", value: record.extracted.knownConditions.join(", ") || null },
        { label: "รายการยาที่แจ้ง", value: record.extracted.medications?.join(", ") || null },
        { label: "การแพ้ยาที่แจ้ง", value: record.extracted.allergies?.join(", ") || null },
      ],
    },
    questionsForClinician: route.clinicianQuestions,
    evidence: route.evidence.map((item) => ({
      id: item.id,
      title: item.title,
      publisher: item.publisher,
      effectiveDate: item.effectiveDate,
      retrievedAt: item.retrievedAt,
      url: item.url,
      isOfficial: item.isOfficial,
    })),
    disclaimer: {
      short: MEDICAL_DISCLAIMER,
      full: `${MEDICAL_DISCLAIMER} Case Passport เป็นข้อมูลสรุปก่อนเข้ารับบริการ ไม่ใช่ใบส่งตัว ใบรับรองแพทย์ หรือผลวินิจฉัย และสถานพยาบาลไม่ได้รับรองเอกสารนี้`,
    },
  }));

  return applyPassportExclusions(snapshot, consent.sensitiveFieldsExcluded);
}

/**
 * Produces the public/share view without mutating the immutable owner snapshot.
 * Shared Passports deliberately omit the original free-text story, medication
 * list, and allergy list unless a future explicit consent scope is introduced.
 */
export function sanitizeSharedPassportSnapshot(
  snapshot: CasePassportSnapshot,
  additionalExclusions: PassportExclusion[] = [],
): CasePassportSnapshot {
  const parsed = PassportSnapshotSchema.parse(snapshot);
  if (!parsed.consent.shareAllowed) throw new Error("PASSPORT_SHARE_NOT_ALLOWED");
  const consent = normalizePassportConsent(
    {
      ...parsed.consent,
      sensitiveFieldsExcluded: [
        ...parsed.consent.sensitiveFieldsExcluded,
        ...DEFAULT_SHARED_PASSPORT_EXCLUSIONS,
        ...additionalExclusions,
      ],
    },
    "shared",
  );
  return applyPassportExclusions({ ...parsed, consent }, consent.sensitiveFieldsExcluded);
}

export function normalizePassportConsent(
  input: PassportConsent,
  mode: "owner" | "shared" = "owner",
): CasePassportSnapshot["consent"] {
  if (input.scope.length !== 1 || input.scope[0] !== "PRE_VISIT_HANDOFF") {
    throw new Error("UNSUPPORTED_PASSPORT_CONSENT_SCOPE");
  }

  const requested = input.sensitiveFieldsExcluded;
  const withRequired: PassportExclusion[] = [
    ...REQUIRED_PASSPORT_EXCLUSIONS,
    ...requested,
    ...(mode === "shared" ? DEFAULT_SHARED_PASSPORT_EXCLUSIONS : []),
  ];

  // A free-text narrative may repeat medication or allergy details. Removing
  // those fields therefore also removes the original story, while retaining a
  // clinically useful normalized symptom summary.
  if (withRequired.includes("medications") || withRequired.includes("allergies")) {
    withRequired.push("original_narrative");
  }

  const sensitiveFieldsExcluded = unique(withRequired).map((field) =>
    PassportExclusionSchema.parse(field),
  );
  return {
    scope: ["PRE_VISIT_HANDOFF"],
    shareAllowed: input.shareAllowed,
    sensitiveFieldsExcluded,
  };
}

export function applyPassportExclusions(
  snapshot: CasePassportSnapshot,
  requestedExclusions: PassportExclusion[],
): CasePassportSnapshot {
  const consent = normalizePassportConsent({
    ...snapshot.consent,
    sensitiveFieldsExcluded: requestedExclusions,
  });
  const excluded = new Set(consent.sensitiveFieldsExcluded);
  const { narrative: sourceNarrative, ...withoutNarrative } = snapshot;
  let narrative: CasePassportSnapshot["narrative"];

  if (!excluded.has("narrative") && sourceNarrative) {
    const {
      originalStory,
      normalizedSummary,
      symptoms,
    } = sourceNarrative;
    narrative = {
      ...(!excluded.has("original_narrative") && originalStory
        ? { originalStory }
        : {}),
      ...(!excluded.has("normalized_narrative") && normalizedSummary
        ? { normalizedSummary }
        : {}),
      symptoms: excluded.has("symptoms") ? [] : symptoms,
    };
  }

  const healthInformation = snapshot.preparation.healthInformation.filter((item) => {
    if (excluded.has("medications") && isMedicationLabel(item.label)) return false;
    if (excluded.has("allergies") && isAllergyLabel(item.label)) return false;
    return true;
  });

  return PassportSnapshotSchema.parse(redactNationalIds({
    ...withoutNarrative,
    ...(narrative ? { narrative } : {}),
    consent,
    preparation: {
      ...snapshot.preparation,
      healthInformation,
    },
  }));
}

export function redactSensitive(value: string): string {
  return value.replace(/(?<!\d)\d{13}(?!\d)/g, "[ไม่จัดเก็บเลขบัตรประชาชน]");
}

function redactNationalIds(value: unknown): unknown {
  if (typeof value === "string") return redactSensitive(value);
  if (Array.isArray(value)) return value.map(redactNationalIds);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, redactNationalIds(nested)]),
    );
  }
  return value;
}

function isMedicationLabel(label: string): boolean {
  return /รายการยา|ยาที่แจ้ง|ยาประจำ/i.test(label);
}

function isAllergyLabel(label: string): boolean {
  return /แพ้ยา|การแพ้/i.test(label);
}

function normalizedSummary(record: MvpCaseRecord): string {
  const symptoms = record.extracted.symptoms.filter((item) => item.present).map((item) => item.normalizedName ?? item.text).join(", ");
  const duration = durationText(record.extracted.duration);
  return [relationDisplay(record.extracted.patientRelation), record.extracted.age == null ? null : `อายุ ${record.extracted.age} ปี`, symptoms || record.extracted.userGoal, duration].filter(Boolean).join(" · ");
}

function durationText(value: MvpCaseRecord["extracted"]["duration"]): string | null {
  if (value.raw) return value.raw;
  if (value.value == null || value.unit === "unknown") return null;
  const unit = { hours: "ชั่วโมง", days: "วัน", weeks: "สัปดาห์", months: "เดือน" }[value.unit];
  return `${value.value} ${unit}`;
}

function relationDisplay(value: string): string {
  return { self: "ผู้เล่าเอง", father: "พ่อ", mother: "แม่", child: "ลูก", relative: "ญาติ/คนในครอบครัว", other: "บุคคลอื่น", unknown: "ยังไม่ทราบ" }[value] ?? "ยังไม่ทราบ";
}

function sexDisplay(value: string): string {
  return { male: "ชาย", female: "หญิง", other: "อื่น ๆ", unknown: "ไม่ระบุ" }[value] ?? "ไม่ระบุ";
}

function schemeDisplay(value: string): string {
  return { UCS: "สิทธิหลักประกันสุขภาพแห่งชาติ (บัตรทอง)", SSS: "สิทธิประกันสังคม", CSMBS: "สวัสดิการรักษาพยาบาลข้าราชการ", PRIVATE: "ประกันสุขภาพเอกชน", UNKNOWN: "ยังไม่ทราบสิทธิรักษาหลัก" }[value] ?? "ยังไม่ทราบสิทธิรักษาหลัก";
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function requireRoute(record: MvpCaseRecord): VerifiedCareRoute {
  if (!record.route) throw new Error("ROUTE_NOT_READY");
  return record.route;
}

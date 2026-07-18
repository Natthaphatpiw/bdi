import { randomUUID } from "crypto";
import {
  CALL_WARNING,
  VerifiedCareRouteSchema,
  type ExtractedCase,
  type PrescreenResult,
  type RouteCoverage,
  type RouteEvidence,
  type SafetyState,
  type Urgency,
  type VerifiedCareRoute,
} from "./contracts";
import { rankFacilities } from "./facility-ranking";
import type { DemoProfile } from "./fallbacks";
import type { FacilityCandidateFact, FacilityReliability } from "./providers";
import { applyUrgencyFloor } from "./safety";

export interface ComposeRouteInput {
  caseId: string;
  extracted: ExtractedCase;
  safety: SafetyState;
  prescreen: PrescreenResult;
  profile: DemoProfile;
  coverages: RouteCoverage[];
  facilities: FacilityCandidateFact[];
  reliabilities?: Map<string, FacilityReliability | null>;
  evidence: RouteEvidence[];
  degraded?: boolean;
  generatedAt?: string;
}

export function composeVerifiedCareRoute(input: ComposeRouteInput): VerifiedCareRoute {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const finalUrgency = applyUrgencyFloor(input.prescreen.urgency, input.safety.finalUrgency);
  const emergency = finalUrgency === "EMERGENCY_NOW";
  const serviceIds = emergency
    ? ["svc:emergency-response"]
    : unique([
        ...input.profile.serviceIds,
        ...input.prescreen.recommendedServiceTypes.filter((value) => value.startsWith("svc:")),
        ...input.coverages.map((coverage) => coverage.serviceId),
      ]);
  const ranked = emergency
    ? { primary: null, backup: null, all: [] }
    : rankFacilities({
        candidates: input.facilities,
        requiredServiceIds: serviceIds,
        coverages: input.coverages,
        urgency: finalUrgency,
        area: { code: input.extracted.area.code, name: input.extracted.area.name },
        location: input.extracted.currentLocation ?? null,
        atTime: input.extracted.preferredTime ?? generatedAt,
        reliabilities: input.reliabilities,
        preferredOrder: input.profile.preferredFacilityIds,
        resolvedEvidenceIds: new Set(input.evidence.map((item) => item.id)),
      });
  const primary = ranked.primary;
  const backup = ranked.backup ?? (!primary && input.extracted.scheme === "UNKNOWN"
    ? unverifiedRightsBackup(input.coverages[0]?.serviceId ?? serviceIds[0] ?? "svc:general-acute-assessment")
    : null);
  const degraded = Boolean(input.degraded || (!emergency && !primary));
  const evidenceIds = new Set(input.evidence.map((item) => item.id));
  const filteredEvidence = input.evidence.filter((item) => evidenceIds.has(item.id));

  return VerifiedCareRouteSchema.parse({
    id: randomUUID(),
    caseId: input.caseId,
    generatedAt,
    urgency: finalUrgency,
    urgencyLabelTh: urgencyLabel(finalUrgency),
    urgencyExplanationTh: emergency
      ? "อาการที่เล่ามาอาจต้องได้รับความช่วยเหลือฉุกเฉิน อย่ารอประมวลผลสิทธิ์หรือเส้นทางปกติ"
      : input.prescreen.explanationTh,
    emergency,
    emergencyInstruction: emergency ? "โทร 1669 ทันที หากอยู่ในที่ไม่ปลอดภัยให้ขอคนใกล้ตัวช่วยโทร" : null,
    redFlagsToWatch: unique(input.prescreen.redFlagsToWatch),
    primary,
    backup,
    backupWhenToUse: emergency
      ? null
      : backup
        ? primary
          ? "ใช้เมื่อสถานที่แรกปิด ไม่มีบริการ หรือยืนยันสิทธิ์ไม่ได้"
          : "ใช้เป็นช่องทางสำรองเพื่อยืนยันสิทธิ์และบริการก่อนเดินทาง"
        : null,
    rights: input.coverages.filter((coverage) => serviceIds.includes(coverage.serviceId)),
    preparationItems: preparationItems(input.extracted, input.coverages),
    whyThisRoute: {
      safety: emergency
        ? ["กฎความปลอดภัยตรวจพบสัญญาณฉุกเฉิน จึงให้ 1669 เป็นการกระทำแรก"]
        : [`ระดับความเร่งด่วนสุดท้ายคือ ${urgencyLabel(finalUrgency)}`, "ระบบไม่ลดระดับความเร่งด่วนต่ำกว่ากฎความปลอดภัย"],
      care: unique([
        ...input.prescreen.recommendedServiceTypes.map((service) => `บริการที่เกี่ยวข้อง: ${serviceName(service, input.coverages)}`),
        input.prescreen.recommendedDepartment ? `แผนกที่เหมาะสม: ${input.prescreen.recommendedDepartment}` : "ให้บุคลากรทางการแพทย์เลือกบริการหลังประเมิน",
      ]),
      rights: input.extracted.scheme === "UNKNOWN"
        ? ["ยังไม่ทราบสิทธิรักษาหลัก จึงไม่ยืนยันความครอบคลุมหรือค่าใช้จ่าย"]
        : input.coverages.length
          ? input.coverages.map((coverage) => `${coverage.serviceName}: ${coverage.costSummary}`)
          : ["ยังต้องยืนยันข้อมูลสิทธิ์สำหรับบริการนี้"],
      facility: emergency
        ? ["เส้นทางฉุกเฉินให้โทร 1669 ก่อน ไม่แสดงสถานพยาบาลปกติเป็นเส้นทางหลัก"]
        : primary?.whySelected ?? ["ยังไม่พบสถานที่ที่ผ่าน hard filters ครบ ต้องโทรยืนยัน"],
      evidenceFreshness: filteredEvidence.length
        ? filteredEvidence.map((item) => `${item.title} · ${item.verificationStatus}`).slice(0, 5)
        : ["ขณะนี้ไม่สามารถตรวจสอบหลักฐานบางส่วนได้"],
    },
    evidence: filteredEvidence,
    possibleConditions: input.prescreen.possibleConditions.slice(0, 3),
    recommendedCareLevel: input.prescreen.recommendedCareLevel,
    recommendedDepartment: input.prescreen.recommendedDepartment,
    recommendedServices: serviceIds.map((service) => serviceName(service, input.coverages)),
    clinicianQuestions: input.prescreen.clinicianQuestions,
    degraded,
    limitationTh: degraded
      ? "ขณะนี้ไม่สามารถตรวจสอบข้อมูลบางส่วนได้ กรุณาโทรยืนยันกับหน่วยงาน/สถานพยาบาล"
      : input.prescreen.limitationsTh,
  });
}

function preparationItems(extracted: ExtractedCase, coverages: RouteCoverage[]): VerifiedCareRoute["preparationItems"] {
  const items: VerifiedCareRoute["preparationItems"] = [
    { id: "prep:identity-card", label: "บัตรประชาชนของผู้ป่วย", requiredStatus: "RECOMMENDED" as const, reason: "ใช้ยืนยันตัวตนและตรวจสอบสิทธิ์ที่สถานพยาบาล โดยไม่ต้องกรอกเลขบัตรในระบบนี้" },
    { id: "prep:right-info", label: "ข้อมูลสิทธิรักษาหลัก", requiredStatus: "RECOMMENDED" as const, reason: extracted.scheme === "UNKNOWN" ? "ใช้ให้เจ้าหน้าที่ช่วยตรวจสอบสิทธิ์" : "ใช้ยืนยันสิทธิ์ที่เลือกไว้" },
  ];
  if (extracted.symptoms.length) {
    items.push({ id: "prep:medications", label: "รายการยาและอาหารเสริมที่ใช้อยู่", requiredStatus: "IF_AVAILABLE", reason: "ช่วยให้บุคลากรประเมินอาการและความเสี่ยงจากยา" });
    items.push({ id: "prep:previous-results", label: "ผลตรวจหรือสมุดนัดเดิม", requiredStatus: "IF_AVAILABLE", reason: "ช่วยเปรียบเทียบข้อมูลเดิมและลดการตรวจซ้ำที่ไม่จำเป็น" });
  }
  if (coverages.some((coverage) => coverage.referralRequired === true)) {
    items.push({ id: "prep:referral", label: "ใบส่งตัว", requiredStatus: "REQUIRED", reason: "ข้อมูลสิทธิ์ระบุว่าบริการนี้ต้องมีใบส่งตัว" });
  }
  return items;
}

function unverifiedRightsBackup(serviceId: string) {
  return {
    facilityId: null,
    facilityName: "ตรวจสอบสิทธิรักษากับหน่วยงานเจ้าของสิทธิ์",
    serviceId,
    serviceName: "ตรวจสอบสิทธิและหน่วยบริการ",
    department: null,
    address: null,
    areaName: null,
    phone: null,
    mapUrl: null,
    distanceKm: null,
    openingStatus: "HOURS_UNKNOWN" as const,
    openingText: "ยังต้องยืนยันเวลาติดต่อ",
    rightAcceptance: "UNKNOWN" as const,
    rightAcceptanceText: "ยังต้องยืนยันสิทธิรักษาหลัก",
    callBeforeVisit: true,
    costSummary: "ยังไม่มีข้อมูลค่าใช้จ่ายที่ยืนยันได้",
    score: 0,
    scoreBreakdown: { serviceMatch: 0, rightMatch: 0, openAtRequestedTime: 0, areaOrDistanceMatch: 0, sourceFreshnessAndVerification: 0, observedAccessReliability: 0 },
    whySelected: ["ยังไม่ทราบสิทธิหลัก จึงต้องตรวจสอบก่อนเลือกสถานพยาบาล"],
    warnings: [CALL_WARNING],
    evidenceIds: [],
    lastVerifiedAt: null,
  };
}

function urgencyLabel(value: Urgency): string {
  return {
    EMERGENCY_NOW: "โทรขอความช่วยเหลือฉุกเฉินทันที",
    URGENT_TODAY: "ควรไปพบแพทย์ภายในวันนี้",
    SOON_1_3_DAYS: "ควรพบแพทย์ภายใน 1–3 วัน",
    ROUTINE_APPOINTMENT: "สามารถนัดหมายเพื่อรับบริการได้",
    SELF_CARE_WITH_MONITORING: "ดูแลตัวเองและเฝ้าระวังอาการ",
  }[value];
}

function serviceName(id: string, coverages: RouteCoverage[]): string {
  return coverages.find((coverage) => coverage.serviceId === id)?.serviceName ?? {
    "svc:emergency-response": "การช่วยเหลือการแพทย์ฉุกเฉิน",
    "svc:dm-assessment": "ประเมินอาการและความเสี่ยงเบาหวาน",
    "svc:dm-screening": "ตรวจระดับน้ำตาลตามข้อบ่งชี้",
    "svc:general-acute-assessment": "ประเมินอาการเจ็บป่วยเฉียบพลัน",
    "svc:ucs-right-verification": "ตรวจสอบสิทธิบัตรทองและหน่วยบริการ",
    "svc:dental-basic": "บริการทันตกรรมพื้นฐาน",
    "svc:sss-right-verification": "ตรวจสอบสิทธิทันตกรรมประกันสังคม",
  }[id] ?? id;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

import { z } from "zod";

export const CaseStatusSchema = z.enum([
  "draft",
  "collecting_information",
  "emergency_escalated",
  "ready_for_review",
  "processing",
  "route_ready",
  "passport_ready",
  "closed",
]);
export type CaseStatus = z.infer<typeof CaseStatusSchema>;

export const SchemeSchema = z.enum(["UCS", "SSS", "CSMBS", "PRIVATE", "UNKNOWN"]);
export type MvpScheme = z.infer<typeof SchemeSchema>;

export const UrgencySchema = z.enum([
  "EMERGENCY_NOW",
  "URGENT_TODAY",
  "SOON_1_3_DAYS",
  "ROUTINE_APPOINTMENT",
  "SELF_CARE_WITH_MONITORING",
]);
export type Urgency = z.infer<typeof UrgencySchema>;

export const PatientRelationSchema = z.enum([
  "self",
  "father",
  "mother",
  "child",
  "relative",
  "other",
  "unknown",
]);

export const ExtractedCaseSchema = z.object({
  patientRelation: PatientRelationSchema,
  age: z.number().int().min(0).max(125).nullable(),
  ageGroup: z.enum(["child", "adult", "older_adult", "unknown"]).optional(),
  sex: z.enum(["male", "female", "other", "unknown"]),
  symptoms: z
    .array(
      z.object({
        id: z.string().optional(),
        text: z.string().min(1).max(160),
        normalizedName: z.string().max(160).optional(),
        present: z.boolean(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(20),
  duration: z.object({
    value: z.number().nonnegative().nullable(),
    unit: z.enum(["hours", "days", "weeks", "months", "unknown"]),
    raw: z.string().max(120).nullable(),
  }),
  onset: z.enum(["sudden", "gradual", "unknown"]).default("unknown"),
  knownConditions: z.array(z.string().max(160)).max(20),
  medications: z.array(z.string().max(160)).max(30).optional(),
  allergies: z.array(z.string().max(160)).max(20).optional(),
  scheme: SchemeSchema,
  area: z.object({ name: z.string().max(160).nullable(), code: z.string().max(60).nullable() }),
  currentLocation: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .nullable()
    .optional(),
  preferredTime: z.string().max(120).nullable(),
  userGoal: z.string().min(1).max(500),
  redFlagMentions: z.array(z.string().max(160)).max(20),
  negatedSymptoms: z.array(z.string().max(160)).max(20),
  uncertainties: z.array(z.string().max(200)).max(20).default([]),
  missingCriticalFields: z.array(z.string().max(80)).max(20),
  fieldConfidence: z.record(z.string(), z.number().min(0).max(1)).default({}),
  overallConfidence: z.number().min(0).max(1),
});
export type ExtractedCase = z.infer<typeof ExtractedCaseSchema>;

export const PrescreenResultSchema = z.object({
  urgency: UrgencySchema,
  possibleConditions: z
    .array(
      z.object({
        conditionId: z.string().nullable(),
        nameTh: z.string().min(1).max(160),
        rationale: z.string().min(1).max(500),
        confidence: z.enum(["low", "medium", "high"]),
      }),
    )
    .max(3),
  recommendedCareLevel: z.enum(["emergency", "primary", "secondary", "tertiary"]),
  recommendedDepartment: z.string().max(160).nullable(),
  recommendedServiceTypes: z.array(z.string().max(120)).max(10),
  redFlagsToWatch: z.array(z.string().max(240)).max(12),
  clinicianQuestions: z.array(z.string().max(240)).max(12),
  explanationTh: z.string().min(1).max(1200),
  limitationsTh: z.string().min(1).max(800),
});
export type PrescreenResult = z.infer<typeof PrescreenResultSchema>;

export const ClarificationQuestionSchema = z.object({
  id: z.string(),
  slotKey: z.string(),
  question: z.string(),
  reasonCode: z.enum(["SAFETY", "ROUTING", "ELIGIBILITY", "COST"]),
  options: z.array(z.object({ label: z.string(), value: z.string() })).max(8),
  allowFreeText: z.boolean().default(false),
  required: z.boolean().default(true),
});
export type ClarificationQuestion = z.infer<typeof ClarificationQuestionSchema>;

export const SafetyStateSchema = z.object({
  emergency: z.boolean(),
  finalUrgency: UrgencySchema,
  matchedRuleIds: z.array(z.string()),
  matchedLabels: z.array(z.string()),
  hotline: z.string().nullable(),
  messageTh: z.string().nullable(),
});
export type SafetyState = z.infer<typeof SafetyStateSchema>;

export const EvidenceSchema = z.object({
  id: z.string(),
  title: z.string(),
  publisher: z.string(),
  url: z.string().url().nullable(),
  effectiveDate: z.string().nullable(),
  retrievedAt: z.string(),
  isOfficial: z.boolean(),
  verificationStatus: z.string(),
});
export type RouteEvidence = z.infer<typeof EvidenceSchema>;

export const CoverageSchema = z.object({
  serviceId: z.string(),
  serviceName: z.string(),
  coverageStatus: z.enum(["COVERED", "CONDITIONAL", "NOT_COVERED", "UNKNOWN"]),
  copayType: z.enum(["FREE", "FIXED", "VARIABLE", "UNKNOWN"]),
  copayAmount: z.number().nonnegative().nullable(),
  costSummary: z.string(),
  conditions: z.string().nullable(),
  referralRequired: z.boolean().nullable(),
  evidenceIds: z.array(z.string()),
  verificationStatus: z.string(),
  effectiveFrom: z.string().nullable(),
  effectiveTo: z.string().nullable(),
});
export type RouteCoverage = z.infer<typeof CoverageSchema>;

export const OpeningStatusSchema = z.enum(["OPEN_NOW", "CLOSED", "HOURS_UNKNOWN"]);

export const RouteFacilitySchema = z.object({
  facilityId: z.string().nullable(),
  facilityName: z.string(),
  serviceId: z.string(),
  serviceName: z.string(),
  department: z.string().nullable(),
  address: z.string().nullable(),
  areaName: z.string().nullable(),
  phone: z.string().nullable(),
  mapUrl: z.string().url().nullable(),
  distanceKm: z.number().nonnegative().nullable(),
  openingStatus: OpeningStatusSchema,
  openingText: z.string(),
  rightAcceptance: z.enum(["ACCEPTED", "CONDITIONAL", "UNKNOWN"]),
  rightAcceptanceText: z.string(),
  callBeforeVisit: z.boolean(),
  costSummary: z.string(),
  score: z.number().min(0).max(100),
  scoreBreakdown: z.object({
    serviceMatch: z.number().min(0).max(35),
    rightMatch: z.number().min(0).max(25),
    openAtRequestedTime: z.number().min(0).max(15),
    areaOrDistanceMatch: z.number().min(0).max(10),
    sourceFreshnessAndVerification: z.number().min(0).max(10),
    observedAccessReliability: z.number().min(0).max(5),
  }),
  whySelected: z.array(z.string()).max(8),
  warnings: z.array(z.string()).max(8),
  evidenceIds: z.array(z.string()),
  lastVerifiedAt: z.string().nullable(),
});
export type RouteFacility = z.infer<typeof RouteFacilitySchema>;

export const PreparationItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  requiredStatus: z.enum(["REQUIRED", "RECOMMENDED", "IF_AVAILABLE"]),
  reason: z.string(),
});

export const VerifiedCareRouteSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  generatedAt: z.string(),
  urgency: UrgencySchema,
  urgencyLabelTh: z.string(),
  urgencyExplanationTh: z.string(),
  emergency: z.boolean(),
  emergencyInstruction: z.string().nullable(),
  redFlagsToWatch: z.array(z.string()),
  primary: RouteFacilitySchema.nullable(),
  backup: RouteFacilitySchema.nullable(),
  backupWhenToUse: z.string().nullable(),
  rights: z.array(CoverageSchema),
  preparationItems: z.array(PreparationItemSchema),
  whyThisRoute: z.object({
    safety: z.array(z.string()),
    care: z.array(z.string()),
    rights: z.array(z.string()),
    facility: z.array(z.string()),
    evidenceFreshness: z.array(z.string()),
  }),
  evidence: z.array(EvidenceSchema),
  possibleConditions: PrescreenResultSchema.shape.possibleConditions,
  recommendedCareLevel: PrescreenResultSchema.shape.recommendedCareLevel,
  recommendedDepartment: PrescreenResultSchema.shape.recommendedDepartment,
  recommendedServices: z.array(z.string()),
  clinicianQuestions: z.array(z.string()),
  degraded: z.boolean().default(false),
  limitationTh: z.string().nullable(),
});
export type VerifiedCareRoute = z.infer<typeof VerifiedCareRouteSchema>;

export const CaseRecordSchema = z.object({
  id: z.string(),
  demoSessionId: z.string().nullable(),
  demoScenarioId: z.string().nullable(),
  status: CaseStatusSchema,
  originalNarrative: z.string().max(4000),
  extracted: ExtractedCaseSchema,
  safety: SafetyStateSchema,
  questions: z.array(ClarificationQuestionSchema),
  answers: z.record(z.string(), z.string()).default({}),
  route: VerifiedCareRouteSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string().nullable(),
});
export type MvpCaseRecord = z.infer<typeof CaseRecordSchema>;

export const PassportConsentScopeSchema = z.literal("PRE_VISIT_HANDOFF");
export type PassportConsentScope = z.infer<typeof PassportConsentScopeSchema>;

/**
 * Stable, user-safe field identifiers recorded in a Passport snapshot.
 * Internal database/provider field names are intentionally not exposed here.
 */
export const REQUIRED_PASSPORT_EXCLUSIONS = [
  "national_id",
  "system_internal_data",
  "model_identity",
  "raw_prompt",
  "internal_reasoning",
  "debug_metadata",
  "private_insurance",
] as const;

export const OPTIONAL_PASSPORT_EXCLUSIONS = [
  "narrative",
  "original_narrative",
  "normalized_narrative",
  "symptoms",
  "medications",
  "allergies",
] as const;

export const PassportExclusionSchema = z.enum([
  ...REQUIRED_PASSPORT_EXCLUSIONS,
  ...OPTIONAL_PASSPORT_EXCLUSIONS,
]);
export type PassportExclusion = z.infer<typeof PassportExclusionSchema>;

export const PassportConsentSchema = z
  .object({
    scope: z.array(PassportConsentScopeSchema).length(1),
    shareAllowed: z.boolean(),
    sensitiveFieldsExcluded: z.array(PassportExclusionSchema),
  })
  .superRefine((consent, context) => {
    for (const required of REQUIRED_PASSPORT_EXCLUSIONS) {
      if (!consent.sensitiveFieldsExcluded.includes(required)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sensitiveFieldsExcluded"],
          message: `Passport must exclude ${required}`,
        });
      }
    }
  });

export const PassportSnapshotSchema = z.object({
  passport: z.object({
    code: z.string(),
    version: z.number().int().positive(),
    createdAt: z.string(),
    updatedAt: z.string(),
    expiresAt: z.string().optional(),
    purpose: z.literal("PRE_VISIT_HANDOFF"),
    language: z.literal("th"),
  }),
  consent: PassportConsentSchema,
  patient: z.object({
    relationToReporter: z.string(),
    age: z.number().nullable(),
    ageDisplay: z.string(),
    sex: z.string().optional(),
    scheme: z.object({
      code: z.string(),
      displayName: z.string(),
      verificationStatus: z.enum(["USER_CONFIRMED", "PROFILE_CONFIRMED", "UNVERIFIED"]),
    }),
    area: z.string(),
  }),
  narrative: z.object({
    originalStory: z.string().optional(),
    normalizedSummary: z.string().optional(),
    symptoms: z.array(
      z.object({
        name: z.string(),
        duration: z.string().optional(),
        severity: z.string().optional(),
        present: z.boolean(),
        source: z.literal("USER"),
      }),
    ),
  }).optional(),
  safety: z.object({
    urgency: z.string(),
    urgencyLabelTh: z.string(),
    emergencyDetected: z.boolean(),
    redFlagAnswers: z.array(
      z.object({
        question: z.string(),
        answer: z.string(),
        status: z.enum(["PRESENT", "ABSENT", "UNKNOWN"]),
      }),
    ),
    watchFor: z.array(z.string()),
    escalationInstruction: z.string().nullable(),
  }),
  prescreen: z.object({
    possibleConditions: z.array(
      z.object({ nameTh: z.string(), confidence: z.enum(["low", "medium", "high"]) }),
    ),
    recommendedCareLevel: z.string(),
    recommendedDepartment: z.string().nullable(),
    recommendedServices: z.array(z.string()),
    disclaimer: z.string(),
  }),
  rights: z.array(
    z.object({
      serviceId: z.string(),
      serviceName: z.string(),
      coverageStatus: z.enum(["COVERED", "CONDITIONAL", "NOT_COVERED", "UNKNOWN"]),
      costSummary: z.string(),
      conditions: z.string().nullable(),
      evidenceIds: z.array(z.string()),
    }),
  ),
  route: z.object({
    primary: z
      .object({
        facilityId: z.string().nullable(),
        facilityName: z.string(),
        serviceName: z.string(),
        address: z.string().nullable(),
        phone: z.string().nullable(),
        mapUrl: z.string().nullable(),
        openingStatus: z.enum(["OPEN_NOW", "CLOSED", "UNKNOWN"]),
        openingText: z.string(),
        rightAcceptance: z.string(),
        callBeforeVisit: z.boolean(),
        whySelected: z.array(z.string()),
        lastVerifiedAt: z.string().nullable(),
      })
      .nullable(),
    backup: z
      .object({
        facilityId: z.string().nullable(),
        facilityName: z.string(),
        whenToUse: z.string(),
        phone: z.string().nullable(),
        mapUrl: z.string().nullable(),
      })
      .nullable(),
  }),
  preparation: z.object({
    documents: z.array(
      z.object({
        label: z.string(),
        requiredStatus: z.enum(["REQUIRED", "RECOMMENDED", "IF_AVAILABLE"]),
        reason: z.string(),
      }),
    ),
    healthInformation: z.array(z.object({ label: z.string(), value: z.string().nullable() })),
  }),
  questionsForClinician: z.array(z.string()),
  evidence: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      publisher: z.string(),
      effectiveDate: z.string().nullable(),
      retrievedAt: z.string(),
      url: z.string().nullable(),
      isOfficial: z.boolean(),
    }),
  ),
  disclaimer: z.object({ short: z.string(), full: z.string() }),
});
export type CasePassportSnapshot = z.infer<typeof PassportSnapshotSchema>;

export interface StoredPassport {
  id: string;
  caseId: string;
  snapshot: CasePassportSnapshot;
  revokedAt: string | null;
}

export type FeedbackOutcome =
  | "RECEIVED_AS_PLANNED"
  | "RECEIVED_WITH_EXTRA_COST"
  | "RIGHT_NOT_ACCEPTED"
  | "SERVICE_NOT_AVAILABLE"
  | "FACILITY_CLOSED"
  | "MISSING_DOCUMENTS"
  | "TRANSFERRED_ELSEWHERE"
  | "DID_NOT_GO"
  | "OTHER";

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; retryable: boolean } | null;
  requestId: string;
}

export const MEDICAL_DISCLAIMER =
  "ข้อมูลนี้เป็นการคัดกรองและนำทางเบื้องต้น ไม่ใช่การวินิจฉัย โปรดให้บุคลากรทางการแพทย์ประเมินอีกครั้ง";

export const CALL_WARNING =
  "เวลาและการรับสิทธิ์อาจเปลี่ยนแปลง โปรดโทรยืนยันก่อนเดินทาง";

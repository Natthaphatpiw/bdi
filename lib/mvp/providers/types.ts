import type {
  ExtractedCase,
  MvpScheme,
  PrescreenResult,
  RouteEvidence,
  Urgency,
  VerifiedCareRoute,
} from "../contracts";

export interface ExtractCaseInput {
  narrative: string;
  confirmed?: {
    patientRelation?: ExtractedCase["patientRelation"];
    scheme?: MvpScheme;
    area?: string;
  };
}

export interface PrescreenCaseInput {
  extractedCase: ExtractedCase;
  urgencyFloor: Urgency;
  safetyMatches?: string[];
}

export interface FollowUpModelInput {
  question: string;
  sanitizedSnapshot: unknown;
}

export interface FollowUpModelAnswer {
  answerTh: string;
  evidenceIds: string[];
  needsVerification: boolean;
}

export interface ModelProvider {
  extractCase(input: ExtractCaseInput): Promise<ExtractedCase>;
  prescreenCase(input: PrescreenCaseInput): Promise<PrescreenResult>;
  synthesizeExplanation(route: VerifiedCareRoute): Promise<string>;
  answerFollowUp(input: FollowUpModelInput): Promise<FollowUpModelAnswer>;
}

export interface KnowledgeRight {
  id: string;
  code: MvpScheme;
  nameTh: string;
  descriptionTh: string | null;
  sourceId: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  verificationStatus: string;
}

export interface ConditionMatch {
  conditionId: string;
  nameTh: string;
  likelihood: number;
  sourceId: string;
}

export interface CoveredServiceFact {
  serviceId: string;
  serviceName: string;
  serviceType: string;
  careLevel: string;
  coverageStatus: "COVERED" | "CONDITIONAL" | "NOT_COVERED" | "UNKNOWN";
  copayType: "FREE" | "FIXED" | "VARIABLE" | "UNKNOWN";
  copayAmount: number | null;
  copayTextTh: string | null;
  conditionsTh: string | null;
  referralRequired: boolean | null;
  intervalMonths: number | null;
  sourceId: string;
  verificationStatus: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

export interface FacilityCandidateFact {
  facilityId: string;
  nameTh: string;
  facilityType: string;
  careLevel: string;
  addressTh: string | null;
  areaId: string | null;
  areaName: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  websiteUrl: string | null;
  mapUrl: string | null;
  openingHours: unknown;
  callBeforeVisit: boolean;
  serviceIds: string[];
  rightAcceptance: "ACCEPTED" | "CONDITIONAL" | "UNKNOWN" | "REJECTED";
  rightConditionsTh: string | null;
  sourceId: string;
  evidenceSourceIds?: string[];
  verificationStatus: string;
  dataUpdatedAt: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

export interface BenefitFact {
  id: string;
  nameTh: string;
  descriptionTh: string | null;
  valueTextTh: string | null;
  relevanceTags: string[];
  agencyId: string | null;
  sourceId: string;
  rule: {
    id: string;
    logic: Record<string, unknown>;
    requiredAttrs: string[];
    effectiveFrom: string | null;
    effectiveTo: string | null;
  } | null;
}

export interface FacilityReliability {
  facilityId: string;
  sampleSize: number;
  successCount: number;
  successRate: number | null;
  lastConfirmationDate: string | null;
  demoData: boolean;
}

export interface FacilityMatchInput {
  serviceIds: string[];
  scheme: MvpScheme;
  area?: { id?: string | null; code?: string | null; name?: string | null };
  location?: { lat: number; lng: number } | null;
  atTime?: string | Date;
  urgency: Urgency;
  asOfDate?: string;
}

export interface KnowledgeRuntimeState {
  degraded: boolean;
  fallbackUsed: boolean;
}

export interface KnowledgeProvider {
  resolveRight(scheme: MvpScheme, asOfDate?: string): Promise<KnowledgeRight | null>;
  matchCondition(symptomIds: string[], asOfDate?: string): Promise<ConditionMatch[]>;
  getCoveredServices(
    conditionIds: string[],
    scheme: MvpScheme,
    asOfDate?: string,
    serviceIds?: string[],
  ): Promise<CoveredServiceFact[]>;
  matchFacilities(input: FacilityMatchInput): Promise<FacilityCandidateFact[]>;
  getBenefits(
    conditionIds: string[],
    age: number | null,
    scheme: MvpScheme,
    asOfDate?: string,
  ): Promise<BenefitFact[]>;
  getEvidence(entityIds: string[]): Promise<RouteEvidence[]>;
  getFacilityReliability(facilityId: string): Promise<FacilityReliability | null>;
  /** Returns an isolated wrapper when a provider keeps per-request provenance. */
  createRequestScope?(): KnowledgeProvider;
  /** Never exposes provider names to the client; the service only consumes the safety state. */
  getRuntimeState?(): KnowledgeRuntimeState;
}

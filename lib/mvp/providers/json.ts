import { readFile } from "fs/promises";
import path from "path";
import type { MvpScheme, RouteEvidence } from "../contracts";
import {
  asBoolean,
  asNullableString,
  asNumber,
  asString,
  asStringArray,
  first,
  isEffective,
  normalizeAcceptance,
  normalizeCopayType,
  normalizeCoverageStatus,
  recordOf,
  recordsOf,
} from "./provider-utils";
import type {
  BenefitFact,
  ConditionMatch,
  CoveredServiceFact,
  FacilityCandidateFact,
  FacilityMatchInput,
  FacilityReliability,
  KnowledgeProvider,
  KnowledgeRight,
} from "./types";

type Row = Record<string, unknown>;

export interface JsonKnowledgeProviderOptions {
  dataDirectory?: string;
}

export class JsonKnowledgeProvider implements KnowledgeProvider {
  private readonly directory: string;
  private readonly cache = new Map<string, Promise<Row[]>>();

  constructor(options: JsonKnowledgeProviderOptions = {}) {
    this.directory = options.dataDirectory ?? path.join(process.cwd(), "data", "knowledge", "v1");
  }

  async resolveRight(scheme: MvpScheme, asOfDate = today()): Promise<KnowledgeRight | null> {
    if (scheme === "UNKNOWN" || scheme === "PRIVATE") return null;
    const row = (await this.load("rights.json")).find(
      (item) =>
        asString(first(item, "code", "scheme")).toUpperCase() === scheme && activeEffective(item, asOfDate),
    );
    return row
      ? {
          id: asString(first(row, "id", "right_id")),
          code: scheme,
          nameTh: asString(first(row, "nameTh", "name_th")),
          descriptionTh: asNullableString(first(row, "descriptionTh", "description_th")),
          sourceId: asString(first(row, "sourceId", "source_id")),
          effectiveFrom: asNullableString(first(row, "effectiveFrom", "effective_from")),
          effectiveTo: asNullableString(first(row, "effectiveTo", "effective_to")),
          verificationStatus: asString(
            first(row, "verificationStatus", "verification_status"),
            "UNVERIFIED",
          ),
        }
      : null;
  }

  async matchCondition(symptomIds: string[], asOfDate = today()): Promise<ConditionMatch[]> {
    if (!symptomIds.length) return [];
    const [links, conditions, symptoms] = await Promise.all([
      this.loadOptional("symptom-condition-links.json"),
      this.load("conditions.json"),
      this.load("symptoms.json"),
    ]);
    const synthesizedLinks = links.length
      ? links
      : [
          ...conditions.flatMap((condition) =>
            asStringArray(first(condition, "symptomIds", "symptom_ids")).map((symptomId) => ({
              symptom_id: symptomId,
              condition_id: first(condition, "id", "condition_id"),
              likelihood: first(condition, "likelihood", "default_likelihood") ?? 0.5,
              source_id: first(condition, "sourceId", "source_id"),
            })),
          ),
          ...symptoms.flatMap((symptom) =>
            asStringArray(first(symptom, "conditionIds", "condition_ids")).map((conditionId) => ({
              symptom_id: first(symptom, "id", "symptom_id"),
              condition_id: conditionId,
              likelihood: 0.5,
              source_id: first(symptom, "sourceId", "source_id"),
            })),
          ),
        ];
    const byId = new Map(conditions.map((row) => [asString(first(row, "id", "condition_id")), row]));
    return synthesizedLinks
      .map(recordOf)
      .filter(
        (link) =>
          symptomIds.includes(asString(first(link, "symptomId", "symptom_id"))) &&
          activeEffective(link, asOfDate),
      )
      .map((link) => {
        const conditionId = asString(first(link, "conditionId", "condition_id"));
        const condition = byId.get(conditionId) ?? {};
        return {
          conditionId,
          nameTh: asString(first(condition, "nameTh", "name_th")),
          likelihood: clamp(asNumber(first(link, "likelihood", "weight")) ?? 0.5, 0, 1),
          sourceId: asString(
            first(link, "sourceId", "source_id") ?? first(condition, "sourceId", "source_id"),
          ),
        };
      })
      .filter((match) => match.conditionId && match.nameTh)
      .sort((a, b) => b.likelihood - a.likelihood);
  }

  async getCoveredServices(
    conditionIds: string[],
    scheme: MvpScheme,
    asOfDate = today(),
    explicitServiceIds: string[] = [],
  ): Promise<CoveredServiceFact[]> {
    const right = await this.resolveRight(scheme, asOfDate);
    if (!right) return [];
    const [services, coverages, links, conditions] = await Promise.all([
      this.load("services.json"),
      this.load("coverages.json"),
      this.loadOptional("condition-service-links.json"),
      this.load("conditions.json"),
    ]);
    const linkedIds = links
      .filter((link) => conditionIds.includes(asString(first(link, "conditionId", "condition_id"))))
      .map((link) => asString(first(link, "serviceId", "service_id")));
    const embeddedIds = services
      .filter((service) =>
        asStringArray(first(service, "conditionIds", "condition_ids")).some((id) => conditionIds.includes(id)),
      )
      .map((service) => asString(first(service, "id", "service_id")));
    const conditionRecommendedIds = conditions
      .filter((condition) => conditionIds.includes(asString(first(condition, "id", "condition_id"))))
      .flatMap((condition) => asStringArray(first(condition, "recommendedServiceIds", "recommended_service_ids")));
    const serviceIds = unique([
      ...explicitServiceIds,
      ...linkedIds,
      ...embeddedIds,
      ...conditionRecommendedIds,
    ].filter(Boolean));
    if (!serviceIds.length) return [];
    const coverageByService = new Map(
      coverages
        .filter(
          (coverage) =>
            asString(first(coverage, "rightId", "right_id")) === right.id &&
            activeEffective(coverage, asOfDate),
        )
        .map((coverage) => [asString(first(coverage, "serviceId", "service_id")), coverage]),
    );
    return services
      .filter(
        (service) =>
          serviceIds.includes(asString(first(service, "id", "service_id"))) && activeEffective(service, asOfDate),
      )
      .map((service) => toServiceFact(service, coverageByService.get(asString(first(service, "id", "service_id")))));
  }

  async matchFacilities(input: FacilityMatchInput): Promise<FacilityCandidateFact[]> {
    if (!input.serviceIds.length || input.scheme === "UNKNOWN" || input.scheme === "PRIVATE") return [];
    const right = await this.resolveRight(input.scheme, input.asOfDate);
    if (!right) return [];
    const [facilities, rightLinks, serviceLinks, areas] = await Promise.all([
      this.load("facilities.json"),
      this.load("facility-rights.json"),
      this.load("facility-services.json"),
      this.load("areas.json"),
    ]);
    const areaNames = new Map(
      areas.map((area) => [asString(first(area, "id", "area_id")), asString(first(area, "nameTh", "name_th"))]),
    );
    const relevantServiceLinks = serviceLinks.filter(
      (link) =>
        input.serviceIds.includes(asString(first(link, "serviceId", "service_id"))) &&
        !["UNAVAILABLE", "REJECTED"].includes(
          asString(first(link, "availabilityStatus", "availability_status")).toUpperCase(),
        ) &&
        activeEffective(link, input.asOfDate),
    );
    const facilityIds = new Set(
      relevantServiceLinks.map((link) => asString(first(link, "facilityId", "facility_id"))),
    );
    const rightByFacility = new Map(
      rightLinks
        .filter(
          (link) =>
            asString(first(link, "rightId", "right_id")) === right.id && activeEffective(link, input.asOfDate),
        )
        .map((link) => [asString(first(link, "facilityId", "facility_id")), link]),
    );
    return facilities
      .filter(
        (facility) =>
          facilityIds.has(asString(first(facility, "id", "facility_id"))) &&
          activeEffective(facility, input.asOfDate),
      )
      .map((facility) => {
        const facilityId = asString(first(facility, "id", "facility_id"));
        const rightLink = rightByFacility.get(facilityId);
        const facilityServiceLinks = relevantServiceLinks.filter(
          (link) => asString(first(link, "facilityId", "facility_id")) === facilityId,
        );
        const serviceIds = unique(
          facilityServiceLinks.map((link) => asString(first(link, "serviceId", "service_id"))),
        );
        const serviceSourceIds = unique(
          facilityServiceLinks
            .map((link) => asString(first(link, "sourceId", "source_id")))
            .filter(Boolean),
        );
        return toFacilityFact(
          facility,
          rightLink,
          serviceIds,
          areaNames.get(asString(first(facility, "areaId", "area_id"))) ?? null,
          serviceSourceIds,
        );
      });
  }

  async getBenefits(
    conditionIds: string[],
    age: number | null,
    scheme: MvpScheme,
    asOfDate = today(),
  ): Promise<BenefitFact[]> {
    const [benefits, rules] = await Promise.all([
      this.load("benefits.json"),
      this.load("eligibility-rules.json"),
    ]);
    const activeRules = new Map(
      rules
        .filter((rule) => activeEffective(rule, asOfDate))
        .map((rule) => [asString(first(rule, "benefitId", "benefit_id")), rule]),
    );
    return benefits
      .filter((benefit) => activeEffective(benefit, asOfDate) && benefitRelevant(benefit, conditionIds, age, scheme))
      .map((benefit) => toBenefitFact(benefit, activeRules.get(asString(first(benefit, "id", "benefit_id")))));
  }

  async getEvidence(entityIds: string[]): Promise<RouteEvidence[]> {
    if (!entityIds.length) return [];
    const sources = await this.load("sources.json");
    const sourceIds = new Set(entityIds);
    const entityFiles = [
      "rights.json",
      "conditions.json",
      "symptoms.json",
      "services.json",
      "coverages.json",
      "facilities.json",
      "facility-rights.json",
      "facility-services.json",
      "benefits.json",
      "eligibility-rules.json",
      "areas.json",
    ];
    const allEntities = (await Promise.all(entityFiles.map((file) => this.loadOptional(file)))).flat();
    for (const entity of allEntities) {
      const id = asString(first(entity, "id", "right_id", "condition_id", "symptom_id", "service_id", "facility_id", "benefit_id"));
      if (!entityIds.includes(id)) continue;
      const sourceId = asString(first(entity, "sourceId", "source_id"));
      if (sourceId) sourceIds.add(sourceId);
    }
    return sources
      .filter((source) => sourceIds.has(asString(first(source, "id", "source_id"))))
      .map(toEvidence);
  }

  async getFacilityReliability(facilityId: string): Promise<FacilityReliability | null> {
    const feedback = await this.loadOptional("demo-feedback.json");
    const relevant = feedback.filter(
      (row) => asString(first(row, "facilityId", "facility_id")) === facilityId,
    );
    if (!relevant.length) return null;
    const aggregate = relevant.find((row) => first(row, "sampleSize", "sample_size") !== undefined);
    if (aggregate) {
      const sampleSize = asNumber(first(aggregate, "sampleSize", "sample_size")) ?? 0;
      const successCount = asNumber(first(aggregate, "successCount", "success_count")) ?? 0;
      return {
        facilityId,
        sampleSize,
        successCount,
        successRate: sampleSize ? successCount / sampleSize : null,
        lastConfirmationDate: asNullableString(first(aggregate, "lastConfirmationDate", "last_confirmation_date")),
        demoData: true,
      };
    }
    const successes = relevant.filter((row) =>
      ["RECEIVED_AS_PLANNED", "RECEIVED_WITH_EXTRA_COST"].includes(
        asString(first(row, "outcome")).toUpperCase(),
      ),
    );
    const dates = relevant
      .map((row) => asString(first(row, "submittedAt", "submitted_at")))
      .filter(Boolean)
      .sort();
    return {
      facilityId,
      sampleSize: relevant.length,
      successCount: successes.length,
      successRate: successes.length / relevant.length,
      lastConfirmationDate: dates.at(-1) ?? null,
      demoData: true,
    };
  }

  private load(file: string): Promise<Row[]> {
    const existing = this.cache.get(file);
    if (existing) return existing;
    const pending = readFile(path.join(this.directory, file), "utf8")
      .then((raw) => recordsOf(JSON.parse(raw) as unknown))
      .catch((error: unknown) => {
        this.cache.delete(file);
        throw error;
      });
    this.cache.set(file, pending);
    return pending;
  }

  private async loadOptional(file: string): Promise<Row[]> {
    try {
      return await this.load(file);
    } catch {
      return [];
    }
  }
}

function toServiceFact(service: Row, coverage?: Row): CoveredServiceFact {
  return {
    serviceId: asString(first(service, "id", "service_id")),
    serviceName: asString(first(service, "nameTh", "name_th")),
    serviceType: asString(first(service, "type", "service_type")),
    careLevel: asString(first(service, "careLevel", "care_level"), "primary"),
    coverageStatus: normalizeCoverageStatus(first(coverage ?? {}, "coverageStatus", "coverage_status")),
    copayType: normalizeCopayType(first(coverage ?? {}, "copayType", "copay_type")),
    copayAmount: asNumber(first(coverage ?? {}, "copayAmount", "copay_amount")),
    copayTextTh: asNullableString(first(coverage ?? {}, "copayTextTh", "copay_text_th")),
    conditionsTh: asNullableString(first(coverage ?? {}, "conditionsTh", "conditions_th")),
    referralRequired:
      typeof first(coverage ?? {}, "referralRequired", "referral_required") === "boolean"
        ? (first(coverage ?? {}, "referralRequired", "referral_required") as boolean)
        : null,
    intervalMonths: asNumber(first(service, "intervalMonths", "interval_months")),
    sourceId: asString(
      first(coverage ?? {}, "sourceId", "source_id") ?? first(service, "sourceId", "source_id"),
    ),
    verificationStatus: asString(
      first(coverage ?? {}, "verificationStatus", "verification_status"),
      "UNVERIFIED",
    ),
    effectiveFrom: asNullableString(first(coverage ?? {}, "effectiveFrom", "effective_from")),
    effectiveTo: asNullableString(first(coverage ?? {}, "effectiveTo", "effective_to")),
  };
}

function toFacilityFact(
  facility: Row,
  rightLink: Row | undefined,
  serviceIds: string[],
  areaName: string | null,
  serviceSourceIds: string[],
): FacilityCandidateFact {
  const facilitySourceId = asString(first(facility, "sourceId", "source_id"));
  const rightSourceId = asString(first(rightLink ?? {}, "sourceId", "source_id"));
  return {
    facilityId: asString(first(facility, "id", "facility_id")),
    nameTh: asString(first(facility, "nameTh", "name_th")),
    facilityType: asString(first(facility, "facilityType", "facility_type")),
    careLevel: asString(first(facility, "careLevel", "care_level")),
    addressTh: asNullableString(first(facility, "addressTh", "address_th")),
    areaId: asNullableString(first(facility, "areaId", "area_id")),
    areaName,
    lat: asNumber(first(facility, "lat")),
    lng: asNumber(first(facility, "lng")),
    phone: asNullableString(first(facility, "phone")),
    websiteUrl: asNullableString(first(facility, "websiteUrl", "website_url")),
    mapUrl: asNullableString(first(facility, "mapUrl", "map_url")),
    openingHours: first(facility, "openingHours", "opening_hours") ?? null,
    callBeforeVisit: asBoolean(first(facility, "callBeforeVisit", "call_before_visit"), true),
    serviceIds,
    rightAcceptance: normalizeAcceptance(first(rightLink ?? {}, "acceptanceStatus", "acceptance_status")),
    rightConditionsTh: asNullableString(first(rightLink ?? {}, "conditionsTh", "conditions_th")),
    sourceId: rightSourceId || facilitySourceId,
    evidenceSourceIds: unique(
      [facilitySourceId, rightSourceId, ...serviceSourceIds].filter(Boolean),
    ),
    verificationStatus: asString(
      first(facility, "verificationStatus", "verification_status"),
      "UNVERIFIED",
    ),
    dataUpdatedAt: asNullableString(
      first(rightLink ?? {}, "verifiedAt", "verified_at") ?? first(facility, "dataUpdatedAt", "data_updated_at"),
    ),
    effectiveFrom: asNullableString(first(facility, "effectiveFrom", "effective_from")),
    effectiveTo: asNullableString(first(facility, "effectiveTo", "effective_to")),
  };
}

function benefitRelevant(row: Row, conditionIds: string[], age: number | null, scheme: MvpScheme): boolean {
  const tags = asStringArray(first(row, "caseRelevanceTags", "case_relevance_tags"));
  if (!tags.length) return false;
  return (
    tags.includes(scheme) ||
    tags.some((tag) => conditionIds.includes(tag)) ||
    (age !== null && age >= 60 && (tags.includes("older_adult") || tags.includes("OLDER_PERSON")))
  );
}

function toBenefitFact(benefit: Row, rule?: Row): BenefitFact {
  return {
    id: asString(first(benefit, "id", "benefit_id")),
    nameTh: asString(first(benefit, "nameTh", "name_th")),
    descriptionTh: asNullableString(first(benefit, "descriptionTh", "description_th")),
    valueTextTh: asNullableString(first(benefit, "valueTextTh", "value_text_th")),
    relevanceTags: asStringArray(first(benefit, "caseRelevanceTags", "case_relevance_tags")),
    agencyId: asNullableString(first(benefit, "agencyId", "agency_id")),
    sourceId: asString(
      first(rule ?? {}, "sourceId", "source_id") ?? first(benefit, "sourceId", "source_id"),
    ),
    rule: rule
      ? {
          id: asString(first(rule, "id", "rule_id")),
          logic: recordOf(first(rule, "logic", "logicJson", "logic_json")),
          requiredAttrs: asStringArray(first(rule, "requiredAttrs", "required_attrs")),
          effectiveFrom: asNullableString(first(rule, "effectiveFrom", "effective_from")),
          effectiveTo: asNullableString(first(rule, "effectiveTo", "effective_to")),
        }
      : null,
  };
}

function toEvidence(row: Row): RouteEvidence {
  return {
    id: asString(first(row, "id", "source_id")),
    title: asString(first(row, "title")),
    publisher: asString(first(row, "publisher")),
    url: asNullableString(first(row, "url")),
    effectiveDate: asNullableString(first(row, "effectiveDate", "effective_date")),
    retrievedAt: asString(first(row, "retrievedAt", "retrieved_at"), new Date(0).toISOString()),
    isOfficial: asBoolean(first(row, "isOfficial", "is_official")),
    verificationStatus: asString(first(row, "verificationStatus", "verification_status"), "UNVERIFIED"),
  };
}

function activeEffective(row: Row, asOfDate = today()): boolean {
  const active = first(row, "active");
  return active !== false &&
    isEffective(
      asNullableString(first(row, "effectiveFrom", "effective_from")),
      asNullableString(first(row, "effectiveTo", "effective_to")),
      asOfDate,
    );
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

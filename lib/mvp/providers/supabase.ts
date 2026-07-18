import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "../../supabase/server";
import type { MvpScheme, RouteEvidence } from "../contracts";
import { ProviderUnavailableError } from "./errors";
import {
  asBoolean,
  asNullableString,
  asNumber,
  asString,
  asStringArray,
  isEffective,
  normalizeAcceptance,
  normalizeCopayType,
  normalizeCoverageStatus,
  recordOf,
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

export class SupabaseKnowledgeProvider implements KnowledgeProvider {
  constructor(private readonly injectedClient?: SupabaseClient) {}

  private client(): SupabaseClient {
    return this.injectedClient ?? adminClient();
  }

  async resolveRight(scheme: MvpScheme, asOfDate = today()): Promise<KnowledgeRight | null> {
    if (scheme === "UNKNOWN" || scheme === "PRIVATE") return null;
    const { data, error } = await this.client()
      .from("health_rights")
      .select("*")
      .eq("code", scheme)
      .eq("active", true)
      .limit(10);
    if (error) throw unavailable("resolveRight", error.message);
    const row = rows(data).find((item) =>
      isEffective(asNullableString(item.effective_from), asNullableString(item.effective_to), asOfDate),
    );
    return row
      ? {
          id: asString(row.id),
          code: scheme,
          nameTh: asString(row.name_th),
          descriptionTh: asNullableString(row.description_th),
          sourceId: asString(row.source_id),
          effectiveFrom: asNullableString(row.effective_from),
          effectiveTo: asNullableString(row.effective_to),
          verificationStatus: asString(row.verification_status, "UNVERIFIED"),
        }
      : null;
  }

  async matchCondition(symptomIds: string[], asOfDate = today()): Promise<ConditionMatch[]> {
    if (!symptomIds.length) return [];
    const { data: linksData, error: linksError } = await this.client()
      .from("symptom_condition_links")
      .select("*")
      .in("symptom_id", symptomIds);
    if (linksError) throw unavailable("matchCondition links", linksError.message);
    const links = rows(linksData);
    const ids = unique(links.map((link) => asString(link.condition_id)).filter(Boolean));
    if (!ids.length) return [];
    const { data, error } = await this.client()
      .from("conditions")
      .select("*")
      .in("id", ids)
      .eq("active", true);
    if (error) throw unavailable("matchCondition conditions", error.message);
    const conditions = new Map(rows(data).map((row) => [asString(row.id), row]));
    return links
      .filter((link) =>
        isEffective(asNullableString(link.effective_from), asNullableString(link.effective_to), asOfDate),
      )
      .map((link) => {
        const conditionId = asString(link.condition_id);
        const condition = conditions.get(conditionId) ?? {};
        return {
          conditionId,
          nameTh: asString(condition.name_th),
          likelihood: Math.max(0, Math.min(1, asNumber(link.likelihood) ?? 0)),
          sourceId: asString(link.source_id ?? condition.source_id),
        };
      })
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
    let serviceIds = [...explicitServiceIds];
    if (conditionIds.length) {
      const { data, error } = await this.client()
        .from("condition_service_links")
        .select("*")
        .in("condition_id", conditionIds)
        .order("priority", { ascending: true });
      if (error) throw unavailable("getCoveredServices links", error.message);
      serviceIds.push(...rows(data).map((row) => asString(row.service_id)));
    }
    serviceIds = unique(serviceIds.filter(Boolean));
    if (!serviceIds.length) return [];
    const [{ data: servicesData, error: servicesError }, { data: coverageData, error: coverageError }] =
      await Promise.all([
        this.client().from("services").select("*").in("id", serviceIds).eq("active", true),
        this.client()
          .from("service_right_coverages")
          .select("*")
          .in("service_id", serviceIds)
          .eq("right_id", right.id),
      ]);
    if (servicesError) throw unavailable("getCoveredServices services", servicesError.message);
    if (coverageError) throw unavailable("getCoveredServices coverages", coverageError.message);
    const services = new Map(rows(servicesData).map((row) => [asString(row.id), row]));
    const coverages = new Map(
      rows(coverageData)
        .filter((row) =>
          isEffective(asNullableString(row.effective_from), asNullableString(row.effective_to), asOfDate),
        )
        .map((row) => [asString(row.service_id), row]),
    );
    return serviceIds.flatMap((serviceId) => {
      const service = services.get(serviceId);
      if (!service) return [];
      const coverage = coverages.get(serviceId) ?? {};
      return [toServiceFact(service, coverage)];
    });
  }

  async matchFacilities(input: FacilityMatchInput): Promise<FacilityCandidateFact[]> {
    if (!input.serviceIds.length || input.scheme === "UNKNOWN" || input.scheme === "PRIVATE") return [];
    const right = await this.resolveRight(input.scheme, input.asOfDate);
    if (!right) return [];
    const { data: serviceLinksData, error: serviceLinksError } = await this.client()
      .from("facility_services")
      .select("*")
      .in("service_id", input.serviceIds);
    if (serviceLinksError) throw unavailable("matchFacilities services", serviceLinksError.message);
    const serviceLinks = rows(serviceLinksData).filter(
      (row) =>
        !["UNAVAILABLE", "REJECTED"].includes(asString(row.availability_status).toUpperCase()) &&
        isEffective(
          asNullableString(row.effective_from),
          asNullableString(row.effective_to),
          input.asOfDate,
        ),
    );
    const facilityIds = unique(serviceLinks.map((row) => asString(row.facility_id)).filter(Boolean));
    if (!facilityIds.length) return [];
    const [{ data: facilitiesData, error: facilitiesError }, { data: rightsData, error: rightsError }] =
      await Promise.all([
        this.client().from("facilities").select("*").in("id", facilityIds).eq("active", true),
        this.client()
          .from("facility_rights")
          .select("*")
          .in("facility_id", facilityIds)
          .eq("right_id", right.id),
      ]);
    if (facilitiesError) throw unavailable("matchFacilities facilities", facilitiesError.message);
    if (rightsError) throw unavailable("matchFacilities rights", rightsError.message);
    const rights = new Map(
      rows(rightsData)
        .filter((row) =>
          isEffective(
            asNullableString(row.effective_from),
            asNullableString(row.effective_to),
            input.asOfDate,
          ),
        )
        .map((row) => [asString(row.facility_id), row]),
    );
    const allFacilities = rows(facilitiesData);
    const areaIds = unique(allFacilities.map((row) => asString(row.area_id)).filter(Boolean));
    let areas = new Map<string, string>();
    if (areaIds.length) {
      const { data: areaData } = await this.client().from("areas").select("id,name_th").in("id", areaIds);
      areas = new Map(rows(areaData).map((row) => [asString(row.id), asString(row.name_th)]));
    }
    return allFacilities
      .filter((facility) =>
        isEffective(
          asNullableString(facility.effective_from),
          asNullableString(facility.effective_to),
          input.asOfDate,
        ),
      )
      .map((facility) => {
        const facilityId = asString(facility.id);
        const rightLink = rights.get(facilityId);
        const facilityServiceLinks = serviceLinks.filter(
          (link) => asString(link.facility_id) === facilityId,
        );
        const serviceIds = unique(facilityServiceLinks.map((link) => asString(link.service_id)));
        const serviceSourceIds = unique(
          facilityServiceLinks.map((link) => asString(link.source_id)).filter(Boolean),
        );
        return toFacilityFact(
          facility,
          rightLink,
          serviceIds,
          areas.get(asString(facility.area_id)) ?? null,
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
    const { data, error } = await this.client().from("benefits").select("*").eq("active", true);
    if (error) throw unavailable("getBenefits", error.message);
    const benefits = rows(data).filter((row) => benefitRelevant(row, conditionIds, age, scheme));
    if (!benefits.length) return [];
    const ids = benefits.map((row) => asString(row.id));
    const { data: ruleData, error: ruleError } = await this.client()
      .from("eligibility_rules")
      .select("*")
      .in("benefit_id", ids)
      .eq("active", true);
    if (ruleError) throw unavailable("getBenefits rules", ruleError.message);
    const rules = new Map(
      rows(ruleData)
        .filter((row) =>
          isEffective(asNullableString(row.effective_from), asNullableString(row.effective_to), asOfDate),
        )
        .map((row) => [asString(row.benefit_id), row]),
    );
    return benefits.map((benefit) => toBenefitFact(benefit, rules.get(asString(benefit.id))));
  }

  async getEvidence(entityIds: string[]): Promise<RouteEvidence[]> {
    if (!entityIds.length) return [];
    const { data: factData, error: factError } = await this.client()
      .from("fact_sources")
      .select("entity_id,source_id")
      .in("entity_id", entityIds);
    if (factError) throw unavailable("getEvidence fact_sources", factError.message);
    const sourceIds = unique([
      ...entityIds.filter((id) => id.startsWith("doc:") || id.startsWith("source:")),
      ...rows(factData).map((row) => asString(row.source_id)),
    ]).filter(Boolean);
    if (!sourceIds.length) return [];
    const { data, error } = await this.client().from("source_documents").select("*").in("id", sourceIds);
    if (error) throw unavailable("getEvidence source_documents", error.message);
    return rows(data).map(toEvidence);
  }

  async getFacilityReliability(facilityId: string): Promise<FacilityReliability | null> {
    const { data, error } = await this.client()
      .from("facility_access_summary")
      .select("*")
      .eq("facility_id", facilityId)
      .maybeSingle();
    if (error) throw unavailable("getFacilityReliability", error.message);
    if (!data) return null;
    const row = recordOf(data);
    const sampleSize = asNumber(row.sample_size) ?? 0;
    const successCount = asNumber(row.success_count) ?? 0;
    return {
      facilityId,
      sampleSize,
      successCount,
      successRate: sampleSize > 0 ? successCount / sampleSize : null,
      lastConfirmationDate: asNullableString(row.last_confirmation_date),
      demoData: asBoolean(row.demo_data),
    };
  }
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(recordOf) : [];
}

function toServiceFact(service: Row, coverage: Row): CoveredServiceFact {
  return {
    serviceId: asString(service.id),
    serviceName: asString(service.name_th),
    serviceType: asString(service.type),
    careLevel: asString(service.care_level, "primary"),
    coverageStatus: normalizeCoverageStatus(coverage.coverage_status),
    copayType: normalizeCopayType(coverage.copay_type),
    copayAmount: asNumber(coverage.copay_amount),
    copayTextTh: asNullableString(coverage.copay_text_th),
    conditionsTh: asNullableString(coverage.conditions_th),
    referralRequired: typeof coverage.referral_required === "boolean" ? coverage.referral_required : null,
    intervalMonths: asNumber(service.interval_months),
    sourceId: asString(coverage.source_id ?? service.source_id),
    verificationStatus: asString(coverage.verification_status, "UNVERIFIED"),
    effectiveFrom: asNullableString(coverage.effective_from),
    effectiveTo: asNullableString(coverage.effective_to),
  };
}

function toFacilityFact(
  facility: Row,
  rightLink: Row | undefined,
  serviceIds: string[],
  areaName: string | null,
  serviceSourceIds: string[],
): FacilityCandidateFact {
  const facilitySourceId = asString(facility.source_id);
  const rightSourceId = asString(rightLink?.source_id);
  return {
    facilityId: asString(facility.id),
    nameTh: asString(facility.name_th),
    facilityType: asString(facility.facility_type),
    careLevel: asString(facility.care_level),
    addressTh: asNullableString(facility.address_th),
    areaId: asNullableString(facility.area_id),
    areaName,
    lat: asNumber(facility.lat),
    lng: asNumber(facility.lng),
    phone: asNullableString(facility.phone),
    websiteUrl: asNullableString(facility.website_url),
    mapUrl: asNullableString(facility.map_url),
    openingHours: facility.opening_hours ?? null,
    callBeforeVisit: asBoolean(facility.call_before_visit, true),
    serviceIds,
    rightAcceptance: normalizeAcceptance(rightLink?.acceptance_status),
    rightConditionsTh: asNullableString(rightLink?.conditions_th),
    sourceId: rightSourceId || facilitySourceId,
    evidenceSourceIds: unique(
      [facilitySourceId, rightSourceId, ...serviceSourceIds].filter(Boolean),
    ),
    verificationStatus: asString(facility.verification_status, "UNVERIFIED"),
    dataUpdatedAt: asNullableString(rightLink?.verified_at ?? facility.data_updated_at),
    effectiveFrom: asNullableString(facility.effective_from),
    effectiveTo: asNullableString(facility.effective_to),
  };
}

function benefitRelevant(row: Row, conditionIds: string[], age: number | null, scheme: MvpScheme): boolean {
  const tags = asStringArray(row.case_relevance_tags);
  if (!tags.length) return false;
  return tags.includes(scheme) || tags.some((tag) => conditionIds.includes(tag)) ||
    (age !== null && age >= 60 && (tags.includes("older_adult") || tags.includes("OLDER_PERSON")));
}

function toBenefitFact(benefit: Row, rule: Row | undefined): BenefitFact {
  return {
    id: asString(benefit.id),
    nameTh: asString(benefit.name_th),
    descriptionTh: asNullableString(benefit.description_th),
    valueTextTh: asNullableString(benefit.value_text_th),
    relevanceTags: asStringArray(benefit.case_relevance_tags),
    agencyId: asNullableString(benefit.agency_id),
    sourceId: asString(rule?.source_id ?? benefit.source_id),
    rule: rule
      ? {
          id: asString(rule.id),
          logic: recordOf(rule.logic_json),
          requiredAttrs: asStringArray(rule.required_attrs),
          effectiveFrom: asNullableString(rule.effective_from),
          effectiveTo: asNullableString(rule.effective_to),
        }
      : null,
  };
}

function toEvidence(row: Row): RouteEvidence {
  return {
    id: asString(row.id),
    title: asString(row.title),
    publisher: asString(row.publisher),
    url: asNullableString(row.url),
    effectiveDate: asNullableString(row.effective_date),
    retrievedAt: asString(row.retrieved_at, new Date(0).toISOString()),
    isOfficial: asBoolean(row.is_official),
    verificationStatus: asString(row.verification_status, "UNVERIFIED"),
  };
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function unavailable(operation: string, detail: string): ProviderUnavailableError {
  return new ProviderUnavailableError(`Supabase ${operation} failed: ${detail}`, "knowledge");
}

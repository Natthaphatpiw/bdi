import { CALL_WARNING, type RouteCoverage, type RouteFacility, type Urgency } from "./contracts";
import { haversineKm } from "./geo";
import { getOpeningStatus } from "./opening-hours";
import type { FacilityCandidateFact, FacilityReliability } from "./providers";

export interface RankFacilitiesInput {
  candidates: FacilityCandidateFact[];
  requiredServiceIds: string[];
  coverages: RouteCoverage[];
  urgency: Urgency;
  area?: { id?: string | null; code?: string | null; name?: string | null };
  location?: { lat: number; lng: number } | null;
  atTime?: Date | string;
  reliabilities?: Map<string, FacilityReliability | null>;
  preferredOrder?: string[];
  /** Source documents resolved by the server-side knowledge provider for this route. */
  resolvedEvidenceIds: ReadonlySet<string>;
}

export interface RankedFacilities {
  primary: RouteFacility | null;
  backup: RouteFacility | null;
  all: RouteFacility[];
}

export function rankFacilities(input: RankFacilitiesInput): RankedFacilities {
  const coverageByService = new Map(input.coverages.map((coverage) => [coverage.serviceId, coverage]));
  const required = new Set(input.requiredServiceIds);
  const ranked = input.candidates
    .filter((candidate) => candidate.rightAcceptance !== "REJECTED")
    .filter((candidate) => candidate.serviceIds.some((id) => required.has(id)))
    .filter((candidate) => careLevelAllowed(candidate.careLevel, input.urgency))
    .filter((candidate) => facilityHasResolvedEvidence(candidate, input.resolvedEvidenceIds))
    .map((candidate) => {
      const matched = candidate.serviceIds.filter((id) => required.has(id));
      const serviceId = matched[0];
      const coverage = coverageByService.get(serviceId);
      const opening = getOpeningStatus(candidate.openingHours, input.atTime);
      const distanceKm = input.location && candidate.lat != null && candidate.lng != null
        ? haversineKm(input.location, { lat: candidate.lat, lng: candidate.lng })
        : null;
      const sameArea = areaMatches(candidate, input.area);
      const reliability = input.reliabilities?.get(candidate.facilityId) ?? null;
      const breakdown = {
        serviceMatch: Math.round((matched.length / Math.max(1, input.requiredServiceIds.length)) * 35),
        rightMatch: candidate.rightAcceptance === "ACCEPTED" ? 25 : candidate.rightAcceptance === "CONDITIONAL" ? 18 : 5,
        openAtRequestedTime: opening.status === "OPEN_NOW" ? 15 : opening.status === "HOURS_UNKNOWN" ? 7 : 0,
        areaOrDistanceMatch: distanceScore(distanceKm, sameArea),
        sourceFreshnessAndVerification: verificationScore(candidate.verificationStatus, candidate.dataUpdatedAt),
        observedAccessReliability: reliabilityScore(reliability),
      };
      const warnings = [CALL_WARNING];
      if (opening.status === "HOURS_UNKNOWN") warnings.unshift("ยังต้องยืนยันเวลาเปิดให้บริการ");
      if (candidate.rightAcceptance !== "ACCEPTED") warnings.unshift(
        candidate.rightAcceptance === "CONDITIONAL"
          ? "การรับสิทธิ์มีเงื่อนไข ต้องโทรยืนยัน"
          : "ยังต้องยืนยันว่ารับสิทธิ์นี้",
      );
      const why = [
        `มีบริการที่เกี่ยวข้องกับเคส ${matched.length} รายการ`,
        candidate.rightAcceptance === "ACCEPTED"
          ? "มีข้อมูลว่ารับสิทธิ์ที่ผู้ใช้ยืนยัน"
          : candidate.rightAcceptance === "CONDITIONAL"
            ? "มีข้อมูลว่ารับสิทธิ์แบบมีเงื่อนไข"
            : "ใช้เป็นทางสำรองระหว่างรอยืนยันสิทธิ์",
        distanceKm != null
          ? `คำนวณระยะทางประมาณ ${distanceKm.toLocaleString("th-TH")} กม.`
          : sameArea
            ? "อยู่ในพื้นที่ที่เลือก"
            : "เป็นบริการที่เกี่ยวข้องตามข้อมูลที่มี",
      ];
      const facility: RouteFacility = {
        facilityId: candidate.facilityId,
        facilityName: candidate.nameTh,
        serviceId,
        serviceName: coverage?.serviceName ?? serviceId,
        department: null,
        address: candidate.addressTh,
        areaName: candidate.areaName,
        phone: candidate.phone,
        mapUrl: candidate.mapUrl,
        distanceKm,
        openingStatus: opening.status,
        openingText: opening.text,
        rightAcceptance: candidate.rightAcceptance as "ACCEPTED" | "CONDITIONAL" | "UNKNOWN",
        rightAcceptanceText: candidate.rightAcceptance === "ACCEPTED"
          ? "มีข้อมูลว่ารับสิทธิ์นี้"
          : candidate.rightAcceptance === "CONDITIONAL"
            ? candidate.rightConditionsTh ?? "รับสิทธิ์แบบมีเงื่อนไข"
            : "ยังต้องยืนยันการรับสิทธิ์",
        callBeforeVisit: candidate.callBeforeVisit || opening.status !== "OPEN_NOW" || candidate.rightAcceptance !== "ACCEPTED",
        costSummary: coverage?.costSummary ?? "ยังไม่มีข้อมูลค่าใช้จ่ายที่ยืนยันได้",
        score: clamp(Object.values(breakdown).reduce((sum, value) => sum + value, 0), 0, 100),
        scoreBreakdown: breakdown,
        whySelected: why,
        warnings: [...new Set(warnings)].slice(0, 8),
        evidenceIds: [
          ...new Set([
            ...(candidate.evidenceSourceIds ?? [candidate.sourceId]),
            ...(coverage?.evidenceIds ?? []),
          ].filter(Boolean)),
        ],
        lastVerifiedAt: candidate.dataUpdatedAt,
      };
      return facility;
    })
    .sort((a, b) => {
      const preference = preferenceIndex(a.facilityId, input.preferredOrder) - preferenceIndex(b.facilityId, input.preferredOrder);
      return preference || b.score - a.score || a.facilityName.localeCompare(b.facilityName, "th");
    });

  const primary = ranked.find((facility) => facility.rightAcceptance !== "UNKNOWN") ?? null;
  const backup = ranked.find((facility) => facility.facilityId !== primary?.facilityId) ?? null;
  return { primary, backup, all: ranked };
}

function facilityHasResolvedEvidence(
  candidate: FacilityCandidateFact,
  resolvedEvidenceIds: ReadonlySet<string>,
): boolean {
  const claimed = candidate.evidenceSourceIds?.length
    ? candidate.evidenceSourceIds
    : [candidate.sourceId];
  return claimed.some((sourceId) => resolvedEvidenceIds.has(sourceId));
}

function careLevelAllowed(level: string, urgency: Urgency): boolean {
  const normalized = level.toLowerCase();
  if (urgency === "EMERGENCY_NOW") return normalized === "emergency";
  return normalized !== "emergency";
}

function areaMatches(candidate: FacilityCandidateFact, area: RankFacilitiesInput["area"]): boolean {
  if (!area) return false;
  const needle = (area.name ?? area.code ?? area.id ?? "").toLowerCase().replace(/[\s-]/g, "");
  const haystacks = [candidate.areaId, candidate.areaName].filter(Boolean).map((value) => String(value).toLowerCase().replace(/[\s-]/g, ""));
  return Boolean(needle) && haystacks.some((value) => value.includes(needle) || needle.includes(value));
}

function distanceScore(distanceKm: number | null, sameArea: boolean): number {
  if (distanceKm != null) return distanceKm <= 3 ? 10 : distanceKm <= 8 ? 8 : distanceKm <= 15 ? 5 : 2;
  return sameArea ? 10 : 3;
}

function verificationScore(status: string, updatedAt: string | null): number {
  const verified = ["VERIFIED", "OFFICIAL", "CONFIRMED"].includes(status.toUpperCase());
  if (!updatedAt) return verified ? 7 : 3;
  const ageDays = Math.max(0, (Date.now() - new Date(updatedAt).getTime()) / 86_400_000);
  return verified ? (ageDays <= 365 ? 10 : 8) : ageDays <= 180 ? 7 : 4;
}

function reliabilityScore(value: FacilityReliability | null): number {
  if (!value || value.sampleSize < 3 || value.successRate == null) return 0;
  return Math.round(value.successRate * 5);
}

function preferenceIndex(id: string | null, preferred: string[] | undefined): number {
  if (!id || !preferred?.length) return Number.MAX_SAFE_INTEGER;
  const index = preferred.indexOf(id);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

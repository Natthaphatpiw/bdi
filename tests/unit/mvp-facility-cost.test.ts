import { describe, expect, it } from "vitest";
import { buildRouteCoverage, costWording } from "@/lib/mvp/cost";
import { rankFacilities } from "@/lib/mvp/facility-ranking";
import type { CoveredServiceFact, FacilityCandidateFact } from "@/lib/mvp/providers";

const fact: CoveredServiceFact = {
  serviceId: "svc:test",
  serviceName: "บริการทดสอบ",
  serviceType: "MEDICAL",
  careLevel: "primary",
  coverageStatus: "COVERED",
  copayType: "UNKNOWN",
  copayAmount: null,
  copayTextTh: null,
  conditionsTh: null,
  referralRequired: null,
  intervalMonths: null,
  sourceId: "doc:test",
  verificationStatus: "VERIFIED",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
};

function facility(overrides: Partial<FacilityCandidateFact>): FacilityCandidateFact {
  return {
    facilityId: "fac:test",
    nameTh: "สถานพยาบาลทดสอบ",
    facilityType: "PUBLIC",
    careLevel: "primary",
    addressTh: "ลาดพร้าว",
    areaId: "area:lat-phrao",
    areaName: "ลาดพร้าว",
    lat: null,
    lng: null,
    phone: "020000000",
    websiteUrl: null,
    mapUrl: null,
    openingHours: { weekly: { mon: [["08:00", "16:00"]] } },
    callBeforeVisit: true,
    serviceIds: ["svc:test"],
    rightAcceptance: "ACCEPTED",
    rightConditionsTh: null,
    sourceId: "doc:test",
    verificationStatus: "VERIFIED",
    dataUpdatedAt: "2026-07-01T00:00:00+07:00",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    ...overrides,
  };
}

describe("cost safety", () => {
  it("never calls an unknown copay free", () => {
    expect(costWording(fact)).toBe("ยังไม่มีข้อมูลค่าใช้จ่ายที่ยืนยันได้");
    expect(costWording(fact)).not.toContain("ฟรี");
  });

  it("uses the verified covered wording for FREE and rejects expired facts", () => {
    expect(costWording({ ...fact, copayType: "FREE", copayAmount: 0 })).toContain("อยู่ภายใต้สิทธิ์");
    const expired = buildRouteCoverage(
      { ...fact, copayType: "FREE", effectiveTo: "2025-01-01" },
      ["doc:test"],
      "2026-07-18",
    );
    expect(expired.coverageStatus).toBe("UNKNOWN");
    expect(expired.costSummary).not.toContain("ฟรี");
    expect(expired.evidenceIds).toEqual([]);
  });
});

describe("facility hard filters and ranking", () => {
  const coverage = buildRouteCoverage(fact, ["doc:test"], "2026-07-18");

  it("cannot choose a rejected right or a facility without the service", () => {
    const ranked = rankFacilities({
      candidates: [
        facility({ facilityId: "fac:rejected", rightAcceptance: "REJECTED" }),
        facility({ facilityId: "fac:no-service", serviceIds: ["svc:other"] }),
      ],
      requiredServiceIds: ["svc:test"],
      coverages: [coverage],
      urgency: "ROUTINE_APPOINTMENT",
      resolvedEvidenceIds: new Set(["doc:test"]),
    });
    expect(ranked.primary).toBeNull();
    expect(ranked.all).toEqual([]);
  });

  it("demotes closed hours and warns when hours are unknown", () => {
    const closed = rankFacilities({
      candidates: [facility({ facilityId: "fac:closed" })],
      requiredServiceIds: ["svc:test"],
      coverages: [coverage],
      urgency: "ROUTINE_APPOINTMENT",
      atTime: "2026-07-20T20:00:00+07:00",
      resolvedEvidenceIds: new Set(["doc:test"]),
    }).primary!;
    const unknown = rankFacilities({
      candidates: [facility({ facilityId: "fac:unknown", openingHours: { weekly: null } })],
      requiredServiceIds: ["svc:test"],
      coverages: [coverage],
      urgency: "ROUTINE_APPOINTMENT",
      resolvedEvidenceIds: new Set(["doc:test"]),
    }).primary!;
    expect(closed.openingStatus).toBe("CLOSED");
    expect(closed.scoreBreakdown.openAtRequestedTime).toBe(0);
    expect(unknown.openingStatus).toBe("HOURS_UNKNOWN");
    expect(unknown.warnings.join(" ")).toContain("ยืนยันเวลา");
  });

  it("does not claim nearest without coordinates", () => {
    const ranked = rankFacilities({
      candidates: [facility({})],
      requiredServiceIds: ["svc:test"],
      coverages: [coverage],
      urgency: "ROUTINE_APPOINTMENT",
      area: { name: "ลาดพร้าว" },
      resolvedEvidenceIds: new Set(["doc:test"]),
    }).primary!;
    expect(ranked.distanceKm).toBeNull();
    expect(ranked.whySelected.join(" ")).toContain("อยู่ในพื้นที่ที่เลือก");
    expect(ranked.whySelected.join(" ")).not.toContain("ใกล้ที่สุด");
  });

  it("rejects a facility whose claimed provenance cannot resolve to a source document", () => {
    const ranked = rankFacilities({
      candidates: [facility({ evidenceSourceIds: ["doc:missing"] })],
      requiredServiceIds: ["svc:test"],
      coverages: [coverage],
      urgency: "ROUTINE_APPOINTMENT",
      resolvedEvidenceIds: new Set(["doc:test"]),
    });
    expect(ranked.primary).toBeNull();
    expect(ranked.all).toEqual([]);
  });
});

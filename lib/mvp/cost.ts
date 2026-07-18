import type { RouteCoverage } from "./contracts";
import type { CoveredServiceFact } from "./providers";
import { isEffective } from "./providers/provider-utils";

export function buildRouteCoverage(
  fact: CoveredServiceFact,
  evidenceIds: string[],
  asOfDate = new Date().toISOString().slice(0, 10),
): RouteCoverage {
  const current = isEffective(fact.effectiveFrom, fact.effectiveTo, asOfDate);
  const verified = isVerified(fact.verificationStatus) && current;
  const normalized = current ? fact : { ...fact, coverageStatus: "UNKNOWN" as const, copayType: "UNKNOWN" as const };
  return {
    serviceId: fact.serviceId,
    serviceName: fact.serviceName,
    coverageStatus: normalized.coverageStatus,
    copayType: normalized.copayType,
    copayAmount: normalized.copayAmount,
    costSummary: costWording(normalized, verified),
    conditions: current ? normalized.conditionsTh : "ข้อมูลเดิมหมดช่วงวันที่มีผล ต้องยืนยันข้อมูลล่าสุด",
    referralRequired: current ? normalized.referralRequired : null,
    evidenceIds: current ? evidenceIds : [],
    verificationStatus: current ? normalized.verificationStatus : "EXPIRED",
    effectiveFrom: normalized.effectiveFrom,
    effectiveTo: normalized.effectiveTo,
  };
}

export function costWording(fact: CoveredServiceFact, verified = isVerified(fact.verificationStatus)): string {
  if (!verified || fact.coverageStatus === "UNKNOWN" || fact.copayType === "UNKNOWN") {
    return "ยังไม่มีข้อมูลค่าใช้จ่ายที่ยืนยันได้";
  }
  if (fact.coverageStatus === "NOT_COVERED") {
    return "ไม่อยู่ภายใต้สิทธิ์สำหรับบริการนี้ตามข้อมูลที่มี โปรดยืนยันค่าใช้จ่ายกับสถานพยาบาล";
  }
  if (fact.copayType === "FREE") {
    return "อยู่ภายใต้สิทธิ์สำหรับบริการนี้ ตามเงื่อนไขที่ระบุ";
  }
  if (fact.copayType === "FIXED") {
    const amount = fact.copayAmount != null ? `${fact.copayAmount.toLocaleString("th-TH")} บาท` : fact.copayTextTh;
    return amount
      ? `มีค่าใช้จ่ายตามข้อมูลสิทธิ์ประมาณ/สูงสุด ${amount}`
      : "มีค่าใช้จ่ายตามเงื่อนไขสิทธิ์ โปรดยืนยันจำนวนกับสถานพยาบาล";
  }
  return "ค่าใช้จ่ายขึ้นกับรายการบริการ โปรดยืนยันกับสถานพยาบาล";
}

function isVerified(status: string): boolean {
  return ["VERIFIED", "OFFICIAL", "CONFIRMED"].includes(status.toUpperCase());
}

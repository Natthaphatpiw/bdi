import { describe, expect, it } from "vitest";
import { applyUrgencyFloor, runSafetyPrecheck } from "@/lib/mvp/safety";

describe("deterministic safety gate", () => {
  it("escalates chest pain and severe breathing trouble", () => {
    const result = runSafetyPrecheck("เจ็บหน้าอกรุนแรงและหายใจไม่ออก");
    expect(result.emergency).toBe(true);
    expect(result.finalUrgency).toBe("EMERGENCY_NOW");
    expect(result.hotline).toBe("1669");
  });

  it("does not naively match negated symptoms", () => {
    const result = runSafetyPrecheck("ไม่เจ็บหน้าอกรุนแรง และไม่มีอาการหายใจไม่ออก");
    expect(result.emergency).toBe(false);
    expect(result.matchedRuleIds).toEqual([]);
  });

  it("never lets a model lower a deterministic floor", () => {
    expect(applyUrgencyFloor("ROUTINE_APPOINTMENT", "EMERGENCY_NOW")).toBe("EMERGENCY_NOW");
    expect(applyUrgencyFloor("URGENT_TODAY", "SOON_1_3_DAYS")).toBe("URGENT_TODAY");
  });
});

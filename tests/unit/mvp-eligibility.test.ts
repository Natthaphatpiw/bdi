import { describe, expect, it } from "vitest";
import { evaluateEligibilityRule } from "@/lib/mvp/eligibility";

const pensionRule = {
  all: [
    { attr: "age", op: ">=", value: 60 },
    { attr: "receives_state_pension", op: "==", value: false },
  ],
};

describe("three-valued eligibility", () => {
  it("returns INDETERMINATE when a required pension fact is unknown", () => {
    const result = evaluateEligibilityRule(pensionRule, ["age", "receives_state_pension"], { age: 68 });
    expect(result.result).toBe("INDETERMINATE");
    expect(result.missingAttrs).toContain("receives_state_pension");
  });

  it("returns NOT_ELIGIBLE for a known disqualifying pension fact", () => {
    const result = evaluateEligibilityRule(pensionRule, ["age", "receives_state_pension"], {
      age: 68,
      receives_state_pension: true,
    });
    expect(result.result).toBe("NOT_ELIGIBLE");
    expect(result.trace.find((item) => item.attr === "receives_state_pension")?.result).toBe(false);
  });

  it("does not default a missing boolean to false", () => {
    const result = evaluateEligibilityRule(
      { attr: "insured", op: "==", value: false },
      ["insured"],
      {},
    );
    expect(result.result).toBe("INDETERMINATE");
    expect(result.trace[0].actual).toBeNull();
    expect(result.trace[0].result).toBeNull();
  });
});

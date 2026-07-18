// Guardrail regression tests (spec §9) — เจตนาของ product ที่ห้ามละเมิด
import { describe, expect, it } from "vitest";
import { PATTERN_CONFIGS, ONSET_OPTIONS } from "@/lib/guardian/choices";
import { sanitizeSamples } from "@/lib/guardian/sanitize";
import { DISMISS_COOLDOWN_HOURS } from "@/lib/guardian/config";

describe("guardian guardrails", () => {
  it("every pattern ends with a gray-path dismiss choice", () => {
    for (const config of Object.values(PATTERN_CONFIGS)) {
      const last = config.choices[config.choices.length - 1];
      expect(last.route).toBe("dismiss");
    }
  });

  it("no diagnosis language in popup copy — อาการเท่านั้น ไม่มีชื่อโรคเป็นข้อสรุป", () => {
    const forbidden = /stroke|หลอดเลือดสมอง|พาร์กินสัน|หัวใจวาย|อัมพาต/i;
    for (const config of Object.values(PATTERN_CONFIGS)) {
      expect(config.title).not.toMatch(forbidden);
      for (const choice of config.choices) {
        expect(choice.label).not.toMatch(forbidden);
        if (choice.triageText) expect(choice.triageText).not.toMatch(forbidden);
      }
    }
  });

  it("onset options match the spec word-for-word", () => {
    expect(ONSET_OPTIONS).toEqual([
      "เพิ่งเริ่มตอนนี้",
      "ภายใน 1 ชั่วโมง",
      "1–4 ชั่วโมง",
      "เกิน 4 ชั่วโมง หรือตื่นนอนมาก็เป็นแล้ว",
      "ไม่แน่ใจ",
    ]);
  });

  it("typing samples: free text can never reach the DB payload", () => {
    const malicious = [
      { t: 10, len: 5, del: false, text: "ความลับของผู้ใช้", value: "secret" },
      { t: 20, len: 6, del: false, key: "ก" },
      "raw string",
      { note: "only strings" },
    ];
    const out = sanitizeSamples("typing", malicious);
    expect(out).toEqual([
      { t: 10, len: 5, del: false },
      { t: 20, len: 6, del: false },
    ]);
    expect(JSON.stringify(out)).not.toContain("ความลับ");
    expect(JSON.stringify(out)).not.toContain("secret");
    expect(JSON.stringify(out)).not.toContain("ก");
  });

  it("motion samples: string fields are stripped for every motion station", () => {
    const out = sanitizeSamples("hold_still", [{ t: 1, ax: 0.1, ua: "Mozilla", ay: "x" }]);
    expect(out).toEqual([{ t: 1, ax: 0.1 }]);
  });

  it("dismiss cooldown is 24 hours (server-enforced constant)", () => {
    expect(DISMISS_COOLDOWN_HOURS).toBe(24);
  });
});

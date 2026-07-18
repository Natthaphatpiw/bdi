import { describe, expect, it } from "vitest";
import { deterministicExtract } from "@/lib/mvp/fallbacks";
import { ClaudeModelProvider } from "@/lib/mvp/providers/claude";

describe("Claude structured provider", () => {
  it("repairs invalid JSON once and returns schema-validated data", async () => {
    const prompts: string[] = [];
    const valid = deterministicExtract({
      narrative: "ฉันปวดฟันมา 2 วัน อยู่ลาดพร้าว ใช้ประกันสังคม",
      patientRelation: "self",
      scheme: "SSS",
      area: "ลาดพร้าว",
      demoScenarioId: "sss-dental",
    });
    const fakeClient = {
      messages: {
        create: async (request: { messages: Array<{ content: string }> }) => {
          prompts.push(request.messages[0].content);
          return {
            stop_reason: "end_turn",
            content: [{ type: "text", text: prompts.length === 1 ? "คำตอบนี้ไม่ใช่ JSON" : JSON.stringify(valid) }],
          };
        },
      },
    };
    const provider = new ClaudeModelProvider({ client: fakeClient as never, timeoutMs: 1_000 });
    const result = await provider.extractCase({ narrative: "ฉันปวดฟันมา 2 วัน", confirmed: { patientRelation: "self", scheme: "SSS", area: "ลาดพร้าว" } });
    expect(result.scheme).toBe("SSS");
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("ซ่อม JSON เพียงครั้งเดียว");
  });
});

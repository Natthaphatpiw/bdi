import { describe, expect, it } from "vitest";
import { MvpService } from "@/lib/mvp/service";
import {
  FallbackKnowledgeProvider,
  JsonKnowledgeProvider,
  type KnowledgeProvider,
  type ModelProvider,
} from "@/lib/mvp/providers";
import { DEMO_CASES } from "@/lib/mvp/demo-cases";
import {
  deterministicExtract,
  deterministicPrescreen,
  resolveDemoProfile,
} from "@/lib/mvp/fallbacks";

const scenarios = DEMO_CASES.map((item) => ({
  id: item.scenarioId,
  narrative: item.narrativeTh,
  relation: item.patientRelation,
  scheme: item.scheme,
  area: item.areaName,
  primary: item.primaryFacilityId,
  backup: item.backupFacilityId,
  expectedQuestions: item.expectedClarificationKeys,
}));

describe("booth demo service", () => {
  it("traverses condition to recommended services in the JSON knowledge fallback", async () => {
    const knowledge = new JsonKnowledgeProvider();
    const services = await knowledge.getCoveredServices(["cond:E11"], "CSMBS", "2026-07-18");
    expect(services.map((service) => service.serviceId)).toEqual(
      expect.arrayContaining(["svc:dm-assessment", "svc:dm-screening"]),
    );
  });

  it.each(scenarios)("completes deterministic route $id", async (scenario) => {
    const service = new MvpService();
    const session = `test-${scenario.id}-${crypto.randomUUID()}`;
    const created = await service.createCase({
      narrative: scenario.narrative,
      patientRelation: scenario.relation,
      scheme: scenario.scheme,
      area: scenario.area,
      demo: true,
      demoSessionId: session,
      demoScenarioId: scenario.id,
    }, { demoSessionId: session });
    expect(created.case.questions.map((question) => question.slotKey)).toEqual(scenario.expectedQuestions);
    await service.confirmCase(created.case.id, { confirmed: true, updates: {} }, { demoSessionId: session });
    const result = await service.generateRoute(created.case.id, { demoSessionId: session });
    expect(result.case.status).toBe("route_ready");
    expect(result.route.primary?.facilityId).toBe(scenario.primary);
    expect(result.route.backup?.facilityId).toBe(scenario.backup);
    expect(result.route.evidence.length).toBeGreaterThan(0);
    expect(JSON.stringify(result.route)).not.toMatch(/Claude|Anthropic|fallback|ThaiLLM/i);
  });

  it("carries HC66 service provenance into the hero route evidence", async () => {
    // 20:30 UTC is already the next calendar day in Bangkok. Effective-date
    // filtering must follow the product timezone, not the UTC date.
    const service = new MvpService({ now: () => new Date("2026-07-17T20:30:00.000Z") });
    const session = `test-hero-evidence-${crypto.randomUUID()}`;
    const created = await service.createCase({
      narrative: scenarios[0].narrative,
      patientRelation: scenarios[0].relation,
      scheme: scenarios[0].scheme,
      area: scenarios[0].area,
      demo: true,
      demoSessionId: session,
      demoScenarioId: scenarios[0].id,
    }, { demoSessionId: session });
    await service.confirmCase(created.case.id, { confirmed: true, updates: {} }, { demoSessionId: session });

    const { route } = await service.generateRoute(created.case.id, { demoSessionId: session });
    const serviceSourceId = "doc:bma:diabetes-clinics";

    expect(route.primary?.facilityId).toBe("fac:bma-hc66");
    expect(route.primary?.evidenceIds).toContain(serviceSourceId);
    expect(route.evidence.map((item) => item.id)).toContain(serviceSourceId);
  });

  it("keeps 1669 primary and suppresses a normal facility on emergency", async () => {
    const service = new MvpService();
    const session = `emergency-${crypto.randomUUID()}`;
    const created = await service.createCase({
      narrative: "พ่อเจ็บหน้าอกรุนแรงและหายใจไม่ออก",
      patientRelation: "father",
      scheme: "UCS",
      area: "ลาดพร้าว",
      demo: true,
      demoSessionId: session,
    }, { demoSessionId: session });
    expect(created.case.status).toBe("emergency_escalated");
    const { route } = await service.generateRoute(created.case.id, { demoSessionId: session });
    expect(route.emergency).toBe(true);
    expect(route.emergencyInstruction).toContain("1669");
    expect(route.primary).toBeNull();
  });

  it("enforces demo-session ownership", async () => {
    const service = new MvpService();
    const created = await service.createCase({
      narrative: "ต้องการตรวจฟัน ใช้ประกันสังคม",
      patientRelation: "self",
      scheme: "SSS",
      area: "ลาดพร้าว",
      demo: true,
      demoSessionId: "owner-session",
      demoScenarioId: "sss-dental",
    }, { demoSessionId: "owner-session" });
    await expect(service.getCase(created.case.id, { demoSessionId: "other-session" })).rejects.toMatchObject({ code: "CASE_ACCESS_DENIED" });
  });

  it("rejects a 13-digit national identifier before creating or storing a case", async () => {
    const service = new MvpService();
    await expect(service.createCase({
      narrative: "ปวดฟัน เลขบัตรประชาชน 1234567890123",
      patientRelation: "self",
      scheme: "SSS",
      area: "ลาดพร้าว",
      demo: true,
      demoSessionId: `sensitive-${crypto.randomUUID()}`,
    })).rejects.toMatchObject({ code: "SENSITIVE_IDENTIFIER_NOT_ALLOWED" });
  });

  it("tries the configured providers for a user-written demo and labels JSON failover degraded", async () => {
    const calls = { extract: 0, prescreen: 0 };
    const model: ModelProvider = {
      async extractCase(input) {
        calls.extract += 1;
        return deterministicExtract({
          narrative: input.narrative,
          patientRelation: input.confirmed?.patientRelation,
          scheme: input.confirmed?.scheme,
          area: input.confirmed?.area,
        });
      },
      async prescreenCase(input) {
        calls.prescreen += 1;
        return deterministicPrescreen(
          input.extractedCase,
          resolveDemoProfile(null, input.extractedCase.userGoal),
          input.urgencyFloor,
        );
      },
      async synthesizeExplanation() { return ""; },
      async answerFollowUp() {
        return { answerTh: "ยังต้องยืนยันข้อมูล", evidenceIds: [], needsVerification: true };
      },
    };
    const unavailable = async (): Promise<never> => { throw new Error("database unavailable"); };
    const primary: KnowledgeProvider = {
      resolveRight: unavailable,
      matchCondition: unavailable,
      getCoveredServices: unavailable,
      matchFacilities: unavailable,
      getBenefits: unavailable,
      getEvidence: unavailable,
      getFacilityReliability: unavailable,
    };
    const knowledge = new FallbackKnowledgeProvider(primary, new JsonKnowledgeProvider());
    const service = new MvpService({ modelProvider: model, knowledgeProvider: knowledge });
    const session = `custom-demo-${crypto.randomUUID()}`;
    const created = await service.createCase({
      narrative: scenarios[0].narrative,
      patientRelation: scenarios[0].relation,
      scheme: scenarios[0].scheme,
      area: scenarios[0].area,
      demo: true,
      demoSessionId: session,
    }, { demoSessionId: session });
    if (created.case.questions.length) {
      await service.turnCase(created.case.id, {
        answers: { critical_red_flags: "absent" },
      }, { demoSessionId: session });
    }
    await service.confirmCase(created.case.id, { confirmed: true, updates: {} }, { demoSessionId: session });
    const { route } = await service.generateRoute(created.case.id, { demoSessionId: session });

    expect(calls).toEqual({ extract: 1, prescreen: 1 });
    expect(route.primary?.facilityId).toBe("fac:bma-hc66");
    expect(route.degraded).toBe(true);
    expect(route.limitationTh).toContain("ไม่สามารถตรวจสอบข้อมูลบางส่วน");
  });
});

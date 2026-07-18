import { describe, expect, it } from "vitest";
import { CreatePassportInputSchema } from "@/lib/mvp/api-schemas";
import {
  PassportSnapshotSchema,
  REQUIRED_PASSPORT_EXCLUSIONS,
} from "@/lib/mvp/contracts";
import {
  buildPassportSnapshot,
  sanitizeSharedPassportSnapshot,
} from "@/lib/mvp/passport-builder";
import { MvpService } from "@/lib/mvp/service";

async function routedHero() {
  const service = new MvpService();
  const session = `passport-${crypto.randomUUID()}`;
  const created = await service.createCase({
    narrative: "ผมถามแทนพ่อ อายุ 68 ปี เพลียมาก ปัสสาวะบ่อย กระหายน้ำบ่อยมา 5 วัน อยู่ลาดพร้าว ใช้สิทธิ์ข้าราชการ ได้รับบำนาญจากรัฐ",
    patientRelation: "father",
    scheme: "CSMBS",
    area: "ลาดพร้าว",
    demo: true,
    demoSessionId: session,
    demoScenarioId: "hero-father-diabetes",
  }, { demoSessionId: session });
  await service.turnCase(created.case.id, { answer: { slotKey: "critical_red_flags", value: "absent" } }, { demoSessionId: session });
  await service.confirmCase(created.case.id, { confirmed: true, updates: {} }, { demoSessionId: session });
  await service.generateRoute(created.case.id, { demoSessionId: session });
  return { service, caseId: created.case.id, session };
}

describe("structured passport", () => {
  it("versions immutable snapshots and excludes provider/debug/private content", async () => {
    const { service, caseId, session } = await routedHero();
    const first = await service.createPassport(caseId, { consent: { shareAllowed: true } }, { demoSessionId: session });
    const second = await service.createPassport(caseId, { consent: { shareAllowed: true } }, { demoSessionId: session });
    expect(first.passport.snapshot.passport.version).toBe(1);
    expect(second.passport.snapshot.passport.version).toBe(2);
    expect(first.passport.snapshot.disclaimer.full).toContain("ไม่ใช่ใบส่งตัว");
    expect(first.passport.snapshot.evidence.length).toBeGreaterThan(0);
    expect(first.passport.snapshot.safety.redFlagAnswers).toContainEqual(expect.objectContaining({ status: "ABSENT" }));
    expect(JSON.stringify(first.passport.snapshot)).not.toMatch(/Claude|Anthropic|fallback|provider_internal|ประกันเอกชน/i);
  });

  it("uses an opaque token, enforces expiry cap, and revokes sharing", async () => {
    const { service, caseId, session } = await routedHero();
    const passport = await service.createPassport(caseId, { consent: { shareAllowed: true } }, { demoSessionId: session });
    const share = await service.sharePassport(passport.passport.id, { consentGranted: true, expiresInHours: 999 }, { demoSessionId: session });
    expect(share.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(Date.parse(share.expiresAt) - Date.now()).toBeLessThanOrEqual(72 * 3_600_000 + 2_000);
    expect((await service.getSharedPassport(share.token)).passport.id).toBe(passport.passport.id);
    expect((await service.revokePassportShare(passport.passport.id, { demoSessionId: session })).revoked).toBe(true);
    await expect(service.getSharedPassport(share.token)).rejects.toMatchObject({ code: "SHARE_NOT_FOUND" });
  });

  it("enforces the handoff scope and fixed privacy exclusions", async () => {
    const { service, caseId, session } = await routedHero();
    const passport = await service.createPassport(caseId, {
      consent: {
        scope: ["PRE_VISIT_HANDOFF"],
        shareAllowed: true,
        sensitiveFieldsExcluded: ["system_internal_data"],
      },
    }, { demoSessionId: session });

    expect(passport.passport.snapshot.consent.sensitiveFieldsExcluded).toEqual(
      expect.arrayContaining([...REQUIRED_PASSPORT_EXCLUSIONS]),
    );
    expect(JSON.stringify(passport.passport.snapshot)).not.toContain("provider_internal");
    expect(PassportSnapshotSchema.safeParse({
      ...passport.passport.snapshot,
      consent: {
        ...passport.passport.snapshot.consent,
        sensitiveFieldsExcluded: [],
      },
    }).success).toBe(false);
    expect(CreatePassportInputSchema.safeParse({
      consent: {
        scope: ["MARKETING"],
        shareAllowed: true,
        sensitiveFieldsExcluded: [],
      },
    }).success).toBe(false);
  });

  it("creates a minimal shared view and applies explicit narrative/medication/allergy exclusions", async () => {
    const { service, caseId, session } = await routedHero();
    const { case: routedCase } = await service.getCase(caseId, { demoSessionId: session });
    const record = {
      ...routedCase,
      originalNarrative: "พ่อกินยาเม็ดสีขาวและเคยแพ้ยาชนิดหนึ่ง เลข 1234567890123",
      extracted: {
        ...routedCase.extracted,
        medications: ["ยาเม็ดสีขาว"],
        allergies: ["ยาชนิดหนึ่ง"],
      },
    };
    const owner = buildPassportSnapshot({
      record,
      version: 1,
      consent: {
        scope: ["PRE_VISIT_HANDOFF"],
        shareAllowed: true,
        sensitiveFieldsExcluded: ["system_internal_data"],
      },
    });
    const shared = sanitizeSharedPassportSnapshot(owner);

    expect(owner.narrative?.originalStory).toContain("ยาเม็ดสีขาว");
    expect(shared.narrative?.originalStory).toBeUndefined();
    expect(shared.narrative?.normalizedSummary).toBeTruthy();
    expect(JSON.stringify(shared)).not.toMatch(/ยาเม็ดสีขาว|ยาชนิดหนึ่ง|1234567890123/);
    expect(shared.preparation.healthInformation.map((item) => item.label)).not.toEqual(
      expect.arrayContaining(["รายการยาที่แจ้ง", "การแพ้ยาที่แจ้ง"]),
    );
    expect(shared.consent.sensitiveFieldsExcluded).toEqual(
      expect.arrayContaining(["original_narrative", "medications", "allergies"]),
    );

    const withoutNarrative = buildPassportSnapshot({
      record,
      version: 2,
      consent: {
        scope: ["PRE_VISIT_HANDOFF"],
        shareAllowed: false,
        sensitiveFieldsExcluded: ["narrative", "medications", "allergies"],
      },
    });
    expect(withoutNarrative.narrative).toBeUndefined();
    expect(() => sanitizeSharedPassportSnapshot(withoutNarrative)).toThrow("PASSPORT_SHARE_NOT_ALLOWED");
  });
});

describe("grounded follow-up", () => {
  it("does not invent cost numbers and escalates a new red flag", async () => {
    const { service, caseId, session } = await routedHero();
    const cost = await service.answerFollowUp(caseId, { question: "มีค่าใช้จ่ายกี่บาท" }, { demoSessionId: session });
    expect(cost.answer).toContain("ยังไม่มีข้อมูลค่าใช้จ่ายที่ยืนยันได้");
    expect(cost.answer).not.toMatch(/\b\d{2,}\s*บาท/);
    const emergency = await service.answerFollowUp(caseId, { question: "ตอนนี้พ่อเจ็บหน้าอกรุนแรงและหายใจไม่ออก" }, { demoSessionId: session });
    expect(emergency.safety.emergency).toBe(true);
    expect(emergency.answer).toContain("1669");
    const escalatedCase = await service.getCase(caseId, { demoSessionId: session });
    expect(escalatedCase.case.status).toBe("emergency_escalated");
    expect(escalatedCase.case.route).toBeNull();
  });

  it("returns plain rendered text rather than raw markdown markers", async () => {
    const { service, caseId, session } = await routedHero();
    const result = await service.answerFollowUp(caseId, { question: "ทำไมแนะนำที่นี่" }, { demoSessionId: session });
    expect(result.answer).not.toMatch(/\*\*|^#|```/m);
  });
});

import { randomUUID } from "crypto";
import {
  CaseRecordSchema,
  type ExtractedCase,
  type FeedbackOutcome,
  type MvpCaseRecord,
  type MvpScheme,
  type SafetyState,
  type StoredPassport,
  type VerifiedCareRoute,
} from "./contracts";
import { buildRouteCoverage } from "./cost";
import { evaluateEligibilityRule, type EligibilityDecision } from "./eligibility";
import { deterministicExtract, deterministicPrescreen, resolveDemoProfile } from "./fallbacks";
import {
  buildPassportSnapshot,
  sanitizeSharedPassportSnapshot,
  type PassportConsent,
} from "./passport-builder";
import {
  createKnowledgeProvider,
  createModelProvider,
  JsonKnowledgeProvider,
  type KnowledgeProvider,
  type ModelProvider,
} from "./providers";
import { composeVerifiedCareRoute } from "./route-composer";
import { applyUrgencyFloor, runSafetyPrecheck } from "./safety";
import { computeRequiredSlotQuestions, deriveCaseStatus, isConfirmedScheme } from "./state-policy";
import { MvpStore, StoreAccessDeniedError, type CaseAccessContext } from "./store";
import { CLIENT_ANALYTICS_EVENTS, computeCaseMetrics, type ClientAnalyticsEvent } from "./analytics";
import { containsThaiNationalId } from "@/lib/sanitize";

export type ServiceAccessContext = CaseAccessContext;

export interface CreateCaseInput {
  narrative: string;
  patientRelation?: string;
  scheme?: MvpScheme;
  area?: string;
  demoSessionId?: string;
  demoScenarioId?: string;
  demo?: boolean;
}

export interface TurnCaseInput {
  message?: string;
  answers?: Record<string, string>;
  answer?: { questionId?: string; slotKey: string; value: string };
}

export interface ConfirmCaseInput {
  confirmed?: boolean;
  updates?: {
    patientRelation?: string;
    age?: number | null;
    scheme?: MvpScheme;
    area?: string;
    symptoms?: string[];
    duration?: string;
    userGoal?: string;
  };
}

export interface FollowUpInput {
  question: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface FeedbackInput {
  outcome: FeedbackOutcome;
  rightAccepted: boolean | null;
  discrepancy: string | null;
}

export interface MvpServiceDependencies {
  store?: MvpStore;
  modelProvider?: ModelProvider;
  knowledgeProvider?: KnowledgeProvider;
  demoKnowledgeProvider?: KnowledgeProvider;
  now?: () => Date;
}

export class MvpServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly userMessage: string,
    public readonly status = 400,
    public readonly retryable = false,
  ) {
    super(code);
    this.name = "MvpServiceError";
  }
}

export class MvpService {
  readonly store: MvpStore;
  private readonly model: ModelProvider;
  private readonly knowledge: KnowledgeProvider;
  private readonly demoKnowledge: KnowledgeProvider;
  private readonly now: () => Date;

  constructor(dependencies: MvpServiceDependencies = {}) {
    // store ที่สร้างเองต้องใช้นาฬิกาเดียวกับ service — มิฉะนั้น test ที่ปัก `now`
    // ในอดีตจะเห็นเคสที่เพิ่งสร้าง "หมดอายุ" ทันทีเมื่อเวลาจริงเดินเลย TTL
    this.store = dependencies.store ?? new MvpStore({ now: dependencies.now });
    this.model = dependencies.modelProvider ?? createModelProvider();
    this.knowledge = dependencies.knowledgeProvider ?? createKnowledgeProvider();
    // Known booth scenarios are precomputed against the validated repository
    // snapshot. They must not wait for a slow/misconfigured remote database.
    this.demoKnowledge = dependencies.demoKnowledgeProvider ?? dependencies.knowledgeProvider ?? new JsonKnowledgeProvider();
    this.now = dependencies.now ?? (() => new Date());
  }

  async createCase(input: CreateCaseInput, access?: ServiceAccessContext): Promise<{ case: MvpCaseRecord }> {
    const narrative = validateNarrative(input.narrative);
    const demo = Boolean(input.demo || input.demoScenarioId || input.demoSessionId || access?.demoSessionId);
    const demoSessionId = demo ? access?.demoSessionId?.trim() || input.demoSessionId?.trim() || randomUUID() : null;
    if (access?.demoSessionId && input.demoSessionId && access.demoSessionId !== input.demoSessionId) {
      throw new MvpServiceError("DEMO_SESSION_MISMATCH", "เซสชันโหมดสาธิตไม่ตรงกัน กรุณาเริ่มใหม่", 403);
    }
    const deterministic = deterministicExtract({
      narrative,
      patientRelation: input.patientRelation,
      scheme: input.scheme,
      area: input.area,
      demoScenarioId: input.demoScenarioId,
    });
    const preSafety = runSafetyPrecheck(narrative);
    let extracted = deterministic;
    const precomputedDemo = Boolean(input.demoScenarioId);
    if (!precomputedDemo && !preSafety.emergency) {
      try {
        extracted = mergeConfirmed(
          await withDeadline(this.model.extractCase({
            narrative,
            confirmed: {
              patientRelation: deterministic.patientRelation,
              scheme: input.scheme,
              area: input.area,
            },
          }), 11_750),
          deterministic,
        );
      } catch {
        extracted = deterministic;
      }
    }
    const safety = mergeSafety(preSafety, runSafetyPrecheck(extracted.redFlagMentions.join(" ")));
    const questions = computeRequiredSlotQuestions(extracted, safety);
    const now = this.now();
    const record = CaseRecordSchema.parse({
      id: randomUUID(),
      demoSessionId,
      demoScenarioId: input.demoScenarioId ?? null,
      status: deriveCaseStatus("draft", safety, questions),
      originalNarrative: narrative,
      extracted,
      safety,
      questions,
      answers: {},
      route: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      // Demo PII is temporary, but 72 hours keeps a consented Passport share
      // valid for its documented default lifetime. Purge/reset cascades all rows.
      expiresAt: demo ? new Date(now.getTime() + 72 * 3_600_000).toISOString() : null,
    });
    await this.store.saveCase(record, access?.ownerUserId ?? null);
    if (demo) await this.store.addAudit(record.id, "demo_started", { demoScenarioId: record.demoScenarioId });
    await this.store.addAudit(record.id, "narrative_submitted", {
      status: record.status,
      questionCount: questions.length,
    });
    if (safety.emergency) await this.store.addAudit(record.id, "emergency_escalated", { urgency: safety.finalUrgency });
    return { case: record };
  }

  async turnCase(caseId: string, input: TurnCaseInput, access?: ServiceAccessContext): Promise<{ case: MvpCaseRecord }> {
    const record = await this.requireCase(caseId, access);
    if (record.status === "closed") throw new MvpServiceError("CASE_CLOSED", "เคสนี้ถูกปิดแล้ว", 409);
    const answers = { ...record.answers, ...sanitizeAnswers(input.answers) };
    if (input.answer?.slotKey) answers[input.answer.slotKey] = sanitizeAnswer(input.answer.value);
    const message = input.message ? validateMessage(input.message) : "";
    const extracted = applyAnswers(record.extracted, answers);
    let safety = mergeSafety(record.safety, message ? runSafetyPrecheck(message) : emptySafety());
    if (answers.critical_red_flags === "present") {
      safety = {
        emergency: true,
        finalUrgency: "EMERGENCY_NOW",
        matchedRuleIds: unique([...safety.matchedRuleIds, "safety:user-confirmed-red-flag"]),
        matchedLabels: unique([...safety.matchedLabels, "สัญญาณอันตรายที่ผู้ใช้ยืนยัน"]),
        hotline: "1669",
        messageTh: "อาการที่เล่ามาอาจต้องได้รับความช่วยเหลือฉุกเฉิน โทร 1669 ทันที",
      };
    }
    const questions = computeRequiredSlotQuestions(extracted, safety, answers);
    const updated: MvpCaseRecord = CaseRecordSchema.parse({
      ...record,
      extracted,
      safety,
      questions,
      answers,
      status: deriveCaseStatus(record.status, safety, questions),
      updatedAt: this.now().toISOString(),
    });
    await this.store.saveCase(updated);
    if (record.questions.length && !questions.length) await this.store.addAudit(caseId, "clarification_completed", { questionCount: Object.keys(answers).length });
    else await this.store.addAudit(caseId, "clarification_started", { remainingQuestions: questions.length });
    if (!record.safety.emergency && safety.emergency) await this.store.addAudit(caseId, "emergency_escalated", { urgency: safety.finalUrgency });
    return { case: updated };
  }

  async confirmCase(caseId: string, input: ConfirmCaseInput, access?: ServiceAccessContext): Promise<{ case: MvpCaseRecord }> {
    const record = await this.requireCase(caseId, access);
    if (!input.confirmed) throw new MvpServiceError("CONFIRMATION_REQUIRED", "กรุณายืนยันข้อมูลเคสก่อนสร้างเส้นทาง", 400);
    const extracted = applyReviewUpdates(record.extracted, input.updates ?? {});
    const safety = mergeSafety(record.safety, runSafetyPrecheck(extracted.redFlagMentions.join(" ")));
    const questions = computeRequiredSlotQuestions(extracted, safety, record.answers);
    const updated: MvpCaseRecord = CaseRecordSchema.parse({
      ...record,
      extracted,
      safety,
      questions,
      status: safety.emergency ? "emergency_escalated" : "ready_for_review",
      updatedAt: this.now().toISOString(),
    });
    await this.store.saveCase(updated);
    await this.store.addAudit(caseId, "review_confirmed", { status: updated.status, remainingQuestions: questions.length });
    return { case: updated };
  }

  async generateRoute(caseId: string, access?: ServiceAccessContext): Promise<{ case: MvpCaseRecord; route: VerifiedCareRoute }> {
    let record = await this.requireCase(caseId, access);
    record = CaseRecordSchema.parse({ ...record, status: record.safety.emergency ? "emergency_escalated" : "processing", updatedAt: this.now().toISOString() });
    await this.store.saveCase(record);
    const profile = resolveDemoProfile(record.demoScenarioId, `${record.originalNarrative} ${record.extracted.userGoal}`);
    const precomputedDemo = Boolean(record.demoScenarioId);
    const baseKnowledge = precomputedDemo ? this.demoKnowledge : this.knowledge;
    const knowledge = baseKnowledge.createRequestScope?.() ?? baseKnowledge;
    let degraded = false;
    let prescreen;
    if (record.safety.emergency || precomputedDemo) {
      prescreen = deterministicPrescreen(record.extracted, profile, record.safety.finalUrgency);
    } else {
      try {
        prescreen = await withDeadline(this.model.prescreenCase({
          extractedCase: record.extracted,
          urgencyFloor: record.safety.finalUrgency,
          safetyMatches: record.safety.matchedLabels,
        }), 11_750);
        prescreen = { ...prescreen, urgency: applyUrgencyFloor(prescreen.urgency, record.safety.finalUrgency) };
      } catch {
        prescreen = deterministicPrescreen(record.extracted, profile, record.safety.finalUrgency);
        degraded = true;
      }
    }

    const asOfDate = dateInBangkok(this.now());
    const symptomIds = record.extracted.symptoms.filter((item) => item.present).map((item) => item.id).filter((value): value is string => Boolean(value));
    let conditionIds = unique([...profile.conditionIds, ...prescreen.possibleConditions.map((item) => item.conditionId).filter((value): value is string => Boolean(value))]);
    let serviceIds = unique([...profile.serviceIds, ...prescreen.recommendedServiceTypes.filter((value) => value.startsWith("svc:"))]);
    let serviceFacts = [] as Awaited<ReturnType<KnowledgeProvider["getCoveredServices"]>>;
    let facilities = [] as Awaited<ReturnType<KnowledgeProvider["matchFacilities"]>>;
    let evidence = [] as Awaited<ReturnType<KnowledgeProvider["getEvidence"]>>;
    let eligibility: Array<{ benefitId: string; ruleId: string; sourceId: string; decision: EligibilityDecision; facts: Record<string, unknown> }> = [];
    try {
      if (profile.id === "generic" && symptomIds.length) {
        const matches = await knowledge.matchCondition(symptomIds, asOfDate);
        conditionIds = unique([...conditionIds, ...matches.slice(0, 3).map((item) => item.conditionId)]);
      }
      serviceFacts = await knowledge.getCoveredServices(conditionIds, record.extracted.scheme, asOfDate, serviceIds);
      serviceIds = unique([...serviceIds, ...serviceFacts.map((item) => item.serviceId)]);
      if (!record.safety.emergency && record.extracted.scheme !== "UNKNOWN" && record.extracted.scheme !== "PRIVATE") {
        facilities = await knowledge.matchFacilities({
          serviceIds,
          scheme: record.extracted.scheme,
          area: { code: record.extracted.area.code, name: record.extracted.area.name },
          location: record.extracted.currentLocation ?? null,
          atTime: record.extracted.preferredTime ?? this.now(),
          urgency: prescreen.urgency,
          asOfDate,
        });
      }
      const sourceOrEntityIds = unique([
        ...conditionIds,
        ...serviceIds,
        ...serviceFacts.map((item) => item.sourceId),
        ...facilities.flatMap((item) => [
          item.facilityId,
          item.sourceId,
          ...(item.evidenceSourceIds ?? []),
        ]),
        ...(record.safety.emergency ? ["doc:niems:1669"] : []),
      ]);
      evidence = await knowledge.getEvidence(sourceOrEntityIds);
      const benefits = await knowledge.getBenefits(conditionIds, record.extracted.age, record.extracted.scheme, asOfDate);
      const facts = eligibilityFacts(record, profile.id);
      eligibility = benefits
        .filter((benefit) => benefit.rule)
        .map((benefit) => ({
          benefitId: benefit.id,
          ruleId: benefit.rule!.id,
          sourceId: benefit.sourceId,
          decision: evaluateEligibilityRule(benefit.rule!.logic, benefit.rule!.requiredAttrs, facts),
          facts,
        }));
    } catch {
      degraded = true;
    }
    const coverages = serviceFacts.map((fact) => buildRouteCoverage(fact, evidence.filter((item) => item.id === fact.sourceId).map((item) => item.id), asOfDate));
    const reliabilities = new Map<string, Awaited<ReturnType<KnowledgeProvider["getFacilityReliability"]>>>();
    await Promise.all(facilities.map(async (facility) => {
      try { reliabilities.set(facility.facilityId, await knowledge.getFacilityReliability(facility.facilityId)); }
      catch { reliabilities.set(facility.facilityId, null); }
    }));
    degraded ||= knowledge.getRuntimeState?.().degraded ?? false;
    const route = composeVerifiedCareRoute({
      caseId,
      extracted: record.extracted,
      safety: record.safety,
      prescreen,
      profile,
      coverages,
      facilities,
      reliabilities,
      evidence,
      degraded,
      generatedAt: this.now().toISOString(),
    });
    const updated: MvpCaseRecord = CaseRecordSchema.parse({ ...record, route, status: route.emergency ? "emergency_escalated" : "route_ready", updatedAt: this.now().toISOString() });
    await this.store.saveRoute(updated, route);
    await this.store.saveEligibilityDecisions(caseId, eligibility);
    await this.store.addAudit(caseId, "route_generated", { urgency: route.urgency, success: true, degraded: route.degraded, hasPrimary: Boolean(route.primary), hasBackup: Boolean(route.backup) });
    return { case: updated, route };
  }

  async getCase(caseId: string, access?: ServiceAccessContext): Promise<{ case: MvpCaseRecord }> {
    return { case: await this.requireCase(caseId, access) };
  }

  async getRoute(caseId: string, access?: ServiceAccessContext): Promise<{ route: VerifiedCareRoute }> {
    await this.requireCase(caseId, access);
    const route = await this.store.getRoute(caseId);
    if (!route) throw new MvpServiceError("ROUTE_NOT_READY", "ยังไม่ได้สร้างเส้นทางดูแลสำหรับเคสนี้", 404);
    return { route };
  }

  async createPassport(caseId: string, input: { consent?: Partial<PassportConsent> }, access?: ServiceAccessContext): Promise<{ passport: { id: string; snapshot: StoredPassport["snapshot"] } }> {
    const record = await this.requireCase(caseId, access);
    if (!record.route) throw new MvpServiceError("ROUTE_NOT_READY", "กรุณาสร้างเส้นทางดูแลก่อนสร้าง Case Passport", 409);
    const consent: PassportConsent = {
      scope: input.consent?.scope ?? ["PRE_VISIT_HANDOFF"],
      shareAllowed: input.consent?.shareAllowed ?? false,
      sensitiveFieldsExcluded: input.consent?.sensitiveFieldsExcluded ?? ["national_id", "system_internal_data"],
    };
    const version = (await this.store.latestPassportVersion(caseId)) + 1;
    const id = randomUUID();
    const createdAt = this.now();
    const snapshot = buildPassportSnapshot({
      record,
      version,
      consent,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + 72 * 3_600_000).toISOString(),
    });
    await this.store.savePassport({ id, caseId, snapshot, revokedAt: null });
    const updated = CaseRecordSchema.parse({ ...record, status: "passport_ready", updatedAt: this.now().toISOString() });
    await this.store.saveCase(updated);
    await this.store.addAudit(caseId, "passport_created", { passportId: id, version });
    return { passport: { id, snapshot } };
  }

  async getPassport(passportId: string, access?: ServiceAccessContext): Promise<{ passport: StoredPassport }> {
    const passport = await this.store.getPassport(passportId);
    if (!passport) throw new MvpServiceError("PASSPORT_NOT_FOUND", "ไม่พบ Case Passport นี้", 404);
    await this.requireCase(passport.caseId, access);
    return { passport };
  }

  async sharePassport(passportId: string, input: { consentGranted?: boolean; expiresInHours?: number }, access?: ServiceAccessContext): Promise<{ token: string; url: string; expiresAt: string }> {
    if (!input.consentGranted) throw new MvpServiceError("SHARE_CONSENT_REQUIRED", "กรุณายินยอมก่อนสร้างลิงก์แชร์", 400);
    const ownedPassport = await this.store.getPassport(passportId);
    if (!ownedPassport) throw new MvpServiceError("PASSPORT_NOT_FOUND", "ไม่พบ Case Passport นี้", 404);
    await this.requireCase(ownedPassport.caseId, access);
    try {
      const share = await this.store.createShare(passportId, input.expiresInHours ?? 72);
      const passport = await this.store.getPassport(passportId);
      if (passport) await this.store.addAudit(passport.caseId, "passport_shared", { passportId, expiresAt: share.expiresAt });
      return { ...share, url: `/passport/share/${encodeURIComponent(share.token)}` };
    } catch (error) {
      if (error instanceof Error && error.message === "SHARE_CONSENT_REQUIRED") throw new MvpServiceError("SHARE_CONSENT_REQUIRED", "Passport นี้ยังไม่ได้รับความยินยอมให้แชร์", 400);
      if (error instanceof Error && ["PASSPORT_NOT_FOUND", "PASSPORT_CASE_NOT_FOUND"].includes(error.message)) {
        throw new MvpServiceError("PASSPORT_NOT_FOUND", "ไม่พบ Case Passport นี้", 404);
      }
      throw new MvpServiceError(
        "PASSPORT_SHARE_UNAVAILABLE",
        "ยังสร้างลิงก์แชร์ไม่สำเร็จ กรุณาลองใหม่",
        503,
        true,
      );
    }
  }

  async revokePassportShare(passportId: string, access?: ServiceAccessContext): Promise<{ revoked: boolean }> {
    const passport = await this.store.getPassport(passportId);
    if (!passport) throw new MvpServiceError("PASSPORT_NOT_FOUND", "ไม่พบ Case Passport นี้", 404);
    await this.requireCase(passport.caseId, access);
    return { revoked: await this.store.revokeShare(passportId) };
  }

  async getSharedPassport(token: string): Promise<{ passport: StoredPassport }> {
    if (!token || token.length > 256) throw new MvpServiceError("SHARE_NOT_FOUND", "ลิงก์นี้ไม่ถูกต้องหรือหมดอายุแล้ว", 404);
    const passport = await this.store.getSharedPassport(token);
    if (!passport) throw new MvpServiceError("SHARE_NOT_FOUND", "ลิงก์นี้ไม่ถูกต้อง หมดอายุ หรือถูกยกเลิกแล้ว", 404);
    return {
      passport: {
        ...passport,
        snapshot: sanitizeSharedPassportSnapshot(passport.snapshot),
      },
    };
  }

  async answerFollowUp(caseId: string, input: FollowUpInput, access?: ServiceAccessContext): Promise<{ answer: string; safety: { emergency: boolean; hotline: string | null; messageTh: string | null } }> {
    const record = await this.requireCase(caseId, access);
    const question = validateMessage(input.question);
    const safety = runSafetyPrecheck(question);
    if (safety.emergency) {
      // A newly reported red flag invalidates the previously composed normal
      // route. The client must return to the safety gate before any facility or
      // Passport action can continue.
      const updated = CaseRecordSchema.parse({
        ...record,
        safety: mergeSafety(record.safety, safety),
        status: "emergency_escalated",
        route: null,
        updatedAt: this.now().toISOString(),
      });
      await this.store.saveCase(updated);
      await this.store.addAudit(caseId, "emergency_escalated", { source: "follow_up" });
      return { answer: safety.messageTh ?? "อาการที่เล่ามาอาจต้องได้รับความช่วยเหลือฉุกเฉิน โทร 1669 ทันที", safety: { emergency: true, hotline: "1669", messageTh: safety.messageTh } };
    }
    if (!record.route) throw new MvpServiceError("ROUTE_NOT_READY", "กรุณาสร้างเส้นทางดูแลก่อนถามคำถามต่อ", 409);
    const grounded = deterministicFollowUp(question, record.route);
    let answer = grounded;
    if (!grounded) {
      try {
        const modelAnswer = await this.model.answerFollowUp({ question, sanitizedSnapshot: sanitizeRouteForModel(record.route) });
        const allowed = new Set(record.route.evidence.map((item) => item.id));
        if (modelAnswer.evidenceIds.every((id) => allowed.has(id))) answer = stripMarkdown(modelAnswer.answerTh);
      } catch {
        // The safe deterministic answer below is the user-visible fallback.
      }
    }
    answer ||= "ข้อมูลในเคสนี้ยังตอบยืนยันไม่ได้ กรุณาโทรสอบถามสถานพยาบาลหรือหน่วยงานเจ้าของสิทธิ์ก่อนดำเนินการ";
    await this.store.addAudit(caseId, "follow_up_asked", { category: followUpCategory(question) });
    return { answer, safety: { emergency: false, hotline: null, messageTh: null } };
  }

  async submitFeedback(caseId: string, input: FeedbackInput, access?: ServiceAccessContext): Promise<{ saved: boolean }> {
    const record = await this.requireCase(caseId, access);
    assertFeedbackOutcome(input.outcome);
    await this.store.saveFeedback({
      caseId,
      facilityId: record.route?.primary?.facilityId ?? null,
      routeId: record.route && (record.route.primary || record.route.backup || record.route.emergency)
        ? record.route.id
        : null,
      outcome: input.outcome,
      rightAccepted: input.rightAccepted,
      discrepancy: input.discrepancy ? sanitizeAnswer(input.discrepancy).slice(0, 500) : null,
    });
    await this.store.addAudit(caseId, "feedback_submitted", { outcome: input.outcome, rightAccepted: input.rightAccepted });
    return { saved: true };
  }

  async resetDemo(demoSessionId: string, access?: ServiceAccessContext): Promise<{ reset: boolean }> {
    if (!demoSessionId.trim()) throw new MvpServiceError("DEMO_SESSION_REQUIRED", "ไม่พบรหัสโหมดสาธิต", 400);
    if (access?.demoSessionId && access.demoSessionId !== demoSessionId.trim()) throw new MvpServiceError("DEMO_SESSION_MISMATCH", "ไม่มีสิทธิ์รีเซ็ตเซสชันนี้", 403);
    return { reset: await this.store.resetDemo(demoSessionId.trim()) };
  }

  async trackEvent(
    caseId: string,
    event: ClientAnalyticsEvent,
    payload: { routeType?: "PRIMARY" | "BACKUP"; status?: string },
    access?: ServiceAccessContext,
  ): Promise<{ tracked: true }> {
    await this.requireCase(caseId, access);
    if (!CLIENT_ANALYTICS_EVENTS.includes(event)) {
      throw new MvpServiceError("INVALID_EVENT", "ประเภทเหตุการณ์ไม่ถูกต้อง", 400);
    }
    await this.store.addAudit(caseId, event, payload);
    return { tracked: true };
  }

  async deleteCase(caseId: string, access?: ServiceAccessContext): Promise<{ deleted: boolean }> {
    await this.requireCase(caseId, access);
    return { deleted: await this.store.deleteCase(caseId) };
  }

  async debugCase(caseId: string, access?: ServiceAccessContext): Promise<{ case: unknown; route: unknown; audit: unknown }> {
    const record = await this.requireCase(caseId, { ...access, internal: access?.internal ?? true });
    const events = await this.store.getAudit(caseId);
    return {
      case: record,
      route: record.route,
      audit: {
        events,
        eligibilityDecisions: await this.store.getEligibilityDecisions(caseId),
        metrics: computeCaseMetrics(events),
      },
    };
  }

  async assertCaseAccess(caseId: string, access: ServiceAccessContext): Promise<true> {
    await this.requireCase(caseId, access);
    return true;
  }

  private async requireCase(caseId: string, access?: ServiceAccessContext): Promise<MvpCaseRecord> {
    let record: MvpCaseRecord | null;
    try { record = await this.store.getCase(caseId, access); }
    catch (error) {
      if (error instanceof StoreAccessDeniedError) throw new MvpServiceError("CASE_ACCESS_DENIED", "ไม่มีสิทธิ์เข้าถึงเคสนี้", 403);
      throw error;
    }
    if (!record) throw new MvpServiceError("CASE_NOT_FOUND", "ไม่พบเคสนี้หรือข้อมูลหมดอายุแล้ว", 404);
    return record;
  }
}

let singleton: MvpService | null = null;
export function getMvpService(): MvpService {
  singleton ??= new MvpService();
  return singleton;
}

export const createCase = (input: CreateCaseInput, access?: ServiceAccessContext) => getMvpService().createCase(input, access);
export const turnCase = (caseId: string, input: TurnCaseInput, access?: ServiceAccessContext) => getMvpService().turnCase(caseId, input, access);
export const confirmCase = (caseId: string, input: ConfirmCaseInput, access?: ServiceAccessContext) => getMvpService().confirmCase(caseId, input, access);
export const generateRoute = (caseId: string, access?: ServiceAccessContext) => getMvpService().generateRoute(caseId, access);
export const getCase = (caseId: string, access?: ServiceAccessContext) => getMvpService().getCase(caseId, access);
export const getRoute = (caseId: string, access?: ServiceAccessContext) => getMvpService().getRoute(caseId, access);
export const createPassport = (caseId: string, input: { consent?: Partial<PassportConsent> }, access?: ServiceAccessContext) => getMvpService().createPassport(caseId, input, access);
export const getPassport = (passportId: string, access?: ServiceAccessContext) => getMvpService().getPassport(passportId, access);
export const sharePassport = (passportId: string, input: { consentGranted?: boolean; expiresInHours?: number }, access?: ServiceAccessContext) => getMvpService().sharePassport(passportId, input, access);
export const revokePassportShare = (passportId: string, access?: ServiceAccessContext) => getMvpService().revokePassportShare(passportId, access);
export const getSharedPassport = (token: string) => getMvpService().getSharedPassport(token);
export const answerFollowUp = (caseId: string, input: FollowUpInput, access?: ServiceAccessContext) => getMvpService().answerFollowUp(caseId, input, access);
export const submitFeedback = (caseId: string, input: FeedbackInput, access?: ServiceAccessContext) => getMvpService().submitFeedback(caseId, input, access);
export const resetDemo = (demoSessionId: string, access?: ServiceAccessContext) => getMvpService().resetDemo(demoSessionId, access);
export const trackEvent = (caseId: string, event: ClientAnalyticsEvent, payload: { routeType?: "PRIMARY" | "BACKUP"; status?: string }, access?: ServiceAccessContext) => getMvpService().trackEvent(caseId, event, payload, access);
export const deleteCase = (caseId: string, access?: ServiceAccessContext) => getMvpService().deleteCase(caseId, access);
export const debugCase = (caseId: string, access?: ServiceAccessContext) => getMvpService().debugCase(caseId, access);
export const assertCaseAccess = (caseId: string, access: ServiceAccessContext) => getMvpService().assertCaseAccess(caseId, access);

function validateNarrative(value: string): string {
  const normalized = String(value ?? "").normalize("NFC").trim();
  if (!normalized) throw new MvpServiceError("NARRATIVE_REQUIRED", "กรุณาเล่าอาการหรือสิ่งที่ต้องการให้ช่วย", 400);
  if (normalized.length > 4_000) throw new MvpServiceError("NARRATIVE_TOO_LONG", "ข้อความยาวเกินไป กรุณาสรุปไม่เกิน 4,000 ตัวอักษร", 413);
  assertNoNationalId(normalized);
  return normalized;
}

function validateMessage(value: string): string {
  const normalized = String(value ?? "").normalize("NFC").trim();
  if (!normalized) throw new MvpServiceError("MESSAGE_REQUIRED", "กรุณาพิมพ์ข้อความ", 400);
  if (normalized.length > 1_000) throw new MvpServiceError("MESSAGE_TOO_LONG", "ข้อความยาวเกินไป กรุณาสรุปไม่เกิน 1,000 ตัวอักษร", 413);
  assertNoNationalId(normalized);
  return normalized;
}

function sanitizeAnswers(value: Record<string, string> | undefined): Record<string, string> {
  if (!value) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, answer]) => [key.slice(0, 80), sanitizeAnswer(answer)]));
}

function sanitizeAnswer(value: string): string {
  const normalized = String(value ?? "").normalize("NFC").trim().slice(0, 500);
  assertNoNationalId(normalized);
  return normalized;
}

function applyAnswers(extracted: ExtractedCase, answers: Record<string, string>): ExtractedCase {
  const next = structuredClone(extracted);
  if (answers.patient_relation && ["self", "father", "mother", "child", "relative", "other", "unknown"].includes(answers.patient_relation)) next.patientRelation = answers.patient_relation as ExtractedCase["patientRelation"];
  if (answers.scheme && isConfirmedScheme(answers.scheme)) {
    next.scheme = answers.scheme;
    next.fieldConfidence.scheme = 1;
  }
  if (answers.area && answers.area !== "unknown") next.area = { name: answers.area, code: next.area.code };
  if (answers.age) {
    const numeric = Number(answers.age);
    if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 125) next.age = numeric;
    else if (["child", "adult", "older_adult", "unknown"].includes(answers.age)) next.ageGroup = answers.age as NonNullable<ExtractedCase["ageGroup"]>;
  }
  if (answers.duration) {
    const [unit, rawValue] = answers.duration.split(":");
    if (["hours", "days", "weeks", "months"].includes(unit)) next.duration = { unit: unit as ExtractedCase["duration"]["unit"], value: rawValue ? Number(rawValue) : null, raw: answers.duration };
  }
  if (answers.user_goal && answers.user_goal !== "unknown") next.userGoal = answers.user_goal;
  next.missingCriticalFields = next.missingCriticalFields.filter((key) => !answers[key]);
  return next;
}

function applyReviewUpdates(extracted: ExtractedCase, updates: NonNullable<ConfirmCaseInput["updates"]>): ExtractedCase {
  [updates.area, updates.duration, updates.userGoal, ...(updates.symptoms ?? [])]
    .filter((value): value is string => typeof value === "string")
    .forEach(assertNoNationalId);
  const next = structuredClone(extracted);
  if (updates.patientRelation) next.patientRelation = applyAnswers(next, { patient_relation: updates.patientRelation }).patientRelation;
  if (updates.age === null || (Number.isInteger(updates.age) && Number(updates.age) >= 0 && Number(updates.age) <= 125)) next.age = updates.age ?? null;
  if (updates.scheme && isConfirmedScheme(updates.scheme)) { next.scheme = updates.scheme; next.fieldConfidence.scheme = 1; }
  if (updates.area?.trim()) next.area = { ...next.area, name: updates.area.trim() };
  if (updates.symptoms) next.symptoms = updates.symptoms.slice(0, 20).filter(Boolean).map((text, index) => ({ text: text.slice(0, 160), normalizedName: text.slice(0, 160), present: true, confidence: 1, id: next.symptoms[index]?.id }));
  if (updates.duration?.trim()) next.duration = parseDurationReview(updates.duration.trim());
  if (updates.userGoal?.trim()) next.userGoal = updates.userGoal.trim().slice(0, 500);
  return next;
}

function parseDurationReview(value: string): ExtractedCase["duration"] {
  if (/ไม่ทราบ|unknown/i.test(value)) return { value: null, unit: "unknown", raw: value };
  const match = /(\d+(?:\.\d+)?)\s*(ชั่วโมง|ชม\.?|วัน|สัปดาห์|เดือน|hours?|days?|weeks?|months?)/i.exec(value);
  if (!match) return { value: null, unit: "unknown", raw: value.slice(0, 120) };
  const key = match[2].toLowerCase();
  const unit: ExtractedCase["duration"]["unit"] = /ชั่วโมง|ชม|hour/.test(key) ? "hours" : /สัปดาห์|week/.test(key) ? "weeks" : /เดือน|month/.test(key) ? "months" : "days";
  return { value: Number(match[1]), unit, raw: value.slice(0, 120) };
}

function eligibilityFacts(record: MvpCaseRecord, profileId: string): Record<string, unknown> {
  const answer = (key: string) => parseFact(record.answers[key]);
  const pensionMentioned = /(?:รับ|มี)\s*(?:เงิน)?บำนาญ|ได้รับบำนาญ/.test(record.originalNarrative);
  const stateIncomeMentioned = /รายได้ประจำจากรัฐ|เงินเดือนจากรัฐ/.test(record.originalNarrative);
  return {
    age: record.extracted.age,
    scheme: record.extracted.scheme,
    thai_nationality: answer("thai_nationality"),
    registered_in_area: answer("registered_in_area"),
    receives_state_pension: answer("receives_state_pension") ?? (profileId === "hero-father-diabetes" || pensionMentioned ? true : null),
    receives_regular_state_income: answer("receives_regular_state_income") ?? (profileId === "hero-father-diabetes" || stateIncomeMentioned ? true : null),
    insured_status: answer("insured_status") ?? (profileId === "sss-dental" ? "ACTIVE" : null),
  };
}

function parseFact(value: string | undefined): unknown {
  if (value == null || value === "" || value === "unknown") return null;
  if (["true", "yes", "มี", "ใช่"].includes(value.toLowerCase())) return true;
  if (["false", "no", "ไม่มี", "ไม่"].includes(value.toLowerCase())) return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && value.trim() !== "" ? numeric : value;
}

function mergeConfirmed(model: ExtractedCase, confirmed: ExtractedCase): ExtractedCase {
  return {
    ...model,
    patientRelation: confirmed.fieldConfidence.patientRelation === 1 ? confirmed.patientRelation : model.patientRelation,
    scheme: confirmed.fieldConfidence.scheme === 1 ? confirmed.scheme : model.scheme,
    area: confirmed.fieldConfidence.area === 1 ? confirmed.area : model.area,
    fieldConfidence: { ...model.fieldConfidence, ...Object.fromEntries(Object.entries(confirmed.fieldConfidence).filter(([, value]) => value === 1)) },
  };
}

function emptySafety(): SafetyState {
  return { emergency: false, finalUrgency: "SELF_CARE_WITH_MONITORING", matchedRuleIds: [], matchedLabels: [], hotline: null, messageTh: null };
}

function mergeSafety(a: SafetyState, b: SafetyState): SafetyState {
  const urgency = applyUrgencyFloor(a.finalUrgency, b.finalUrgency);
  const lead = b.emergency ? b : a;
  return {
    emergency: urgency === "EMERGENCY_NOW",
    finalUrgency: urgency,
    matchedRuleIds: unique([...a.matchedRuleIds, ...b.matchedRuleIds]),
    matchedLabels: unique([...a.matchedLabels, ...b.matchedLabels]),
    hotline: lead.hotline,
    messageTh: lead.messageTh,
  };
}

function deterministicFollowUp(question: string, route: VerifiedCareRoute): string | null {
  if (/เตรียม|เอกสาร|เอาอะไร/.test(question)) return route.preparationItems.map((item) => `• ${item.label} — ${item.reason}`).join("\n");
  if (/ค่าใช้จ่าย|เสียเงิน|ฟรี|ราคา|กี่บาท/.test(question)) return route.rights.length
    ? route.rights.map((item) => `${item.serviceName}: ${item.costSummary}`).join("\n")
    : "ยังไม่มีข้อมูลตัวเลขค่าใช้จ่ายที่ยืนยันได้ กรุณาโทรยืนยันกับสถานพยาบาล";
  if (/ปิด|ไปไม่ได้|ที่แรก/.test(question)) return route.backup
    ? `หากที่แรกปิด ให้ใช้เส้นทางสำรอง: ${route.backup.facilityName}${route.backup.phone ? ` โทร ${route.backup.phone}` : ""} และโทรยืนยันก่อนเดินทาง`
    : "ยังไม่มีเส้นทางสำรองที่ยืนยันได้ กรุณาโทรหน่วยงานเจ้าของสิทธิ์หรือสถานพยาบาลก่อนเดินทาง";
  if (/ทำไม|เหตุผล|แนะนำที่นี่/.test(question)) return unique([...route.whyThisRoute.safety, ...route.whyThisRoute.care, ...route.whyThisRoute.rights, ...route.whyThisRoute.facility]).slice(0, 5).map((item) => `• ${item}`).join("\n");
  return null;
}

function sanitizeRouteForModel(route: VerifiedCareRoute): unknown {
  return {
    urgency: route.urgency,
    primary: route.primary && { facilityName: route.primary.facilityName, phone: route.primary.phone, openingText: route.primary.openingText, costSummary: route.primary.costSummary, warnings: route.primary.warnings },
    backup: route.backup && { facilityName: route.backup.facilityName, phone: route.backup.phone },
    rights: route.rights.map((item) => ({ serviceName: item.serviceName, costSummary: item.costSummary, conditions: item.conditions, evidenceIds: item.evidenceIds })),
    preparationItems: route.preparationItems,
    evidence: route.evidence.map((item) => ({ id: item.id, title: item.title, publisher: item.publisher })),
  };
}

function stripMarkdown(value: string): string {
  return value.replace(/```[\s\S]*?```/g, "").replace(/[*_#>`~]/g, "").replace(/\[(.*?)\]\([^)]*\)/g, "$1").trim().slice(0, 1_200);
}

function followUpCategory(question: string): string {
  if (/ค่าใช้จ่าย|ฟรี|ราคา/.test(question)) return "cost";
  if (/เอกสาร|เตรียม/.test(question)) return "preparation";
  if (/ทำไม|เหตุผล/.test(question)) return "reason";
  if (/ปิด|ที่แรก/.test(question)) return "backup";
  return "other";
}

function assertFeedbackOutcome(value: string): asserts value is FeedbackOutcome {
  if (!["RECEIVED_AS_PLANNED", "RECEIVED_WITH_EXTRA_COST", "RIGHT_NOT_ACCEPTED", "SERVICE_NOT_AVAILABLE", "FACILITY_CLOSED", "MISSING_DOCUMENTS", "TRANSFERRED_ELSEWHERE", "DID_NOT_GO", "OTHER"].includes(value)) {
    throw new MvpServiceError("INVALID_FEEDBACK", "ข้อมูลผลการเข้ารับบริการไม่ถูกต้อง", 400);
  }
}

async function withDeadline<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => { timeout = setTimeout(() => reject(new Error("DEADLINE_EXCEEDED")), milliseconds); }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function dateInBangkok(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function assertNoNationalId(value: string): void {
  if (containsThaiNationalId(value)) {
    throw new MvpServiceError(
      "SENSITIVE_IDENTIFIER_NOT_ALLOWED",
      "กรุณาลบเลขบัตรประชาชน 13 หลักออกก่อนส่ง ระบบไม่รับหรือจัดเก็บข้อมูลส่วนนี้",
      400,
    );
  }
}

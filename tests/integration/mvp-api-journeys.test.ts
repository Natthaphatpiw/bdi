import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import type {
  ApiEnvelope,
  MvpCaseRecord,
  StoredPassport,
  VerifiedCareRoute,
} from "@/lib/mvp/contracts";
import { POST as createCasePost } from "@/app/api/cases/route";
import { POST as caseTurnPost } from "@/app/api/cases/[id]/turn/route";
import { POST as caseConfirmPost } from "@/app/api/cases/[id]/confirm/route";
import { POST as routeGeneratePost } from "@/app/api/cases/[id]/generate-route/route";
import { GET as caseGet } from "@/app/api/cases/[id]/route";
import { POST as passportCreatePost } from "@/app/api/cases/[id]/passport/route";
import {
  DELETE as passportShareDelete,
  POST as passportSharePost,
} from "@/app/api/passports/[id]/share/route";
import { GET as publicPassportGet } from "@/app/api/passport/share/[token]/route";
import { POST as feedbackPost } from "@/app/api/cases/[id]/feedback/route";
import { POST as eventPost } from "@/app/api/cases/[id]/events/route";
import { POST as demoResetPost } from "@/app/api/demo/reset/route";

type RouteContext<Key extends string> = { params: Promise<Record<Key, string>> };

interface CaseData {
  case: MvpCaseRecord;
}

interface TurnData extends CaseData {
  status: MvpCaseRecord["status"];
  extractedSlots: MvpCaseRecord["extracted"];
  questions: MvpCaseRecord["questions"];
  safetyState: MvpCaseRecord["safety"];
  nextAction: string;
}

interface RouteData extends CaseData {
  route: VerifiedCareRoute;
}

interface PassportData {
  passport: {
    id: string;
    snapshot: StoredPassport["snapshot"];
  };
}

interface ShareData {
  token: string;
  url: string;
  expiresAt: string;
}

type TestEnvelope<T> =
  | (ApiEnvelope<T> & { success: true; data: T; error: null })
  | (ApiEnvelope<T> & {
      success: false;
      data: null;
      error: NonNullable<ApiEnvelope<never>["error"]>;
    });

function sessionId(label: string): string {
  return `integration-${label}-${crypto.randomUUID()}`;
}

function cookie(session: string): string {
  return `rrs_demo_session=${encodeURIComponent(session)}`;
}

function request(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    session?: string;
    ip?: string;
  } = {},
): NextRequest {
  const headers = new Headers();
  headers.set("x-forwarded-for", options.ip ?? "198.51.100.10");
  if (options.session) headers.set("cookie", cookie(options.session));
  if (options.body !== undefined) headers.set("content-type", "application/json");
  return new NextRequest(`http://localhost:3000${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function envelope<T>(response: Response): Promise<TestEnvelope<T>> {
  return (await response.json()) as TestEnvelope<T>;
}

function caseContext(id: string): RouteContext<"id"> {
  return { params: Promise.resolve({ id }) };
}

function tokenContext(token: string): RouteContext<"token"> {
  return { params: Promise.resolve({ token }) };
}

function expectSafePublicPayload(value: unknown): void {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toMatch(
    /Claude|Anthropic|ThaiLLM|Neo4j|RunPod|fallback|provider_internal|raw_model_output|chain[-_ ]?of[-_ ]?thought|system prompt/i,
  );
  expect(serialized).not.toMatch(/\b\d{13}\b/);
}

describe("Verified Care Route HTTP API journeys", () => {
  it("completes the hero journey through clarification, review, route, Passport, share, revoke, feedback, and reset", async () => {
    const session = sessionId("hero");
    const ip = `198.51.100.${Math.floor(Math.random() * 100) + 20}`;
    const createResponse = await createCasePost(
      request("/api/cases", {
        method: "POST",
        session,
        ip,
        body: {
          narrative:
            "ผมถามแทนพ่อ อายุ 68 ปี ช่วง 5 วันที่ผ่านมาเพลียมาก ปัสสาวะบ่อยและกระหายน้ำบ่อย อยู่ลาดพร้าว ใช้สิทธิ์ข้าราชการ และพ่อมีบำนาญจากรัฐ อยากรู้ว่าควรไปตรวจที่ไหนและต้องเตรียมอะไร",
          patientRelation: "father",
          scheme: "CSMBS",
          area: "ลาดพร้าว",
          demoSessionId: session,
          demoScenarioId: "hero-father-diabetes",
          demo: true,
        },
      }),
    );
    expect(createResponse.status).toBe(200);
    expect(createResponse.headers.get("set-cookie")).toContain("rrs_demo_session=");
    expect(createResponse.headers.get("cache-control")).toContain("no-store");
    const created = await envelope<CaseData>(createResponse);
    expect(created.success).toBe(true);
    if (!created.success) throw new Error("hero case creation failed");
    expect(created.data.case.status).toBe("collecting_information");
    expect(created.data.case.safety.emergency).toBe(false);
    expect(created.data.case.questions.map((question) => question.slotKey)).toContain(
      "critical_red_flags",
    );

    const caseId = created.data.case.id;
    const turnResponse = await caseTurnPost(
      request(`/api/cases/${caseId}/turn`, {
        method: "POST",
        session,
        ip,
        body: {
          message: "ไม่มี",
          answers: { critical_red_flags: "absent" },
          answer: {
            questionId: "question:critical_red_flags",
            slotKey: "critical_red_flags",
            value: "absent",
          },
        },
      }),
      caseContext(caseId),
    );
    expect(turnResponse.status).toBe(200);
    const turned = await envelope<TurnData>(turnResponse);
    if (!turned.success) throw new Error("hero clarification failed");
    expect(turned.data.case.questions).toHaveLength(0);
    expect(turned.data.case.status).toBe("ready_for_review");
    expect(turned.data.status).toBe("ready_for_review");
    expect(turned.data.extractedSlots.patientRelation).toBe("father");
    expect(turned.data.questions).toHaveLength(0);
    expect(turned.data.safetyState.emergency).toBe(false);
    expect(turned.data.nextAction).toBe("REVIEW_CASE");

    const extracted = turned.data.case.extracted;
    const confirmResponse = await caseConfirmPost(
      request(`/api/cases/${caseId}/confirm`, {
        method: "POST",
        session,
        ip,
        body: {
          confirmed: true,
          updates: {
            patientRelation: extracted.patientRelation,
            age: extracted.age,
            scheme: extracted.scheme,
            area: extracted.area.name,
            symptoms: extracted.symptoms
              .filter((symptom) => symptom.present)
              .map((symptom) => symptom.text),
            duration: extracted.duration.raw ?? "5 วัน",
            userGoal: extracted.userGoal,
          },
        },
      }),
      caseContext(caseId),
    );
    expect(confirmResponse.status).toBe(200);
    const confirmed = await envelope<CaseData>(confirmResponse);
    if (!confirmed.success) throw new Error("hero review confirmation failed");
    expect(confirmed.data.case.originalNarrative).toBe(created.data.case.originalNarrative);

    const routeResponse = await routeGeneratePost(
      request(`/api/cases/${caseId}/generate-route`, {
        method: "POST",
        session,
        ip,
        body: {},
      }),
      caseContext(caseId),
    );
    expect(routeResponse.status).toBe(200);
    const generated = await envelope<RouteData>(routeResponse);
    if (!generated.success) throw new Error("hero route generation failed");
    expect(generated.data.case.status).toBe("route_ready");
    expect(generated.data.route.emergency).toBe(false);
    expect(generated.data.route.primary?.facilityId).toBe("fac:bma-hc66");
    expect(generated.data.route.backup?.facilityId).toBe("fac:rajavithi");
    expect(generated.data.route.whyThisRoute.safety.length).toBeGreaterThan(0);
    expect(generated.data.route.whyThisRoute.care.length).toBeGreaterThan(0);
    expect(generated.data.route.whyThisRoute.rights.length).toBeGreaterThan(0);
    expect(generated.data.route.whyThisRoute.facility.length).toBeGreaterThan(0);
    expect(generated.data.route.evidence.length).toBeGreaterThan(0);
    expectSafePublicPayload(generated);

    const eventResponse = await eventPost(
      request(`/api/cases/${caseId}/events`, {
        method: "POST",
        session,
        ip,
        body: { event: "why_route_opened", payload: { routeType: "PRIMARY" } },
      }),
      caseContext(caseId),
    );
    expect(eventResponse.status).toBe(200);
    const tracked = await envelope<{ tracked: true }>(eventResponse);
    expect(tracked.success && tracked.data.tracked).toBe(true);

    const passportResponse = await passportCreatePost(
      request(`/api/cases/${caseId}/passport`, {
        method: "POST",
        session,
        ip,
        body: {
          consent: {
            scope: ["PRE_VISIT_HANDOFF"],
            shareAllowed: true,
            sensitiveFieldsExcluded: ["national_id", "system_internal_data"],
          },
        },
      }),
      caseContext(caseId),
    );
    expect(passportResponse.status).toBe(200);
    const passport = await envelope<PassportData>(passportResponse);
    if (!passport.success) throw new Error("Passport creation failed");
    expect(passport.data.passport.snapshot.passport.version).toBe(1);
    expect(passport.data.passport.snapshot.route.primary?.facilityId).toBe("fac:bma-hc66");
    expect(passport.data.passport.snapshot.disclaimer.full).toContain("ไม่ใช่การวินิจฉัย");
    expect(passport.data.passport.snapshot.evidence.length).toBeGreaterThan(0);
    expectSafePublicPayload(passport);

    const passportId = passport.data.passport.id;
    const shareResponse = await passportSharePost(
      request(`/api/passports/${passportId}/share`, {
        method: "POST",
        session,
        ip,
        body: { consentGranted: true, expiresInHours: 72 },
      }),
      caseContext(passportId),
    );
    expect(shareResponse.status).toBe(200);
    const share = await envelope<ShareData>(shareResponse);
    if (!share.success) throw new Error("Passport share creation failed");
    expect(share.data.token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(share.data.url).toBe(`/passport/share/${encodeURIComponent(share.data.token)}`);
    const expiresInMs = new Date(share.data.expiresAt).getTime() - Date.now();
    expect(expiresInMs).toBeGreaterThan(71 * 60 * 60 * 1_000);
    expect(expiresInMs).toBeLessThanOrEqual(72 * 60 * 60 * 1_000 + 5_000);

    const publicResponse = await publicPassportGet(
      request(`/api/passport/share/${share.data.token}`, { ip }),
      tokenContext(share.data.token),
    );
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers.get("cache-control")).toContain("no-store");
    expect(publicResponse.headers.get("x-robots-tag")).toContain("noindex");
    const shared = await envelope<{ passport: StoredPassport }>(publicResponse);
    if (!shared.success) throw new Error("shared Passport could not be read");
    expect(shared.data.passport.snapshot.passport.code).toBe(
      passport.data.passport.snapshot.passport.code,
    );
    expect(shared.data.passport.snapshot.narrative?.originalStory).toBeUndefined();
    expect(shared.data.passport.snapshot.consent.sensitiveFieldsExcluded).toEqual(
      expect.arrayContaining(["original_narrative", "medications", "allergies"]),
    );
    expectSafePublicPayload(shared);

    const revokeResponse = await passportShareDelete(
      request(`/api/passports/${passportId}/share`, {
        method: "DELETE",
        session,
        ip,
      }),
      caseContext(passportId),
    );
    expect(revokeResponse.status).toBe(200);
    const revoked = await envelope<{ revoked: boolean }>(revokeResponse);
    expect(revoked.success && revoked.data.revoked).toBe(true);

    const revokedReadResponse = await publicPassportGet(
      request(`/api/passport/share/${share.data.token}`, { ip }),
      tokenContext(share.data.token),
    );
    expect(revokedReadResponse.status).toBe(404);
    const revokedRead = await envelope<never>(revokedReadResponse);
    expect(revokedRead.success).toBe(false);
    if (!revokedRead.success) {
      expect(revokedRead.error.code).toBe("SHARE_NOT_FOUND");
      expect(JSON.stringify(revokedRead)).not.toContain("stack");
    }

    const feedbackResponse = await feedbackPost(
      request(`/api/cases/${caseId}/feedback`, {
        method: "POST",
        session,
        ip,
        body: {
          outcome: "RECEIVED_AS_PLANNED",
          rightAccepted: true,
          discrepancy: null,
        },
      }),
      caseContext(caseId),
    );
    expect(feedbackResponse.status).toBe(200);
    const feedback = await envelope<{ saved: boolean }>(feedbackResponse);
    expect(feedback.success && feedback.data.saved).toBe(true);

    const resetResponse = await demoResetPost(
      request("/api/demo/reset", {
        method: "POST",
        session,
        ip,
        body: { demoSessionId: session },
      }),
    );
    expect(resetResponse.status).toBe(200);
    expect(resetResponse.headers.get("set-cookie")).toContain("rrs_demo_session=");
    const reset = await envelope<{ reset: boolean }>(resetResponse);
    expect(reset.success && reset.data.reset).toBe(true);

    const afterResetResponse = await caseGet(
      request(`/api/cases/${caseId}`, { session, ip }),
      caseContext(caseId),
    );
    expect(afterResetResponse.status).toBe(404);
  });

  it("escalates an emergency before model routing and never returns a normal primary facility", async () => {
    const session = sessionId("emergency");
    const ip = `203.0.113.${Math.floor(Math.random() * 100) + 20}`;
    const createdResponse = await createCasePost(
      request("/api/cases", {
        method: "POST",
        session,
        ip,
        body: {
          narrative: "พ่อเจ็บหน้าอกรุนแรงและหายใจไม่ออก เริ่มเมื่อครึ่งชั่วโมงก่อน",
          patientRelation: "father",
          scheme: "UCS",
          area: "ลาดพร้าว",
          demoSessionId: session,
          demo: true,
        },
      }),
    );
    expect(createdResponse.status).toBe(200);
    const created = await envelope<CaseData>(createdResponse);
    if (!created.success) throw new Error("emergency case creation failed");
    expect(created.data.case.status).toBe("emergency_escalated");
    expect(created.data.case.safety.emergency).toBe(true);
    expect(created.data.case.safety.hotline).toBe("1669");
    expect(created.data.case.questions).toHaveLength(0);

    const generatedResponse = await routeGeneratePost(
      request(`/api/cases/${created.data.case.id}/generate-route`, {
        method: "POST",
        session,
        ip,
        body: {},
      }),
      caseContext(created.data.case.id),
    );
    expect(generatedResponse.status).toBe(200);
    const generated = await envelope<RouteData>(generatedResponse);
    if (!generated.success) throw new Error("emergency route generation failed");
    expect(generated.data.route.emergency).toBe(true);
    expect(generated.data.route.urgency).toBe("EMERGENCY_NOW");
    expect(generated.data.route.emergencyInstruction).toContain("1669");
    expect(generated.data.route.primary).toBeNull();
    expect(generated.data.route.backup).toBeNull();
    expectSafePublicPayload(generated);

    await demoResetPost(
      request("/api/demo/reset", {
        method: "POST",
        session,
        ip,
        body: { demoSessionId: session },
      }),
    );
  });

  it("keeps an unknown scheme explicit and returns verification guidance instead of inventing coverage", async () => {
    const session = sessionId("unknown-scheme");
    const ip = `192.0.2.${Math.floor(Math.random() * 100) + 20}`;
    const createdResponse = await createCasePost(
      request("/api/cases", {
        method: "POST",
        session,
        ip,
        body: {
          narrative:
            "ฉันอายุ 40 ปี มีไข้และเจ็บคอมา 2 วัน อยู่ลาดพร้าว แต่ไม่ทราบว่าสิทธิรักษาหลักคืออะไร",
          patientRelation: "self",
          scheme: "UNKNOWN",
          area: "ลาดพร้าว",
          demoSessionId: session,
          demo: true,
        },
      }),
    );
    const created = await envelope<CaseData>(createdResponse);
    if (!created.success) throw new Error("unknown scheme case creation failed");
    expect(created.data.case.extracted.scheme).toBe("UNKNOWN");
    expect(created.data.case.questions.map((question) => question.slotKey)).toContain("scheme");

    let current = created.data.case;
    for (const question of [...current.questions]) {
      const answer = question.slotKey === "critical_red_flags" ? "absent" : "UNKNOWN";
      const turnResponse = await caseTurnPost(
        request(`/api/cases/${current.id}/turn`, {
          method: "POST",
          session,
          ip,
          body: {
            message: answer,
            answer: { questionId: question.id, slotKey: question.slotKey, value: answer },
            answers: { [question.slotKey]: answer },
          },
        }),
        caseContext(current.id),
      );
      const turned = await envelope<CaseData>(turnResponse);
      if (!turned.success) throw new Error(`clarification failed for ${question.slotKey}`);
      current = turned.data.case;
    }
    expect(current.extracted.scheme).toBe("UNKNOWN");

    const confirmResponse = await caseConfirmPost(
      request(`/api/cases/${current.id}/confirm`, {
        method: "POST",
        session,
        ip,
        body: {
          confirmed: true,
          updates: {
            patientRelation: current.extracted.patientRelation,
            age: current.extracted.age,
            scheme: "UNKNOWN",
            area: current.extracted.area.name,
            symptoms: current.extracted.symptoms
              .filter((symptom) => symptom.present)
              .map((symptom) => symptom.text),
            duration: current.extracted.duration.raw ?? "2 วัน",
            userGoal: current.extracted.userGoal,
          },
        },
      }),
      caseContext(current.id),
    );
    expect(confirmResponse.status).toBe(200);

    const routeResponse = await routeGeneratePost(
      request(`/api/cases/${current.id}/generate-route`, {
        method: "POST",
        session,
        ip,
        body: {},
      }),
      caseContext(current.id),
    );
    const generated = await envelope<RouteData>(routeResponse);
    if (!generated.success) throw new Error("unknown scheme route generation failed");
    expect(generated.data.case.extracted.scheme).toBe("UNKNOWN");
    expect(generated.data.route.primary).toBeNull();
    expect(generated.data.route.backup?.rightAcceptance).toBe("UNKNOWN");
    expect(generated.data.route.backup?.costSummary).toBe(
      "ยังไม่มีข้อมูลค่าใช้จ่ายที่ยืนยันได้",
    );
    expect(generated.data.route.whyThisRoute.rights.join(" ")).toContain("ยังไม่ทราบสิทธิ");
    expect(JSON.stringify(generated.data.route)).not.toContain("อยู่ภายใต้สิทธิ์สำหรับบริการนี้");
    expectSafePublicPayload(generated);

    await demoResetPost(
      request("/api/demo/reset", {
        method: "POST",
        session,
        ip,
        body: { demoSessionId: session },
      }),
    );
  });
});

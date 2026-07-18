import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { CaseRecordSchema, type MvpCaseRecord } from "@/lib/mvp/contracts";
import {
  MvpStore,
  StorePersistenceUnavailableError,
} from "@/lib/mvp/store";

type WriteCall = {
  table: string;
  operation: "insert" | "upsert";
  payload: unknown;
};

function record(demoSessionId: string | null): MvpCaseRecord {
  const now = new Date().toISOString();
  return CaseRecordSchema.parse({
    id: randomUUID(),
    demoSessionId,
    demoScenarioId: null,
    status: "ready_for_review",
    originalNarrative: "เพลียและต้องการพบแพทย์",
    extracted: {
      patientRelation: "self",
      age: 40,
      sex: "unknown",
      symptoms: [{ text: "เพลีย", present: true, confidence: 1 }],
      duration: { value: 2, unit: "days", raw: "2 วัน" },
      knownConditions: [],
      scheme: "UCS",
      area: { name: "ลาดพร้าว", code: "area:bkk-lat-phrao" },
      preferredTime: null,
      userGoal: "ต้องการพบแพทย์",
      redFlagMentions: [],
      negatedSymptoms: [],
      missingCriticalFields: [],
      overallConfidence: 1,
    },
    safety: {
      emergency: false,
      finalUrgency: "SOON_1_3_DAYS",
      matchedRuleIds: [],
      matchedLabels: [],
      hotline: null,
      messageTh: null,
    },
    questions: [],
    answers: {},
    route: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: demoSessionId ? new Date(Date.now() + 3_600_000).toISOString() : null,
  });
}

function fakeClient(fail?: { table: string; operation: WriteCall["operation"] }) {
  const calls: WriteCall[] = [];
  const response = (call: WriteCall) => {
    calls.push(call);
    return {
      data: null,
      error: fail?.table === call.table && fail.operation === call.operation
        ? new Error(`write failed: ${call.table}`)
        : null,
    };
  };
  const client = {
    from(table: string) {
      return {
        insert: async (payload: unknown) => response({ table, operation: "insert", payload }),
        upsert: async (payload: unknown) => response({ table, operation: "upsert", payload }),
      };
    },
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
  return { client, calls };
}

describe("MvpStore persistence boundary", () => {
  it("fails closed and does not mutate memory when non-demo persistence is unavailable", async () => {
    const value = record(null);
    const store = new MvpStore({ clientFactory: async () => null });

    await expect(store.saveCase(value)).rejects.toBeInstanceOf(StorePersistenceUnavailableError);
    await expect(store.getCase(value.id)).resolves.toBeNull();
  });

  it("propagates Supabase write errors instead of returning a false success", async () => {
    const value = record(null);
    const { client } = fakeClient({ table: "cases", operation: "upsert" });
    const store = new MvpStore({ clientFactory: async () => client });

    await expect(store.saveCase(value)).rejects.toThrow("write failed: cases");
    await expect(store.getCase(value.id)).resolves.toBeNull();
  });

  it("keeps demo cases ephemeral and does not request a database client", async () => {
    const value = record(`demo-${randomUUID()}`);
    const clientFactory = vi.fn(async () => null);
    const store = new MvpStore({ clientFactory, persistDemo: false });

    await expect(store.saveCase(value)).resolves.toMatchObject({ id: value.id });
    await expect(store.getCase(value.id)).resolves.toMatchObject({ id: value.id });
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("durably stores feedback without a facility without inventing a facility", async () => {
    const value = record(null);
    const { client, calls } = fakeClient();
    const store = new MvpStore({ clientFactory: async () => client });
    await store.saveCase(value);
    calls.length = 0;

    await expect(store.saveFeedback({
      caseId: value.id,
      facilityId: null,
      routeId: null,
      outcome: "DID_NOT_GO",
      rightAccepted: null,
      discrepancy: null,
    })).resolves.toMatchObject({ facilityId: null, outcome: "DID_NOT_GO" });

    expect(calls.map((call) => `${call.table}:${call.operation}`)).toEqual([
      "facility_access_feedback:insert",
    ]);
    const feedback = calls[0]?.payload as Record<string, unknown>;
    expect(feedback.facility_id).toBeNull();
  });

  it("opportunistically persists an expiring demo snapshot when a client is configured", async () => {
    const value = record(`demo-${randomUUID()}`);
    const { client, calls } = fakeClient();
    const store = new MvpStore({ clientFactory: async () => client });

    await store.saveCase(value);

    expect(calls.map((call) => `${call.table}:${call.operation}`)).toEqual([
      "cases:upsert",
      "case_slots:upsert",
    ]);
    const persistedCase = calls[0]?.payload as Record<string, unknown>;
    expect(persistedCase.demo_session_id).toBe(value.demoSessionId);
    expect(persistedCase.expires_at).toBe(value.expiresAt);
  });
});

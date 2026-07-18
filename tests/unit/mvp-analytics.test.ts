import { describe, expect, it } from "vitest";
import { computeCaseMetrics } from "@/lib/mvp/analytics";
import type { AuditEntry } from "@/lib/mvp/store";

function event(eventType: string, seconds: number, payload: Record<string, unknown> = {}): AuditEntry {
  return {
    id: crypto.randomUUID(),
    caseId: "case:pseudonymous",
    eventType,
    payload,
    createdAt: new Date(Date.UTC(2026, 6, 18, 3, 0, seconds)).toISOString(),
  };
}

describe("PII-safe case analytics", () => {
  it("derives booth metrics from event metadata without narrative content", () => {
    const metrics = computeCaseMetrics([
      event("demo_started", 0),
      event("narrative_submitted", 1, { questionCount: 1 }),
      event("clarification_completed", 2, { questionCount: 1 }),
      event("route_generated", 5, { success: true }),
      event("route_primary_navigated", 6, { routeType: "PRIMARY" }),
      event("passport_created", 7, { version: 1 }),
      event("feedback_submitted", 8, { outcome: "RECEIVED_AS_PLANNED", rightAccepted: true }),
    ]);
    expect(metrics).toMatchObject({
      timeToRouteMs: 5_000,
      questionsPerCase: 1,
      routeGenerationSuccess: true,
      passportConversion: true,
      actionClickCount: 1,
      actionClickRate: 1,
      routeCompletion: true,
      rightAcceptanceSuccess: true,
    });
  });
});

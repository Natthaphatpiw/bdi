import type { AuditEntry } from "./store";

export const CLIENT_ANALYTICS_EVENTS = [
  "route_primary_called",
  "route_primary_navigated",
  "why_route_opened",
  "evidence_opened",
] as const;

export type ClientAnalyticsEvent = (typeof CLIENT_ANALYTICS_EVENTS)[number];

export interface CaseMetrics {
  timeToRouteMs: number | null;
  questionsPerCase: number;
  routeGenerationSuccess: boolean;
  passportConversion: boolean;
  actionClickCount: number;
  actionClickRate: number;
  routeCompletion: boolean;
  rightAcceptanceSuccess: boolean | null;
}

/** Derives booth-validation metrics from pseudonymous audit events only. */
export function computeCaseMetrics(events: AuditEntry[]): CaseMetrics {
  const ordered = [...events].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const started = ordered.find((event) => event.eventType === "narrative_submitted" || event.eventType === "demo_started");
  const routed = ordered.find((event) => event.eventType === "route_generated");
  const clarification = ordered.find((event) => event.eventType === "clarification_completed");
  const feedback = [...ordered].reverse().find((event) => event.eventType === "feedback_submitted");
  const timeToRouteMs = started && routed
    ? Math.max(0, Date.parse(routed.createdAt) - Date.parse(started.createdAt))
    : null;
  const feedbackOutcome = typeof feedback?.payload.outcome === "string" ? feedback.payload.outcome : null;
  const completedOutcomes = new Set(["RECEIVED_AS_PLANNED", "RECEIVED_WITH_EXTRA_COST"]);
  const actionClickCount = ordered.filter((event) => event.eventType === "route_primary_called" || event.eventType === "route_primary_navigated").length;
  return {
    timeToRouteMs,
    questionsPerCase: numeric(clarification?.payload.questionCount) ?? numeric(started?.payload.questionCount) ?? 0,
    routeGenerationSuccess: routed?.payload.success === true,
    passportConversion: ordered.some((event) => event.eventType === "passport_created"),
    actionClickCount,
    actionClickRate: routed ? (actionClickCount > 0 ? 1 : 0) : 0,
    routeCompletion: Boolean(feedbackOutcome && completedOutcomes.has(feedbackOutcome)),
    rightAcceptanceSuccess: typeof feedback?.payload.rightAccepted === "boolean" ? feedback.payload.rightAccepted : null,
  };
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

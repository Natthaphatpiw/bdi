import { NextRequest } from "next/server";
import { allowRequest } from "@/lib/rateLimit";
import { TurnCaseInputSchema } from "@/lib/mvp/api-schemas";
import { handleMvpRouteError, normalizedId, NO_STORE_HEADERS, ok, parseBody, serviceAccess } from "@/lib/mvp/api-route";
import { MvpServiceError, turnCase } from "@/lib/mvp/service";
import type { MvpCaseRecord } from "@/lib/mvp/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!allowRequest(request, "mvp-case-turn", { limit: 30 })) throw new MvpServiceError("RATE_LIMITED", "มีคำขอมากเกินไป กรุณารอสักครู่", 429, true);
    const id = normalizedId((await params).id, "รหัสเคส");
    const input = await parseBody(request, TurnCaseInputSchema);
    const result = await turnCase(id, input, await serviceAccess(request));
    return ok({
      ...result,
      status: result.case.status,
      extractedSlots: result.case.extracted,
      questions: result.case.questions,
      safetyState: result.case.safety,
      nextAction: nextAction(result.case),
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return handleMvpRouteError(error);
  }
}

function nextAction(record: MvpCaseRecord):
  | "CALL_1669"
  | "ANSWER_QUESTIONS"
  | "REVIEW_CASE"
  | "WAIT_FOR_ROUTE"
  | "VIEW_ROUTE"
  | "VIEW_PASSPORT"
  | "NONE" {
  if (record.safety.emergency || record.status === "emergency_escalated") return "CALL_1669";
  if (record.questions.length > 0 || record.status === "collecting_information") return "ANSWER_QUESTIONS";
  if (record.status === "processing") return "WAIT_FOR_ROUTE";
  if (record.status === "route_ready") return "VIEW_ROUTE";
  if (record.status === "passport_ready") return "VIEW_PASSPORT";
  if (record.status === "closed") return "NONE";
  return "REVIEW_CASE";
}

import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { allowRequest } from "@/lib/rateLimit";
import { CreateCaseInputSchema } from "@/lib/mvp/api-schemas";
import {
  attachDemoSession,
  handleMvpRouteError,
  NO_STORE_HEADERS,
  ok,
  parseBody,
  requireUserId,
} from "@/lib/mvp/api-route";
import { createCase, MvpServiceError } from "@/lib/mvp/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    if (!allowRequest(request, "mvp-create-case", { limit: 12 })) {
      throw new MvpServiceError("RATE_LIMITED", "มีคำขอมากเกินไป กรุณารอสักครู่แล้วลองใหม่", 429, true);
    }
    const input = await parseBody(request, CreateCaseInputSchema);
    if (input.demo) {
      if (process.env.NODE_ENV === "production" && !env.demoMode) {
        throw new MvpServiceError("DEMO_DISABLED", "ขณะนี้ไม่ได้เปิดโหมดสาธิต", 403);
      }
      if (!input.demoSessionId) {
        throw new MvpServiceError("DEMO_SESSION_REQUIRED", "กรุณาเริ่มโหมดสาธิตใหม่", 400);
      }
      const data = await createCase(input, { demoSessionId: input.demoSessionId });
      return attachDemoSession(ok(data, { headers: NO_STORE_HEADERS }), input.demoSessionId);
    }

    if (input.demoScenarioId || input.demoSessionId) {
      throw new MvpServiceError("INVALID_MODE", "ข้อมูลโหมดสาธิตไม่ตรงกับคำขอ", 400);
    }
    const ownerUserId = await requireUserId(request);
    return ok(await createCase(input, { ownerUserId }), { headers: NO_STORE_HEADERS });
  } catch (error) {
    return handleMvpRouteError(error);
  }
}

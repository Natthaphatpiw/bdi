import { NextRequest } from "next/server";
import { allowRequest } from "@/lib/rateLimit";
import { ResetDemoInputSchema } from "@/lib/mvp/api-schemas";
import {
  clearDemoSession,
  demoSessionFromRequest,
  handleMvpRouteError,
  NO_STORE_HEADERS,
  ok,
  parseBody,
} from "@/lib/mvp/api-route";
import { MvpServiceError, resetDemo } from "@/lib/mvp/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    if (!allowRequest(request, "mvp-reset-demo", { limit: 20 })) throw new MvpServiceError("RATE_LIMITED", "เริ่มใหม่ถี่เกินไป กรุณารอสักครู่", 429, true);
    const input = await parseBody(request, ResetDemoInputSchema);
    const cookieSession = demoSessionFromRequest(request);
    if (!cookieSession || cookieSession !== input.demoSessionId) {
      throw new MvpServiceError("DEMO_SESSION_MISMATCH", "เซสชันโหมดสาธิตไม่ตรงกัน กรุณารีเฟรชหน้า", 403);
    }
    const result = await resetDemo(input.demoSessionId, { demoSessionId: cookieSession });
    return clearDemoSession(ok(result, { headers: NO_STORE_HEADERS }));
  } catch (error) {
    return handleMvpRouteError(error);
  }
}

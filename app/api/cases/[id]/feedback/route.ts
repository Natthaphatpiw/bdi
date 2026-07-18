import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { allowRequest } from "@/lib/rateLimit";
import { FeedbackInputSchema } from "@/lib/mvp/api-schemas";
import { handleMvpRouteError, normalizedId, NO_STORE_HEADERS, ok, parseBody, serviceAccess } from "@/lib/mvp/api-route";
import { MvpServiceError, submitFeedback } from "@/lib/mvp/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!env.enableFacilityFeedback) throw new MvpServiceError("FEEDBACK_DISABLED", "ขณะนี้ยังไม่เปิดรับผลการใช้บริการ", 403);
    if (!allowRequest(request, "mvp-feedback", { limit: 20 })) throw new MvpServiceError("RATE_LIMITED", "ส่งข้อมูลถี่เกินไป กรุณารอสักครู่", 429, true);
    const id = normalizedId((await params).id, "รหัสเคส");
    const input = await parseBody(request, FeedbackInputSchema);
    return ok(await submitFeedback(id, input, await serviceAccess(request)), { headers: NO_STORE_HEADERS });
  } catch (error) {
    return handleMvpRouteError(error);
  }
}

import { NextRequest } from "next/server";
import { allowRequest } from "@/lib/rateLimit";
import { TrackEventInputSchema } from "@/lib/mvp/api-schemas";
import { handleMvpRouteError, normalizedId, NO_STORE_HEADERS, ok, parseBody, serviceAccess } from "@/lib/mvp/api-route";
import { MvpServiceError, trackEvent } from "@/lib/mvp/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!allowRequest(request, "mvp-case-event", { limit: 60 })) {
      throw new MvpServiceError("RATE_LIMITED", "บันทึกการใช้งานถี่เกินไป กรุณารอสักครู่", 429, true);
    }
    const id = normalizedId((await params).id, "รหัสเคส");
    const input = await parseBody(request, TrackEventInputSchema);
    return ok(await trackEvent(id, input.event, input.payload ?? {}, await serviceAccess(request)), { headers: NO_STORE_HEADERS });
  } catch (error) {
    return handleMvpRouteError(error);
  }
}

import { NextRequest } from "next/server";
import { allowRequest } from "@/lib/rateLimit";
import { handleMvpRouteError, normalizedId, NO_STORE_HEADERS, ok, serviceAccess } from "@/lib/mvp/api-route";
import { getRoute, MvpServiceError } from "@/lib/mvp/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!allowRequest(request, "mvp-get-route", { limit: 60 })) throw new MvpServiceError("RATE_LIMITED", "มีคำขอมากเกินไป กรุณาลองใหม่", 429, true);
    const id = normalizedId((await params).id, "รหัสเคส");
    return ok(await getRoute(id, await serviceAccess(request)), { headers: NO_STORE_HEADERS });
  } catch (error) {
    return handleMvpRouteError(error);
  }
}

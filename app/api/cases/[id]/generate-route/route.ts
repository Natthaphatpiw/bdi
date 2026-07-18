import { NextRequest } from "next/server";
import { allowRequest } from "@/lib/rateLimit";
import { handleMvpRouteError, normalizedId, NO_STORE_HEADERS, ok, serviceAccess } from "@/lib/mvp/api-route";
import { generateRoute, MvpServiceError } from "@/lib/mvp/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!allowRequest(request, "mvp-generate-route", { limit: 10 })) throw new MvpServiceError("RATE_LIMITED", "มีคำขอประมวลผลมากเกินไป กรุณารอสักครู่", 429, true);
    const id = normalizedId((await params).id, "รหัสเคส");
    return ok(await generateRoute(id, await serviceAccess(request)), { headers: NO_STORE_HEADERS });
  } catch (error) {
    return handleMvpRouteError(error);
  }
}

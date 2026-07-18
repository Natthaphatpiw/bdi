import { NextRequest } from "next/server";
import { allowRequest } from "@/lib/rateLimit";
import { ConfirmCaseInputSchema } from "@/lib/mvp/api-schemas";
import { handleMvpRouteError, normalizedId, NO_STORE_HEADERS, ok, parseBody, serviceAccess } from "@/lib/mvp/api-route";
import { confirmCase, MvpServiceError } from "@/lib/mvp/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!allowRequest(request, "mvp-case-confirm", { limit: 20 })) throw new MvpServiceError("RATE_LIMITED", "มีคำขอมากเกินไป กรุณารอสักครู่", 429, true);
    const id = normalizedId((await params).id, "รหัสเคส");
    const input = await parseBody(request, ConfirmCaseInputSchema);
    return ok(await confirmCase(id, input, await serviceAccess(request)), { headers: NO_STORE_HEADERS });
  } catch (error) {
    return handleMvpRouteError(error);
  }
}

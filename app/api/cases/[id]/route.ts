import { NextRequest } from "next/server";
import { allowRequest } from "@/lib/rateLimit";
import {
  handleMvpRouteError,
  normalizedId,
  NO_STORE_HEADERS,
  ok,
  serviceAccess,
} from "@/lib/mvp/api-route";
import { deleteCase, getCase, MvpServiceError } from "@/lib/mvp/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    if (!allowRequest(request, "mvp-get-case", { limit: 60 })) throw new MvpServiceError("RATE_LIMITED", "มีคำขอมากเกินไป กรุณาลองใหม่", 429, true);
    const id = normalizedId((await context.params).id, "รหัสเคส");
    return ok(await getCase(id, await serviceAccess(request)), { headers: NO_STORE_HEADERS });
  } catch (error) {
    return handleMvpRouteError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    if (!allowRequest(request, "mvp-delete-case", { limit: 12 })) throw new MvpServiceError("RATE_LIMITED", "มีคำขอมากเกินไป กรุณาลองใหม่", 429, true);
    const id = normalizedId((await context.params).id, "รหัสเคส");
    return ok(await deleteCase(id, await serviceAccess(request)), { headers: NO_STORE_HEADERS });
  } catch (error) {
    return handleMvpRouteError(error);
  }
}

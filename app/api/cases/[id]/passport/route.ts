import { NextRequest } from "next/server";
import { allowRequest } from "@/lib/rateLimit";
import { CreatePassportInputSchema } from "@/lib/mvp/api-schemas";
import { handleMvpRouteError, normalizedId, NO_STORE_HEADERS, ok, parseBody, serviceAccess } from "@/lib/mvp/api-route";
import { createPassport, MvpServiceError } from "@/lib/mvp/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!allowRequest(request, "mvp-create-passport", { limit: 12 })) throw new MvpServiceError("RATE_LIMITED", "สร้างข้อมูลสรุปถี่เกินไป กรุณารอสักครู่", 429, true);
    const id = normalizedId((await params).id, "รหัสเคส");
    const input = await parseBody(request, CreatePassportInputSchema);
    return ok(await createPassport(id, input, await serviceAccess(request)), { headers: NO_STORE_HEADERS });
  } catch (error) {
    return handleMvpRouteError(error);
  }
}

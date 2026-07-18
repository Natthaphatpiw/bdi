import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { allowRequest } from "@/lib/rateLimit";
import { CreateShareInputSchema } from "@/lib/mvp/api-schemas";
import { handleMvpRouteError, normalizedId, NO_STORE_HEADERS, ok, parseBody, serviceAccess } from "@/lib/mvp/api-route";
import { MvpServiceError, revokePassportShare, sharePassport } from "@/lib/mvp/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  try {
    if (!env.enablePassportShare) throw new MvpServiceError("SHARING_DISABLED", "ขณะนี้ยังไม่เปิดการแชร์ข้อมูล", 403);
    if (!allowRequest(request, "mvp-share-passport", { limit: 10 })) throw new MvpServiceError("RATE_LIMITED", "สร้างลิงก์ถี่เกินไป กรุณารอสักครู่", 429, true);
    const id = normalizedId((await params).id, "รหัส Passport");
    const input = await parseBody(request, CreateShareInputSchema);
    return ok(await sharePassport(id, input, await serviceAccess(request)), { headers: NO_STORE_HEADERS });
  } catch (error) {
    return handleMvpRouteError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    if (!allowRequest(request, "mvp-revoke-passport", { limit: 20 })) throw new MvpServiceError("RATE_LIMITED", "มีคำขอมากเกินไป กรุณารอสักครู่", 429, true);
    const id = normalizedId((await params).id, "รหัส Passport");
    return ok(await revokePassportShare(id, await serviceAccess(request)), { headers: NO_STORE_HEADERS });
  } catch (error) {
    return handleMvpRouteError(error);
  }
}

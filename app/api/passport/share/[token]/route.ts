import { NextRequest } from "next/server";
import { allowRequest } from "@/lib/rateLimit";
import { handleMvpRouteError, normalizedId, ok } from "@/lib/mvp/api-route";
import { getSharedPassport, MvpServiceError } from "@/lib/mvp/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHARE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    if (!allowRequest(request, "mvp-public-passport", { limit: 60 })) throw new MvpServiceError("RATE_LIMITED", "มีคำขอมากเกินไป กรุณาลองใหม่", 429, true);
    const token = normalizedId((await params).token, "ลิงก์แชร์");
    return ok(await getSharedPassport(token), { headers: SHARE_HEADERS });
  } catch (error) {
    const response = handleMvpRouteError(error);
    for (const [key, value] of Object.entries(SHARE_HEADERS)) response.headers.set(key, value);
    return response;
  }
}

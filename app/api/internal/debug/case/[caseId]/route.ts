import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { allowRequest } from "@/lib/rateLimit";
import { handleMvpRouteError, normalizedId, NO_STORE_HEADERS, ok, requireUserId } from "@/lib/mvp/api-route";
import { debugCase, MvpServiceError } from "@/lib/mvp/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
  try {
    if (process.env.NODE_ENV !== "development" && !env.adminDebug) throw new MvpServiceError("DEBUG_DISABLED", "ไม่ได้เปิดหน้าตรวจสอบภายใน", 404);
    if (!allowRequest(request, "mvp-internal-debug", { limit: 30 })) throw new MvpServiceError("RATE_LIMITED", "มีคำขอมากเกินไป", 429, true);
    if (process.env.NODE_ENV !== "development") {
      const userId = await requireUserId(request);
      if (!env.adminUserIds.includes(userId)) throw new MvpServiceError("FORBIDDEN", "ไม่มีสิทธิ์เข้าถึงส่วนผู้ดูแลระบบ", 403);
    }
    const caseId = normalizedId((await params).caseId, "รหัสเคส");
    return ok(await debugCase(caseId, { internal: true }), { headers: { ...NO_STORE_HEADERS, "X-Robots-Tag": "noindex, nofollow, noarchive" } });
  } catch (error) {
    return handleMvpRouteError(error);
  }
}

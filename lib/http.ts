// API route helpers: JSON responses, standard error envelope, and bearer auth.
import { NextRequest, NextResponse } from "next/server";
import type { ApiError } from "./types";
import { getUserFromRequest, type AuthedUser } from "./supabase/server";
import { env } from "./env";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(
  status: number,
  code: string,
  message_th: string,
  retryable = false
) {
  const body: { error: ApiError } = { error: { code, message_th, retryable } };
  return NextResponse.json(body, { status });
}

export const ERR = {
  unauthorized: () =>
    fail(401, "unauthorized", "กรุณาเข้าสู่ระบบก่อนใช้งาน", false),
  badRequest: (msg = "คำขอไม่ถูกต้อง") => fail(400, "bad_request", msg, false),
  notFound: (msg = "ไม่พบข้อมูล") => fail(404, "not_found", msg, false),
  tooMany: () => fail(429, "rate_limited", "มีคำขอมากเกินไป กรุณารอสักครู่แล้วลองใหม่", true),
  server: (msg = "ระบบมีปัญหาชั่วคราว ลองใหม่อีกครั้ง") =>
    fail(500, "server_error", msg, true),
};

/** Resolve the Supabase user from the Authorization header (RLS-aware). */
export async function requireUser(
  req: NextRequest
): Promise<{ user: AuthedUser; token: string } | NextResponse> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return ERR.unauthorized();
  const user = await getUserFromRequest(token);
  if (!user) return ERR.unauthorized();
  return { user, token };
}

/** Like requireUser, but also enforces the ADMIN_USER_IDS allow-list. */
export async function requireAdmin(
  req: NextRequest
): Promise<{ user: AuthedUser; token: string } | NextResponse> {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  if (env.adminUserIds.length === 0 || !env.adminUserIds.includes(auth.user.id)) {
    return fail(403, "forbidden", "ไม่มีสิทธิ์เข้าถึงส่วนผู้ดูแลระบบ", false);
  }
  return auth;
}

export function wantsStream(req: NextRequest): boolean {
  return (req.headers.get("accept") || "").includes("text/event-stream");
}

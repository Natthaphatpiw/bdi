import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { apiFailure, apiSuccess, safeJson } from "@/lib/apiEnvelope";
import { getUserFromRequest } from "@/lib/supabase/server";
import { MvpServiceError, type ServiceAccessContext } from "./service";

export const DEMO_SESSION_COOKIE = "rrs_demo_session";
export const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" } as const;

export async function parseBody<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  const body = await safeJson<unknown>(request);
  if (body === null) throw new MvpServiceError("INVALID_JSON", "รูปแบบคำขอไม่ถูกต้อง", 400);
  return schema.parse(body);
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return apiSuccess(data, init);
}

export function handleMvpRouteError(error: unknown): NextResponse {
  let response: NextResponse;
  if (error instanceof MvpServiceError) {
    response = apiFailure(error.status, error.code, error.userMessage, error.retryable);
  } else if (error instanceof ZodError) {
    response = apiFailure(400, "INVALID_INPUT", "ข้อมูลบางส่วนไม่ถูกต้องหรือยาวเกินกำหนด", false);
  } else {
    // Do not echo provider/database errors or stack traces to the client.
    console.error("[mvp-api] request failed", error instanceof Error ? error.name : "UnknownError");
    response = apiFailure(500, "INTERNAL_ERROR", "ระบบมีปัญหาชั่วคราว กรุณาลองใหม่", true);
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export function normalizedId(value: string, label = "รหัส"): string {
  let id = "";
  try {
    id = decodeURIComponent(value).trim();
  } catch {
    throw new MvpServiceError("INVALID_ID", `${label}ไม่ถูกต้อง`, 400);
  }
  if (!id || id.length > 256 || /[\u0000-\u001F]/.test(id)) {
    throw new MvpServiceError("INVALID_ID", `${label}ไม่ถูกต้อง`, 400);
  }
  return id;
}

export function demoSessionFromRequest(request: NextRequest): string | null {
  return request.cookies.get(DEMO_SESSION_COOKIE)?.value ?? null;
}

export function attachDemoSession(response: NextResponse, demoSessionId: string): NextResponse {
  response.cookies.set(DEMO_SESSION_COOKIE, demoSessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  return response;
}

export function clearDemoSession(response: NextResponse): NextResponse {
  response.cookies.set(DEMO_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function optionalUserId(request: NextRequest): Promise<string | null> {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  return (await getUserFromRequest(authorization.slice(7)))?.id ?? null;
}

export async function requireUserId(request: NextRequest): Promise<string> {
  const userId = await optionalUserId(request);
  if (!userId) throw new MvpServiceError("UNAUTHORIZED", "กรุณาเข้าสู่ระบบก่อนใช้งาน", 401);
  return userId;
}

export async function serviceAccess(request: NextRequest): Promise<ServiceAccessContext> {
  return {
    ownerUserId: await optionalUserId(request),
    demoSessionId: demoSessionFromRequest(request),
  };
}

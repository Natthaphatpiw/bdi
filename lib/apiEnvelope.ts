import { NextResponse } from "next/server";
import type { ApiEnvelope } from "./mvp/contracts";

function requestId(): string {
  return crypto.randomUUID();
}

export function apiSuccess<T>(data: T, init?: ResponseInit): NextResponse<ApiEnvelope<T>> {
  return NextResponse.json(
    { success: true, data, error: null, requestId: requestId() },
    init,
  );
}

export function apiFailure(
  status: number,
  code: string,
  message: string,
  retryable = false,
  headers?: HeadersInit,
): NextResponse<ApiEnvelope<never>> {
  return NextResponse.json(
    {
      success: false,
      data: null,
      error: { code, message, retryable },
      requestId: requestId(),
    },
    { status, headers },
  );
}

export const API_ERROR = {
  badRequest: (message = "คำขอไม่ถูกต้อง") => apiFailure(400, "BAD_REQUEST", message),
  notFound: (message = "ไม่พบข้อมูล") => apiFailure(404, "NOT_FOUND", message),
  forbidden: (message = "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้") => apiFailure(403, "FORBIDDEN", message),
  conflict: (message: string) => apiFailure(409, "INVALID_STATE", message),
  rateLimited: () =>
    apiFailure(429, "RATE_LIMITED", "มีคำขอมากเกินไป กรุณารอสักครู่แล้วลองใหม่", true),
  server: (message = "ระบบมีปัญหาชั่วคราว กรุณาลองใหม่") =>
    apiFailure(500, "INTERNAL_ERROR", message, true),
};

export async function safeJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

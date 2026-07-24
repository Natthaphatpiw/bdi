// Server-side helpers ของ QR staff view (ภาคเสริม 4 §3)
// Token: สุ่ม 32 bytes (256-bit) → เก็บเฉพาะ sha256 hash · default อายุ 30 วัน
// การ resolve ทำด้วย service role เท่านั้น (ไม่มี anon RLS policy) และ log
// ทุกการเปิดลง audit_log
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "./supabase/server";
import type { PassportAudience, PassportData } from "./types";

export const PASSPORT_TOKEN_TTL_DAYS = 30;

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export interface CreatedShare {
  token: string; // ส่งให้ client ครั้งเดียว — ไม่ถูกเก็บดิบ
  token_id: string;
  passport_id: string;
  expires_at: string;
}

/** สร้าง snapshot + token (ผ่าน userClient — RLS ผูกเจ้าของ) */
export async function createPassportShare(
  sb: SupabaseClient,
  userId: string,
  sessionId: string | null,
  passport: PassportData,
  audience: PassportAudience
): Promise<CreatedShare> {
  const { data: snapshot, error: snapErr } = await sb
    .from("shared_passports")
    .insert({ user_id: userId, session_id: sessionId, audience, passport })
    .select("id")
    .single();
  if (snapErr || !snapshot) throw new Error(snapErr?.message ?? "snapshot insert failed");

  const raw = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + PASSPORT_TOKEN_TTL_DAYS * 24 * 3600 * 1000).toISOString();
  const { data: tokenRow, error: tokenErr } = await sb
    .from("passport_tokens")
    .insert({ passport_id: snapshot.id, token_hash: hashToken(raw), expires_at: expiresAt })
    .select("id")
    .single();
  if (tokenErr || !tokenRow) throw new Error(tokenErr?.message ?? "token insert failed");

  return { token: raw, token_id: tokenRow.id, passport_id: snapshot.id, expires_at: expiresAt };
}

export type ResolvedShare =
  | { status: "ok"; passport: PassportData; audience: PassportAudience }
  | { status: "expired" }   // รวม revoked — ผู้เปิดไม่ต้องรู้ความต่าง (no leak)
  | { status: "not_found" };

/** Resolve token (service role) + log การเปิดลง audit_log */
export async function resolvePassportShare(rawToken: string, userAgent?: string): Promise<ResolvedShare> {
  if (!rawToken || rawToken.length < 20) return { status: "not_found" };
  const admin = adminClient();
  const { data } = await admin
    .from("passport_tokens")
    .select("id, expires_at, revoked_at, shared_passports(id, user_id, session_id, audience, passport)")
    .eq("token_hash", hashToken(rawToken))
    .maybeSingle();
  if (!data) return { status: "not_found" };

  const snapshot = data.shared_passports as unknown as {
    id: string;
    user_id: string;
    session_id: string | null;
    audience: PassportAudience;
    passport: PassportData;
  } | null;
  if (!snapshot) return { status: "not_found" };

  // log ทุกการเปิด (รวม expired) — telemetry ตาม spec §3; รายละเอียดอยู่ใน
  // rule_traces (โครงตาราง audit เดิมไม่มีช่อง payload แยก)
  try {
    await admin.from("audit_log").insert({
      session_id: snapshot.session_id,
      user_id: snapshot.user_id,
      queries_run: ["passport_share_opened"],
      rule_traces: [
        {
          event: "passport_share_opened",
          at: new Date().toISOString(),
          ua: (userAgent ?? "").slice(0, 200),
          token_id: data.id,
        },
      ],
      citations: [],
      prescreen_result: null,
    });
  } catch {
    /* best-effort — การเปิดดูต้องไม่ล้มเพราะ log */
  }

  if (data.revoked_at || Date.parse(data.expires_at) <= Date.now()) return { status: "expired" };
  return { status: "ok", passport: snapshot.passport, audience: snapshot.audience };
}

/** เพิกถอน token ของตัวเอง (userClient — RLS บังคับเจ้าของ) */
export async function revokePassportShare(sb: SupabaseClient, tokenId: string): Promise<boolean> {
  const { error } = await sb
    .from("passport_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId);
  return !error;
}

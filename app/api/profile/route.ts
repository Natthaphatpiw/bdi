import { NextRequest } from "next/server";
import { ok, ERR, requireUser } from "@/lib/http";
import { userClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const sb = userClient(auth.token);
  const { data, error } = await sb
    .from("profiles")
    .select("birth_year, scheme, area_code, sss_section, receives_state_pension, emergency_phone, conditions_meds")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) return ERR.server();
  const profile: Profile = data ?? {
    birth_year: null,
    scheme: null,
    area_code: null,
    sss_section: null,
    receives_state_pension: null,
    emergency_phone: null,
    conditions_meds: null,
  };
  return ok(profile);
}

export async function PUT(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  let body: Partial<Profile>;
  try {
    body = (await req.json()) as Partial<Profile>;
  } catch {
    return ERR.badRequest();
  }
  // partial update — เซ็ตเฉพาะ field ที่ client ส่งมา เพื่อให้จุดที่บันทึก
  // ทีละช่อง (เช่น Emergency Co-pilot จำเบอร์โทรกลับ) ไม่ล้าง field อื่น
  const row: Record<string, unknown> = {
    user_id: auth.user.id,
    updated_at: new Date().toISOString(),
  };
  if ("birth_year" in body) row.birth_year = body.birth_year ?? null;
  if ("scheme" in body) row.scheme = body.scheme ?? null;
  if ("area_code" in body) row.area_code = body.area_code ?? null;
  if ("sss_section" in body) row.sss_section = body.sss_section ?? null;
  if ("receives_state_pension" in body) row.receives_state_pension = body.receives_state_pension ?? null;
  if ("emergency_phone" in body) row.emergency_phone = body.emergency_phone ?? null;
  if ("conditions_meds" in body) row.conditions_meds = body.conditions_meds ?? null;
  const sb = userClient(auth.token);
  const { data, error } = await sb.from("profiles").upsert(row).select().single();
  if (error) {
    console.error("[profile] upsert:", error.message);
    return ERR.server();
  }
  return ok(data);
}

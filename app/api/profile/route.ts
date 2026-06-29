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
    .select("birth_year, scheme, area_code, sss_section, receives_state_pension")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) return ERR.server();
  const profile: Profile = data ?? {
    birth_year: null,
    scheme: null,
    area_code: null,
    sss_section: null,
    receives_state_pension: null,
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
  const row = {
    user_id: auth.user.id,
    birth_year: body.birth_year ?? null,
    scheme: body.scheme ?? null,
    area_code: body.area_code ?? null,
    sss_section: body.sss_section ?? null,
    receives_state_pension: body.receives_state_pension ?? null,
    updated_at: new Date().toISOString(),
  };
  const sb = userClient(auth.token);
  const { data, error } = await sb.from("profiles").upsert(row).select().single();
  if (error) {
    console.error("[profile] upsert:", error.message);
    return ERR.server();
  }
  return ok(data);
}

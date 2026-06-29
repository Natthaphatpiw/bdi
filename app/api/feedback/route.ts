import { NextRequest } from "next/server";
import { ok, ERR, requireUser } from "@/lib/http";
import { userClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/feedback { session_id, rating, note }
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  let body: { session_id?: string; rating?: number; note?: string };
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest();
  }
  if (!body.session_id) return ERR.badRequest("ต้องมี session_id");
  const sb = userClient(auth.token);
  const { error } = await sb.from("feedback").insert({
    session_id: body.session_id,
    rating: body.rating ?? null,
    note: body.note ?? null,
  });
  if (error) {
    console.error("[feedback]", error.message);
    return ERR.server();
  }
  return ok({ saved: true });
}

import { NextRequest } from "next/server";
import { ok, ERR, requireUser } from "@/lib/http";
import { userClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/sessions → recent sessions with a short preview (for History)
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const sb = userClient(auth.token);

  const { data: sessions, error } = await sb
    .from("sessions")
    .select("id, channel, status, started_at")
    .eq("user_id", auth.user.id)
    .order("started_at", { ascending: false })
    .limit(30);
  if (error) return ERR.server();

  // first user message as preview
  const out = await Promise.all(
    (sessions ?? []).map(async (s) => {
      const { data: msg } = await sb
        .from("messages")
        .select("content")
        .eq("session_id", s.id)
        .eq("role", "user")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return {
        id: s.id,
        channel: s.channel,
        status: s.status,
        started_at: s.started_at,
        preview: (msg?.content as string | null)?.slice(0, 80) ?? "(ยังไม่มีข้อความ)",
      };
    })
  );
  return ok({ sessions: out });
}

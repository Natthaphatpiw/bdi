import { NextRequest } from "next/server";
import { ok, ERR, requireUser } from "@/lib/http";
import { userClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/session/:id/messages → chat history (RLS-scoped to owner)
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { token } = auth;
  const { id } = await ctx.params;

  const sb = userClient(token);
  const { data, error } = await sb
    .from("messages")
    .select("id, role, content, created_at")
    .eq("session_id", id)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error("[messages] select:", error.message);
    return ERR.server();
  }
  // parse assistant card payloads back to objects when present
  const messages = (data ?? []).map((m) => {
    let cards: unknown = undefined;
    const c = m.content?.trim() ?? "";
    if (m.role === "assistant" && (c.startsWith("[") || c.startsWith("{"))) {
      try {
        const parsed = JSON.parse(c);
        cards = Array.isArray(parsed) ? parsed : parsed.cards;
      } catch {
        /* keep as text */
      }
    }
    return { id: m.id, role: m.role, content: cards ? "" : m.content, cards, created_at: m.created_at };
  });
  return ok({ session_id: id, messages });
}

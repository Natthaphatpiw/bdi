import type { SupabaseClient } from "@supabase/supabase-js";
import type { Card, CaseSnapshot, Understood } from "./types";

function parseCards(content?: string | null): Card[] {
  const raw = (content ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as Card[];
    if (Array.isArray(parsed?.cards)) return parsed.cards as Card[];
  } catch {
    // Plain assistant text is not a dashboard result.
  }
  return [];
}

export async function loadCaseSnapshot(
  sb: SupabaseClient,
  sessionId: string
): Promise<CaseSnapshot | null> {
  const { data: session, error: sessionError } = await sb
    .from("sessions")
    .select("id, channel, started_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError || !session) return null;

  const [{ data: state }, { data: assistantMsgs }, { data: firstUser }, { data: audit }] =
    await Promise.all([
      sb.from("session_state").select("slots").eq("session_id", sessionId).maybeSingle(),
      sb
        .from("messages")
        .select("content, created_at")
        .eq("session_id", sessionId)
        .eq("role", "assistant")
        .order("created_at", { ascending: false })
        .limit(12),
      sb
        .from("messages")
        .select("content")
        .eq("session_id", sessionId)
        .eq("role", "user")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      sb
        .from("audit_log")
        .select("queries_run, rule_traces, citations, prescreen_result")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  let cards: Card[] = [];
  for (const msg of assistantMsgs ?? []) {
    cards = parseCards(msg.content as string | null);
    if (cards.length) break;
  }

  return {
    session_id: sessionId,
    channel: session.channel,
    started_at: session.started_at,
    preview: (firstUser?.content as string | undefined)?.slice(0, 160),
    understood: ((state?.slots as Understood | null) ?? {}) as Understood,
    cards,
    audit: audit
      ? {
          queries_run: (audit.queries_run as string[] | null) ?? undefined,
          rule_traces: (audit.rule_traces as unknown[] | null) ?? undefined,
          citations:
            (audit.citations as { title: string; url: string; publisher: string }[] | null) ??
            undefined,
          prescreen_result: audit.prescreen_result,
        }
      : undefined,
  };
}

import { NextRequest } from "next/server";
import { ERR, ok, requireUser, wantsStream } from "@/lib/http";
import { userClient, adminClient } from "@/lib/supabase/server";
import { transcribeAudio } from "@/lib/gemini";
import { runTurn } from "@/lib/orchestrator";
import type { Profile, TurnRequest, TurnResponse, Understood, Card } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { user, token } = auth;

  let body: TurnRequest;
  try {
    body = (await req.json()) as TurnRequest;
  } catch {
    return ERR.badRequest();
  }
  if (!body.session_id || !body.input) return ERR.badRequest("ต้องมี session_id และ input");

  const sb = userClient(token);

  // load profile + prior slots
  const [{ data: prof }, { data: state }] = await Promise.all([
    sb.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    sb.from("session_state").select("slots").eq("session_id", body.session_id).maybeSingle(),
  ]);
  const profile: Profile = {
    birth_year: prof?.birth_year ?? null,
    scheme: prof?.scheme ?? null,
    area_code: prof?.area_code ?? null,
    sss_section: prof?.sss_section ?? null,
    receives_state_pension: prof?.receives_state_pension ?? null,
  };
  const priorSlots: Understood = (state?.slots as Understood) ?? {};

  // resolve input → text (+ transcript for voice)
  let text = body.input.text ?? "";
  let transcript: string | undefined;
  let hasDoc = false;
  let documentId: string | undefined;

  if (body.input.type === "voice" && body.input.audio?.data_base64) {
    try {
      transcript = await transcribeAudio(body.input.audio.data_base64, body.input.audio.mime || "audio/webm");
      text = transcript;
    } catch (e) {
      console.error("[turn] STT failed:", (e as Error).message);
      return ERR.server("ถอดเสียงไม่สำเร็จ ขอพิมพ์แทนได้ไหมคะ");
    }
  } else if (body.input.type === "document") {
    hasDoc = true;
    documentId = body.input.document_id;
    if (!text) text = "ช่วยอ่านเอกสารที่ฉันอัปโหลด แล้วบอกว่าฉันมีสิทธิ์อะไรบ้าง";
  }

  if (!text.trim()) return ERR.badRequest("ไม่มีข้อความสำหรับประมวลผล");

  // run the orchestrator
  let result;
  try {
    result = await runTurn({
      text,
      profile,
      priorSlots,
      userId: user.id,
      channel: body.input.type === "voice" ? "web" : "web",
      hasDoc,
      documentId,
    });
  } catch (e) {
    console.error("[turn] orchestrator:", (e as Error).message);
    return ERR.server();
  }

  // persist (best-effort — never block the answer on a write error)
  let auditId: string | undefined;
  try {
    await sb.from("messages").insert([
      { session_id: body.session_id, role: "user", content: text },
      { session_id: body.session_id, role: "assistant", content: JSON.stringify(result.cards) },
    ]);
    await sb.from("session_state").upsert({
      session_id: body.session_id,
      slots: result.understood,
      intent: result.understood.intent ?? null,
      pending_question: result.pending_question,
    });
    const { data: audit } = await adminClient()
      .from("audit_log")
      .insert({
        session_id: body.session_id,
        user_id: user.id,
        queries_run: result.audit.queries_run,
        rule_traces: result.audit.rule_traces,
        citations: result.audit.citations,
        prescreen_result: result.audit.prescreen_result,
      })
      .select("id")
      .single();
    auditId = audit?.id;
  } catch (e) {
    console.error("[turn] persist:", (e as Error).message);
  }

  const payload: TurnResponse = {
    session_id: body.session_id,
    transcript,
    understood: result.understood,
    pending_question: result.pending_question,
    quick_replies: result.quick_replies,
    cards: result.cards,
    audit_id: auditId,
  };

  if (!wantsStream(req)) return ok(payload);
  return streamResponse(payload);
}

// ---- SSE streaming (cards arrive one at a time) ----------------------------
function streamResponse(payload: TurnResponse): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      if (payload.transcript) send("transcript", { text: payload.transcript });
      send("understood", payload.understood);

      // safety card first, then the rest in order, with a small gap for UX
      const ordered: Card[] = payload.cards;
      for (const card of ordered) {
        send("card", card);
        await new Promise((r) => setTimeout(r, 120));
      }
      if (payload.pending_question) {
        send("pending", { question: payload.pending_question, quick_replies: payload.quick_replies });
      }
      send("done", { audit_id: payload.audit_id });
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

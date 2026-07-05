import { NextRequest } from "next/server";
import { ERR, ok, requireUser, wantsStream } from "@/lib/http";
import { userClient, adminClient } from "@/lib/supabase/server";
import { transcribeAudio } from "@/lib/gemini";
import { runTurnStream, type TurnContext, type TurnResult } from "@/lib/orchestrator";
import type { Profile, TurnRequest, TurnResponse, Understood } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Keep under common serverless limits; RUNPOD_TIMEOUT_MS bounds the slow path.
export const maxDuration = 60;

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
  } else if (body.input.type === "answers") {
    if (!body.input.answers || !Object.keys(body.input.answers).length)
      return ERR.badRequest("ไม่มีคำตอบสำหรับประมวลผล");
    if (!text) text = Object.values(body.input.answers).join(" · ");
  }

  if (!text.trim()) return ERR.badRequest("ไม่มีข้อความสำหรับประมวลผล");

  const ctx: TurnContext = {
    text,
    profile,
    priorSlots,
    userId: user.id,
    channel: "web",
    hasDoc,
    documentId,
    answers: body.input.type === "answers" ? body.input.answers : undefined,
    prefill: body.input.prefill,
  };

  // ---- non-streaming (JSON) ----
  if (!wantsStream(req)) {
    let result: TurnResult;
    try {
      result = await runTurnStream(ctx);
    } catch (e) {
      console.error("[turn] orchestrator:", (e as Error).message);
      return ERR.server();
    }
    const auditId = await persistTurn(sb, body.session_id, user.id, text, result);
    const payload: TurnResponse = {
      session_id: body.session_id,
      transcript,
      understood: result.understood,
      pending_question: result.pending_question,
      quick_replies: result.quick_replies,
      questions: result.questions,
      cards: result.cards,
      audit_id: auditId,
    };
    return ok(payload);
  }

  // ---- streaming (SSE) — emit cards live as each tool finishes ----
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        if (transcript) send("transcript", { text: transcript });
        const result = await runTurnStream(ctx, (type, data) => {
          if (type === "understood") send("understood", data);
          else if (type === "card") send("card", data);
          else if (type === "questions") send("questions", data);
        });
        if (result.pending_question) {
          send("pending", { question: result.pending_question, quick_replies: result.quick_replies });
        }
        const auditId = await persistTurn(sb, body.session_id, user.id, text, result);
        send("done", { audit_id: auditId });
      } catch (e) {
        console.error("[turn] stream:", (e as Error).message);
        send("error", { code: "server_error", message_th: "ระบบมีปัญหาชั่วคราว ลองใหม่อีกครั้ง", retryable: true });
      } finally {
        controller.close();
      }
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

// persist messages + slots + audit (best-effort; never block the answer)
async function persistTurn(
  sb: ReturnType<typeof userClient>,
  sessionId: string,
  userId: string,
  text: string,
  result: TurnResult
): Promise<string | undefined> {
  try {
    await sb.from("messages").insert([
      { session_id: sessionId, role: "user", content: text },
      { session_id: sessionId, role: "assistant", content: JSON.stringify(result.cards) },
    ]);
    await sb.from("session_state").upsert({
      session_id: sessionId,
      slots: result.understood,
      intent: result.understood.intent ?? null,
      pending_question: result.pending_question,
    });
    const { data: audit } = await adminClient()
      .from("audit_log")
      .insert({
        session_id: sessionId,
        user_id: userId,
        queries_run: result.audit.queries_run,
        rule_traces: result.audit.rule_traces,
        citations: result.audit.citations,
        prescreen_result: result.audit.prescreen_result,
      })
      .select("id")
      .single();
    return audit?.id;
  } catch (e) {
    console.error("[turn] persist:", (e as Error).message);
    return undefined;
  }
}

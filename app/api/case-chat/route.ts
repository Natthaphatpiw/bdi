import { NextRequest } from "next/server";
import { ERR, ok, requireUser } from "@/lib/http";
import { userClient } from "@/lib/supabase/server";
import { loadCaseSnapshot } from "@/lib/caseData";
import { llmText } from "@/lib/llm";
import { allowRequest } from "@/lib/rateLimit";
import { containsThaiNationalId } from "@/lib/sanitize";
import { runSafetyPrecheck } from "@/lib/mvp/safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

type ChatMsg = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  if (!allowRequest(req, "case-follow-up", { limit: 15 })) return ERR.tooMany();
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  let body: { session_id?: string; history?: ChatMsg[]; question?: string };
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest();
  }
  if (!body.session_id || !body.question?.trim()) return ERR.badRequest("ต้องมีเคสและคำถาม");
  if (body.question.length > 800) return ERR.badRequest("คำถามยาวเกินไป");
  if (containsThaiNationalId(body.question)) return ERR.badRequest("กรุณาลบเลขบัตรประชาชน 13 หลักออกก่อนส่ง ระบบไม่รับหรือจัดเก็บข้อมูลส่วนนี้");

  const safety = runSafetyPrecheck(body.question);
  if (safety.emergency) {
    return ok({
      text: safety.messageTh ?? "อาการที่เล่ามาอาจต้องได้รับความช่วยเหลือฉุกเฉิน โทร 1669 ทันที",
      safety: { emergency: true, hotline: safety.hotline ?? "1669" },
    });
  }

  const snapshot = await loadCaseSnapshot(userClient(auth.token), body.session_id);
  if (!snapshot) return ERR.notFound("ไม่พบเคสนี้");

  const history = (body.history ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content?.trim())
    .slice(-8);

  const prompt = [
    "คุณคือผู้ช่วยตอบคำถามต่อจากหน้า Result Dashboard ของระบบรู้สิทธิ์ รู้สุข",
    "ตอบภาษาไทย กระชับ ตรงคำถาม ใช้ข้อมูลจาก CASE_CONTEXT เท่านั้น ถ้าข้อมูลไม่พอให้บอกวิธีตรวจสอบต่อ เช่น โทรสถานพยาบาลหรือดูแหล่งที่มา ห้ามเดาค่ารักษา เบี้ยประกัน หรือสิทธิ์ที่ไม่มีใน context",
    "ระบบนี้เป็นการคัดกรองเบื้องต้น ไม่ใช่การวินิจฉัย",
    "",
    "CASE_CONTEXT:",
    JSON.stringify(snapshot, null, 2),
    "",
    "SHORT_MEMORY:",
    history.map((m) => `${m.role === "user" ? "ผู้ใช้" : "ผู้ช่วย"}: ${m.content}`).join("\n") || "(ไม่มี)",
    "",
    `คำถามล่าสุด: ${body.question.trim()}`,
  ].join("\n");

  const text =
    (await llmText(prompt, { maxOutputTokens: 1200 })) ||
    "ขออภัย ระบบตอบคำถามต่อไม่ได้ชั่วคราว ลองถามใหม่อีกครั้ง หรือกดดูที่มาของคำแนะนำในหน้านี้";
  return ok({ text });
}

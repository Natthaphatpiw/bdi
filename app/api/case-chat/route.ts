import { NextRequest } from "next/server";
import { ERR, ok, requireUser } from "@/lib/http";
import { userClient } from "@/lib/supabase/server";
import { loadCaseSnapshot } from "@/lib/caseData";
import { llmText } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

type ChatMsg = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  let body: { session_id?: string; history?: ChatMsg[]; question?: string };
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest();
  }
  if (!body.session_id || !body.question?.trim()) return ERR.badRequest("ต้องมีเคสและคำถาม");

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

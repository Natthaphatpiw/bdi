import { NextRequest } from "next/server";
import { ok, ERR, requireUser } from "@/lib/http";
import { transcribeAudio } from "@/lib/gemini";
import { env, featureFlags } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/stt — multipart (file) OR json { audio_base64, mime } → { text }
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  if (!featureFlags.hasGemini()) return ERR.server("ยังไม่ได้ตั้งค่า Gemini สำหรับถอดเสียง");

  let base64 = "";
  let mime = "audio/webm";
  const ctype = req.headers.get("content-type") || "";

  try {
    if (ctype.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file") as File | null;
      if (!file) return ERR.badRequest("ไม่พบไฟล์เสียง");
      mime = file.type || mime;
      base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    } else {
      const body = (await req.json()) as { audio_base64?: string; mime?: string };
      if (!body.audio_base64) return ERR.badRequest("ไม่พบข้อมูลเสียง");
      base64 = body.audio_base64;
      mime = body.mime || mime;
    }
  } catch {
    return ERR.badRequest();
  }

  try {
    const text = await transcribeAudio(base64, mime);
    return ok({ text, model: env.geminiModel });
  } catch (e) {
    console.error("[stt]", (e as Error).message);
    return ERR.server("ถอดเสียงไม่สำเร็จ ขอพิมพ์แทนได้ไหมคะ");
  }
}

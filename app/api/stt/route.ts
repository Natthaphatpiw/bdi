import { NextRequest } from "next/server";
import { ok, ERR, requireUser } from "@/lib/http";
import { transcribeAudio } from "@/lib/gemini";
import { featureFlags } from "@/lib/env";
import { allowRequest } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/stt — multipart (file) OR json { audio_base64, mime } → { text }
export async function POST(req: NextRequest) {
  if (!allowRequest(req, "stt", { limit: 10 })) return ERR.tooMany();
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  if (!featureFlags.hasGemini()) return ERR.server("ระบบถอดเสียงยังไม่พร้อมใช้งาน กรุณาพิมพ์ข้อความแทน");

  let base64 = "";
  let mime = "audio/webm";
  const ctype = req.headers.get("content-type") || "";

  try {
    if (ctype.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file") as File | null;
      if (!file) return ERR.badRequest("ไม่พบไฟล์เสียง");
      if (file.size > 8 * 1024 * 1024) return ERR.badRequest("ไฟล์เสียงต้องมีขนาดไม่เกิน 8 MB");
      if (file.type && !file.type.startsWith("audio/")) return ERR.badRequest("รองรับเฉพาะไฟล์เสียง");
      mime = file.type || mime;
      base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    } else {
      const body = (await req.json()) as { audio_base64?: string; mime?: string };
      if (!body.audio_base64) return ERR.badRequest("ไม่พบข้อมูลเสียง");
      if (body.audio_base64.length > 11_000_000) return ERR.badRequest("ข้อมูลเสียงมีขนาดใหญ่เกินไป");
      if (body.mime && !body.mime.startsWith("audio/")) return ERR.badRequest("รองรับเฉพาะไฟล์เสียง");
      base64 = body.audio_base64;
      mime = body.mime || mime;
    }
  } catch {
    return ERR.badRequest();
  }

  try {
    const text = await transcribeAudio(base64, mime);
    return ok({ text });
  } catch (e) {
    console.error("[stt]", (e as Error).message);
    return ERR.server("ถอดเสียงไม่สำเร็จ ขอพิมพ์แทนได้ไหมคะ");
  }
}

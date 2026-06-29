import { NextRequest } from "next/server";
import { ok, ERR, requireUser } from "@/lib/http";
import { userClient, adminClient } from "@/lib/supabase/server";
import { ingestDocument } from "@/lib/documents";
import type { DocumentRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BUCKET = "documents";

// GET /api/documents → list the caller's documents
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const sb = userClient(auth.token);
  const { data, error } = await sb
    .from("documents")
    .select("id, doc_type, status, storage_path, created_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false });
  if (error) return ERR.server();
  const documents: DocumentRecord[] = (data ?? []).map((d) => ({
    document_id: d.id,
    status: d.status,
    doc_type: d.doc_type,
    filename: (d.storage_path as string | null)?.split("/").pop(),
  }));
  return ok({ documents });
}

// POST /api/documents (multipart: file, doc_type) → 202 { document_id, status }
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  let file: File | null = null;
  let docType = "policy";
  try {
    const form = await req.formData();
    file = form.get("file") as File | null;
    docType = (form.get("doc_type") as string) || "policy";
  } catch {
    return ERR.badRequest();
  }
  if (!file) return ERR.badRequest("ไม่พบไฟล์");
  if (file.size > 15 * 1024 * 1024) return ERR.badRequest("ไฟล์ใหญ่เกิน 15MB");

  const sb = userClient(auth.token);
  // create the row first (RLS: owner)
  const { data: doc, error: insErr } = await sb
    .from("documents")
    .insert({ user_id: auth.user.id, doc_type: docType, status: "processing" })
    .select("id")
    .single();
  if (insErr || !doc) {
    console.error("[documents] insert:", insErr?.message);
    return ERR.server();
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const path = `${auth.user.id}/${doc.id}.pdf`;

  // upload to Storage (service role — bucket is private)
  const admin = adminClient();
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, buf, {
    contentType: file.type || "application/pdf",
    upsert: true,
  });
  if (upErr) {
    console.error("[documents] storage:", upErr.message);
    // continue — we can still ingest from the buffer
  } else {
    await admin.from("documents").update({ storage_path: path }).eq("id", doc.id);
  }

  // ingest inline (extract → chunk → embed). Errors mark the doc failed.
  const result = await ingestDocument(auth.user.id, doc.id, buf);

  const res: DocumentRecord = {
    document_id: doc.id,
    status: result.status === "ready" ? "ready" : "failed",
    doc_type: docType,
    chunk_count: result.chunks,
    filename: file.name,
  };
  return ok(res, { status: 202 });
}

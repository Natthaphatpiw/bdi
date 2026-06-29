import { NextRequest } from "next/server";
import { ok, ERR, requireUser } from "@/lib/http";
import { userClient } from "@/lib/supabase/server";
import type { DocumentRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/documents/:id → status + chunk count
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  const sb = userClient(auth.token);

  const { data, error } = await sb
    .from("documents")
    .select("id, doc_type, status, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (error) return ERR.server();
  if (!data) return ERR.notFound();

  const { count } = await sb
    .from("user_doc_chunks")
    .select("id", { count: "exact", head: true })
    .eq("document_id", id);

  const res: DocumentRecord = {
    document_id: data.id,
    status: data.status,
    doc_type: data.doc_type,
    chunk_count: count ?? 0,
    filename: (data.storage_path as string | null)?.split("/").pop(),
  };
  return ok(res);
}

// DELETE /api/documents/:id
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  const sb = userClient(auth.token);
  const { error } = await sb.from("documents").delete().eq("id", id);
  if (error) return ERR.server();
  return ok({ deleted: true });
}

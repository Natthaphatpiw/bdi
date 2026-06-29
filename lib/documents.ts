// PDF ingest: extract text → chunk → embed (Gemini) → user_doc_chunks (per-user,
// RLS). Runs inline for the hackathon; swap to a queue worker later if needed.
import { adminClient } from "./supabase/server";
import { embedTexts } from "./gemini";
import { featureFlags } from "./env";

const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 150;

function chunkText(text: string): string[] {
  const clean = text.replace(/\s+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    chunks.push(clean.slice(i, i + CHUNK_SIZE));
    i += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks.filter((c) => c.trim().length > 20);
}

async function extractPdfText(buf: Buffer): Promise<string> {
  try {
    const mod = (await import("pdf-parse")) as unknown as {
      default: (b: Buffer) => Promise<{ text: string }>;
    };
    const data = await mod.default(buf);
    return data.text ?? "";
  } catch (e) {
    console.error("[documents] pdf-parse failed:", (e as Error).message);
    return "";
  }
}

export async function ingestDocument(
  userId: string,
  documentId: string,
  buf: Buffer
): Promise<{ status: "ready" | "failed"; chunks: number }> {
  const admin = adminClient();
  try {
    const text = await extractPdfText(buf);
    const chunks = chunkText(text);
    if (!chunks.length) {
      await admin.from("documents").update({ status: "failed" }).eq("id", documentId);
      return { status: "failed", chunks: 0 };
    }

    if (featureFlags.hasGemini()) {
      const embeddings = await embedTexts(chunks, "RETRIEVAL_DOCUMENT");
      const rows = chunks.map((chunk_text, idx) => ({
        user_id: userId,
        document_id: documentId,
        chunk_text,
        page: String(Math.floor(idx / 3) + 1),
        embedding: embeddings[idx]?.length ? embeddings[idx] : null,
      }));
      // insert in batches to stay under payload limits
      for (let i = 0; i < rows.length; i += 50) {
        await admin.from("user_doc_chunks").insert(rows.slice(i, i + 50));
      }
    }
    await admin.from("documents").update({ status: "ready" }).eq("id", documentId);
    return { status: "ready", chunks: chunks.length };
  } catch (e) {
    console.error("[documents] ingest:", (e as Error).message);
    await admin.from("documents").update({ status: "failed" }).eq("id", documentId);
    return { status: "failed", chunks: 0 };
  }
}

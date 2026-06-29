// GraphRAG + document retrieval over Supabase pgvector (RPC functions defined in
// supabase/schema.sql). Gracefully returns [] when unconfigured or unseeded.
import { adminClient } from "./supabase/server";
import { embedOne } from "./gemini";
import { featureFlags } from "./env";

export interface KgChunk {
  node_id: string;
  label: string;
  name: string;
  text_th: string;
  source_url: string;
  source_title: string;
  publisher: string;
  similarity: number;
}

// Once we learn kg_chunks is unseeded, stop spending a Gemini embed per turn.
let kgChunksKnownEmpty = false;

export async function retrieveKgChunks(query: string, matchCount = 5, label?: string): Promise<KgChunk[]> {
  if (!featureFlags.hasSupabase() || !featureFlags.hasGemini()) return [];
  if (kgChunksKnownEmpty) return [];
  try {
    // Skip the embed entirely if the table has no embedded rows.
    const { count } = await adminClient()
      .from("kg_chunks")
      .select("id", { count: "exact", head: true })
      .not("embedding", "is", null);
    if (!count) {
      kgChunksKnownEmpty = true;
      return [];
    }
    const embedding = await embedOne(query, "RETRIEVAL_QUERY");
    if (!embedding.length) return [];
    const { data, error } = await adminClient().rpc("match_kg_chunks", {
      query_embedding: embedding,
      match_count: matchCount,
      label_filter: label ?? null,
    });
    if (error) {
      console.error("[retrieve] match_kg_chunks:", error.message);
      return [];
    }
    return (data ?? []) as KgChunk[];
  } catch (e) {
    console.error("[retrieve] kg chunks failed:", (e as Error).message);
    return [];
  }
}

export interface DocChunk {
  chunk_text: string;
  page: string;
  document_id: string;
  similarity: number;
}

export async function retrieveUserDocs(query: string, userId: string, matchCount = 5): Promise<DocChunk[]> {
  if (!featureFlags.hasSupabase() || !featureFlags.hasGemini()) return [];
  try {
    const embedding = await embedOne(query, "RETRIEVAL_QUERY");
    if (!embedding.length) return [];
    const { data, error } = await adminClient().rpc("match_user_doc_chunks", {
      query_embedding: embedding,
      p_user_id: userId,
      match_count: matchCount,
    });
    if (error) {
      console.error("[retrieve] match_user_doc_chunks:", error.message);
      return [];
    }
    return (data ?? []) as DocChunk[];
  } catch (e) {
    console.error("[retrieve] user docs failed:", (e as Error).message);
    return [];
  }
}

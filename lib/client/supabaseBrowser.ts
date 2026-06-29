"use client";
// Browser Supabase client (singleton). Persists the session so both surfaces
// (web anonymous, LINE bridge) keep a Bearer token across reloads.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  _client = createClient(url, anon, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return _client;
}

/** Current access token (or "" if not signed in). */
export async function currentToken(): Promise<string> {
  const { data } = await supabaseBrowser().auth.getSession();
  return data.session?.access_token ?? "";
}

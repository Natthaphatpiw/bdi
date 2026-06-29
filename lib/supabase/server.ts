// Server-side Supabase clients.
//  - adminClient(): service_role, bypasses RLS — for public KG tables, auth admin,
//    vector RPC, and trusted per-user ops where we pass user_id explicitly.
//  - userClient(token): anon key + the caller's JWT in the Authorization header,
//    so Postgres RLS (auth.uid() = user_id) is enforced for that user's rows.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env";

let _admin: SupabaseClient | null = null;

export function adminClient(): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseServiceKey) {
    throw new Error("Supabase not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY)");
  }
  if (!_admin) {
    _admin = createClient(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _admin;
}

export function userClient(token: string): SupabaseClient {
  // SECURITY: must use the anon key here. The service_role key has BYPASSRLS,
  // so falling back to it would disable per-user RLS on every tenant table.
  // Fail closed (throw) rather than silently bypass row-level security.
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error(
      "Supabase user client not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY required for RLS)"
    );
  }
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface AuthedUser {
  id: string;
  email?: string;
  line_user_id?: string;
}

/** Validate a Supabase access token and return the user (or null). */
export async function getUserFromRequest(token: string): Promise<AuthedUser | null> {
  try {
    const { data, error } = await adminClient().auth.getUser(token);
    if (error || !data?.user) return null;
    return {
      id: data.user.id,
      email: data.user.email,
      line_user_id: (data.user.user_metadata as Record<string, unknown> | undefined)?.line_user_id as
        | string
        | undefined,
    };
  } catch {
    return null;
  }
}

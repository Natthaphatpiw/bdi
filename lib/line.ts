// LINE Mini App auth bridge: verify a LIFF idToken with LINE, then map the LINE
// user to a Supabase auth user and mint a real Supabase session (access_token)
// the browser uses as Bearer for every API call. Deterministic password derived
// from the channel secret means the same LINE user always maps to the same row.
import { createHmac } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";
import { adminClient } from "./supabase/server";

export interface LineProfile {
  sub: string; // LINE userId
  name?: string;
  picture?: string;
  email?: string;
}

/** Verify the idToken against LINE's endpoint (validates signature + audience). */
export async function verifyLineIdToken(idToken: string): Promise<LineProfile> {
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: env.lineChannelId }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LINE verify failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const payload = (await res.json()) as LineProfile & { aud?: string };
  if (!payload.sub) throw new Error("LINE idToken missing sub");
  return payload;
}

function derivePassword(lineUserId: string): string {
  const h = createHmac("sha256", env.lineChannelSecret || "rusit-rusuk").update(lineUserId).digest("hex");
  return `Ln-${h.slice(0, 40)}`; // satisfies length/complexity
}

function lineEmail(lineUserId: string): string {
  return `line_${lineUserId.toLowerCase()}@line.rusit-rusuk.local`;
}

/** Ensure a Supabase user for this LINE user and return a fresh session. */
export async function bridgeLineUser(p: LineProfile): Promise<{
  access_token: string;
  refresh_token: string;
  user_id: string;
}> {
  const admin = adminClient();
  const email = lineEmail(p.sub);
  const password = derivePassword(p.sub);

  // Create the user if missing (idempotent — ignore "already registered").
  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { line_user_id: p.sub, display_name: p.name, picture_url: p.picture },
  });
  if (createErr && !/registered|already/i.test(createErr.message)) {
    console.error("[line] createUser:", createErr.message);
  }

  // Sign in (service key works as apikey for the auth endpoint).
  const authClient = createClient(
    env.supabaseUrl,
    env.supabaseAnonKey || env.supabaseServiceKey,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`Supabase sign-in for LINE user failed: ${error?.message ?? "no session"}`);
  }
  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user_id: data.user!.id,
  };
}

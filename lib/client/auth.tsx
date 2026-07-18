"use client";
// Unified auth for both surfaces:
//   surface="web"  → Supabase anonymous sign-in
//   surface="line" → LIFF idToken → POST /api/auth/line → setSession()
// Exposes a single { ready, userId, displayName, ... } so screens are surface-agnostic.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { supabaseBrowser } from "./supabaseBrowser";
import { initLiff } from "./liff";
import { liffIdForPath } from "./liffConfig";
import type { LineAuthResponse } from "../types";

export type Surface = "web" | "line";

interface AuthState {
  ready: boolean;
  error: string | null;
  surface: Surface;
  userId: string | null;
  displayName: string | null;
  pictureUrl: string | null;
  isInLineClient: boolean;
}

const AuthCtx = createContext<AuthState>({
  ready: false,
  error: null,
  surface: "web",
  userId: null,
  displayName: null,
  pictureUrl: null,
  isInLineClient: false,
});

export function useAuth() {
  return useContext(AuthCtx);
}

export function AuthProvider({ surface, children }: { surface: Surface; children: ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<AuthState>({
    ready: false,
    error: null,
    surface,
    userId: null,
    displayName: null,
    pictureUrl: null,
    isInLineClient: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        // The explicit booth route is intentionally auth-independent and keeps
        // no durable PII. This lets a judge open the LIFF-sized demo even when
        // LINE or Supabase is unavailable.
        if (pathname === "/liff/demo") {
          setState((current) => ({
            ...current,
            ready: true,
            error: null,
            userId: "demo-session",
            displayName: null,
            pictureUrl: null,
            isInLineClient: false,
          }));
          return;
        }
        const sb = supabaseBrowser();
        if (surface === "line") {
          const liffId = liffIdForPath(pathname);
          const session = await initLiff(liffId);
          if (session.idToken) {
            const res = await fetch("/api/auth/line", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ idToken: session.idToken }),
            });
            if (!res.ok) throw new Error("auth/line failed");
            const auth = (await res.json()) as LineAuthResponse;
            await sb.auth.setSession({ access_token: auth.access_token, refresh_token: auth.refresh_token });
            if (cancelled) return;
            setState((s) => ({
              ...s,
              ready: true,
              userId: auth.user_id,
              displayName: session.profile?.displayName ?? auth.display_name ?? null,
              pictureUrl: session.profile?.pictureUrl ?? auth.picture_url ?? null,
              isInLineClient: session.isInClient,
            }));
            return;
          }
          // not logged in to LINE yet (login() was triggered) — show splash
          setState((s) => ({ ...s, ready: false, isInLineClient: session.isInClient }));
          return;
        }

        // web surface: reuse or create an anonymous session
        const { data: existing } = await sb.auth.getSession();
        let userId = existing.session?.user?.id ?? null;
        if (!userId) {
          const { data, error } = await sb.auth.signInAnonymously();
          if (error) throw error;
          userId = data.user?.id ?? null;
        }
        if (cancelled) return;
        setState((s) => ({ ...s, ready: true, userId }));
      } catch (e) {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          ready: false,
          error:
            surface === "line"
              ? "เข้าสู่ระบบด้วย LINE ไม่สำเร็จ — เปิดผ่านแอป LINE แล้วลองใหม่"
              : "เข้าสู่ระบบไม่สำเร็จ — ตรวจสอบการตั้งค่า Supabase (เปิด Anonymous sign-in + ใส่ ANON KEY)",
        }));
        console.error("[auth]", (e as Error).message);
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
    // init runs once at the entry path; SPA navigation must not re-init LIFF.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface]);

  return <AuthCtx.Provider value={state}>{children}</AuthCtx.Provider>;
}

"use client";
// LIFF init (LINE Mini App). Dynamically imported so it never runs during SSR.

export interface LiffSession {
  isInClient: boolean;
  isLoggedIn: boolean;
  idToken: string | null;
  profile: { userId: string; displayName: string; pictureUrl?: string } | null;
}

let _liff: typeof import("@line/liff").default | null = null;

async function getLiff() {
  if (!_liff) {
    const mod = await import("@line/liff");
    _liff = mod.default;
  }
  return _liff;
}

export async function initLiff(liffId: string): Promise<LiffSession> {
  const liff = await getLiff();
  await liff.init({ liffId });
  const isInClient = liff.isInClient();
  if (!liff.isLoggedIn()) {
    // outside LINE we can still run, but to get an idToken we must login
    if (isInClient) liff.login();
    return { isInClient, isLoggedIn: false, idToken: null, profile: null };
  }
  const idToken = liff.getIDToken();
  let profile: LiffSession["profile"] = null;
  try {
    const p = await liff.getProfile();
    profile = { userId: p.userId, displayName: p.displayName, pictureUrl: p.pictureUrl };
  } catch {
    /* profile scope may be missing */
  }
  return { isInClient, isLoggedIn: true, idToken, profile };
}

export async function liffLogin(liffId: string) {
  const liff = await getLiff();
  if (!(liff as unknown as { id?: string }).id) await liff.init({ liffId });
  liff.login();
}

export async function liffShare(text: string) {
  const liff = await getLiff();
  try {
    if (liff.isApiAvailable("shareTargetPicker")) {
      await liff.shareTargetPicker([{ type: "text", text }]);
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}

export async function liffOpenWindow(url: string) {
  const liff = await getLiff();
  try {
    liff.openWindow({ url, external: true });
  } catch {
    window.open(url, "_blank");
  }
}

export async function isInLineClient(): Promise<boolean> {
  try {
    const liff = await getLiff();
    return liff.isInClient();
  } catch {
    return false;
  }
}

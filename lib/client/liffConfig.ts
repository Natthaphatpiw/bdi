"use client";
// Maps a /liff/* route to its own LIFF app id. Each LINE LIFF app has one
// endpoint URL, so deep-linking a specific page = its own LIFF id. Page-specific
// ids are optional — blank ones fall back to the HOME id, then the legacy single id.
//
// NOTE: process.env.NEXT_PUBLIC_* must be referenced statically (Next inlines
// them at build time); dynamic process.env[key] does NOT work in the browser.

const PAGE_LIFF: { prefix: string; id: string }[] = [
  { prefix: "/liff/chat", id: process.env.NEXT_PUBLIC_LIFF_ID_CHAT ?? "" },
  { prefix: "/liff/rights", id: process.env.NEXT_PUBLIC_LIFF_ID_RIGHTS ?? "" },
  { prefix: "/liff/facilities", id: process.env.NEXT_PUBLIC_LIFF_ID_FACILITIES ?? "" },
  { prefix: "/liff/documents", id: process.env.NEXT_PUBLIC_LIFF_ID_DOCUMENTS ?? "" },
  { prefix: "/liff/profile", id: process.env.NEXT_PUBLIC_LIFF_ID_PROFILE ?? "" },
  { prefix: "/liff/history", id: process.env.NEXT_PUBLIC_LIFF_ID_HISTORY ?? "" },
];

const HOME_ID = process.env.NEXT_PUBLIC_LIFF_ID_HOME ?? "";
const LEGACY_ID = process.env.NEXT_PUBLIC_LIFF_ID ?? "";

/** Resolve the LIFF id to init with, based on the entry path. */
export function liffIdForPath(pathname: string | null): string {
  const match = PAGE_LIFF.find((p) => (pathname ?? "").startsWith(p.prefix));
  return match?.id || HOME_ID || LEGACY_ID;
}

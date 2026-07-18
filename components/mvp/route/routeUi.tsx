"use client";

import { CheckCircle2, CircleHelp, Clock3 } from "lucide-react";
import type { RouteCoverage, RouteFacility } from "@/lib/mvp/contracts";
import { liffOpenWindow } from "@/lib/client/liff";
import { cn } from "@/lib/cn";

export function openRouteUrl(url: string, surface: "web" | "line") {
  if (surface === "line") void liffOpenWindow(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

export function RouteAction({ href, onClick, children, primary }: { href?: string; onClick?: () => void; children: React.ReactNode; primary?: boolean }) {
  const classes = cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-base font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2", primary ? "bg-brand text-white hover:bg-brand-dark focus-visible:outline-brand" : "border border-hairline bg-white text-ink hover:border-brand/40 hover:bg-brand-soft focus-visible:outline-brand");
  return href ? <a href={href} onClick={onClick} className={classes}>{children}</a> : <button type="button" onClick={onClick} className={classes}>{children}</button>;
}

export function OpeningBadge({ facility }: { facility: RouteFacility }) {
  const status = facility.openingStatus;
  return <span className={cn("inline-flex min-h-7 items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold", status === "OPEN_NOW" && "bg-rights-soft text-rights", status === "CLOSED" && "bg-orange-100 text-orange-800", status === "HOURS_UNKNOWN" && "bg-gray-100 text-review")}><Clock3 className="h-4 w-4" aria-hidden="true" />{status === "OPEN_NOW" ? "เปิดตามข้อมูล" : status === "CLOSED" ? "ปิดตามข้อมูล" : "ยังไม่ทราบเวลาเปิด"}</span>;
}

export function AcceptanceBadge({ facility }: { facility: RouteFacility }) {
  return <span className={cn("inline-flex min-h-7 items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold", facility.rightAcceptance === "ACCEPTED" && "bg-rights-soft text-rights", facility.rightAcceptance === "CONDITIONAL" && "bg-benefit-soft text-benefit", facility.rightAcceptance === "UNKNOWN" && "bg-gray-100 text-review")}>{facility.rightAcceptance === "ACCEPTED" ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <CircleHelp className="h-4 w-4" aria-hidden="true" />}{facility.rightAcceptanceText}</span>;
}

export function CoverageStatus({ coverage }: { coverage: RouteCoverage }) {
  const label = coverage.coverageStatus === "COVERED" ? "อยู่ภายใต้สิทธิ์" : coverage.coverageStatus === "CONDITIONAL" ? "มีเงื่อนไข" : coverage.coverageStatus === "NOT_COVERED" ? "ไม่ครอบคลุม" : "ยังต้องยืนยัน";
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-sm font-bold", coverage.coverageStatus === "COVERED" && "bg-rights-soft text-rights", coverage.coverageStatus === "CONDITIONAL" && "bg-benefit-soft text-benefit", coverage.coverageStatus === "NOT_COVERED" && "bg-safety-soft text-safety", coverage.coverageStatus === "UNKNOWN" && "bg-gray-100 text-review")}>{label}</span>;
}

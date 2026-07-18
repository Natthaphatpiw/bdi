"use client";

import { AlertTriangle, Check, FileCheck2, Hospital, Navigation, Phone } from "lucide-react";
import type { RouteFacility } from "@/lib/mvp/contracts";
import { cn } from "@/lib/cn";
import { AcceptanceBadge, OpeningBadge, openRouteUrl, RouteAction } from "./routeUi";

function FacilityRouteCard({ facility, title, subtitle, compact, surface, onEvidence, onCall, onNavigate }: {
  facility: RouteFacility;
  title: string;
  subtitle?: string | null;
  compact?: boolean;
  surface: "web" | "line";
  onEvidence: () => void;
  onCall?: () => void;
  onNavigate?: () => void;
}) {
  const headingId = `${compact ? "backup" : "primary"}-route-heading`;
  return (
    <section className={cn("rounded-2xl border bg-white shadow-card", compact ? "border-hairline p-4" : "border-brand/25 p-5 sm:p-6")} aria-labelledby={headingId}>
      <div className="flex items-start gap-3">
        <span className={cn("grid shrink-0 place-items-center rounded-xl", compact ? "h-10 w-10 bg-canvas text-facility" : "h-12 w-12 bg-facility-soft text-facility")}><Hospital className={compact ? "h-5 w-5" : "h-6 w-6"} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1"><p className="text-sm font-bold text-brand">{title}</p><h2 id={headingId} className={cn("mt-0.5 break-words font-bold leading-snug text-ink", compact ? "text-lg" : "text-2xl")}>{facility.facilityName}</h2><p className="mt-1 text-base text-ink-soft">{facility.serviceName}{facility.department ? ` · ${facility.department}` : ""}</p></div>
      </div>
      {subtitle && <p className="mt-3 rounded-xl bg-canvas px-3 py-2 text-base text-ink-soft">{subtitle}</p>}
      <div className="mt-4 flex flex-wrap gap-2"><OpeningBadge facility={facility} /><AcceptanceBadge facility={facility} /></div>
      <dl className="mt-4 grid gap-3 text-base sm:grid-cols-2">
        <div><dt className="text-sm font-bold text-ink-muted">พื้นที่</dt><dd className="mt-0.5 text-ink">{facility.distanceKm != null ? `${facility.distanceKm.toFixed(1)} กม. จากตำแหน่งที่ให้ไว้` : facility.areaName ? `อยู่ในพื้นที่${facility.areaName}` : "ยังต้องยืนยันพื้นที่"}</dd></div>
        <div><dt className="text-sm font-bold text-ink-muted">เวลาเปิด</dt><dd className="mt-0.5 text-ink">{facility.openingText}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm font-bold text-ink-muted">ค่าใช้จ่าย</dt><dd className="mt-0.5 text-ink">{facility.costSummary || "ยังไม่มีข้อมูลค่าใช้จ่ายที่ยืนยันได้"}</dd></div>
      </dl>
      {facility.whySelected.length > 0 && <div className="mt-4 rounded-xl bg-facility-soft p-3"><p className="font-bold text-facility">เหตุผลที่เลือก</p><ul className="mt-2 space-y-1.5 text-base text-ink">{facility.whySelected.slice(0, compact ? 2 : 3).map((reason) => <li key={reason} className="flex gap-2"><Check className="mt-0.5 h-5 w-5 shrink-0 text-facility" aria-hidden="true" /> {reason}</li>)}</ul></div>}
      {facility.warnings.length > 0 && <ul className="mt-3 space-y-1 text-sm text-benefit">{facility.warnings.map((warning) => <li key={warning} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {warning}</li>)}</ul>}
      <p className="mt-4 flex gap-2 rounded-xl bg-benefit-soft/60 px-3 py-2 text-sm leading-relaxed text-benefit"><Phone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> เวลาเปิดตามข้อมูลที่อัปเดตล่าสุด โปรดโทรยืนยันก่อนเดินทาง การรับสิทธิ์อาจเปลี่ยนแปลงได้</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {facility.phone && <RouteAction href={`tel:${facility.phone}`} onClick={onCall}><Phone className="h-5 w-5" aria-hidden="true" /> โทรยืนยัน</RouteAction>}
        {facility.mapUrl && <RouteAction primary onClick={() => { onNavigate?.(); openRouteUrl(facility.mapUrl as string, surface); }}><Navigation className="h-5 w-5" aria-hidden="true" /> นำทาง</RouteAction>}
        <RouteAction onClick={onEvidence}><FileCheck2 className="h-5 w-5" aria-hidden="true" /> ดูหลักฐาน</RouteAction>
      </div>
    </section>
  );
}

export function PrimaryRouteCard(props: Omit<React.ComponentProps<typeof FacilityRouteCard>, "title" | "compact" | "subtitle">) {
  return <FacilityRouteCard {...props} title="เส้นทางหลัก" />;
}

export function BackupRouteCard(props: Omit<React.ComponentProps<typeof FacilityRouteCard>, "title" | "compact">) {
  return <FacilityRouteCard {...props} title="เส้นทางสำรอง" compact />;
}

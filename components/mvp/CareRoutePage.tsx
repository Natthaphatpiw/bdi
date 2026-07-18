"use client";

import { useState } from "react";
import { Hospital, IdCard, Info, Navigation, Phone } from "lucide-react";
import type { MvpCaseRecord, VerifiedCareRoute } from "@/lib/mvp/contracts";
import { MEDICAL_DISCLAIMER } from "@/lib/mvp/contracts";
import { PrimaryRouteCard, BackupRouteCard } from "./route/FacilityRouteCards";
import { EmergencyRouteHero, UrgencyHero } from "./route/UrgencyHero";
import { PreparationChecklist } from "./route/PreparationChecklist";
import { CaseRightsCard } from "./route/CaseRightsCard";
import { WhyThisRouteCard, WhyThisRouteDrawer } from "./route/WhyThisRouteDrawer";
import { EvidenceAccordion } from "./route/EvidenceAccordion";
import { openRouteUrl } from "./route/routeUi";
import { PassportExperience } from "./PassportExperience";
import { FollowUpAssistant } from "./FollowUpAssistant";
import { FeedbackPrompt } from "./FeedbackPrompt";
import { cn } from "@/lib/cn";
import { trackCaseEvent } from "@/lib/client/mvpApi";

function PassportCTA({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="rounded-2xl border border-hairline bg-white p-5 shadow-card" aria-labelledby="passport-cta-heading">
      <div className="flex items-start gap-3"><IdCard className="mt-0.5 h-6 w-6 shrink-0 text-brand" aria-hidden="true" /><div><h2 id="passport-cta-heading" className="text-xl font-bold text-ink">สร้าง Case Passport</h2><p className="mt-1 text-base leading-relaxed text-ink-soft">ข้อมูลสรุปก่อนเข้ารับบริการ เพื่อลดการเล่าเรื่องซ้ำ</p></div></div>
      <button type="button" onClick={onOpen} className="mt-4 min-h-12 w-full rounded-xl border border-brand/30 bg-white px-4 py-3 text-base font-bold text-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">สร้างข้อมูลสรุปเพื่อใช้เตรียมตัวและยื่นให้สถานพยาบาล</button>
    </section>
  );
}

function StickyActions({ route, surface, onWhy, onPassport, onCall, onNavigate }: { route: VerifiedCareRoute; surface: "web" | "line"; onWhy: () => void; onPassport: () => void; onCall: () => void; onNavigate: () => void }) {
  return (
    <div className={cn("fixed inset-x-0 z-30 border-t border-hairline bg-white/95 px-3 pb-safe pt-2 shadow-[0_-8px_20px_rgba(15,23,42,0.08)] backdrop-blur md:hidden", surface === "line" ? "bottom-14" : "bottom-0")}>
      <div className="mx-auto grid max-w-lg grid-cols-[1fr_auto] gap-2">
        {route.primary?.mapUrl ? <button type="button" onClick={() => { onNavigate(); openRouteUrl(route.primary?.mapUrl as string, surface); }} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-base font-bold text-white"><Navigation className="h-5 w-5" aria-hidden="true" />นำทาง</button> : route.primary?.phone ? <a href={`tel:${route.primary.phone}`} onClick={onCall} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-base font-bold text-white"><Phone className="h-5 w-5" aria-hidden="true" />โทรยืนยัน</a> : <button type="button" onClick={onWhy} className="min-h-12 rounded-xl bg-brand px-4 text-base font-bold text-white">ดูเหตุผล</button>}
        <button type="button" onClick={onPassport} aria-label="สร้าง Case Passport" className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-brand/30 bg-white px-3 text-brand-dark"><IdCard className="h-6 w-6" aria-hidden="true" /></button>
      </div>
    </div>
  );
}

export function CareRoutePage({ caseRecord, route, surface, checkedPreparation, onTogglePreparation, onEmergency }: {
  caseRecord: MvpCaseRecord;
  route: VerifiedCareRoute;
  surface: "web" | "line";
  checkedPreparation: Record<string, boolean>;
  onTogglePreparation: (itemId: string) => void;
  onEmergency?: (safety: { hotline: string; message: string }) => void;
}) {
  const [whyOpen, setWhyOpen] = useState(false);
  const [passportOpen, setPassportOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  function showEvidence() {
    changeEvidenceOpen(true);
    window.setTimeout(() => document.getElementById("route-evidence")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function changeEvidenceOpen(open: boolean) {
    if (open && !evidenceOpen) void trackCaseEvent(caseRecord.id, "evidence_opened").catch(() => undefined);
    setEvidenceOpen(open);
  }

  function showWhy() {
    void trackCaseEvent(caseRecord.id, "why_route_opened").catch(() => undefined);
    setWhyOpen(true);
  }

  if (route.emergency) return <div className="mx-auto w-full max-w-2xl pb-16"><EmergencyRouteHero route={route} /></div>;

  return (
    <div className="mx-auto w-full max-w-3xl pb-32 md:pb-12">
      <header className="mb-4"><h1 className="text-3xl font-bold text-ink">เส้นทางดูแลของคุณ</h1><p className="mt-1 text-base text-ink-soft">สิ่งที่ควรทำ สิทธิ์ที่ใช้ได้ และสถานที่ที่เหมาะกับเคสนี้</p></header>
      <UrgencyHero route={route} />
      {route.degraded && <div className="mt-4 rounded-2xl border border-benefit/30 bg-benefit-soft p-4 text-base leading-relaxed text-benefit" role="status"><p className="font-bold">ข้อมูลบางส่วนยังต้องยืนยัน</p><p className="mt-1">{route.limitationTh || "ขณะนี้ไม่สามารถตรวจสอบข้อมูลบางส่วนได้ กรุณาโทรยืนยันกับหน่วยงานหรือสถานพยาบาล"}</p></div>}

      <div className="mt-4 space-y-4">
        {route.primary ? <PrimaryRouteCard facility={route.primary} surface={surface} onEvidence={showEvidence} onCall={() => void trackCaseEvent(caseRecord.id, "route_primary_called", { routeType: "PRIMARY" }).catch(() => undefined)} onNavigate={() => void trackCaseEvent(caseRecord.id, "route_primary_navigated", { routeType: "PRIMARY" }).catch(() => undefined)} /> : <section className="rounded-2xl border border-benefit/30 bg-white p-5 shadow-card"><Hospital className="h-6 w-6 text-benefit" aria-hidden="true" /><h2 className="mt-2 text-xl font-bold text-ink">ยังต้องยืนยันสถานที่</h2><p className="mt-2 text-base text-ink-soft">ยังไม่มีสถานพยาบาลที่ผ่านเงื่อนไขครบ กรุณาโทรหน่วยงานสิทธิ์หรือสถานพยาบาลก่อนเดินทาง</p></section>}
        {route.backup && <BackupRouteCard facility={route.backup} subtitle={route.backupWhenToUse} surface={surface} onEvidence={showEvidence} />}
        <PreparationChecklist items={route.preparationItems} checked={checkedPreparation} onToggle={onTogglePreparation} />
        <CaseRightsCard rights={route.rights} />
        <WhyThisRouteCard onOpen={showWhy} />
        <PassportCTA onOpen={() => setPassportOpen(true)} />
        <EvidenceAccordion evidence={route.evidence} open={evidenceOpen} onOpenChange={changeEvidenceOpen} surface={surface} />
        <section className="rounded-2xl border border-hairline bg-canvas p-4" aria-label="ข้อควรทราบ"><p className="flex gap-2 text-sm leading-relaxed text-ink-soft"><Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />{MEDICAL_DISCLAIMER}</p></section>
        <FeedbackPrompt caseId={caseRecord.id} />
      </div>

      <WhyThisRouteDrawer open={whyOpen} onOpenChange={setWhyOpen} route={route} />
      <PassportExperience open={passportOpen} onOpenChange={setPassportOpen} caseId={caseRecord.id} />
      <FollowUpAssistant caseId={caseRecord.id} surface={surface} onEmergency={onEmergency} />
      <StickyActions route={route} surface={surface} onWhy={showWhy} onPassport={() => setPassportOpen(true)} onCall={() => void trackCaseEvent(caseRecord.id, "route_primary_called", { routeType: "PRIMARY" }).catch(() => undefined)} onNavigate={() => void trackCaseEvent(caseRecord.id, "route_primary_navigated", { routeType: "PRIMARY" }).catch(() => undefined)} />
    </div>
  );
}

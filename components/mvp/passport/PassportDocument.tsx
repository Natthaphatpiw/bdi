import Image from "next/image";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  ClipboardCheck,
  ExternalLink,
  FileCheck2,
  FileText,
  HeartPulse,
  Hospital,
  IdCard,
  MapPin,
  Phone,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from "lucide-react";
import type { CasePassportSnapshot } from "@/lib/mvp/contracts";
import { cn } from "@/lib/cn";

export interface PassportShareQr {
  dataUrl: string;
  expiresAt?: string | null;
}

export function thaiDate(value?: string | null): string {
  if (!value) return "ไม่ระบุ";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

const EXCLUSION_LABELS: Record<string, string> = {
  national_id: "เลขประจำตัวประชาชน",
  system_internal_data: "ข้อมูลภายในระบบ",
  model_identity: "ข้อมูลระบบประมวลผล",
  raw_prompt: "คำสั่งภายใน",
  internal_reasoning: "เหตุผลภายในระบบ",
  debug_metadata: "ข้อมูลดีบัก",
  private_insurance: "ข้อมูลประกันเอกชน",
  narrative: "เรื่องเล่าและสรุปอาการ",
  original_narrative: "เรื่องเล่าต้นฉบับ",
  normalized_narrative: "สรุปอาการ",
  symptoms: "รายการอาการ",
  medications: "รายการยา",
  allergies: "ข้อมูลแพ้ยา",
};

function exclusionSummary(values: string[]): string {
  const labels = [...new Set(values.map((value) => EXCLUSION_LABELS[value] ?? "ข้อมูลอ่อนไหวที่ไม่จำเป็น"))];
  return labels.join(", ") || "ข้อมูลอ่อนไหวที่ไม่จำเป็น";
}

export function ShareQrImage({ qr, compact = false }: { qr: PassportShareQr; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", !compact && "flex-col text-center sm:flex-row sm:text-left")}>
      <Image
        src={qr.dataUrl}
        alt="คิวอาร์โค้ดสำหรับเปิด Case Passport ผ่านลิงก์แชร์ชั่วคราว"
        width={compact ? 128 : 160}
        height={compact ? 128 : 160}
        unoptimized
        className="h-32 w-32 shrink-0 rounded-lg border border-hairline bg-white p-1 sm:h-40 sm:w-40 print:h-28 print:w-28"
      />
      <div>
        <p className="font-bold text-ink">สแกนเพื่อเปิด Case Passport</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          QR นี้มีเฉพาะลิงก์แชร์ชั่วคราวแบบสุ่ม ไม่ฝังข้อมูลผู้ป่วยหรือข้อมูลลับอื่น
        </p>
        {qr.expiresAt && <p className="mt-1 text-sm font-semibold text-review">ใช้ได้ถึง {thaiDate(qr.expiresAt)}</p>}
      </div>
    </div>
  );
}

function PassportSection({
  title,
  icon,
  children,
  className,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("avoid-break border-t border-hairline px-4 py-4 sm:px-6", className)}>
      <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">{icon}</span>
        {title}
      </h2>
      <div className="mt-3 text-base leading-relaxed text-ink">{children}</div>
    </section>
  );
}

function LabelValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-canvas px-3 py-2">
      <dt className="text-sm font-bold text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold text-ink">{value || "ยังต้องยืนยัน"}</dd>
    </div>
  );
}

export function PassportDocument({
  snapshot,
  shared = false,
  shareQr = null,
}: {
  snapshot: CasePassportSnapshot;
  shared?: boolean;
  shareQr?: PassportShareQr | null;
}) {
  const primary = snapshot.route.primary;
  const backup = snapshot.route.backup;
  return (
    <>
      <style>{`
        @page {
          size: A4 portrait;
          margin: 11mm 11mm 17mm;
          @bottom-center {
            content: "หน้า " counter(page) " / " counter(pages);
            font-family: ui-sans-serif, system-ui, sans-serif;
            font-size: 9pt;
            color: #64748b;
          }
        }
        @media print {
          body:has(.mvp-passport-print) {
            height: auto !important;
            overflow: visible !important;
          }
          body:has(.mvp-passport-print) > :not(:has(.mvp-passport-print)) {
            display: none !important;
          }
          body:has(.mvp-passport-print) [role="dialog"]:has(.mvp-passport-print) {
            position: static !important;
            inset: auto !important;
            display: block !important;
            width: auto !important;
            max-height: none !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
          }
          body:has(.mvp-passport-print) [role="dialog"]:has(.mvp-passport-print) > :not(:has(.mvp-passport-print)),
          body:has(.mvp-passport-print) .mvp-passport-print ~ * {
            display: none !important;
          }
          body:has(.mvp-passport-print) [role="dialog"]:has(.mvp-passport-print) > :has(.mvp-passport-print) {
            display: block !important;
            margin: 0 !important;
          }
          .mvp-passport-print {
            position: static !important;
            inset: auto !important;
            width: 188mm !important;
            max-width: 188mm !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .mvp-passport-print section {
            orphans: 3;
            widows: 3;
          }
        }
      `}</style>
      <article className="mvp-passport-print mx-auto w-full max-w-[794px] overflow-hidden rounded-2xl border border-hairline bg-white text-ink shadow-card print:max-w-none print:rounded-none print:border-0 print:shadow-none">
      <header className="avoid-break bg-brand px-4 py-5 text-white sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15">
              <IdCard className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-2xl font-bold">Case Passport</h1>
              <p className="mt-1 text-base text-white/90">ข้อมูลสรุปก่อนเข้ารับบริการ</p>
            </div>
          </div>
          <dl className="text-sm text-white/90 sm:text-right">
            <div><dt className="inline font-semibold">รหัส:</dt> <dd className="inline">{snapshot.passport.code}</dd></div>
            <div><dt className="inline font-semibold">เวอร์ชัน:</dt> <dd className="inline">{snapshot.passport.version}</dd></div>
            <div><dt className="inline font-semibold">สร้างเมื่อ:</dt> <dd className="inline">{thaiDate(snapshot.passport.createdAt)}</dd></div>
            {snapshot.passport.expiresAt && <div><dt className="inline font-semibold">หมดอายุ:</dt> <dd className="inline">{thaiDate(snapshot.passport.expiresAt)}</dd></div>}
          </dl>
        </div>
        {shared && <p className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-sm">เปิดจากลิงก์ที่ผู้ใช้อนุญาต ข้อมูลแชร์เป็นชุดขั้นต่ำและอาจถูกเพิกถอนได้ก่อนเวลาหมดอายุ</p>}
      </header>

      <PassportSection title="บริบทผู้ป่วย" icon={<UserRound className="h-5 w-5" aria-hidden="true" />}>
        <dl className="grid gap-2 sm:grid-cols-2">
          <LabelValue label="ผู้ป่วยคือใคร" value={snapshot.patient.relationToReporter} />
          <LabelValue label="อายุ" value={snapshot.patient.ageDisplay} />
          <LabelValue
            label="สิทธิ์"
            value={`${snapshot.patient.scheme.displayName} · ${snapshot.patient.scheme.verificationStatus === "UNVERIFIED" ? "ยังไม่ยืนยัน" : "ผู้ใช้/โปรไฟล์ยืนยัน"}`}
          />
          <LabelValue label="พื้นที่" value={snapshot.patient.area} />
        </dl>
      </PassportSection>

      <PassportSection title="สิ่งที่ควรรู้ทันที" icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}>
        <div className={cn("rounded-xl border p-3", snapshot.safety.emergencyDetected ? "border-safety/40 bg-safety-soft" : "border-orange-200 bg-orange-50")}>
          <p className={cn("text-lg font-bold", snapshot.safety.emergencyDetected ? "text-safety" : "text-orange-800")}>{snapshot.safety.urgencyLabelTh}</p>
          {snapshot.safety.escalationInstruction && <p className="mt-1">{snapshot.safety.escalationInstruction}</p>}
        </div>
        {primary && (
          <div className="mt-3 rounded-xl border border-brand/20 bg-brand-soft p-3">
            <p className="text-sm font-bold text-brand">เส้นทางหลัก</p>
            <p className="mt-1 text-lg font-bold">{primary.facilityName}</p>
            <p className="text-ink-soft">{primary.serviceName}</p>
          </div>
        )}
      </PassportSection>

      {snapshot.narrative && (
        <PassportSection title="เรื่องที่มา" icon={<HeartPulse className="h-5 w-5" aria-hidden="true" />}>
          {snapshot.narrative.originalStory && <p className="whitespace-pre-wrap">{snapshot.narrative.originalStory}</p>}
          {snapshot.narrative.normalizedSummary && <p className="mt-2 rounded-xl bg-canvas p-3 text-ink-soft"><strong className="text-ink">สรุป:</strong> {snapshot.narrative.normalizedSummary}</p>}
          {snapshot.narrative.symptoms.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {snapshot.narrative.symptoms.filter((symptom) => symptom.present).map((symptom) => (
                <li key={`${symptom.name}-${symptom.duration ?? ""}`} className="rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand-dark">
                  {symptom.name}{symptom.duration ? ` · ${symptom.duration}` : ""}
                </li>
              ))}
            </ul>
          )}
        </PassportSection>
      )}

      <PassportSection title="คำตอบด้านความปลอดภัย" icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}>
        {snapshot.safety.redFlagAnswers.length ? (
          <ul className="space-y-2">
            {snapshot.safety.redFlagAnswers.map((item) => (
              <li key={item.question} className="flex items-start justify-between gap-3 rounded-xl bg-canvas px-3 py-2">
                <span>{item.question}</span>
                <span className={cn("shrink-0 rounded-full px-2 py-1 text-sm font-bold", item.status === "PRESENT" ? "bg-safety-soft text-safety" : item.status === "ABSENT" ? "bg-rights-soft text-rights" : "bg-gray-100 text-review")}>{item.answer}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-ink-muted">ไม่มีคำตอบเพิ่มเติมที่บันทึกไว้</p>}
        {snapshot.safety.watchFor.length > 0 && <div className="mt-3 rounded-xl bg-safety-soft p-3"><p className="font-bold text-safety">สิ่งที่ต้องเฝ้าระวัง</p><ul className="mt-1 list-disc pl-5">{snapshot.safety.watchFor.map((item) => <li key={item}>{item}</li>)}</ul></div>}
      </PassportSection>

      <PassportSection title="ผลคัดกรองเบื้องต้น" icon={<Stethoscope className="h-5 w-5" aria-hidden="true" />}>
        {snapshot.prescreen.possibleConditions.length > 0 && (
          <div>
            <p className="font-bold">ภาวะที่อาจเกี่ยวข้อง</p>
            <ul className="mt-2 space-y-1">
              {snapshot.prescreen.possibleConditions.slice(0, 3).map((condition) => <li key={condition.nameTh} className="flex gap-2"><Check className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />{condition.nameTh}</li>)}
            </ul>
          </div>
        )}
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          <LabelValue label="ระดับบริการ" value={snapshot.prescreen.recommendedCareLevel} />
          <LabelValue label="แผนก" value={snapshot.prescreen.recommendedDepartment || "ยังต้องยืนยัน"} />
        </dl>
        {snapshot.prescreen.recommendedServices.length > 0 && <p className="mt-3"><strong>บริการที่เกี่ยวข้อง:</strong> {snapshot.prescreen.recommendedServices.join(" · ")}</p>}
        <p className="mt-3 rounded-xl bg-benefit-soft/70 p-3 text-sm leading-relaxed text-benefit">{snapshot.prescreen.disclaimer}</p>
      </PassportSection>

      <PassportSection title="สิทธิ์ที่เกี่ยวข้องกับเคสนี้" icon={<BadgeCheck className="h-5 w-5" aria-hidden="true" />}>
        {snapshot.rights.length ? <ul className="space-y-2">{snapshot.rights.map((right) => (
          <li key={right.serviceId} className="rounded-xl border border-hairline p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold">{right.serviceName}</p><span className="rounded-full bg-rights-soft px-2 py-1 text-sm font-bold text-rights">{right.coverageStatus}</span></div>
            <p className="mt-1 text-ink-soft">{right.costSummary || "ยังไม่มีข้อมูลค่าใช้จ่ายที่ยืนยันได้"}</p>
            {right.conditions && <p className="mt-1 text-sm text-ink-muted">เงื่อนไข: {right.conditions}</p>}
          </li>
        ))}</ul> : <p className="text-ink-muted">ยังต้องยืนยันข้อมูลส่วนนี้</p>}
      </PassportSection>

      <PassportSection title="เส้นทางแนะนำ" icon={<Hospital className="h-5 w-5" aria-hidden="true" />}>
        {primary ? (
          <div className="rounded-xl border border-brand/20 p-3">
            <p className="text-sm font-bold text-brand">เส้นทางหลัก</p>
            <p className="mt-1 text-lg font-bold">{primary.facilityName}</p>
            <p className="text-ink-soft">{primary.serviceName}</p>
            {primary.address && <p className="mt-2 flex gap-2 text-sm"><MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />{primary.address}</p>}
            {primary.phone && <p className="mt-1 flex gap-2 text-sm"><Phone className="h-4 w-4 shrink-0" aria-hidden="true" />{primary.phone}</p>}
            <p className="mt-2 text-sm text-benefit">{primary.openingText} · โปรดโทรยืนยันก่อนเดินทาง</p>
            {primary.whySelected.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm">{primary.whySelected.map((item) => <li key={item}>{item}</li>)}</ul>}
          </div>
        ) : <p className="text-ink-muted">ยังไม่มีสถานที่ที่ผ่านเงื่อนไขครบ</p>}
        {backup && <div className="mt-3 rounded-xl bg-canvas p-3"><p className="text-sm font-bold text-ink-muted">เส้นทางสำรอง</p><p className="mt-1 font-bold">{backup.facilityName}</p><p className="text-sm text-ink-soft">ใช้เมื่อ: {backup.whenToUse}</p></div>}
      </PassportSection>

      <PassportSection title="เตรียมอะไร" icon={<ClipboardCheck className="h-5 w-5" aria-hidden="true" />}>
        <ul className="space-y-2">
          {snapshot.preparation.documents.map((document) => <li key={document.label} className="flex gap-2"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border border-ink-muted"><Check className="h-4 w-4" aria-hidden="true" /></span><span><strong>{document.label}</strong><span className="block text-sm text-ink-muted">{document.reason}</span></span></li>)}
        </ul>
        {snapshot.preparation.healthInformation.length > 0 && <dl className="mt-3 grid gap-2 sm:grid-cols-2">{snapshot.preparation.healthInformation.map((item) => <LabelValue key={item.label} label={item.label} value={item.value || "ไม่ระบุ"} />)}</dl>}
      </PassportSection>

      <PassportSection title="สิ่งที่อยากปรึกษา" icon={<FileCheck2 className="h-5 w-5" aria-hidden="true" />}>
        {snapshot.questionsForClinician.length ? <ol className="list-decimal space-y-1 pl-5">{snapshot.questionsForClinician.map((question) => <li key={question}>{question}</li>)}</ol> : <p className="text-ink-muted">ยังไม่มีคำถามเพิ่มเติม</p>}
      </PassportSection>

      <PassportSection title="หลักฐาน" icon={<FileText className="h-5 w-5" aria-hidden="true" />}>
        {snapshot.evidence.length ? <ul className="space-y-2">{snapshot.evidence.map((evidence) => <li key={evidence.id} className="rounded-xl bg-canvas p-3"><p className="font-bold">{evidence.title}</p><p className="text-sm text-ink-soft">{evidence.publisher} · มีผล {evidence.effectiveDate || "ไม่ระบุ"} · ตรวจ {thaiDate(evidence.retrievedAt)}</p>{evidence.url && <a href={evidence.url} target="_blank" rel="noreferrer" className="no-print mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-bold text-facility underline">เปิดที่มา <ExternalLink className="h-4 w-4" aria-hidden="true" /></a>}</li>)}</ul> : <p className="text-ink-muted">ยังไม่มีหลักฐานที่เปิดดูได้</p>}
      </PassportSection>

      <footer className="avoid-break border-t border-hairline bg-canvas px-4 py-4 sm:px-6">
        {shareQr && (
          <div className="mb-4 border-b border-hairline pb-4">
            <ShareQrImage qr={shareQr} />
          </div>
        )}
        <p className="text-sm font-bold text-ink">{snapshot.disclaimer.short}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">{snapshot.disclaimer.full}</p>
        <p className="mt-3 text-xs text-ink-muted">ขอบเขตการยินยอม: ข้อมูลสรุปก่อนเข้ารับบริการ · ไม่รวม: {exclusionSummary(snapshot.consent.sensitiveFieldsExcluded)}</p>
        <div className="mt-3 flex items-center justify-between text-xs font-semibold text-ink-muted"><span>รู้สิทธิ์ รู้สุข · {snapshot.passport.code}</span><span className="print-page-number">เอกสารเวอร์ชัน {snapshot.passport.version}</span></div>
      </footer>
      </article>
    </>
  );
}

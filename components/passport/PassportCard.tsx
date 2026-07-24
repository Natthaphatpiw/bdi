"use client";
// The visual Case Passport — rendered to PNG (html-to-image) for the user to
// hand to a hospital. Crisp Thai text + exact data (not an AI-generated image).
import { forwardRef } from "react";
import {
  ShieldPlus,
  HeartPulse,
  BadgeCheck,
  MapPin,
  FileText,
  HelpCircle,
  Phone,
  Hash,
  Wallet,
  Stethoscope,
  AlertTriangle,
} from "lucide-react";
import type { PassportData } from "@/lib/types";
import { AUDIENCE_LABELS, RESPONSIBILITY_BOX } from "@/lib/passportVariants";

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5 text-brand">
        {icon}
        <span className="text-[13px] font-semibold text-ink">{title}</span>
      </div>
      <div className="mt-1 text-[13px] leading-relaxed text-ink">{children}</div>
    </div>
  );
}

export const PassportCard = forwardRef<
  HTMLDivElement,
  { data: PassportData; sampleFooter?: boolean; samplePrintOnly?: boolean }
>(
  function PassportCard({ data, sampleFooter = false, samplePrintOnly = false }, ref) {
    const p = data.patient;
    const chips = [
      p.role,
      p.age != null ? `อายุ ${p.age}` : null,
      p.gender,
      p.scheme,
      p.area,
    ].filter(Boolean) as string[];
    const v = data.variant;

    return (
      <div
        ref={ref}
        className="mx-auto w-full max-w-[440px] overflow-hidden rounded-card border border-hairline bg-white"
        style={{ fontFamily: "var(--font-thai), system-ui, sans-serif" }}
      >
        {/* header — แดงเฉพาะ ER Passport (บริบทฉุกเฉินเท่านั้น) */}
        <div
          className={
            data.emergency
              ? "flex items-center gap-2 bg-safety px-4 py-3 text-white"
              : "flex items-center gap-2 bg-brand px-4 py-3 text-white"
          }
        >
          <ShieldPlus className="h-5 w-5" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-[15px] font-bold leading-none">
              {data.emergency ? "ER Passport — เอกสารยื่นห้องฉุกเฉิน" : "Case Passport"}
            </p>
            <p className="mt-0.5 text-[11px] opacity-90">
              {data.emergency
                ? "ข้อมูลวิกฤตสำหรับพยาบาลคัดกรอง · รู้สิทธิ์ รู้สุข"
                : "ข้อมูลสรุปก่อนเข้ารับบริการ · รู้สิทธิ์ รู้สุข"}
            </p>
          </div>
          <div className="text-right">
            <p className="inline-flex items-center gap-1 text-[12px] font-semibold">
              <Hash className="h-3 w-3" aria-hidden="true" />
              {data.ref_code}
            </p>
            <p className="text-[10px] opacity-90">{fmtDate(data.generated_at)}</p>
          </div>
        </div>

        <div className="px-4 pb-4 pt-2">
          {/* audience + กล่องเส้นแบ่งความรับผิดชอบ (§7.1 — ต้องเจอใน 3 วินาทีแรก) */}
          {data.audience && data.audience !== "general" && (
            <p className="mb-1.5 inline-flex rounded-full bg-brand-soft px-2.5 py-0.5 text-[11px] font-semibold text-brand-dark">
              สำหรับ: {AUDIENCE_LABELS[data.audience]}
            </p>
          )}
          <div className="mb-2 rounded-btn border-2 border-ink/20 bg-canvas px-3 py-2">
            <p className="text-[11px] font-semibold leading-snug text-ink">{RESPONSIBILITY_BOX}</p>
          </div>

          {/* ER critical block — ข้อมูลวิกฤตอยู่บนสุด อ่านจบใน 15 วินาที */}
          {data.emergency && (
            <div className="mb-1 rounded-btn border border-safety/40 bg-safety-soft px-3 py-2.5">
              <p className="text-[13px] font-bold leading-snug text-safety">
                {data.emergency.ucep_line}
              </p>
              <table className="mt-2 w-full text-[13px]">
                <tbody>
                  {data.emergency.symptom && (
                    <tr>
                      <td className="py-0.5 pr-2 align-top text-ink-muted">อาการ</td>
                      <td className="py-0.5 font-semibold text-ink">{data.emergency.symptom}</td>
                    </tr>
                  )}
                  {data.emergency.onset && (
                    <tr>
                      <td className="py-0.5 pr-2 align-top text-ink-muted">เริ่มอาการ</td>
                      <td className="py-0.5 font-semibold text-ink">{data.emergency.onset}</td>
                    </tr>
                  )}
                  {data.emergency.befast && (
                    <tr>
                      <td className="py-0.5 pr-2 align-top text-ink-muted">เช็ค BEFAST</td>
                      <td className="py-0.5 font-medium text-ink">
                        {(["f", "a", "s"] as const)
                          .filter((k) => data.emergency!.befast?.[k])
                          .map((k) => {
                            const label = k === "f" ? "ใบหน้า" : k === "a" ? "แขน" : "การพูด";
                            return `${label}: ${data.emergency!.befast![k] === "yes" ? "ผิดปกติ" : "ปกติ"}`;
                          })
                          .join(" · ")}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td className="py-0.5 pr-2 align-top text-ink-muted">โรคประจำตัว/ยา</td>
                    <td className="py-0.5 font-medium text-ink">
                      {data.emergency.conditions_meds || "—"}
                    </td>
                  </tr>
                  {data.emergency.contact_phone && (
                    <tr>
                      <td className="py-0.5 pr-2 align-top text-ink-muted">เบอร์ญาติ/ติดต่อกลับ</td>
                      <td className="py-0.5 font-semibold text-ink">{data.emergency.contact_phone}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* patient chips */}
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b border-hairline pb-3">
              {chips.map((c, i) => (
                <span
                  key={i}
                  className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[12px] font-medium text-brand-dark"
                >
                  {c}
                </span>
              ))}
            </div>
          )}

          {/* chief complaint */}
          <Section icon={<HeartPulse className="h-4 w-4" aria-hidden="true" />} title="เรื่องที่มา">
            <p>{data.chief_complaint}</p>
            {data.symptoms.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {data.symptoms.map((s, i) => (
                  <span key={i} className="rounded-full bg-canvas px-2 py-0.5 text-[12px] text-ink-soft">
                    {s}
                  </span>
                ))}
              </div>
            )}
            {!data.screening && (data.condition || data.triage) && (
              <p className="mt-1.5 text-[12px] text-ink-soft">
                {data.condition ? `เบื้องต้นอาจเกี่ยวกับ: ${data.condition}` : ""}
                {data.triage?.department ? ` · แผนก: ${data.triage.department}` : ""}
                {data.triage?.severity ? ` · ${data.triage.severity}` : ""}
              </p>
            )}
          </Section>

          {/* user-facing prescreen summary; provider internals are never shown */}
          {data.screening && (
            <Section
              icon={<Stethoscope className="h-4 w-4" aria-hidden="true" />}
              title="ผลคัดกรองเบื้องต้น"
            >
              <div className="rounded-btn bg-canvas px-3 py-2">
                <table className="w-full text-[12px]">
                  <tbody>
                    {(data.screening.condition_th || data.screening.disease_en) && (
                      <tr>
                        <td className="py-0.5 pr-2 align-top text-ink-muted">โรคที่อาจเกี่ยวข้อง</td>
                        <td className="py-0.5 font-medium text-ink">
                          {data.screening.condition_th ?? data.screening.disease_en}
                          {data.screening.condition_th && data.screening.disease_en && (
                            <span className="font-normal text-ink-muted"> ({data.screening.disease_en})</span>
                          )}
                        </td>
                      </tr>
                    )}
                    {data.screening.department && (
                      <tr>
                        <td className="py-0.5 pr-2 align-top text-ink-muted">แผนกที่แนะนำ</td>
                        <td className="py-0.5 font-medium text-ink">{data.screening.department}</td>
                      </tr>
                    )}
                    {data.screening.severity && (
                      <tr>
                        <td className="py-0.5 pr-2 align-top text-ink-muted">ความเร่งด่วน</td>
                        <td className="py-0.5 font-medium text-ink">{data.screening.severity}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {data.screening.red_flags && data.screening.red_flags.length > 0 && (
                  <p className="mt-1 flex items-start gap-1 text-[11px] font-medium text-safety">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    สัญญาณเสี่ยง: {data.screening.red_flags.join(", ")}
                  </p>
                )}
              </div>
            </Section>
          )}

          {/* 7.2 — บรรทัดสัญญาณอันตราย (ลบ) — พิมพ์เฉพาะเมื่อผ่านจริง */}
          {v?.safety_check?.negative && (
            <p className="mt-2 rounded-btn bg-rights-soft px-3 py-1.5 text-[12px] font-medium text-rights">
              ตรวจสัญญาณอันตรายเบื้องต้นแล้ว: ไม่พบ ({fmtDate(v.safety_check.checked_at)})
            </p>
          )}

          {/* 4.1 — แถบสถานะโครงการร้านยา */}
          {v?.pharmacy_program && (
            <div
              className={
                v.pharmacy_program.in_program
                  ? "mt-2 rounded-btn bg-rights-soft px-3 py-2 text-[12px] font-semibold text-rights"
                  : "mt-2 rounded-btn bg-canvas px-3 py-2 text-[12px] font-medium text-ink-soft"
              }
            >
              {v.pharmacy_program.banner}
              {v.pharmacy_program.in_program && v.pharmacy_program.matched.length > 0 && (
                <span className="mt-0.5 block text-[11px] font-normal text-ink-soft">
                  กลุ่มอาการที่เข้าเกณฑ์: {v.pharmacy_program.matched.slice(0, 3).join(", ")}
                </span>
              )}
            </div>
          )}

          {/* 4.2 — คลินิกอบอุ่น/ปฐมภูมิ */}
          {v?.primary_care && (
            <div className="mt-3">
              <div className="rounded-btn bg-brand-soft px-3 py-2.5">
                <p className="text-[12px] font-semibold text-brand-dark">
                  {v.primary_care.mechanism_title}
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink">
                  {v.primary_care.mechanism_body}
                </p>
              </div>
              <table className="mt-2 w-full text-[12px]">
                <tbody>
                  {v.primary_care.chronic_rows.map((row) => (
                    <tr key={row.label}>
                      <td className="py-0.5 pr-2 align-top text-ink-muted">{row.label}</td>
                      <td className="py-0.5 font-medium text-ink">{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {v.primary_care.services.length > 0 && (
                <div className="mt-2 rounded-btn bg-canvas px-3 py-2">
                  <p className="text-[12px] font-semibold text-ink">{v.primary_care.services_title}</p>
                  <ul className="ml-1 mt-0.5 list-inside list-disc space-y-0.5 text-[12px] text-ink-soft">
                    {v.primary_care.services.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* 4.3 — ทันตกรรม: วงเงิน (โดยประมาณ) + เงื่อนไขเบิก */}
          {v?.dental && (
            <div className="mt-3 rounded-btn bg-benefit-soft px-3 py-2.5">
              {v.dental.allowance_line && (
                <p className="text-[13px] font-bold leading-snug text-benefit">
                  {v.dental.allowance_line}
                </p>
              )}
              {v.dental.claim_conditions.length > 0 && (
                <ul className="mt-1.5 ml-1 list-inside list-disc space-y-0.5 text-[11px] leading-relaxed text-ink-soft">
                  {v.dental.claim_conditions.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-[11px] text-ink-muted">
                เอกสารที่ต้องเตรียม: {v.dental.documents.join(" · ")}
              </p>
            </div>
          )}

          {/* rights */}
          {data.rights_summary.length > 0 && (
            <Section icon={<BadgeCheck className="h-4 w-4" aria-hidden="true" />} title="สิทธิ์ที่ครอบคลุม">
              <ul className="ml-1 list-inside list-disc space-y-0.5 marker:text-rights">
                {data.rights_summary.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </Section>
          )}

          {/* facility */}
          {data.recommended_facility && (
            <Section icon={<MapPin className="h-4 w-4" aria-hidden="true" />} title="สถานพยาบาลที่แนะนำ">
              <p className="font-medium">{data.recommended_facility.name}</p>
              {data.recommended_facility.note && (
                <p className="text-[12px] text-ink-soft">{data.recommended_facility.note}</p>
              )}
            </Section>
          )}

          {/* documents */}
          {data.prepared_documents.length > 0 && (
            <Section icon={<FileText className="h-4 w-4" aria-hidden="true" />} title="เอกสารที่ควรเตรียม">
              <ul className="ml-1 list-inside list-disc space-y-0.5">
                {data.prepared_documents.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </Section>
          )}

          {/* questions for provider */}
          {data.questions_for_provider && data.questions_for_provider.length > 0 && (
            <Section icon={<HelpCircle className="h-4 w-4" aria-hidden="true" />} title="สิ่งที่อยากปรึกษา">
              <ul className="ml-1 list-inside list-disc space-y-0.5">
                {data.questions_for_provider.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </Section>
          )}

          {data.notes && <p className="mt-3 text-[12px] text-ink-soft">หมายเหตุ: {data.notes}</p>}

          {/* unclaimed entitlement value (deterministic, rule-engine-backed) */}
          {data.unclaimed_value && (
            <div className="mt-3 rounded-btn bg-benefit-soft px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-benefit">
                <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                มูลค่าสิทธิ์ที่อาจยังไม่ได้ใช้
              </p>
              <p className="mt-0.5 text-[18px] font-bold leading-tight text-benefit">
                {data.unclaimed_value.total_label}
              </p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {data.unclaimed_value.lines.map((l, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-2 text-[11px] text-ink-soft">
                    <span className="min-w-0 flex-1">{l.label}</span>
                    {l.amount_label && (
                      <span className="shrink-0 font-medium">
                        {l.amount_label}
                        {l.tentative ? "*" : ""}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {data.unclaimed_value.lines.some((l) => l.tentative) && (
                <p className="mt-1 text-[10px] text-ink-muted">* รอยืนยันเงื่อนไข</p>
              )}
            </div>
          )}

          {/* hotlines */}
          {data.hotlines && data.hotlines.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-hairline pt-3">
              {data.hotlines.map((h) => (
                <span
                  key={h.number}
                  className="inline-flex items-center gap-1 rounded-full bg-safety-soft px-2.5 py-0.5 text-[12px] font-medium text-safety"
                >
                  <Phone className="h-3 w-3" aria-hidden="true" />
                  {h.name} {h.number}
                </span>
              ))}
            </div>
          )}

          {/* แหล่งอ้างอิงสิทธิ์/วงเงิน — บนใบกระดาษเท่ากับ staff view เสมอ */}
          {data.citations && data.citations.length > 0 && (
            <div className="mt-3 border-t border-hairline pt-2">
              <p className="text-[10px] font-semibold text-ink-muted">ประกาศอ้างอิง</p>
              <ul className="mt-0.5 space-y-0.5">
                {data.citations.map((c, i) => (
                  <li key={i} className="text-[10px] leading-snug text-ink-muted">
                    {c.title}
                    {c.publisher ? ` — ${c.publisher}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-3 text-[10px] leading-snug text-ink-muted">{data.disclaimer}</p>

          {sampleFooter && (
            <p
              className={
                samplePrintOnly
                  ? "mt-2 hidden border-t border-hairline pt-2 text-center text-[10px] font-medium text-ink-muted print:block"
                  : "mt-2 border-t border-hairline pt-2 text-center text-[10px] font-medium text-ink-muted"
              }
            >
              เอกสารตัวอย่าง · ข้อมูลสมมติเพื่อการนำเสนอ
            </p>
          )}
        </div>
      </div>
    );
  }
);

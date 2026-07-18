"use client";
// ProfileScreen — แก้ไขโปรไฟล์ (ปีเกิด/สิทธิ/พื้นที่/มาตรา), การยินยอม (consent),
// ขนาดตัวอักษร และปุ่มลบข้อมูลทั้งหมด (PDPA). surface-agnostic.
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ShieldCheck,
  Loader2,
  Trash2,
  Type as TypeIcon,
  MessageCircle,
  HeartPulse,
  Watch,
  FileText,
  Activity,
  BellRing,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type {
  Consent,
  ConsentScope,
  Profile,
  Scheme,
} from "@/lib/types";
import {
  getProfile,
  putProfile,
  getConsents,
  postConsent,
  deleteMe,
  ApiClientError,
} from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { useUi } from "@/store/ui";
import { useToast } from "@/store/toast";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  getGuardianConsent,
  revokeGuardianConsent,
} from "@/lib/guardian/client";
import type { GuardianConsentStatus } from "@/lib/guardian/types";

interface Props {
  surface: "web" | "line";
  basePath: string;
}

const SCHEME_OPTIONS: { value: Scheme; label: string }[] = [
  { value: "UCS", label: "บัตรทอง" },
  { value: "SSS", label: "ประกันสังคม" },
  { value: "CSMBS", label: "ข้าราชการ" },
];

const SSS_SECTIONS = [33, 39, 40];

const CONSENT_ITEMS: {
  scope: ConsentScope;
  label: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  {
    scope: "chat",
    label: "บันทึกบทสนทนา",
    desc: "เก็บประวัติการปรึกษาเพื่อช่วยตอบต่อเนื่อง",
    icon: <MessageCircle className="h-5 w-5 text-brand" aria-hidden />,
  },
  {
    scope: "phr",
    label: "ข้อมูลสุขภาพ",
    desc: "ใช้ข้อมูลสุขภาพเพื่อเช็กสิทธิให้แม่นยำขึ้น",
    icon: <HeartPulse className="h-5 w-5 text-brand" aria-hidden />,
  },
  {
    scope: "wearable",
    label: "อุปกรณ์สวมใส่",
    desc: "เชื่อมข้อมูลจากนาฬิกา/อุปกรณ์สุขภาพ",
    icon: <Watch className="h-5 w-5 text-brand" aria-hidden />,
  },
  {
    scope: "doc",
    label: "ประมวลผลเอกสาร",
    desc: "อ่านไฟล์ประกัน/เอกสารเพื่อตอบคำถามจากเอกสาร",
    icon: <FileText className="h-5 w-5 text-brand" aria-hidden />,
  },
];

const THIS_YEAR = new Date().getFullYear();

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors tap-lg",
        on ? "bg-brand" : "bg-gray-300"
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
          on ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

export function ProfileScreen({ surface, basePath }: Props) {
  const auth = useAuth();
  const toast = useToast();
  const largeText = useUi((s) => s.largeText);
  const setLargeText = useUi((s) => s.setLargeText);
  const guardianSound = useUi((s) => s.guardianSound);
  const setGuardianSound = useUi((s) => s.setGuardianSound);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [guardianConsent, setGuardianConsent] = useState<GuardianConsentStatus | null>(null);
  const [revoking, setRevoking] = useState(false);

  // editable profile fields (string-backed for inputs)
  const [birthYear, setBirthYear] = useState<string>("");
  const [scheme, setScheme] = useState<Scheme | null>(null);
  const [areaCode, setAreaCode] = useState<string>("");
  const [sssSection, setSssSection] = useState<number | null>(null);

  const [consents, setConsents] = useState<Record<ConsentScope, boolean>>({
    chat: false,
    phr: false,
    wearable: false,
    doc: false,
  });

  const applyProfile = useCallback((p: Profile) => {
    setBirthYear(p.birth_year != null ? String(p.birth_year) : "");
    setScheme(p.scheme ?? null);
    setAreaCode(p.area_code ?? "");
    setSssSection(p.sss_section ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [profile, consentRes] = await Promise.all([getProfile(), getConsents()]);
        if (cancelled) return;
        applyProfile(profile);
        const map: Record<ConsentScope, boolean> = {
          chat: false,
          phr: false,
          wearable: false,
          doc: false,
        };
        for (const c of consentRes.consents) map[c.scope] = c.granted;
        setConsents(map);
        getGuardianConsent()
          .then((g) => !cancelled && setGuardianConsent(g))
          .catch(() => !cancelled && setGuardianConsent({ active: false }));
      } catch (e) {
        if (cancelled) return;
        toast(e instanceof ApiClientError ? e.message : "โหลดข้อมูลไม่สำเร็จ", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [applyProfile, toast]);

  const derivedAge = useMemo(() => {
    const y = Number(birthYear);
    if (!birthYear || Number.isNaN(y) || y < 1900 || y > THIS_YEAR) return null;
    return THIS_YEAR - y;
  }, [birthYear]);

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Partial<Profile> = {
        birth_year: birthYear ? Number(birthYear) : null,
        scheme,
        area_code: areaCode.trim() || null,
        sss_section: scheme === "SSS" ? sssSection : null,
      };
      const saved = await putProfile(payload);
      applyProfile(saved);
      toast("บันทึกแล้ว", "success");
    } catch (e) {
      toast(e instanceof ApiClientError ? e.message : "บันทึกไม่สำเร็จ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleConsentChange(scope: ConsentScope, granted: boolean) {
    const prev = consents[scope];
    setConsents((c) => ({ ...c, [scope]: granted }));
    try {
      const saved: Consent = await postConsent({ scope, granted });
      setConsents((c) => ({ ...c, [scope]: saved.granted }));
    } catch (e) {
      setConsents((c) => ({ ...c, [scope]: prev }));
      toast(e instanceof ApiClientError ? e.message : "บันทึกการยินยอมไม่สำเร็จ", "error");
    }
  }

  async function handleGuardianRevoke() {
    const ok = window.confirm(
      "ถอนความยินยอมและลบข้อมูลพฤติกรรมทั้งหมด (ผลเช็คสุขภาพและเส้นฐานของคุณ)? การลบไม่สามารถกู้คืนได้"
    );
    if (!ok) return;
    setRevoking(true);
    try {
      await revokeGuardianConsent();
      setGuardianConsent({ active: false });
      toast("ถอนความยินยอมและลบข้อมูลพฤติกรรมแล้ว", "success");
    } catch (e) {
      toast(e instanceof ApiClientError ? e.message : "ถอนความยินยอมไม่สำเร็จ", "error");
    } finally {
      setRevoking(false);
    }
  }

  async function handleDeleteMe() {
    const ok = window.confirm(
      "ยืนยันลบข้อมูลทั้งหมดของคุณ? การลบไม่สามารถกู้คืนได้"
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteMe();
      toast("ลบข้อมูลทั้งหมดแล้ว", "success");
      window.location.href = "/";
    } catch (e) {
      toast(e instanceof ApiClientError ? e.message : "ลบข้อมูลไม่สำเร็จ", "error");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Identity header */}
      <section className="flex items-center gap-3 card-enter">
        {auth.pictureUrl ? (
          <Image
            src={auth.pictureUrl}
            alt="รูปโปรไฟล์"
            width={56}
            height={56}
            className="h-14 w-14 rounded-full border border-hairline object-cover"
            unoptimized
          />
        ) : (
          <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-soft text-xl font-bold text-brand-dark">
            {(auth.displayName ?? "ฉัน").slice(0, 1)}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-ink">
            {auth.displayName ?? "ผู้ใช้"}
          </p>
          <p className="text-sm text-ink-muted">โปรไฟล์และความเป็นส่วนตัว</p>
        </div>
      </section>

      {loading ? (
        <div className="space-y-3">
          <Skeleton variant="card" />
          <Skeleton variant="card" />
        </div>
      ) : (
        <>
          {/* Profile fields */}
          <section className="rounded-card bg-surface p-4 shadow-card card-enter">
            <h2 className="mb-3 text-base font-semibold text-ink">ข้อมูลของฉัน</h2>

            <div className="space-y-4">
              {/* Birth year */}
              <div>
                <label
                  htmlFor="profile-birth-year"
                  className="mb-1 block text-sm font-medium text-ink-soft"
                >
                  ปีเกิด (พ.ศ. หรือ ค.ศ.)
                </label>
                <input
                  id="profile-birth-year"
                  type="number"
                  inputMode="numeric"
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  placeholder="เช่น 1958"
                  className="min-h-12 w-full rounded-btn border border-hairline bg-surface px-3 text-base text-ink outline-none focus:border-brand"
                />
                {derivedAge != null && (
                  <p className="mt-1 text-sm text-ink-muted">อายุประมาณ {derivedAge} ปี</p>
                )}
              </div>

              {/* Scheme */}
              <div>
                <p className="mb-2 text-sm font-medium text-ink-soft">สิทธิการรักษา</p>
                <div className="no-scrollbar flex gap-2 overflow-x-auto">
                  {SCHEME_OPTIONS.map((opt) => (
                    <Chip
                      key={opt.value}
                      selected={scheme === opt.value}
                      onClick={() => setScheme(opt.value)}
                    >
                      {opt.label}
                    </Chip>
                  ))}
                </div>
              </div>

              {/* SSS section (only when scheme === SSS) */}
              {scheme === "SSS" && (
                <div>
                  <p className="mb-2 text-sm font-medium text-ink-soft">มาตราประกันสังคม</p>
                  <div className="no-scrollbar flex gap-2 overflow-x-auto">
                    {SSS_SECTIONS.map((sec) => (
                      <Chip
                        key={sec}
                        selected={sssSection === sec}
                        onClick={() =>
                          setSssSection((cur) => (cur === sec ? null : sec))
                        }
                      >
                        มาตรา {sec}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}

              {/* Area */}
              <div>
                <label
                  htmlFor="profile-area"
                  className="mb-1 block text-sm font-medium text-ink-soft"
                >
                  เขต/อำเภอ ที่อยู่
                </label>
                <input
                  id="profile-area"
                  type="text"
                  value={areaCode}
                  onChange={(e) => setAreaCode(e.target.value)}
                  placeholder="เช่น บางกะปิ"
                  className="min-h-12 w-full rounded-btn border border-hairline bg-surface px-3 text-base text-ink outline-none focus:border-brand"
                />
              </div>

              <Button
                onClick={handleSave}
                size="lg"
                fullWidth
                disabled={saving}
                leftIcon={saving ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : undefined}
              >
                {saving ? "กำลังบันทึก…" : "บันทึก"}
              </Button>
            </div>
          </section>

          {/* Consent */}
          <section className="rounded-card bg-surface p-4 shadow-card card-enter">
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-brand" aria-hidden />
              <h2 className="text-base font-semibold text-ink">การยินยอมใช้ข้อมูล</h2>
            </div>
            <ul className="divide-y divide-hairline">
              {CONSENT_ITEMS.map((item) => (
                <li key={item.scope} className="flex items-center gap-3 py-3">
                  <div className="mt-0.5 shrink-0">{item.icon}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{item.label}</p>
                    <p className="text-xs text-ink-muted">{item.desc}</p>
                  </div>
                  <Toggle
                    on={consents[item.scope]}
                    onChange={(v) => handleConsentChange(item.scope, v)}
                    label={`${consents[item.scope] ? "ยกเลิก" : "อนุญาต"}${item.label}`}
                  />
                </li>
              ))}
            </ul>
          </section>

          {/* ความเป็นส่วนตัว — Guardian / เช็คสุขภาพประจำเดือน */}
          <section className="rounded-card bg-surface p-4 shadow-card card-enter">
            <div className="mb-3 flex items-center gap-2">
              <Activity className="h-5 w-5 text-brand" aria-hidden />
              <h2 className="text-base font-semibold text-ink">ความเป็นส่วนตัว · เช็คสุขภาพ</h2>
            </div>

            <div className="flex items-center gap-3 py-1">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">ข้อมูลพฤติกรรมระหว่างเช็คสุขภาพ</p>
                <p className="text-xs text-ink-muted">
                  {guardianConsent == null
                    ? "กำลังโหลดสถานะ…"
                    : guardianConsent.active
                      ? `ยินยอมแล้วเมื่อ ${
                          guardianConsent.granted_at
                            ? new Date(guardianConsent.granted_at).toLocaleDateString("th-TH", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "ก่อนหน้านี้"
                        } — เก็บเฉพาะระหว่างทำแบบเช็ค`
                      : "ยังไม่ได้ให้ความยินยอม — ระบบจะขอก่อนเริ่มเช็คครั้งแรก"}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  guardianConsent?.active
                    ? "bg-rights-soft text-rights"
                    : "bg-canvas text-ink-muted"
                )}
              >
                {guardianConsent?.active ? "เปิดใช้อยู่" : "ปิดอยู่"}
              </span>
            </div>

            <div className="mt-2 flex items-center gap-3 border-t border-hairline py-3">
              <BellRing className="h-5 w-5 shrink-0 text-brand" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">เสียงแจ้งเตือนเมื่อพบสัญญาณผิดปกติ</p>
                <p className="text-xs text-ink-muted">สั่นเตือนยังทำงานตามปกติแม้ปิดเสียง</p>
              </div>
              <Toggle
                on={guardianSound}
                onChange={setGuardianSound}
                label="เสียงแจ้งเตือนเมื่อพบสัญญาณผิดปกติ"
              />
            </div>

            <Link
              href={`${basePath}/health-check`}
              className="block border-t border-hairline py-3 text-sm font-medium text-brand underline"
            >
              ไปหน้าเช็คสุขภาพประจำเดือน
            </Link>

            {guardianConsent?.active && (
              <Button
                variant="outline"
                fullWidth
                className="mt-1 border-safety/40 text-safety"
                onClick={handleGuardianRevoke}
                disabled={revoking}
                leftIcon={
                  revoking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />
                }
              >
                {revoking ? "กำลังลบ…" : "ถอนความยินยอมและลบข้อมูลพฤติกรรม"}
              </Button>
            )}
          </section>

          {/* Accessibility */}
          <section className="rounded-card bg-surface p-4 shadow-card card-enter">
            <div className="flex items-center gap-3">
              <TypeIcon className="h-5 w-5 text-brand" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">ขนาดตัวอักษรใหญ่</p>
                <p className="text-xs text-ink-muted">อ่านสบายตาขึ้นทั้งแอป</p>
              </div>
              <Toggle on={largeText} onChange={setLargeText} label="ขนาดตัวอักษรใหญ่" />
            </div>
          </section>

          {/* Danger zone */}
          <section className="rounded-card border border-safety/40 bg-safety-soft p-4 card-enter">
            <h2 className="mb-1 text-base font-semibold text-safety">ลบข้อมูลของฉัน</h2>
            <p className="mb-3 text-sm text-ink-soft">
              ข้อมูลเก็บแบบเข้ารหัส ลบได้ทุกเมื่อ การลบจะนำข้อมูลทั้งหมดออกอย่างถาวร
            </p>
            <Button
              variant="danger"
              size="lg"
              fullWidth
              onClick={handleDeleteMe}
              disabled={deleting}
              leftIcon={
                deleting ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="h-5 w-5" aria-hidden />
                )
              }
            >
              {deleting ? "กำลังลบ…" : "ลบข้อมูลทั้งหมดของฉัน"}
            </Button>
          </section>

          <p className="px-1 pb-2 text-center text-xs text-ink-muted">
            {surface === "line" ? "เชื่อมต่อผ่าน LINE • " : ""}
            <a href={`${basePath}/history`} className="text-brand underline">
              ดูประวัติการปรึกษา
            </a>
          </p>
        </>
      )}
    </div>
  );
}

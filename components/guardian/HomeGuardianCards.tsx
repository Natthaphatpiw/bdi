"use client";
// การ์ด Guardian บน HomeScreen:
//  1. เช็คสุขภาพประจำเดือน (badge วันที่เช็คล่าสุด / "ครบกำหนดเช็คแล้ว")
//  2. การ์ดนัดเช็คซ้ำ BEFAST ใน 1 ชั่วโมง (in-session reminder)
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, ChevronRight, HeartPulse, X } from "lucide-react";
import { getHealthCheckHistory } from "@/lib/guardian/client";
import { HEALTH_CHECK_DUE_DAYS } from "@/lib/guardian/config";
import { useGuardian } from "@/lib/guardian/store";
import { useAuth } from "@/lib/client/auth";
import { Button } from "@/components/ui/Button";

interface Props {
  basePath: string;
}

function fmtThaiDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

export function HomeGuardianCards({ basePath }: Props) {
  const { ready } = useAuth();
  const recheckDueAt = useGuardian((s) => s.recheckDueAt);
  const recheckSymptom = useGuardian((s) => s.recheckSymptom);
  const clearRecheck = useGuardian((s) => s.clearRecheck);
  const startBefast = useGuardian((s) => s.startBefast);

  const [lastCheckAt, setLastCheckAt] = useState<string | null | undefined>(undefined);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    getHealthCheckHistory()
      .then((res) => {
        if (!cancelled) setLastCheckAt(res.entries[0]?.completed_at ?? null);
      })
      .catch(() => {
        if (!cancelled) setLastCheckAt(null);
      });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  // อัปเดตการ์ดนัดเช็คซ้ำเมื่อถึงเวลา (นาทีละครั้งพอ)
  useEffect(() => {
    if (!recheckDueAt) return;
    const t = setInterval(() => forceTick((v) => v + 1), 60_000);
    return () => clearInterval(t);
  }, [recheckDueAt]);

  const overdue =
    lastCheckAt === null ||
    (typeof lastCheckAt === "string" &&
      Date.now() - new Date(lastCheckAt).getTime() > HEALTH_CHECK_DUE_DAYS * 24 * 3600 * 1000);
  const recheckReady = recheckDueAt != null && Date.now() >= recheckDueAt;

  return (
    <>
      {recheckDueAt != null && (
        <section className="card-enter rounded-card border border-benefit/40 bg-benefit-soft p-4">
          <div className="flex items-start gap-3">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-benefit" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">
                {recheckReady
                  ? "ถึงเวลาเช็คสัญญาณซ้ำแล้ว"
                  : `นัดเช็คสัญญาณซ้ำเวลา ${fmtTime(recheckDueAt)}`}
              </p>
              <p className="mt-0.5 text-xs text-ink-soft">
                จากการเช็คครั้งก่อนที่ยังไม่พบสัญญาณเร่งด่วน — เช็คซ้ำสั้น ๆ เพื่อความแน่ใจ
              </p>
              <div className="mt-2.5 flex gap-2">
                <Button
                  size="md"
                  onClick={() => {
                    clearRecheck();
                    startBefast(recheckSymptom);
                  }}
                >
                  เช็คซ้ำตอนนี้
                </Button>
                <Button size="md" variant="ghost" onClick={clearRecheck} aria-label="ปิดการแจ้งเตือนเช็คซ้ำ">
                  <X className="h-4 w-4" aria-hidden />
                  ปิด
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      <Link href={`${basePath}/health-check`} className="card-enter block">
        <section className="flex items-center gap-3 rounded-card border border-hairline bg-surface p-4 shadow-card transition-colors hover:border-brand/40">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-soft">
            <HeartPulse className="h-6 w-6 text-brand" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">เช็คสุขภาพประจำเดือน · ใช้เวลา 2 นาที</p>
            {lastCheckAt === undefined ? (
              <p className="mt-0.5 text-xs text-ink-muted">กำลังโหลดสถานะ…</p>
            ) : overdue ? (
              <p className="mt-0.5 inline-flex rounded-full bg-benefit-soft px-2 py-0.5 text-xs font-semibold text-benefit">
                ครบกำหนดเช็คแล้ว
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-ink-muted">
                เช็คล่าสุด {fmtThaiDate(lastCheckAt!)}
              </p>
            )}
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-ink-muted" aria-hidden />
        </section>
      </Link>
    </>
  );
}

"use client";
// HistoryScreen — รายการเซสชันการปรึกษาที่ผ่านมา; แตะเพื่อเปิดต่อ และปุ่มเริ่มใหม่.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, History, Plus } from "lucide-react";
import { getSessions, ApiClientError } from "@/lib/client/api";
import { useToast } from "@/store/toast";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

interface Props {
  surface: "web" | "line";
  basePath: string;
}

interface SessionItem {
  id: string;
  channel: string;
  status: string;
  started_at: string;
  preview: string;
}

const CHANNEL_LABEL: Record<string, string> = {
  web: "เว็บ",
  line: "LINE",
};

function formatThaiDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("th-TH", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

export function HistoryScreen({ surface, basePath }: Props) {
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await getSessions();
        if (cancelled) return;
        setSessions(res.sessions);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof ApiClientError ? e.message : "โหลดประวัติไม่สำเร็จ";
        setError(msg);
        toast(msg, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  function openSession(id: string) {
    router.push(`${basePath}/chat?session=${encodeURIComponent(id)}`);
  }

  function startNew() {
    router.push(`${basePath}/chat`);
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-brand" aria-hidden />
          <h1 className="text-lg font-semibold text-ink">ประวัติการปรึกษา</h1>
        </div>
        <Button
          size="md"
          onClick={startNew}
          leftIcon={<Plus className="h-4 w-4" aria-hidden />}
        >
          ปรึกษาใหม่
        </Button>
      </header>

      {loading ? (
        <div className="space-y-3">
          <Skeleton variant="card" />
          <Skeleton variant="card" />
          <Skeleton variant="card" />
        </div>
      ) : error ? (
        <EmptyState
          icon={<History className="h-8 w-8 text-ink-muted" aria-hidden />}
          title="โหลดประวัติไม่สำเร็จ"
          body={error}
          actionLabel="ลองใหม่"
          onAction={() => router.refresh()}
        />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<MessageCircle className="h-8 w-8 text-ink-muted" aria-hidden />}
          title="ยังไม่มีประวัติการปรึกษา"
          body="เริ่มถามเรื่องสิทธิหรืออาการได้เลย เราจะเก็บไว้ให้คุณกลับมาดูได้"
          actionLabel="เริ่มปรึกษาใหม่"
          onAction={startNew}
        />
      ) : (
        <ul className="space-y-3">
          {sessions.map((s) => (
            <li key={s.id} className="card-enter">
              <button
                type="button"
                onClick={() => openSession(s.id)}
                className="tap-lg flex w-full items-start gap-3 rounded-card bg-surface p-4 text-left shadow-card transition active:scale-[0.99]"
              >
                <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft">
                  <MessageCircle className="h-5 w-5 text-brand" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium text-ink">
                    {s.preview?.trim() || "การปรึกษา"}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {formatThaiDate(s.started_at)}
                    {CHANNEL_LABEL[s.channel] ? ` • ${CHANNEL_LABEL[s.channel]}` : ""}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && sessions.length > 0 && (
        <Button
          variant="outline"
          size="lg"
          fullWidth
          onClick={startNew}
          leftIcon={<Plus className="h-5 w-5" aria-hidden />}
        >
          เริ่มปรึกษาใหม่
        </Button>
      )}

      {surface === "line" && !loading && (
        <p className="pb-2 text-center text-xs text-ink-muted">
          ประวัติเชื่อมกับบัญชี LINE ของคุณ
        </p>
      )}
    </div>
  );
}

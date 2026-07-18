"use client";
// RightsScreen — summarizes everything the user's scheme covers via a turn() call.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import type { Card, Profile } from "@/lib/types";
import {
  ApiClientError,
  createSession,
  getProfile,
  turn,
} from "@/lib/client/api";
import { useUi } from "@/store/ui";
import { useToast } from "@/store/toast";
import { cn } from "@/lib/cn";
import { CardStack } from "@/components/cards/CardStack";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

interface Props {
  surface: "web" | "line";
  basePath: string;
}

const RIGHTS_PROMPT =
  "ขอสรุปสิทธิทั้งหมดของฉัน ครอบคลุมบริการอะไร มีสิทธิประโยชน์อะไรบ้าง";

export function RightsScreen({ surface, basePath }: Props) {
  const router = useRouter();
  const toast = useToast();
  const setSessionId = useUi((state) => state.setSessionId);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);

  // Load profile first to decide whether the user can see rights at all.
  useEffect(() => {
    let active = true;
    setProfileLoading(true);
    getProfile()
      .then((p) => {
        if (active) setProfile(p);
      })
      .catch((err: unknown) => {
        if (active) {
          setProfile(null);
          toast(
            err instanceof ApiClientError ? err.message : "โหลดข้อมูลไม่สำเร็จ",
            "error"
          );
        }
      })
      .finally(() => {
        if (active) setProfileLoading(false);
      });
    return () => {
      active = false;
    };
  }, [toast]);

  const ensureSession = useCallback(async (): Promise<string> => {
    // fresh session each load — reusing an old one can carry stale slots
    const res = await createSession(surface === "line" ? "line" : "web");
    setSessionId(res.session_id);
    return res.session_id;
  }, [surface, setSessionId]);

  const loadRights = useCallback(async () => {
    setLoading(true);
    try {
      const sid = await ensureSession();
      const res = await turn(sid, { type: "text", text: RIGHTS_PROMPT });
      setCards(res.cards);
    } catch (err: unknown) {
      toast(
        err instanceof ApiClientError ? err.message : "สรุปสิทธิไม่สำเร็จ",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }, [ensureSession, toast]);

  // Once we know the user has a scheme, fetch their rights summary.
  useEffect(() => {
    if (profileLoading) return;
    if (!profile?.scheme) return;
    void loadRights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileLoading, profile?.scheme]);

  if (profileLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton variant="card" />
        <Skeleton variant="card" />
      </div>
    );
  }

  if (!profile?.scheme) {
    return (
      <EmptyState
        title="ยังไม่ทราบสิทธิของคุณ"
        body="บอกสิทธิเพื่อดูสิ่งที่ครอบคลุม"
        actionLabel="ไปบอกสิทธิ"
        onAction={() => router.push(`${basePath}/profile`)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-ink">สิทธิของฉัน</h1>
        <Button
          variant="outline"
          size="md"
          onClick={() => void loadRights()}
          disabled={loading}
          leftIcon={<RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />}
        >
          รีเฟรช
        </Button>
      </div>

      {loading && cards.length === 0 ? (
        <div className="flex flex-col gap-3">
          <Skeleton variant="card" />
          <Skeleton variant="card" />
        </div>
      ) : cards.length > 0 ? (
        <CardStack cards={cards} surface={surface} />
      ) : (
        <EmptyState
          title="ยังไม่มีข้อมูลสิทธิ"
          body="ลองกดรีเฟรชอีกครั้ง"
          actionLabel="ลองใหม่"
          onAction={() => void loadRights()}
        />
      )}
    </div>
  );
}

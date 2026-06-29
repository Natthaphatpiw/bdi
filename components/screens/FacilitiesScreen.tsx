"use client";
// FacilitiesScreen — find facilities that accept the user's scheme near an area
// or their current location. Results render through a constructed facility Card.
import { useEffect, useState } from "react";
import { MapPin, LocateFixed, Search, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import type { FacilityCard, FacilityResult, Profile, Scheme } from "@/lib/types";
import { getProfile, searchFacilities, ApiClientError } from "@/lib/client/api";
import { useToast } from "@/store/toast";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { CardStack } from "@/components/cards/CardStack";

const SCHEMES: { value: Scheme; label: string }[] = [
  { value: "UCS", label: "บัตรทอง" },
  { value: "SSS", label: "ประกันสังคม" },
  { value: "CSMBS", label: "ข้าราชการ" },
];

interface Props {
  surface: "web" | "line";
  basePath: string;
}

export function FacilitiesScreen({ surface }: Props) {
  const toast = useToast();
  const [scheme, setScheme] = useState<Scheme>("UCS");
  const [area, setArea] = useState("บางกะปิ");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [facilities, setFacilities] = useState<FacilityResult[]>([]);

  // Default scheme from saved profile.
  useEffect(() => {
    let active = true;
    getProfile()
      .then((p: Profile) => {
        if (active && p.scheme) setScheme(p.scheme);
      })
      .catch(() => {
        /* fall back to default scheme */
      });
    return () => {
      active = false;
    };
  }, []);

  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast("อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง", "error");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        toast("ใช้ตำแหน่งปัจจุบันแล้ว", "success");
      },
      () => {
        setLocating(false);
        toast("ไม่สามารถเข้าถึงตำแหน่งได้ ลองกรอกพื้นที่แทน", "error");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function search() {
    setLoading(true);
    setSearched(true);
    try {
      const res = await searchFacilities({
        scheme,
        area: area.trim() || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
        limit: 5,
      });
      setFacilities(res.facilities);
    } catch (e) {
      const msg = e instanceof ApiClientError ? e.message : "ค้นหาสถานพยาบาลไม่สำเร็จ";
      toast(msg, "error");
      setFacilities([]);
    } finally {
      setLoading(false);
    }
  }

  const card: FacilityCard = {
    type: "facility",
    title: "สถานพยาบาลที่แนะนำ",
    items: facilities,
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <MapPin className="text-facility" size={22} aria-hidden />
        <h1 className="text-lg font-semibold text-ink">หาสถานพยาบาล</h1>
      </header>

      <section className="rounded-card bg-surface shadow-card p-4 space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink-soft">สิทธิของคุณ</p>
          <div className="no-scrollbar overflow-x-auto flex gap-2">
            {SCHEMES.map((s) => (
              <Chip
                key={s.value}
                selected={scheme === s.value}
                onClick={() => setScheme(s.value)}
              >
                {s.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="fac-area" className="text-sm font-medium text-ink-soft">
            พื้นที่ / เขต
          </label>
          <input
            id="fac-area"
            type="text"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="เช่น บางกะปิ"
            className="w-full rounded-btn border border-hairline bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none min-h-12"
          />
        </div>

        <Button
          variant="outline"
          fullWidth
          leftIcon={<LocateFixed size={18} aria-hidden />}
          onClick={useMyLocation}
          disabled={locating}
          className={cn(coords && "border-brand text-brand-dark")}
        >
          {locating
            ? "กำลังหาตำแหน่ง…"
            : coords
              ? "ใช้ตำแหน่งของฉันแล้ว"
              : "ใช้ตำแหน่งของฉัน"}
        </Button>

        <Button
          variant="primary"
          size="lg"
          fullWidth
          leftIcon={<Search size={18} aria-hidden />}
          onClick={search}
          disabled={loading}
        >
          {loading ? "กำลังค้นหา…" : "ค้นหา"}
        </Button>
      </section>

      {loading && (
        <div className="space-y-3">
          <Skeleton variant="card" />
          <Skeleton variant="card" />
        </div>
      )}

      {!loading && searched && facilities.length === 0 && (
        <EmptyState
          icon={<MapPin size={32} className="text-ink-muted" aria-hidden />}
          title="ไม่พบสถานพยาบาล"
          body="ลองขยายพื้นที่ค้นหา หรือโทรสายด่วน สปสช. 1330 เพื่อสอบถามเพิ่มเติม"
          actionLabel="ค้นหาอีกครั้ง"
          onAction={search}
        />
      )}

      {!loading && facilities.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-muted">พบ {facilities.length} แห่ง</p>
            <button
              type="button"
              onClick={search}
              aria-label="ค้นหาใหม่"
              title="ค้นหาใหม่"
              className="inline-flex items-center gap-1 text-sm text-brand-dark"
            >
              <RefreshCw size={16} aria-hidden />
              รีเฟรช
            </button>
          </div>
          <CardStack cards={[card]} surface={surface} />
        </div>
      )}
    </div>
  );
}

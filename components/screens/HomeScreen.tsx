"use client";
// HomeScreen — entry tiles + example prompts. Surface-agnostic (web + LIFF).
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareText, ShieldCheck, MapPin, FileText, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/client/auth";
import { cn } from "@/lib/cn";

interface Props {
  surface: "web" | "line";
  basePath: string;
}

interface Tile {
  icon: ReactNode;
  label: string;
  desc: string;
  href: string;
  iconWrap: string;
}

const EXAMPLES = [
  "พ่อ 68 เบาหวาน น้ำตาลขึ้นบ่อย บางกะปิ บัตรทอง",
  "จ่ายประกันสังคม ไม่รู้มีสิทธิ์อะไร",
  "ปวดหัวมาก ตาพร่า ควรทำอย่างไร",
  "หาคลินิกใกล้บ้านที่รับบัตรทอง",
];

export function HomeScreen({ basePath }: Props) {
  const router = useRouter();
  const { displayName } = useAuth();

  const tiles: Tile[] = [
    {
      icon: <MessageSquareText className="h-5 w-5" aria-hidden="true" />,
      label: "ปรึกษาอาการ",
      desc: "เล่าอาการ รับคำแนะนำ",
      href: `${basePath}/chat?intent=symptom`,
      iconWrap: "bg-brand text-white",
    },
    {
      icon: <ShieldCheck className="h-5 w-5" aria-hidden="true" />,
      label: "เช็กสิทธิของฉัน",
      desc: "สิทธิ์และสิทธิประโยชน์",
      href: `${basePath}/chat?intent=rights`,
      iconWrap: "bg-rights text-white",
    },
    {
      icon: <MapPin className="h-5 w-5" aria-hidden="true" />,
      label: "หาสถานพยาบาล",
      desc: "ใกล้คุณ รับสิทธิ์ของคุณ",
      href: `${basePath}/facilities`,
      iconWrap: "bg-facility text-white",
    },
    {
      icon: <FileText className="h-5 w-5" aria-hidden="true" />,
      label: "ส่งเอกสาร / ประกัน",
      desc: "อ่าน PDF หาสิทธิ์เสริม",
      href: `${basePath}/documents`,
      iconWrap: "bg-brand-dark text-white",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="card-enter">
        <h1 className="text-xl font-bold text-ink">
          สวัสดี{displayName ? ` ${displayName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">วันนี้ให้เราช่วยเรื่องอะไรดี</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <button
            key={tile.label}
            type="button"
            onClick={() => router.push(tile.href)}
            className={cn(
              "card-enter tap-lg flex flex-col items-start gap-3 rounded-card border border-hairline bg-surface p-4 text-left shadow-card",
              "transition-colors hover:border-brand/40 active:bg-canvas"
            )}
          >
            <span
              className={cn("grid h-10 w-10 place-items-center rounded-btn", tile.iconWrap)}
              aria-hidden="true"
            >
              {tile.icon}
            </span>
            <span className="flex flex-col">
              <span className="text-base font-semibold text-ink">{tile.label}</span>
              <span className="text-xs text-ink-muted">{tile.desc}</span>
            </span>
          </button>
        ))}
      </div>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-ink-soft">ตัวอย่างคำถาม</p>
        <div className="flex flex-col gap-2">
          {EXAMPLES.map((text) => (
            <button
              key={text}
              type="button"
              onClick={() => router.push(`${basePath}/chat?q=${encodeURIComponent(text)}`)}
              className="card-enter flex items-center justify-between gap-3 rounded-btn border border-hairline bg-surface px-4 py-3 text-left text-sm text-ink transition-colors hover:border-brand/40 active:bg-canvas"
            >
              <span className="min-w-0 flex-1">{text}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

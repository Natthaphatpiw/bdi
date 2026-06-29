"use client";
// HomeScreen — entry tiles + example prompts. Surface-agnostic (web + LIFF).
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/client/auth";
import { cn } from "@/lib/cn";
import { Chip } from "@/components/ui/Chip";

interface Props {
  surface: "web" | "line";
  basePath: string;
}

interface Tile {
  emoji: string;
  label: string;
  href: string;
  accent: string;
}

const EXAMPLES = [
  "พ่อ 68 เบาหวาน น้ำตาลขึ้นบ่อย บางกะปิ บัตรทอง",
  "จ่ายประกันสังคม ไม่รู้มีสิทธิ์อะไร",
  "ปวดหัวมาก ตาพร่า ควรทำยังไง",
  "หาคลินิกใกล้บ้านที่รับบัตรทอง",
];

export function HomeScreen({ basePath }: Props) {
  const router = useRouter();
  const { displayName } = useAuth();

  const tiles: Tile[] = [
    { emoji: "💬", label: "ปรึกษาอาการ", href: `${basePath}/chat?intent=symptom`, accent: "text-brand" },
    { emoji: "🎫", label: "เช็กสิทธิ์ของฉัน", href: `${basePath}/chat?intent=rights`, accent: "text-benefit" },
    { emoji: "📍", label: "หาสถานพยาบาล", href: `${basePath}/facilities`, accent: "text-facility" },
    { emoji: "📄", label: "ส่งเอกสาร/ประกัน", href: `${basePath}/documents`, accent: "text-brand-dark" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <header className="card-enter">
        <h1 className="text-xl font-bold text-ink">
          สวัสดีค่ะ{displayName ? ` ${displayName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">วันนี้อยากให้ช่วยเรื่องอะไรดีคะ</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <button
            key={tile.label}
            type="button"
            onClick={() => router.push(tile.href)}
            className={cn(
              "card-enter tap-lg flex flex-col items-start gap-2 rounded-card bg-surface p-4 text-left shadow-card",
              "transition-transform active:scale-[0.98]"
            )}
          >
            <span className="text-3xl leading-none" aria-hidden="true">
              {tile.emoji}
            </span>
            <span className={cn("text-base font-semibold", tile.accent)}>{tile.label}</span>
          </button>
        ))}
      </div>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-ink-soft">ลองถามแบบนี้</p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((text) => (
            <Chip
              key={text}
              tone="brand"
              onClick={() => router.push(`${basePath}/chat?q=${encodeURIComponent(text)}`)}
            >
              {text}
            </Chip>
          ))}
        </div>
      </section>
    </div>
  );
}

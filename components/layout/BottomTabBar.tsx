"use client";
// Fixed bottom tab bar for the LIFF shell. 4 destinations under basePath.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, Ticket, MapPin, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

interface BottomTabBarProps {
  basePath: string;
}

interface Tab {
  label: string;
  href: string;
  Icon: LucideIcon;
}

export function BottomTabBar({ basePath }: BottomTabBarProps) {
  const pathname = usePathname();

  const tabs: Tab[] = [
    { label: "ปรึกษา", href: basePath, Icon: MessageCircle },
    { label: "สิทธิ์", href: basePath + "/rights", Icon: Ticket },
    { label: "หาสถานพยาบาล", href: basePath + "/facilities", Icon: MapPin },
    { label: "โปรไฟล์", href: basePath + "/profile", Icon: User },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-hairline pb-safe grid grid-cols-4">
      {tabs.map(({ label, href, Icon }) => {
        const active =
          href === basePath
            ? pathname === basePath || pathname === basePath + "/chat" || pathname.startsWith(basePath + "/case/")
            : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "min-h-14 flex flex-col items-center justify-center gap-0.5 text-xs",
              active ? "text-brand" : "text-ink-muted"
            )}
          >
            <Icon className="w-6 h-6" aria-hidden />
            <span className="truncate max-w-full px-1">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

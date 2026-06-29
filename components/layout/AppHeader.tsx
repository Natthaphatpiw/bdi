"use client";
// Sticky app header for the LIFF shell: left slot (or Logo) + title + large-text toggle.
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { IconButton } from "@/components/ui/IconButton";
import { useUi } from "@/store/ui";
import { cn } from "@/lib/cn";

interface AppHeaderProps {
  title?: string;
  left?: ReactNode;
}

export function AppHeader({ title = "รู้สิทธิ์ รู้สุข", left }: AppHeaderProps) {
  const largeText = useUi((s) => s.largeText);
  const toggleLargeText = useUi((s) => s.toggleLargeText);

  return (
    <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur border-b border-hairline pt-safe">
      <div className="flex items-center gap-2 px-4 h-14">
        <div className="flex items-center shrink-0">{left ?? <Logo size={24} />}</div>
        <h1 className="flex-1 truncate text-base font-semibold text-ink">{title}</h1>
        <IconButton
          tone="neutral"
          label="ปรับขนาดตัวอักษร"
          onClick={toggleLargeText}
          className={cn(
            "font-bold",
            largeText ? "bg-brand-soft text-brand-dark" : "text-ink-soft"
          )}
          icon={<span aria-hidden className="text-sm leading-none">Aa</span>}
        />
      </div>
    </header>
  );
}

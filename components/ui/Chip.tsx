"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ChipTone = "neutral" | "review" | "info" | "brand";

export interface ChipProps {
  selected?: boolean;
  tone?: ChipTone;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

const toneClasses: Record<ChipTone, string> = {
  neutral: "text-ink",
  review: "text-review",
  info: "text-info",
  brand: "text-brand-dark",
};

export function Chip({
  selected = false,
  tone = "neutral",
  onClick,
  children,
  className,
}: ChipProps) {
  const interactive = typeof onClick === "function";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={interactive ? selected : undefined}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-hairline bg-surface px-3 py-2 text-sm font-medium transition-colors",
        toneClasses[tone],
        selected && "border-brand bg-brand text-white",
        !interactive && "cursor-default",
        className,
      )}
    >
      {children}
    </button>
  );
}

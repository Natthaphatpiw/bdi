"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone =
  | "rights"
  | "benefit"
  | "facility"
  | "safety"
  | "review"
  | "info";

export interface BadgeProps {
  tone: BadgeTone;
  children: ReactNode;
  className?: string;
}

const toneClasses: Record<BadgeTone, string> = {
  rights: "bg-brand-soft text-brand-dark",
  benefit: "bg-benefit-soft text-benefit",
  facility: "bg-facility-soft text-facility",
  safety: "bg-safety-soft text-safety",
  review: "bg-gray-100 text-review",
  info: "bg-facility-soft text-info",
};

export function Badge({ tone, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

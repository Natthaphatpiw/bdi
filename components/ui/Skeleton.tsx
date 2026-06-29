"use client";

import { cn } from "@/lib/cn";

export type SkeletonVariant = "card" | "line";

export interface SkeletonProps {
  variant?: SkeletonVariant;
  className?: string;
}

const variantClasses: Record<SkeletonVariant, string> = {
  card: "h-28 w-full rounded-card",
  line: "h-4 w-full rounded",
};

export function Skeleton({ variant = "line", className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded bg-gray-200",
        variantClasses[variant],
        className,
      )}
    />
  );
}

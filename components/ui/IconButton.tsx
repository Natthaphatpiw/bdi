"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type IconButtonTone = "brand" | "neutral" | "danger";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  icon: ReactNode;
  label: string;
  tone?: IconButtonTone;
}

const toneClasses: Record<IconButtonTone, string> = {
  brand: "text-brand hover:bg-brand-soft",
  neutral: "text-ink-soft hover:bg-gray-100",
  danger: "text-safety hover:bg-safety-soft",
};

export function IconButton({
  icon,
  label,
  tone = "neutral",
  type = "button",
  className,
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
}

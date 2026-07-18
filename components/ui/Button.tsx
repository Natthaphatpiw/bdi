"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "danger" | "line" | "ghost" | "outline";
export type ButtonSize = "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white",
  danger: "bg-safety text-white",
  line: "bg-line text-white",
  outline: "border border-hairline bg-surface text-ink",
  ghost: "bg-transparent text-ink",
};

const sizeClasses: Record<ButtonSize, string> = {
  md: "min-h-11 px-4",
  lg: "min-h-12 text-base px-5",
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  leftIcon,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-btn font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {leftIcon}
      {children}
    </button>
  );
}

export default Button;

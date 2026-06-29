"use client";

import Image from "next/image";
import { cn } from "@/lib/cn";

export interface LogoProps {
  size?: number;
  withText?: boolean;
  className?: string;
}

export function Logo({ size = 28, withText = false, className }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Image
        src="/icon.svg"
        alt="รู้สิทธิ์ รู้สุข"
        width={size}
        height={size}
        priority
      />
      {withText && (
        <span className="font-bold text-brand-dark">รู้สิทธิ์ รู้สุข</span>
      )}
    </span>
  );
}

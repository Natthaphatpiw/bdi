"use client";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function ChatBubble({
  role,
  children,
}: {
  role: "user" | "assistant";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "max-w-[85%] rounded-card p-3 my-1",
        role === "user"
          ? "ml-auto bg-brand-soft text-ink"
          : "mr-auto bg-surface border border-hairline text-ink"
      )}
    >
      {children}
    </div>
  );
}

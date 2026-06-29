"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className,
      )}
    >
      {icon && <div className="text-ink-muted">{icon}</div>}
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {body && <p className="max-w-xs text-sm text-ink-muted">{body}</p>}
      {actionLabel && onAction && (
        <Button variant="primary" size="lg" onClick={onAction} className="mt-1">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

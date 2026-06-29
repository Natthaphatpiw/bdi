"use client";
// LIFF shell: auth gating (splash / error / app), AppHeader + main + BottomTabBar, global Toaster.
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { Toaster } from "@/components/ui/Toast";
import { AppHeader } from "./AppHeader";
import { BottomTabBar } from "./BottomTabBar";
import { useAuth } from "@/lib/client/auth";
import { useUi } from "@/store/ui";
import { cn } from "@/lib/cn";

interface LiffShellProps {
  children: ReactNode;
}

export function LiffShell({ children }: LiffShellProps) {
  const { ready, error } = useAuth();
  const largeText = useUi((s) => s.largeText);

  if (!ready && !error) {
    return (
      <div className="min-h-screen bg-canvas grid place-items-center px-6 pt-safe pb-safe">
        <div className="flex flex-col items-center gap-4 text-center">
          <Logo size={64} />
          <Loader2 className="w-8 h-8 text-brand animate-spin" aria-hidden />
          <p className="text-ink-soft text-sm">กำลังเข้าสู่ระบบด้วย LINE…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-canvas grid place-items-center px-6 pt-safe pb-safe">
        <div className="w-full max-w-sm bg-surface rounded-card shadow-card p-6 text-center flex flex-col items-center gap-4">
          <Logo size={48} />
          <p className="text-ink-soft text-sm">{error}</p>
          <Button fullWidth onClick={() => location.reload()}>
            ลองใหม่
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen bg-canvas pb-24", largeText && "large-text")}>
      <Toaster />
      <AppHeader />
      <main className="max-w-xl mx-auto px-4 py-3">{children}</main>
      <BottomTabBar basePath="/liff" />
    </div>
  );
}

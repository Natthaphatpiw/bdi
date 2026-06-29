"use client";
// Desktop/web shell: top nav with horizontal links + Aa toggle, centered main, global Toaster.
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";
import { Toaster } from "@/components/ui/Toast";
import { useAuth } from "@/lib/client/auth";
import { useUi } from "@/store/ui";
import { cn } from "@/lib/cn";

interface WebShellProps {
  children: ReactNode;
}

interface NavLink {
  label: string;
  href: string;
}

const NAV_LINKS: NavLink[] = [
  { label: "ปรึกษา", href: "/chat" },
  { label: "สิทธิ์", href: "/rights" },
  { label: "หาสถานพยาบาล", href: "/facilities" },
  { label: "เอกสาร", href: "/documents" },
  { label: "ประวัติ", href: "/history" },
  { label: "โปรไฟล์", href: "/profile" },
];

export function WebShell({ children }: WebShellProps) {
  const pathname = usePathname();
  const { ready, error } = useAuth();
  const largeText = useUi((s) => s.largeText);
  const toggleLargeText = useUi((s) => s.toggleLargeText);

  function Gate() {
    if (error) {
      return (
        <div className="grid min-h-[60vh] place-items-center">
          <div className="w-full max-w-md rounded-card border border-hairline bg-surface p-6 text-center shadow-card">
            <h2 className="text-base font-semibold text-ink">เชื่อมต่อระบบไม่สำเร็จ</h2>
            <p className="mt-2 text-sm text-ink-soft">{error}</p>
            <div className="mt-4">
              <Button fullWidth onClick={() => location.reload()}>
                ลองใหม่
              </Button>
            </div>
          </div>
        </div>
      );
    }
    if (!ready) {
      return (
        <div className="grid min-h-[60vh] place-items-center">
          <div className="flex flex-col items-center gap-3 text-ink-soft">
            <Loader2 className="h-7 w-7 animate-spin text-brand" aria-hidden="true" />
            <p className="text-sm">กำลังเชื่อมต่อ…</p>
          </div>
        </div>
      );
    }
    return <>{children}</>;
  }

  return (
    <div className={cn("min-h-screen bg-canvas", largeText && "large-text")}>
      <Toaster />
      <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur border-b border-hairline pt-safe">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/" className="shrink-0" aria-label="หน้าหลัก รู้สิทธิ์ รู้สุข">
            <Logo withText />
          </Link>
          <nav className="flex-1 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm">
            {NAV_LINKS.map(({ label, href }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "py-1 font-medium",
                    active ? "text-brand" : "text-ink-soft hover:text-ink"
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
          <IconButton
            tone="neutral"
            label="ปรับขนาดตัวอักษร"
            onClick={toggleLargeText}
            className={cn(
              "shrink-0 font-bold",
              largeText ? "bg-brand-soft text-brand-dark" : "text-ink-soft"
            )}
            icon={<span aria-hidden className="text-sm leading-none">Aa</span>}
          />
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-4">
        <Gate />
      </main>
    </div>
  );
}

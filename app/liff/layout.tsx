import type { ReactNode } from "react";
import { Providers } from "@/app/providers";
import { LiffShell } from "@/components/layout/LiffShell";

export default function LiffLayout({ children }: { children: ReactNode }) {
  return (
    <Providers surface="line">
      <LiffShell>{children}</LiffShell>
    </Providers>
  );
}

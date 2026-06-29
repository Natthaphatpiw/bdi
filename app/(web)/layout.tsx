import type { ReactNode } from "react";
import { Providers } from "@/app/providers";
import { WebShell } from "@/components/layout/WebShell";

export default function WebLayout({ children }: { children: ReactNode }) {
  return (
    <Providers surface="web">
      <WebShell>{children}</WebShell>
    </Providers>
  );
}

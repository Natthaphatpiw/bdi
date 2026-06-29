"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { AuthProvider, type Surface } from "@/lib/client/auth";

export function Providers({ surface, children }: { surface: Surface; children: ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
      })
  );
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider surface={surface}>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

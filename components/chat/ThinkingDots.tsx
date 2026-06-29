"use client";
// Animated "processing" indicator (ChatGPT-style bouncing dots).
export function ThinkingDots({ label = "กำลังประมวลผล…" }: { label?: string }) {
  return (
    <div
      className="mr-auto inline-flex items-center gap-2 rounded-card border border-hairline bg-surface px-4 py-3"
      role="status"
      aria-label={label}
    >
      <span className="flex items-center gap-1" aria-hidden="true">
        {[0, 160, 320].map((d) => (
          <span
            key={d}
            className="h-2 w-2 animate-bounce rounded-full bg-brand"
            style={{ animationDelay: `${d}ms` }}
          />
        ))}
      </span>
      <span className="text-sm text-ink-soft">{label}</span>
    </div>
  );
}

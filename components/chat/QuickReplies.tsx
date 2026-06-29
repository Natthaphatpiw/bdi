"use client";
import { Chip } from "@/components/ui/Chip";

export function QuickReplies({
  options,
  onPick,
}: {
  options: string[];
  onPick: (s: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="my-1 flex flex-wrap gap-2">
      {options.map((opt, i) => (
        <Chip key={i} tone="brand" onClick={() => onPick(opt)}>
          {opt}
        </Chip>
      ))}
    </div>
  );
}

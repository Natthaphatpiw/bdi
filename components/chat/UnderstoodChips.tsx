"use client";
import { Pencil } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import type { Scheme, Understood } from "@/lib/types";

const SCHEME_LABEL: Record<Scheme, string> = {
  UCS: "บัตรทอง",
  SSS: "ประกันสังคม",
  CSMBS: "ข้าราชการ",
};

export function UnderstoodChips({
  data,
  onEdit,
}: {
  data: Understood;
  onEdit?: () => void;
}) {
  const chips: string[] = [];
  if (data.patient_role) chips.push(data.patient_role);
  if (typeof data.age === "number") chips.push("อายุ " + data.age);
  if (data.condition_hint) chips.push(data.condition_hint);
  if (data.scheme) chips.push(SCHEME_LABEL[data.scheme]);
  if (data.area) chips.push(data.area);
  if (data.symptoms) for (const s of data.symptoms) chips.push(s);

  if (chips.length === 0 && !onEdit) return null;

  return (
    <div className="my-1 flex items-center gap-2">
      <span className="shrink-0 text-xs text-ink-muted">AI เข้าใจว่า:</span>
      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto">
        {chips.map((label, i) => (
          <Chip key={i} tone="info" className="shrink-0">
            {label}
          </Chip>
        ))}
        {onEdit && (
          <Chip onClick={onEdit} className="shrink-0">
            <span className="inline-flex items-center gap-1">
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              แก้
            </span>
          </Chip>
        )}
      </div>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton } from "@/components/ui/IconButton";

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: ReactNode;
}

export function Sheet({ open, onOpenChange, title, children }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-card bg-surface p-4 pb-safe shadow-sheet",
          )}
        >
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-hairline" />
          <div className="mb-2 flex items-start justify-between gap-2">
            {title ? (
              <Dialog.Title className="text-lg font-semibold text-ink">
                {title}
              </Dialog.Title>
            ) : (
              <Dialog.Title className="sr-only">เมนู</Dialog.Title>
            )}
            <Dialog.Close asChild>
              <IconButton icon={<X size={20} />} label="ปิด" tone="neutral" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            แผงรายละเอียดเลื่อนขึ้นจากด้านล่าง
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

"use client";
// Tiny global toast store. <Toaster/> (components/ui/Toast.tsx) renders these.
import { create } from "zustand";

export type ToastTone = "info" | "error" | "success";
export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: ToastItem[];
  show: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
}

let seq = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (message, tone = "info") => {
    const id = seq++;
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Convenience hook: const toast = useToast(); toast("ข้อความ", "error") */
export function useToast() {
  const show = useToastStore((s) => s.show);
  return show;
}

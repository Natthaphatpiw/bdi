"use client";
// Lightweight UI/session state (Zustand). Persists largeText + voice mode.
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  largeText: boolean;
  voiceMode: "hold" | "toggle";
  sessionId: string | null;
  /** เสียงแจ้งเตือนสั้นของ Guardian (ปิดได้ใน ตั้งค่า > ความเป็นส่วนตัว) */
  guardianSound: boolean;
  setLargeText: (v: boolean) => void;
  toggleLargeText: () => void;
  setVoiceMode: (m: "hold" | "toggle") => void;
  setSessionId: (id: string | null) => void;
  setGuardianSound: (v: boolean) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      largeText: false,
      voiceMode: "toggle",
      sessionId: null,
      guardianSound: true,
      setLargeText: (v) => set({ largeText: v }),
      toggleLargeText: () => set((s) => ({ largeText: !s.largeText })),
      setVoiceMode: (m) => set({ voiceMode: m }),
      setSessionId: (id) => set({ sessionId: id }),
      setGuardianSound: (v) => set({ guardianSound: v }),
    }),
    { name: "rusit-ui" }
  )
);

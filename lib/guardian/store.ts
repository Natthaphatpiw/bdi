"use client";
// Guardian client state (Zustand) — popup/BEFAST flow state is ephemeral;
// the re-check reminder + pending prefill story persist so they survive
// navigation between screens.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GuardianPattern, GuardianSignal } from './types';

interface GuardianState {
  /** popup กำลังโชว์ pattern ไหน (null = ปิด) */
  activePattern: GuardianPattern | null;
  signal: GuardianSignal | null;
  eventId: string | null;
  simSheetOpen: boolean;
  befastOpen: boolean;
  /** อาการที่เลือกจาก popup — ส่งต่อเข้า BEFAST/Emergency */
  chosenSymptom: string | null;

  /** นัดเช็คซ้ำใน 1 ชม. หลัง BEFAST ปกติ (persisted, in-session reminder) */
  recheckDueAt: number | null;
  recheckSymptom: string | null;

  /** เรื่องเล่าสังเคราะห์รอส่งเข้า flow หลักบน HomeScreen (triage prefill) */
  pendingStory: string | null;

  /** surface ล่าสุด (line/web) — หน้า /guardian/emergency ใช้เลือก AuthProvider */
  lastSurface: 'line' | 'web';

  openPopup: (signal: GuardianSignal, eventId: string | null) => void;
  closePopup: () => void;
  setSimSheetOpen: (open: boolean) => void;
  startBefast: (symptom: string | null) => void;
  closeBefast: () => void;
  setRecheck: (dueAt: number, symptom: string | null) => void;
  clearRecheck: () => void;
  setPendingStory: (story: string | null) => void;
  setLastSurface: (surface: 'line' | 'web') => void;
}

export const useGuardian = create<GuardianState>()(
  persist(
    (set) => ({
      activePattern: null,
      signal: null,
      eventId: null,
      simSheetOpen: false,
      befastOpen: false,
      chosenSymptom: null,
      recheckDueAt: null,
      recheckSymptom: null,
      pendingStory: null,
      lastSurface: 'line',

      openPopup: (signal, eventId) =>
        set({ activePattern: signal.pattern, signal, eventId, befastOpen: false }),
      closePopup: () => set({ activePattern: null }),
      setSimSheetOpen: (open) => set({ simSheetOpen: open }),
      startBefast: (symptom) =>
        set({ befastOpen: true, chosenSymptom: symptom, activePattern: null }),
      closeBefast: () => set({ befastOpen: false }),
      setRecheck: (dueAt, symptom) => set({ recheckDueAt: dueAt, recheckSymptom: symptom }),
      clearRecheck: () => set({ recheckDueAt: null, recheckSymptom: null }),
      setPendingStory: (story) => set({ pendingStory: story }),
      setLastSurface: (surface) => set({ lastSurface: surface }),
    }),
    {
      name: 'rusit-guardian',
      partialize: (s) => ({
        recheckDueAt: s.recheckDueAt,
        recheckSymptom: s.recheckSymptom,
        pendingStory: s.pendingStory,
        lastSurface: s.lastSurface,
      }),
    }
  )
);

"use client";

// Preferensi suara Shorts GLOBAL — mengingat pilihan bisu pengguna di semua
// Short (persist di localStorage, seperti TikTok yang mengingat satu setelan
// volume untuk seluruh feed), sekaligus menghapus desync lama: observer
// tidak lagi memaksa `muted=false` tiap Short jadi terlihat.

import { create } from "zustand";
import { persist } from "zustand/middleware";

type ShortsSoundState = {
  muted: boolean;
  /** Browser pernah memblokir autoplay bersuara di sesi ini */
  soundBlockedOnce: boolean;
  setMuted: (v: boolean) => void;
  toggle: () => void;
  markBlocked: () => void;
  clearBlocked: () => void;
};

export const useShortsSound = create<ShortsSoundState>()(
  persist(
    (set) => ({
      muted: false,
      soundBlockedOnce: false,
      setMuted: (v) => set({ muted: v }),
      toggle: () => set((s) => ({ muted: !s.muted })),
      markBlocked: () => set({ soundBlockedOnce: true }),
      clearBlocked: () => set({ soundBlockedOnce: false }),
    }),
    { name: "skelz-shorts-sound" }
  )
);

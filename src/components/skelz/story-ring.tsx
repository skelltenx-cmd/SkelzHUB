"use client";

import { createContext, useContext, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useStories } from "./hooks";
import type { Me } from "@/lib/types";

// ============================================================
// Ring story GLOBAL — seperti aplikasi sosial pada umumnya:
// avatar siapa pun (post, komentar, chat, notifikasi, dll.) yang
// punya story aktif mendapat lingkaran gradient di sekelilingnya.
// Klik avatar -> story milik user itu langsung terbuka.
//
// Provider ini dipasang sekali di App (membungkus Shell) sehingga
// SEMUA menu otomatis mendukung ring story tanpa fetch tambahan
// (data diambil dari cache react-query yang sama dengan rail story).
// ============================================================

export type StoryRingInfo = {
  /** user punya story aktif */
  has: boolean;
  /** ada item yang belum aku tonton */
  unseen: boolean;
};

type StoryRingCtx = {
  /** Info ring story untuk satu username (null = tidak ada story) */
  ring: (username: string) => StoryRingInfo | null;
  /** Buka penampil story milik username (kalau ada) */
  open: (username: string) => void;
  /** true kalau data story masih dimuat */
  loading: boolean;
};

const Ctx = createContext<StoryRingCtx | null>(null);

// Dimuat terpisah supaya tidak membungkus bundel utama (viewer berat).
const StoryViewer = dynamic(() => import("./story").then((m) => m.StoryViewer), {
  ssr: false,
});

export function StoryRingProvider({ me, children }: { me: Me | null; children: React.ReactNode }) {
  const query = useStories(!!me);
  const groups = useMemo(() => query.data?.groups ?? [], [query.data]);

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const map = useMemo(() => {
    const m = new Map<string, number>();
    groups.forEach((g, i) => m.set(g.author.username, i));
    return m;
  }, [groups]);

  const value = useMemo<StoryRingCtx>(
    () => ({
      ring: (username: string) => {
        const idx = map.get(username);
        if (idx === undefined) return null;
        const g = groups[idx];
        if (!g || g.items.length === 0) return null;
        return { has: true, unseen: g.hasUnseen };
      },
      open: (username: string) => {
        const idx = map.get(username);
        if (idx !== undefined) setViewerIndex(idx);
      },
      loading: query.isLoading,
    }),
    [map, groups, query.isLoading]
  );

  const open = viewerIndex !== null && groups[viewerIndex] !== undefined;

  return (
    <Ctx.Provider value={value}>
      {children}
      {open && me && (
        <StoryViewer groups={groups} startIndex={viewerIndex as number} me={me} onClose={() => setViewerIndex(null)} />
      )}
    </Ctx.Provider>
  );
}

/** Hook ring story: null kalau provider tidak ada (aman dipakai di mana saja). */
export function useStoryRing(): StoryRingCtx | null {
  return useContext(Ctx);
}

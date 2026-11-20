"use client";

import { cn } from "@/lib/utils";
import { Play, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/i18n";
import { AVATAR_GRADIENTS, initials, mediaThumb } from "./utils";
import { useStoryRing } from "./story-ring";

type Props = {
  name: string;
  color: number;
  /** URL foto profil (null/undefined = avatar gradient) */
  avatar?: string | null;
  size?: number;
  className?: string;
  ring?: boolean;
  /** Titik hijau status online (di kanan-bawah avatar) */
  online?: boolean;
};

export function UserAvatar({ name, color, avatar, size = 40, className, ring, online }: Props) {
  const gradient = AVATAR_GRADIENTS[Math.abs(color) % AVATAR_GRADIENTS.length];
  return (
    <span className={cn("relative inline-block shrink-0", className)} style={{ width: size, height: size }}>
      {avatar ? (
        <span
          className={cn(
            "inline-block select-none overflow-hidden rounded-full bg-muted",
            ring && "ring-2 ring-background"
          )}
          style={{ width: size, height: size }}
        >
          {/* Thumbnail server: avatar 40px tak perlu memuat foto resolusi penuh */}
          <img
            src={mediaThumb(avatar, size <= 48 ? 96 : 160) ?? undefined}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex select-none items-center justify-center rounded-full bg-gradient-to-br font-bold text-white",
            gradient,
            ring && "ring-2 ring-background"
          )}
          style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}
        >
          {initials(name)}
        </span>
      )}
      {online !== undefined && (
        <span
          aria-label={online ? "Online" : "Offline"}
          className={cn(
            "absolute bottom-0 right-0 block rounded-full border-2 border-background",
            online ? "bg-emerald-500" : "bg-zinc-400"
          )}
          style={{ width: Math.max(9, size * 0.26), height: Math.max(9, size * 0.26) }}
        />
      )}
    </span>
  );
}

/** Bingkai ring story di sekeliling avatar (gradient kalau belum dilihat).
 *
 *  Ring digambar sebagai OVERLAY ABSOLUT (tidak menambah ukuran kotak):
 *  ukuran avatar tetap `size` — baris/kartu tidak "melompat" 6px saat data
 *  story tiba dari server (dulu bingkai +6px muncul mendadak, layout
 *  bergeser setelah feed termuat). */
function StoryRingFrame({
  unseen,
  children,
  size,
}: {
  unseen: boolean;
  children: React.ReactNode;
  size: number;
}) {
  return (
    <span className="relative inline-block shrink-0 rounded-full" style={{ width: size, height: size }}>
      {/* pita gradient (5px keluar) — animasinya transform-only (GPU) */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute rounded-full",
          unseen
            ? "animate-story-ring bg-gradient-to-tr from-rose-500 via-pink-500 to-orange-400"
            : "bg-muted-foreground/30"
        )}
        style={{ inset: -5 }}
      />
      {/* celah tipis antara pita dan avatar */}
      <span aria-hidden="true" className="pointer-events-none absolute rounded-full bg-background" style={{ inset: -2 }} />
      <span className="relative flex h-full w-full items-center justify-center rounded-full">{children}</span>
    </span>
  );
}

/** Menu pilihan saat ring story ditekan: lihat story atau buka profil.
 *
 *  Dipakai bersama oleh UserAvatarLink & UserAvatarStory supaya perilaku
 *  SAMA di semua tempat (feed, komentar, chat, notifikasi, jelajahi, dll.):
 *  ditekan -> muncul pilihan; tidak lagi langsung membuka story.
 *  `onOpenProfile` diberi lewat supaya konteks khusus (mis. dialog chat
 *  baru) bisa menutup dialognya sebelum berpindah halaman. */
function StoryAvatarMenu({
  name,
  username,
  size,
  className,
  onOpenProfile,
  children,
}: {
  name: string;
  username: string;
  size: number;
  className?: string;
  onOpenProfile: () => void;
  children: React.ReactNode;
}) {
  const t = useT();
  const story = useStoryRing();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className
          )}
          aria-label={`${t("st.story")}: ${name}`}
        >
          {children}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => story?.open(username)}>
          <Play className="h-4 w-4" /> {t("st.viewStory")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenProfile}>
          <UserRound className="h-4 w-4" /> {t("st.openProfile")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserAvatarLink({
  name,
  color,
  avatar,
  size = 40,
  username,
  className,
  ring,
  online,
}: Props & { username: string }) {
  const story = useStoryRing();
  const info = story?.ring(username) ?? null;

  // Punya story aktif -> ditekan muncul PILIHAN (lihat story / buka profil),
  // persis permintaan interaksi ring story — bukan langsung membuka story.
  if (info) {
    return (
      <StoryAvatarMenu
        name={name}
        username={username}
        size={size}
        className={className}
        onOpenProfile={() => {
          window.location.hash = `#/u/${encodeURIComponent(username)}`;
        }}
      >
        <StoryRingFrame unseen={info.unseen} size={size}>
          <UserAvatar name={name} color={color} avatar={avatar} size={size} online={online} />
        </StoryRingFrame>
      </StoryAvatarMenu>
    );
  }

  return (
    <a href={`#/u/${encodeURIComponent(username)}`} aria-label={`Profil ${name}`} className={cn("shrink-0", className)}>
      <UserAvatar name={name} color={color} avatar={avatar} size={size} ring={ring} online={online} />
    </a>
  );
}

/**
 * Avatar dengan ring story untuk konteks TANPA link (mis. baris daftar chat):
 * - punya story  -> ring + ditekan muncul pilihan (lihat story / buka profil)
 * - tanpa story  -> klik opsional (fallbackHref / onFallback) atau polos
 */
export function UserAvatarStory({
  name,
  color,
  avatar,
  size = 40,
  username,
  className,
  online,
  fallbackHref,
  onFallback,
}: Props & {
  username: string;
  /** kalau tidak punya story: klik avatar menuju URL ini (opsional) */
  fallbackHref?: string;
  /** kalau tidak punya story: klik avatar memanggil ini (opsional) */
  onFallback?: () => void;
}) {
  const story = useStoryRing();
  const info = story?.ring(username) ?? null;

  if (info) {
    // Pilihan "buka profil": hormati perilaku konteks kalau ada (onFallback
    // biasanya sekaligus menutup dialog + memindah halaman), kalau tidak
    // langsung menuju halaman profil user itu.
    const openProfile = () => {
      if (onFallback) onFallback();
      else if (fallbackHref) window.location.hash = fallbackHref;
      else window.location.hash = `#/u/${encodeURIComponent(username)}`;
    };
    return (
      <StoryAvatarMenu name={name} username={username} size={size} className={className} onOpenProfile={openProfile}>
        <StoryRingFrame unseen={info.unseen} size={size}>
          <UserAvatar name={name} color={color} avatar={avatar} size={size} online={online} />
        </StoryRingFrame>
      </StoryAvatarMenu>
    );
  }

  if (fallbackHref || onFallback) {
    return (
      <button
        type="button"
        onClick={() => {
          if (onFallback) onFallback();
          else if (fallbackHref) window.location.hash = fallbackHref;
        }}
        className={cn("shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
        aria-label={`Profil ${name}`}
      >
        <UserAvatar name={name} color={color} avatar={avatar} size={size} online={online} />
      </button>
    );
  }

  return <UserAvatar name={name} color={color} avatar={avatar} size={size} className={className} online={online} />;
}

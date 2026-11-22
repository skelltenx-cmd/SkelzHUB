"use client";

import { cn } from "@/lib/utils";
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

/** Avatar ber-ring yang membuka story LANGSUNG saat ditekan (satu ketukan,
 *  seperti Instagram/TikTok). Dipakai bersama oleh UserAvatarLink &
 *  UserAvatarStory supaya perilaku SAMA di semua tempat (feed, komentar,
 *  chat, notifikasi, jelajahi, dll.). Profil tetap bisa dibuka lewat tautan
 *  @username di sekitarnya — tidak perlu menu pilihan lagi. */
function StoryOpenButton({
  name,
  username,
  className,
  children,
}: {
  name: string;
  username: string;
  className?: string;
  children: React.ReactNode;
}) {
  const t = useT();
  const story = useStoryRing();
  return (
    <button
      type="button"
      onClick={() => story?.open(username)}
      className={cn("shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
      aria-label={`${t("st.viewStory")}: ${name}`}
    >
      {children}
    </button>
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

  // Punya story aktif -> satu ketukan langsung membuka viewer story
  // (profil tetap tersedia lewat tautan @username di sekitar avatar).
  if (info) {
    return (
      <StoryOpenButton name={name} username={username} className={className}>
        <StoryRingFrame unseen={info.unseen} size={size}>
          <UserAvatar name={name} color={color} avatar={avatar} size={size} online={online} />
        </StoryRingFrame>
      </StoryOpenButton>
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
 * - punya story  -> ring + satu ketukan langsung membuka story
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
    return (
      <StoryOpenButton name={name} username={username} className={className}>
        <StoryRingFrame unseen={info.unseen} size={size}>
          <UserAvatar name={name} color={color} avatar={avatar} size={size} online={online} />
        </StoryRingFrame>
      </StoryOpenButton>
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

"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import {
  Home,
  Compass,
  PlusSquare,
  Bookmark,
  User as UserIcon,
  Sun,
  Moon,
  LogOut,
  Zap,
  Clapperboard,
  Bell,
  Search,
  ShieldCheck,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Me } from "@/lib/types";
import type { Route } from "./router";
import { UserAvatarLink, UserAvatar } from "./user-avatar";
import { SkelzLogo } from "./logo";
import { useLogout, useSuggestions, useFollow, useNotifications, useConversations } from "./hooks";
import { formatCount } from "./utils";

function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  // Deteksi hidrasi tanpa setState dalam effect
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-10 w-10 rounded-full", className)}
      aria-label="Ganti tema terang/gelap"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {mounted && resolvedTheme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}

function NotifDot({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white"
      aria-label={`${count} notifikasi belum dibaca`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  badge?: number;
};

function navItems(route: Route, me: Me | null, unread: number, unreadDm: number, t: ReturnType<typeof useT>): NavItem[] {
  const profileHref = me ? `#/u/${encodeURIComponent(me.username)}` : "#/login";
  const items: NavItem[] = [
    { href: "#/", label: t("nav.home"), icon: <Home className="h-6 w-6" />, active: route.view === "feed" },
    { href: "#/shorts", label: t("nav.shorts"), icon: <Clapperboard className="h-6 w-6" />, active: route.view === "shorts" },
    // Cari (seperti sosmed pada umumnya): membuka halaman Jelajahi dengan
    // kotak pencarian akun/post/video di bagian atas.
    { href: "#/explore", label: t("nav.search"), icon: <Search className="h-6 w-6" />, active: route.view === "explore" },
    { href: "#/create", label: t("nav.create"), icon: <PlusSquare className="h-6 w-6" />, active: route.view === "create" },
  ];
  if (me) {
    items.push({
      href: "#/messages",
      label: t("nav.messages"),
      icon: (
        <span className="relative">
          <MessageCircle className="h-6 w-6" />
          {unreadDm > 0 && (
            <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {unreadDm > 99 ? "99+" : unreadDm}
            </span>
          )}
        </span>
      ),
      active: route.view === "messages" || route.view === "chat",
      badge: unreadDm,
    });
    items.push({
      href: "#/notifications",
      label: t("nav.notifications"),
      icon: (
        <span className="relative">
          <Bell className="h-6 w-6" />
          <NotifDot count={unread} />
        </span>
      ),
      active: route.view === "notifications",
      badge: unread,
    });
    items.push({ href: "#/saved", label: t("nav.saved"), icon: <Bookmark className="h-6 w-6" />, active: route.view === "saved" });
    if (me.role === "ADMIN" || me.role === "OWNER") {
      items.push({
        href: "#/admin",
        label: t("nav.admin"),
        icon: <ShieldCheck className="h-6 w-6 text-rose-500" />,
        active: route.view === "admin",
      });
    }
  }
  items.push({
    href: profileHref,
    label: t("nav.profile"),
    icon: me ? (
      <UserAvatar name={me.displayName} color={me.avatarColor} avatar={me.avatar} size={26} className={cn((route.view === "profile" && !!me && route.username === me.username) && "ring-2 ring-rose-500")} />
    ) : (
      <UserIcon className="h-6 w-6" />
    ),
    active: route.view === "profile" && !!me && route.username === me.username,
  });
  return items;
}

function mobileNavItems(route: Route, me: Me | null, t: ReturnType<typeof useT>): NavItem[] {
  const profileHref = me ? `#/u/${encodeURIComponent(me.username)}` : "#/login";
  return [
    { href: "#/", label: t("nav.home"), icon: <Home className="h-6 w-6" />, active: route.view === "feed" },
    { href: "#/shorts", label: t("nav.shorts"), icon: <Clapperboard className="h-6 w-6" />, active: route.view === "shorts" },
    { href: "#/explore", label: t("nav.explore"), icon: <Compass className="h-6 w-6" />, active: route.view === "explore" },
    { href: "#/create", label: t("nav.create"), icon: <PlusSquare className="h-6 w-6" />, active: route.view === "create" },
    {
      href: profileHref,
      label: t("nav.profile"),
      icon: me ? (
        <UserAvatar name={me.displayName} color={me.avatarColor} avatar={me.avatar} size={26} className={cn((route.view === "profile" && !!me && route.username === me.username) && "ring-2 ring-rose-500")} />
      ) : (
        <UserIcon className="h-6 w-6" />
      ),
      active: route.view === "profile" && !!me && route.username === me.username,
    },
  ];
}

function DesktopSidebar({ route, me }: { route: Route; me: Me | null }) {
  const t = useT();
  const logout = useLogout(() => {
    window.location.hash = "#/";
  });
  const notifQuery = useNotifications(!!me);
  const unread = notifQuery.data?.unread ?? 0;
  const dmQuery = useConversations(!!me);
  const unreadDm = dmQuery.data?.unread ?? 0;
  const items = navItems(route, me, unread, unreadDm, t);
  return (
    <aside className="sticky top-0 hidden h-screen w-[76px] shrink-0 flex-col overflow-y-auto border-r bg-card/50 px-2 py-4 backdrop-blur md:flex xl:w-64 xl:px-4">
      <a href="#/" className="mb-6 flex items-center justify-center px-2 xl:justify-start" aria-label="SkelzHub Beranda">
        <SkelzLogo compact={false} className="scale-100 xl:scale-100" />
      </a>
      <nav className="flex flex-1 flex-col gap-1" aria-label="Navigasi utama">
        {items.map((item) => (
          <a
            key={item.label}
            href={item.href}
            aria-current={item.active ? "page" : undefined}
            title={item.label}
            className={cn(
              "flex items-center gap-4 rounded-xl px-3 py-3 text-sm font-medium transition-colors hover:bg-accent",
              item.active && "bg-accent font-semibold"
            )}
          >
            {/* Ikon: mode ringkas (md–xl) diberi aksen rose saat aktif */}
            <span className={cn("shrink-0 [&>svg]:h-6 [&>svg]:w-6", item.active && "md:text-rose-500")}>{item.icon}</span>
            <span className="hidden xl:inline">{item.label}</span>
            {item.badge ? (
              <span className="ml-auto hidden h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white xl:flex">
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            ) : null}
            {/* Titik aksi kecil untuk mode ringkas (md–xl) — disembunyikan saat melebar */}
            {item.active && <span className="hidden h-1.5 w-1.5 rounded-full bg-rose-500 md:block xl:hidden" />}
          </a>
        ))}
        {me ? (
          <button
            onClick={() => logout.mutate()}
            className="flex items-center gap-4 rounded-xl px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-6 w-6" />
            <span className="hidden xl:inline">{t("nav.logout")}</span>
          </button>
        ) : (
          <a
            href="#/login"
            className="flex items-center gap-4 rounded-xl px-3 py-3 text-sm font-medium transition-colors hover:bg-accent"
          >
            <Zap className="h-6 w-6" />
            <span className="hidden xl:inline">{t("nav.login")}</span>
          </a>
        )}
      </nav>
      <div className="hidden px-3 pb-2 xl:block">
        <ThemeToggle />
      </div>
      <div className="flex justify-center xl:hidden">
        <ThemeToggle />
      </div>
    </aside>
  );
}

function MobileHeader({ me }: { me: Me | null }) {
  const t = useT();
  const notifQuery = useNotifications(!!me);
  const unread = notifQuery.data?.unread ?? 0;
  const dmQuery = useConversations(!!me);
  const unreadDm = dmQuery.data?.unread ?? 0;
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-card/80 px-4 backdrop-blur md:hidden">
      <a href="#/" aria-label="SkelzHub Beranda">
        <SkelzLogo />
      </a>
      <div className="flex items-center gap-1">
        {/* Pintasan cari: langsung ke halaman Jelajahi (kotak pencarian di atas) */}
        <a
          href="#/explore"
          aria-label={t("nav.search")}
          className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-accent"
        >
          <Search className="h-5 w-5" />
        </a>
        {me && (
          <a
            href="#/messages"
            aria-label={`Pesan${unreadDm > 0 ? ` (${unreadDm} belum dibaca)` : ""}`}
            className="relative flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-accent"
          >
            <MessageCircle className="h-5 w-5" />
            {unreadDm > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {unreadDm > 99 ? "99+" : unreadDm}
              </span>
            )}
          </a>
        )}
        {me && (
          <a
            href="#/notifications"
            aria-label={`Notifikasi${unread > 0 ? ` (${unread} belum dibaca)` : ""}`}
            className="relative flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-accent"
          >
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </a>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}

function BottomNav({ route, me }: { route: Route; me: Me | null }) {
  const t = useT();
  const items = mobileNavItems(route, me, t);
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex h-[60px] items-stretch justify-around border-t bg-card/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navigasi bawah"
    >
      {items.map((item) => (
        <motion.a
          key={item.label}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          aria-label={item.label}
          whileTap={{ scale: 0.88 }}
          transition={{ duration: 0.12 }}
          className={cn(
            "relative flex min-w-[44px] flex-1 flex-col items-center justify-center gap-1 pt-1.5 transition-colors",
            item.active ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {item.active && (
            <motion.span
              layoutId="bottomnav-pill"
              className="absolute top-0 left-1/2 h-[3px] w-8 -translate-x-1/2 rounded-full bg-gradient-to-r from-rose-500 to-orange-400"
              aria-hidden="true"
            />
          )}
          {item.icon}
          <span className={cn("text-[10px] font-medium leading-none", item.active && "font-semibold")}>{item.label}</span>
        </motion.a>
      ))}
    </nav>
  );
}

function RightRail({ me, onNeedLogin }: { me: Me | null; onNeedLogin: () => void }) {
  const t = useT();
  const { data } = useSuggestions(true);
  const follow = useFollow(onNeedLogin);
  const users = data?.users ?? [];
  if (users.length === 0) return null;
  return (
    <aside className="sticky top-0 hidden h-screen w-[300px] shrink-0 flex-col gap-6 overflow-y-auto px-4 py-8 lg:flex">
      <div>
        {me ? (
          <div className="mb-4 flex items-center gap-3">
            <UserAvatarLink name={me.displayName} color={me.avatarColor} avatar={me.avatar} username={me.username} size={44} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{me.displayName}</p>
              <p className="truncate text-xs text-muted-foreground">@{me.username}</p>
            </div>
          </div>
        ) : (
          <div className="mb-4 rounded-xl border bg-card p-4 text-sm">
            <p className="font-semibold">{t("feed.welcome")} SkelzHub</p>
            <p className="mb-3 text-muted-foreground">{t("a.registerSub")}</p>
            <a href="#/register">
              <Button size="sm" className="w-full bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90">
                {t("a.createAccount")}
              </Button>
            </a>
          </div>
        )}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">Saran untukmu</h2>
        </div>
        <ul className="mt-2 flex flex-col gap-3 pr-1">
          {users.map((u) => {
            // Status ikut dibaca dari cache (server kini mengirimnya) dan
            // langsung dibalik optimistik oleh mutation — tombol berubah
            // seketika, hanya tombol yang SEDANG diproses yang nonaktif.
            const st = u.followStatus ?? "NONE";
            const busy = follow.isPending && follow.variables === u.username;
            return (
              <li key={u.id} className="flex items-center gap-3">
                <UserAvatarLink name={u.displayName} color={u.avatarColor} avatar={u.avatar} username={u.username} size={36} />
                <div className="min-w-0 flex-1">
                  <a href={`#/u/${encodeURIComponent(u.username)}`} className="block truncate text-sm font-semibold hover:underline">
                    {u.displayName}
                  </a>
                  <p className="truncate text-xs text-muted-foreground">
                    @{u.username} · {formatCount(u.followerCount)} pengikut
                  </p>
                </div>
                {me && !u.isMe && (
                  <Button
                    size="sm"
                    variant={st === "NONE" ? "default" : "outline"}
                    className={
                      st === "NONE"
                        ? "h-8 rounded-full bg-gradient-to-r from-rose-500 to-orange-400 px-3 text-xs text-white hover:opacity-90"
                        : "h-8 rounded-full px-3 text-xs"
                    }
                    disabled={busy}
                    onClick={() => follow.mutate(u.username)}
                  >
                    {st === "PENDING" ? t("c.requested") : st === "ACCEPTED" ? t("c.following") : t("c.follow")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-6 border-t pt-4 text-[11px] leading-relaxed text-muted-foreground">
          <p className="mb-2 font-semibold text-foreground/70">SkelzHub</p>
          <p className="mb-3">Media sosial buatan kreator Indonesia untuk membagikan meme, momen, Shorts, dan karya terbaik.</p>
          <nav className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Tautan SkelzHub">
            <a href="#/" className="hover:text-foreground hover:underline">Beranda</a>
            <a href="#/explore" className="hover:text-foreground hover:underline">Jelajahi</a>
            <a href="#/shorts" className="hover:text-foreground hover:underline">Shorts</a>
            <a href="#/create" className="hover:text-foreground hover:underline">Buat Post</a>
          </nav>
          <p className="mt-3">© {new Date().getFullYear()} SkelzHub · Semua hak dilindungi</p>
        </div>
      </div>
    </aside>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto border-t bg-card/40 py-6">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-2 px-4 text-center">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Zap className="h-4 w-4 text-rose-500" aria-hidden="true" />
          SkelzHub
        </p>
        <p className="text-xs text-muted-foreground">
          Bagikan momen, meme & Shorts terbaikmu — tempat karya kreatif bersinar.
        </p>
        <nav className="flex items-center gap-4 text-xs text-muted-foreground" aria-label="Footer">
          <a href="#/" className="hover:text-foreground hover:underline">Beranda</a>
          <a href="#/shorts" className="hover:text-foreground hover:underline">Shorts</a>
          <a href="#/explore" className="hover:text-foreground hover:underline">Jelajahi</a>
          <span>© {new Date().getFullYear()} SkelzHub</span>
        </nav>
      </div>
    </footer>
  );
}

export function Shell({
  route,
  me,
  children,
  onNeedLogin,
  showRail,
}: {
  route: Route;
  me: Me | null;
  children: React.ReactNode;
  onNeedLogin: () => void;
  showRail: boolean;
}) {
  // Shorts & pesan penuh layar: tanpa footer supaya layout chat murni (dua kolom di desktop)
  const immersive = route.view === "shorts" || route.view === "chat" || route.view === "messages";
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MobileHeader me={me} />
      <div className="flex flex-1 w-full">
        <DesktopSidebar route={route} me={me} />
        {/* Rute imersif mengatur tinggi sendiri (100dvh - header - nav) —
            padding cadangan untuk nav bawah justru bikin ada kolom kosong
            60px di atas nav (bingkai "tidak pas" di ponsel). */}
        <div className={cn("flex min-w-0 flex-1 flex-col", immersive ? "pb-0" : "pb-[60px] md:pb-0")}>
          <main className="flex-1">{children}</main>
          {!immersive && <Footer />}
        </div>
        {showRail && !immersive && <RightRail me={me} onNeedLogin={onNeedLogin} />}
      </div>
      <BottomNav route={route} me={me} />
    </div>
  );
}

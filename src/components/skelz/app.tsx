"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Ghost } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useMe } from "./hooks";
import { useRoute } from "./router";
import { Shell } from "./shell";
import { StoryRingProvider } from "./story-ring";
import { FeedView } from "./views/feed";
import { ExploreView } from "./views/explore";
import { CreateView } from "./views/create";
import { ProfileView } from "./views/profile";
import { PostDetailView } from "./views/post-detail";
import { NotificationsView } from "./views/notifications";
import { AuthView } from "./views/auth";
import { SavedView } from "./views/saved";
import { MessagesView } from "./views/messages";
import { SettingsView } from "./views/settings";

// View berat (video/recharts) dimuat terpisah -> initial JS lebih kecil & buka halaman lebih cepat
const ShortsView = dynamic(() => import("./views/shorts").then((m) => m.ShortsView), {
  loading: () => (
    <div className="flex h-[calc(100vh-60px)] items-center justify-center md:h-screen">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-rose-500 border-t-transparent" aria-label="Memuat" />
    </div>
  ),
});
const AdminView = dynamic(() => import("./views/admin").then((m) => m.AdminView), {
  loading: () => (
    <div className="mx-auto flex h-96 max-w-3xl items-center justify-center px-4">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-rose-500 border-t-transparent" aria-label="Memuat" />
    </div>
  ),
});

export default function App() {
  const route = useRoute();
  const meQuery = useMe();
  const me = meQuery.data?.user ?? null;
  const t = useT();

  // Heartbeat presence: tiap 25 dtk selama tab terlihat -> status online & "terakhir aktif"
  useEffect(() => {
    if (!me) return;
    const beat = () => {
      if (document.visibilityState === "visible") {
        api.heartbeat().catch(() => null);
      }
    };
    beat();
    const timer = setInterval(beat, 25_000);
    const onVis = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [me?.id]);

  // Reset scroll saat berpindah view (Shorts punya scroll-snap sendiri tapi tetap reset window)
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route]);

  // Sudah login tapi membuka halaman masuk/daftar -> arahkan ke beranda
  // (cek hash langsung supaya tidak bentrok dengan redirect #/create setelah daftar)
  const meLoaded = !meQuery.isLoading;
  useEffect(() => {
    if (!meLoaded || !me) return;
    const h = window.location.hash;
    if (h === "#/login" || h === "#/register") {
      window.location.hash = "#/";
    }
  }, [meLoaded, me, route.view]);

  // User ter-ban saat sesi aktif: beri tahu lalu paksa keluar
  const bannedHandled = useRef(false);
  const bannedMessage = meQuery.data?.bannedMessage;
  useEffect(() => {
    if (!bannedMessage || bannedHandled.current) return;
    bannedHandled.current = true;
    toast({
      title: "Akun kamu dibanned",
      description: bannedMessage,
      variant: "destructive",
    });
    api
      .logout()
      .catch(() => null)
      .finally(() => {
        meQuery.refetch();
        window.location.hash = "#/login";
      });
  }, [bannedMessage]);

  function handleNeedLogin() {
    const isAuth = route.view === "auth";
    if (!isAuth) {
      toast({ title: t("misc.needLogin"), description: t("misc.needLoginSub") });
      window.location.hash = "#/login";
    }
  }

  let content: React.ReactNode = null;
  switch (route.view) {
    case "feed":
      content = <FeedView me={me} meLoading={meQuery.isLoading} onNeedLogin={handleNeedLogin} />;
      break;
    case "explore":
      content = <ExploreView me={me} onNeedLogin={handleNeedLogin} />;
      break;
    case "shorts":
      content = <ShortsView me={me} onNeedLogin={handleNeedLogin} />;
      break;
    case "create":
      content = <CreateView me={me} />;
      break;
    case "saved":
      content = <SavedView me={me} meLoading={meQuery.isLoading} />;
      break;
    case "notifications":
      content = <NotificationsView me={me} />;
      break;
    case "messages":
      content = <MessagesView me={me} />;
      break;
    case "chat":
      content = <MessagesView me={me} conversationId={route.conversationId} />;
      break;
    case "settings":
      content = <SettingsView me={me} />;
      break;
    case "admin":
      content = <AdminView me={me} />;
      break;
    case "post":
      content = <PostDetailView id={route.id} me={me} onNeedLogin={handleNeedLogin} />;
      break;
    case "profile":
      content = <ProfileView username={route.username} me={me} />;
      break;
    case "auth":
      content = <AuthView mode={route.mode} />;
      break;
    case "not-found":
      content = (
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
          <Ghost className="h-10 w-10 text-muted-foreground" />
          <h1 className="text-lg font-bold">{t("misc.notFound")}</h1>
          <p className="text-sm text-muted-foreground">{t("misc.notFoundSub")}</p>
          <a href="#/">
            <Button className="bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90">
              {t("misc.backHome")}
            </Button>
          </a>
        </div>
      );
      break;
  }

  // Kunci transisi antar view supaya setiap perpindahan halaman terasa halus
  const viewKey =
    route.view +
    ("username" in route && route.username ? `:${route.username}` : "") +
    ("id" in route && route.id ? `:${route.id}` : "") +
    ("conversationId" in route && route.conversationId ? `:${route.conversationId}` : "") +
    ("mode" in route && route.mode ? `:${route.mode}` : "");

  return (
    <StoryRingProvider me={me}>
      <Shell route={route} me={me} onNeedLogin={handleNeedLogin} showRail={route.view === "feed"}>
        <motion.div
          key={viewKey}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          {content}
        </motion.div>
      </Shell>
    </StoryRingProvider>
  );
}

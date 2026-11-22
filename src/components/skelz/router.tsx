"use client";

import { useCallback, useSyncExternalStore } from "react";

// Mini hash-router: seluruh aplikasi berjalan di route "/" dengan navigasi hash

export type Route =
  | { view: "feed" }
  | { view: "explore"; q?: string }
  | { view: "shorts" }
  | { view: "create" }
  | { view: "saved" }
  | { view: "notifications" }
  | { view: "admin" }
  | { view: "messages" }
  | { view: "chat"; conversationId: string }
  | { view: "settings" }
  | { view: "post"; id: string }
  | { view: "profile"; username: string }
  | { view: "auth"; mode: "login" | "register" }
  | { view: "not-found" };

const FALLBACK_ROUTE: Route = { view: "feed" };

// Ambil ?q= dari hash (#/explore?q=kucing) — dipakai deep-link hashtag.
function exploreQueryFromHash(hash: string): string | undefined {
  const query = hash.split("?")[1] ?? "";
  const params = new URLSearchParams(query);
  const q = params.get("q");
  return q ? q.slice(0, 60) : undefined;
}

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, "").split("?")[0];
  const [head, second] = path.split("/");
  switch (head) {
    case "":
    case "feed":
      return { view: "feed" };
    case "explore":
      return { view: "explore", q: exploreQueryFromHash(hash) };
    case "shorts":
      return { view: "shorts" };
    case "create":
      return { view: "create" };
    case "saved":
      return { view: "saved" };
    case "notifications":
      return { view: "notifications" };
    case "admin":
      return { view: "admin" };
    case "messages":
      return { view: "messages" };
    case "chat":
      return second ? { view: "chat", conversationId: second } : { view: "not-found" };
    case "settings":
      return { view: "settings" };
    case "post":
      return second ? { view: "post", id: second } : { view: "not-found" };
    case "u":
      return second ? { view: "profile", username: decodeURIComponent(second) } : { view: "not-found" };
    case "login":
      return { view: "auth", mode: "login" };
    case "register":
      return { view: "auth", mode: "register" };
    default:
      return { view: "not-found" };
  }
}

export function routeToPath(route: Route): string {
  switch (route.view) {
    case "feed":
      return "#/";
    case "explore":
      return route.q ? `#/explore?q=${encodeURIComponent(route.q)}` : "#/explore";
    case "shorts":
      return "#/shorts";
    case "create":
      return "#/create";
    case "saved":
      return "#/saved";
    case "notifications":
      return "#/notifications";
    case "admin":
      return "#/admin";
    case "messages":
      return "#/messages";
    case "chat":
      return `#/chat/${route.conversationId}`;
    case "settings":
      return "#/settings";
    case "post":
      return `#/post/${route.id}`;
    case "profile":
      return `#/u/${encodeURIComponent(route.username)}`;
    case "auth":
      return route.mode === "login" ? "#/login" : "#/register";
    default:
      return "#/";
  }
}

export function navigate(path: string) {
  if (typeof window === "undefined") return;
  if (window.location.hash === path) return;
  window.location.hash = path;
}

export function goBack() {
  if (typeof window === "undefined") return;
  if (window.history.length > 1) window.history.back();
  else navigate("#/");
}

// Cache snapshot agar useSyncExternalStore tidak loop (hasil parse harus stabil)
let cachedHash = "";
let cachedRoute: Route = FALLBACK_ROUTE;

function getSnapshot(): Route {
  if (typeof window === "undefined") return FALLBACK_ROUTE;
  if (window.location.hash !== cachedHash) {
    cachedHash = window.location.hash;
    cachedRoute = parseHash(cachedHash);
  }
  return cachedRoute;
}

export function useRoute(): Route {
  // useSyncExternalStore: server snapshot = feed (sesuai SSR), lalu sync hash asli setelah mount
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("hashchange", onChange);
      return () => window.removeEventListener("hashchange", onChange);
    },
    getSnapshot,
    () => FALLBACK_ROUTE
  );
}

export function useNavigate() {
  return useCallback((path: string) => navigate(path), []);
}

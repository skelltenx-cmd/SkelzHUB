"use client";

import { useEffect } from "react";
import { Bookmark, LogIn } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Me } from "@/lib/types";
import { useInfinitePosts } from "../hooks";
import { PostGrid } from "../post-grid";
import { EmptyState } from "../empty-state";

export function SavedView({ me, meLoading }: { me: Me | null; meLoading: boolean }) {
  const query = useInfinitePosts({ feed: "saved", limit: 18, enabled: !!me && !meLoading });
  const posts = query.data?.pages.flatMap((p) => p.posts) ?? [];

  useEffect(() => {
    document.title = "Tersimpan · SkelzHub";
  }, []);

  if (!meLoading && !me) {
    return (
      <div className="mx-auto max-w-md px-3 py-8 sm:px-4">
        <EmptyState
          icon={LogIn}
          title="Login untuk melihat post tersimpan"
          subtitle="Simpan post favoritmu dan nikmati kapan saja."
          action={{ label: "Masuk", href: "#/login" }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-2 py-4 sm:px-4 sm:py-6">
      <div className="mb-5 flex items-center gap-2">
        <Bookmark className="h-5 w-5 text-rose-500" />
        <h1 className="text-lg font-bold tracking-tight">Tersimpan</h1>
      </div>

      {query.isLoading && (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-lg" />
          ))}
        </div>
      )}

      {!query.isLoading && posts.length === 0 && (
        <EmptyState
          icon={Bookmark}
          title="Belum ada yang disimpan"
          subtitle="Tekan ikon bookmark pada post untuk menyimpannya di sini."
          action={{ label: "Jelajahi post", href: "#/explore" }}
        />
      )}

      {posts.length > 0 && <PostGrid posts={posts} />}
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { Bookmark, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Me } from "@/lib/types";
import { useInfinitePosts } from "../hooks";
import { PostGrid } from "../post-grid";

export function SavedView({ me, meLoading }: { me: Me | null; meLoading: boolean }) {
  const query = useInfinitePosts({ feed: "saved", limit: 18, enabled: !!me && !meLoading });
  const posts = query.data?.pages.flatMap((p) => p.posts) ?? [];

  useEffect(() => {
    document.title = "Tersimpan · SkelzHub";
  }, []);

  if (!meLoading && !me) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
        <LogIn className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-bold">Login untuk melihat post tersimpan</h1>
        <p className="text-sm text-muted-foreground">Simpan post favoritmu dan nikmati kapan saja.</p>
        <a href="#/login">
          <Button className="bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90">Masuk</Button>
        </a>
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
        <div className="flex flex-col items-center gap-2 rounded-xl border bg-card p-10 text-center">
          <Bookmark className="h-10 w-10 text-muted-foreground" />
          <p className="font-semibold">Belum ada post tersimpan</p>
          <p className="text-sm text-muted-foreground">Tekan ikon bookmark pada post untuk menyimpannya di sini.</p>
          <a href="#/explore" className="mt-2">
            <Button variant="outline">Jelajahi post</Button>
          </a>
        </div>
      )}

      {posts.length > 0 && <PostGrid posts={posts} />}
    </div>
  );
}

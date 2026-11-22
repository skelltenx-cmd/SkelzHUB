"use client";

import { Heart, MessageCircle, Play, Repeat2 } from "lucide-react";
import type { Post } from "@/lib/types";
import { formatCount, mediaThumb } from "./utils";

export function PostTile({ post }: { post: Post }) {
  const isVideo = post.type === "VIDEO";
  const isRepost = !!post.repostOf;
  return (
    <a
      href={`#/post/${post.id}`}
      className="group relative block overflow-hidden rounded-lg bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Buka ${isRepost ? "postingan ulang" : "post"} oleh ${post.author.username}${isVideo ? " (video)" : ""}`}
    >
      {isVideo ? (
        <video
          src={post.media ?? undefined}
          muted
          playsInline
          preload="metadata"
          className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          aria-hidden="true"
        />
      ) : (
        <img
          src={mediaThumb(post.media, 320) ?? undefined}
          alt={`Post oleh ${post.repostOf?.author.username ?? post.author.username}`}
          className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      )}

      {/* Tanda postingan ulang */}
      {isRepost && (
        <span
          className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur"
          title={`Diposting ulang dari @${post.repostOf?.author.username}`}
        >
          <Repeat2 className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">Diposting ulang dari </span>@{post.repostOf?.author.username}
        </span>
      )}

      {isVideo && (
        <span className="pointer-events-none absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur">
          <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
        </span>
      )}
      <span className="pointer-events-none absolute inset-0 hidden items-center justify-center gap-5 bg-black/40 text-sm font-semibold text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus:opacity-100 md:flex">
        <span className="flex items-center gap-1.5">
          <Heart className={post.likedByMe ? "h-5 w-5 fill-rose-400 text-rose-400" : "h-5 w-5"} />
          {formatCount(post.likeCount)}
        </span>
        <span className="flex items-center gap-1.5">
          <MessageCircle className="h-5 w-5" />
          {formatCount(post.commentCount)}
        </span>
      </span>
    </a>
  );
}

export function PostGrid({ posts, className }: { posts: Post[]; className?: string }) {
  return (
    <div className={className ?? "grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2"}>
      {posts.map((p) => (
        <PostTile key={p.id} post={p} />
      ))}
    </div>
  );
}

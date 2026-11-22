"use client";

// RichText — merender caption post/story/chat dengan #hashtag dan @mention
// yang bisa diklik (hashtag -> Jelajahi dengan kata kunci; mention -> profil).
// Mengganti render teks polos di post-card / post-detail / shorts / chat.

import { Fragment, useMemo } from "react";
import { cn } from "@/lib/utils";

const RICH_TOKEN = /(#[A-Za-z0-9_]+|@[A-Za-z0-9](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9])?)/g;

export type RichPart =
  | { type: "text"; value: string }
  | { type: "tag"; value: string }
  | { type: "mention"; value: string };

export function parseRichText(text: string): RichPart[] {
  const parts: RichPart[] = [];
  let last = 0;
  for (const match of text.matchAll(RICH_TOKEN)) {
    const idx = match.index ?? 0;
    if (idx > last) parts.push({ type: "text", value: text.slice(last, idx) });
    const value = match[0];
    parts.push({ type: value.startsWith("#") ? "tag" : "mention", value });
    last = idx + value.length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

export function RichText({
  text,
  className,
  light = false,
}: {
  text: string;
  className?: string;
  /** light=true dipakai di atas media gelap (shorts/story) — link putih */
  light?: boolean;
}) {
  const parts = useMemo(() => parseRichText(text), [text]);
  // Render sebagai <span> supaya bisa dipakai inline di dalam <p> caption
  // maupun sebagai blok (parent menentukan).
  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {parts.map((part, i) => {
        if (part.type === "text") return <Fragment key={i}>{part.value}</Fragment>;
        const href =
          part.type === "tag"
            ? `#/explore?q=${encodeURIComponent(part.value.slice(1))}`
            : `#/u/${encodeURIComponent(part.value.slice(1))}`;
        return (
          <a
            key={i}
            href={href}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "font-semibold transition-colors hover:underline",
              light ? "text-white" : "text-rose-500 hover:text-rose-600 dark:text-rose-400"
            )}
          >
            {part.value}
          </a>
        );
      })}
    </span>
  );
}

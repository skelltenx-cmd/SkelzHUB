"use client";

// EmojiPickerButton — pemilih emoji ringan (popover kecil, tanpa library
// eksternal) untuk input chat & komentar. Dipakai di composer chat, komentar
// post/shorts, dan kolom caption.

import { Smile } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const EMOJI_CATEGORIES: { label: string; items: string[] }[] = [
  {
    label: "Wajah",
    items: [
      "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃",
      "😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😋",
      "😛","😜","🤪","🤨","🧐","🤓","😎","🥳","😏","😒",
      "😞","😔","😟","😕","🙁","☹️","😣","😖","😫","😩",
      "🥺","😢","😭","😤","😠","😡","🤯","😳","🥵","🥶",
    ],
  },
  {
    label: "Tangan & Orang",
    items: [
      "👋","🤚","✋","🖖","👌","✌️","🤞","🤟","🤘","🤙",
      "👍","👎","✊","👊","🤛","🤜","👏","🙌","🫶","🤝",
      "🙏","✍️","💪","🫡","👶","🧒","👦","👧","🧑","👩",
    ],
  },
  {
    label: "Hati",
    items: [
      "❤️","🩷","🧡","💛","💚","💙","💜","🤎","🖤","🤍",
      "💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟",
    ],
  },
  {
    label: "Seru & Objek",
    items: [
      "🎉","🎊","🔥","⭐","✨","💫","⚡","🏆","🥇","🎯",
      "🎵","🎶","🎤","🎬","📸","📷","🤳","💬","👁️","🫵",
      "👀","🙏","☕","🍕","🍩","🍫","🍿","🎂","🎁","💤",
    ],
  },
];

export function EmojiPickerButton({
  onPick,
  className,
  buttonClassName,
  label = "Tambah emoji",
}: {
  /** Menerima emoji yang dipilih; string kosong = hapus pilihan terakhir */
  onPick: (emoji: string) => void;
  className?: string;
  buttonClassName?: string;
  label?: string;
}) {
  return (
    <div className={cn("flex", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              buttonClassName
            )}
          >
            <Smile className="h-5 w-5" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="top"
          className="w-72 p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="max-h-64 overflow-y-auto p-2" role="grid" aria-label="Pilihan emoji">
            {EMOJI_CATEGORIES.map((cat) => (
              <div key={cat.label} className="mb-1.5 last:mb-0">
                <p className="px-1 pb-1 pt-1.5 text-[11px] font-semibold text-muted-foreground">{cat.label}</p>
                <div className="grid grid-cols-8 gap-0.5">
                  {cat.items.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      aria-label={`Emoji ${emoji}`}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-xl leading-none transition-transform hover:scale-125 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => onPick(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

"use client";

import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export function SkelzLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  if (compact) {
    return (
      <span
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 via-pink-500 to-orange-400 text-white shadow-sm",
          className
        )}
      >
        <Zap className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-2 select-none", className)}>
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 via-pink-500 to-orange-400 text-white shadow-sm">
        <Zap className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
      </span>
      <span className="text-2xl font-extrabold tracking-tight">
        <span className="bg-gradient-to-r from-rose-500 via-pink-500 to-orange-400 bg-clip-text text-transparent">
          Skelz
        </span>
        <span className="text-foreground">Hub</span>
      </span>
    </span>
  );
}

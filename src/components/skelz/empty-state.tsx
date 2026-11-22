"use client";

import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type EmptyStateAction = {
  label: string;
  /** Tujuan tautan (opsional — pakai ini bila CTA berupa tautan) */
  href?: string;
  /** Aksi klik (opsional — pakai ini bila CTA tanpa tautan) */
  onClick?: () => void;
};

type EmptyStateProps = {
  /** Ikon besar di tengah (default: petir bila tidak diberikan) */
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  action?: EmptyStateAction;
  className?: string;
};

/**
 * Empty state premium yang seragam untuk semua view SkelzHub:
 * - blob gradient lembut (rose -> orange) di belakang ikon besar
 * - judul bold + subjudul redup + CTA pill gradient (opsional)
 * - animasi masuk halus (animate-fade-in-up dari globals.css)
 */
export function EmptyState({ icon: Icon, title, subtitle, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center gap-3 overflow-hidden rounded-2xl border bg-card px-6 py-10 text-center animate-fade-in-up sm:py-12",
        className
      )}
    >
      {/* Blob gradient lembut di belakang ikon — dekoratif, dipotong container */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-14 left-1/2 h-44 w-56 -translate-x-1/2 rounded-full bg-gradient-to-br from-rose-500/25 to-orange-400/25 blur-3xl"
      />
      <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500/15 to-orange-400/15">
        {Icon ? <Icon className="h-8 w-8 text-rose-500" aria-hidden="true" /> : null}
      </span>
      <p className="relative max-w-sm text-base font-bold leading-snug">{title}</p>
      {subtitle && <p className="relative max-w-xs text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
      {action &&
        (action.href ? (
          <a href={action.href} className="relative mt-1">
            <Button className="rounded-full bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90">
              {action.label}
            </Button>
          </a>
        ) : (
          <Button
            onClick={action.onClick}
            className="relative mt-1 rounded-full bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90"
          >
            {action.label}
          </Button>
        ))}
    </div>
  );
}

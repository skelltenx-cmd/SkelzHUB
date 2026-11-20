"use client";

import { ShieldCheck, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/**
 * Badge peran akun — tampil di samping nama di semua tempat.
 * role OWNER -> badge "Owner" (mahkota emas, di atas level Admin)
 * selain itu  -> badge "Admin" merah-oren standar
 */
export function AdminBadge({ className, role }: { className?: string; role?: string }) {
  const t = useT();
  const isOwner = role === "OWNER";
  const label = isOwner ? t("c.ownerBadge") : t("c.adminBadge");
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none text-white",
        isOwner
          ? "bg-gradient-to-r from-amber-400 to-yellow-500 shadow-[0_1px_4px_rgba(245,158,11,0.45)]"
          : "bg-gradient-to-r from-rose-500 to-orange-400",
        className
      )}
      title={label}
    >
      {isOwner ? <Crown className="h-3 w-3" aria-hidden="true" /> : <ShieldCheck className="h-3 w-3" aria-hidden="true" />}
      {label}
    </span>
  );
}

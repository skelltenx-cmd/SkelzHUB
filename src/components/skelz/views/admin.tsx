"use client";

// Panel Admin SkelzHub: moderasi pengguna, post, komentar, dan laporan konten.
// Hanya bisa diakses oleh akun dengan role ADMIN.

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Ban,
  Check,
  Clapperboard,
  Eye,
  Flag,
  Heart,
  Image as ImageIcon,
  LayoutDashboard,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Play,
  Repeat2,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unlock,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  AdminComment,
  AdminPost,
  AdminUser,
  MediaType,
  Me,
  ReportItem,
  ReportStatus,
  Role,
} from "@/lib/types";
import { UserAvatar, UserAvatarLink } from "../user-avatar";
import { formatCount, timeAgo } from "../utils";

// ---- Util umum ----

function useDebounced(value: string, delay = 350): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value.trim()), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function adminErrorToast(err: unknown) {
  toast({ title: "Gagal", description: (err as Error).message, variant: "destructive" });
}

function useInvalidateAdmin() {
  const qc = useQueryClient();
  return (opts?: { posts?: boolean }) => {
    qc.invalidateQueries({ queryKey: ["admin"] });
    if (opts?.posts) {
      qc.invalidateQueries({ queryKey: ["posts"] });
    }
  };
}

function profileHref(username: string) {
  return `#/u/${encodeURIComponent(username)}`;
}

function MediaThumb({
  src,
  type,
  alt,
  className,
}: {
  src: string | null;
  type: MediaType;
  alt: string;
  className?: string;
}) {
  if (!src) {
    // Repost murni tanpa media: tampilkan ikon repost
    return (
      <span className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)} aria-label={alt}>
        <Repeat2 className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
  if (type === "VIDEO") {
    return (
      <video
        src={src}
        muted
        playsInline
        preload="metadata"
        aria-label={alt}
        className={cn("bg-muted object-cover", className)}
      />
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      draggable={false}
      className={cn("bg-muted object-cover", className)}
    />
  );
}

function ThumbWithPlay({
  media,
  type,
  alt,
  className,
}: {
  media: string | null;
  type: MediaType;
  alt: string;
  className?: string;
}) {
  return (
    <span className={cn("relative shrink-0 overflow-hidden rounded-md bg-muted", className)}>
      <MediaThumb src={media} type={type} alt={alt} className="h-full w-full object-cover" />
      {type === "VIDEO" && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25" aria-hidden="true">
          <Play className="h-5 w-5 fill-white text-white drop-shadow" />
        </span>
      )}
    </span>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-10 rounded-xl pl-9"
        maxLength={60}
      />
    </div>
  );
}

function FilterGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex w-full gap-1 rounded-xl border bg-muted p-1 sm:w-auto">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={cn(
              "h-10 flex-1 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors sm:flex-none",
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function EmptyState({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
      <Icon className="mx-auto mb-2 h-8 w-8" aria-hidden="true" />
      {children}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center">
      <p className="text-sm font-semibold text-destructive">Gagal memuat data admin.</p>
      <p className="mt-1 text-xs text-muted-foreground">Coba muat ulang sebentar lagi.</p>
      <Button variant="outline" size="sm" className="mt-3 h-10 rounded-lg" onClick={onRetry}>
        Coba lagi
      </Button>
    </div>
  );
}

// ---- Skeleton ----

function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-2.5 h-7 w-12" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-xl border bg-card p-4">
            <Skeleton className="mb-3 h-4 w-28" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UsersSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-11 w-11 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function PostsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border bg-card p-3">
          <Skeleton className="h-16 w-16 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CommentsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 rounded-xl border bg-card p-4">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-1/2 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportsSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl border bg-card p-4">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

// ---- Badge kecil ----

function RoleBadge({ role }: { role: Role }) {
  if (role === "OWNER") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-2 py-0.5 text-xs font-medium text-white shadow-[0_1px_4px_rgba(245,158,11,0.45)]">
        Owner
      </span>
    );
  }
  if (role === "ADMIN") {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-gradient-to-r from-rose-500 to-orange-400 px-2 py-0.5 text-xs font-medium text-white">
        Admin
      </span>
    );
  }
  return (
    <Badge variant="secondary" className="rounded-full">
      User
    </Badge>
  );
}

function UserStatus({ user }: { user: AdminUser }) {
  const banned = user.bannedAt !== null;
  if (!banned) {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
        Aktif
      </span>
    );
  }
  const badge = (
    <Badge variant="destructive" className="shrink-0 rounded-full">
      Dibanned
    </Badge>
  );
  if (user.banReason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent className="max-w-60 text-left">Alasan: {user.banReason}</TooltipContent>
      </Tooltip>
    );
  }
  return badge;
}

function ReportStatusBadge({ status }: { status: ReportStatus }) {
  if (status === "PENDING") {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
        Menunggu
      </span>
    );
  }
  if (status === "RESOLVED") {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
        Selesai
      </span>
    );
  }
  return (
    <Badge variant="secondary" className="shrink-0 rounded-full">
      Diabaikan
    </Badge>
  );
}

// ---- Tab 1: Ringkasan ----

function StatCard({
  icon: Icon,
  label,
  value,
  iconClassName,
  valueClassName,
  cardClassName,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  iconClassName?: string;
  valueClassName?: string;
  cardClassName?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", cardClassName)}>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className={cn("h-4 w-4", iconClassName)} aria-hidden="true" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={cn("mt-1.5 text-2xl font-bold tabular-nums", valueClassName)}>{formatCount(value)}</p>
    </div>
  );
}

function OverviewTab() {
  const statsQuery = useQuery({ queryKey: ["admin", "stats"], queryFn: api.adminStats });
  const stats = statsQuery.data;

  if (statsQuery.isLoading) return <OverviewSkeleton />;
  if (!stats) return <ErrorState onRetry={() => statsQuery.refetch()} />;

  const highlightReports = stats.pendingReports > 0;

  return (
    <div className="space-y-4">
      <section aria-label="Statistik SkelzHub" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Users} label="Total Pengguna" value={stats.totalUsers} />
        <StatCard icon={ShieldCheck} label="Admin" value={stats.admins} iconClassName="text-rose-500" />
        <StatCard icon={Ban} label="Dibanned" value={stats.bannedUsers} />
        <StatCard icon={ImageIcon} label="Total Post" value={stats.totalPosts} />
        <StatCard icon={Clapperboard} label="Shorts Video" value={stats.totalShorts} />
        <StatCard icon={MessageCircle} label="Komentar" value={stats.totalComments} />
        <StatCard icon={Heart} label="Total Suka" value={stats.totalLikes} iconClassName="fill-rose-500 text-rose-500" />
        <StatCard
          icon={Flag}
          label="Laporan Menunggu"
          value={stats.pendingReports}
          iconClassName={highlightReports ? "text-amber-500" : undefined}
          valueClassName={highlightReports ? "text-amber-600 dark:text-amber-400" : undefined}
          cardClassName={highlightReports ? "border-amber-300/70 bg-amber-50/40 dark:border-amber-500/40 dark:bg-amber-950/20" : undefined}
        />
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section aria-label="User terbaru" className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            User terbaru
          </h2>
          {stats.latestUsers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Belum ada pengguna.</p>
          ) : (
            <ul className="divide-y">
              {stats.latestUsers.map((u) => (
                <li key={u.id}>
                  <a
                    href={profileHref(u.username)}
                    className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60"
                  >
                    <UserAvatar name={u.displayName} color={u.avatarColor} avatar={u.avatar} size={32} />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-sm font-semibold">{u.displayName}</span>
                      <span className="block truncate text-xs text-muted-foreground">@{u.username}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">bergabung {timeAgo(u.createdAt)}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Post terbaru" className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Post terbaru
          </h2>
          {stats.latestPosts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Belum ada post.</p>
          ) : (
            <ul className="divide-y">
              {stats.latestPosts.map((p) => (
                <li key={p.id}>
                  <a
                    href={`#/post/${p.id}`}
                    className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60"
                  >
                    <MediaThumb
                      src={p.media}
                      type={p.type}
                      alt={`Post oleh @${p.author.username}`}
                      className="h-10 w-10 shrink-0 rounded-md"
                    />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="line-clamp-1 block text-sm">{p.caption || "tanpa keterangan"}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        @{p.author.username} · {timeAgo(p.createdAt)}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

// ---- Tab 2: Pengguna ----

type UserConfirmKind = "unban" | "delete" | "promote" | "demote";

function UserMenu({
  user,
  isSelf,
  onBan,
  onConfirm,
}: {
  user: AdminUser;
  isSelf: boolean;
  onBan: (user: AdminUser) => void;
  onConfirm: (kind: UserConfirmKind, user: AdminUser) => void;
}) {
  if (isSelf) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 rounded-full"
              disabled
              aria-label="Tidak bisa memoderasi akun sendiri"
            >
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Tidak bisa memoderasi akun sendiri</TooltipContent>
      </Tooltip>
    );
  }
  const banned = user.bannedAt !== null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-full"
          aria-label={`Aksi moderasi untuk @${user.username}`}
        >
          <MoreHorizontal className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {banned ? (
          <DropdownMenuItem onClick={() => onConfirm("unban", user)}>
            <Unlock /> Hapus ban
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem variant="destructive" onClick={() => onBan(user)}>
            <Ban /> Ban user
          </DropdownMenuItem>
        )}
        {user.role === "OWNER" ? null : user.role === "ADMIN" ? (
          <DropdownMenuItem onClick={() => onConfirm("demote", user)}>
            <UserRound /> Turunkan jadi user
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => onConfirm("promote", user)}>
            <ShieldCheck /> Jadikan admin
          </DropdownMenuItem>
        )}
        <DropdownMenuItem variant="destructive" onClick={() => onConfirm("delete", user)}>
          <Trash2 /> Hapus akun
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function userConfirmMeta(c: { kind: UserConfirmKind; user: AdminUser }): {
  title: string;
  description: string;
  actionLabel: string;
  destructive: boolean;
} {
  const { user } = c;
  switch (c.kind) {
    case "unban":
      return {
        title: "Hapus ban user ini?",
        description: `@${user.username} akan bisa login dan beraktivitas kembali di SkelzHub.`,
        actionLabel: "Hapus ban",
        destructive: false,
      };
    case "delete":
      return {
        title: "Hapus akun ini?",
        description: `Semua post dan komentar milik @${user.username} akan ikut terhapus. Tindakan ini tidak bisa dibatalkan.`,
        actionLabel: "Hapus akun",
        destructive: true,
      };
    case "promote":
      return {
        title: "Jadikan admin?",
        description: `@${user.username} akan mendapat akses penuh ke panel admin SkelzHub, termasuk memoderasi konten dan pengguna lain.`,
        actionLabel: "Jadikan admin",
        destructive: false,
      };
    case "demote":
      return {
        title: "Turunkan jadi user?",
        description: `@${user.username} akan kehilangan akses panel admin.`,
        actionLabel: "Turunkan jadi user",
        destructive: false,
      };
  }
}

function UsersTab({ me }: { me: Me | null }) {
  const [rawSearch, setRawSearch] = useState("");
  const search = useDebounced(rawSearch);
  const invalidate = useInvalidateAdmin();

  const usersQuery = useQuery({
    queryKey: ["admin", "users", search],
    queryFn: () => api.adminUsers(search),
  });

  const [banTarget, setBanTarget] = useState<AdminUser | null>(null);
  const [banReason, setBanReason] = useState("");
  const [confirmState, setConfirmState] = useState<{ kind: UserConfirmKind; user: AdminUser } | null>(null);

  const updateUser = useMutation({
    mutationFn: (vars: {
      user: AdminUser;
      action: "ban" | "unban" | "setRole";
      reason?: string;
      role?: Role;
    }) => api.adminUpdateUser(vars.user.id, { action: vars.action, reason: vars.reason, role: vars.role }),
    onSuccess: (_result, vars) => {
      if (vars.action === "ban") {
        toast({
          title: `User @${vars.user.username} dibanned`,
          description: vars.reason ? `Alasan: ${vars.reason}` : undefined,
        });
      } else if (vars.action === "unban") {
        toast({ title: "Ban dihapus", description: `@${vars.user.username} kembali aktif.` });
      } else {
        toast({
          title: "Role diperbarui",
          description: `@${vars.user.username} sekarang berstatus ${vars.role === "ADMIN" ? "admin" : "user"}.`,
        });
      }
      invalidate();
    },
    onError: adminErrorToast,
  });

  const deleteUser = useMutation({
    mutationFn: (user: AdminUser) => api.adminDeleteUser(user.id),
    onSuccess: (_result, user) => {
      toast({ title: "Akun dihapus", description: `@${user.username} beserta kontennya sudah dihapus.` });
      invalidate({ posts: true });
    },
    onError: adminErrorToast,
  });

  const users = usersQuery.data?.users ?? [];
  const isSelf = (u: AdminUser) => !!me && me.id === u.id;

  function openBan(user: AdminUser) {
    setBanReason("");
    setBanTarget(user);
  }

  function closeBan() {
    setBanTarget(null);
    setBanReason("");
  }

  function submitBan() {
    const reason = banReason.trim();
    if (!banTarget || !reason || updateUser.isPending) return;
    updateUser.mutate(
      { user: banTarget, action: "ban", reason },
      { onSuccess: () => closeBan() }
    );
  }

  function handleConfirm() {
    if (!confirmState) return;
    switch (confirmState.kind) {
      case "unban":
        updateUser.mutate({ user: confirmState.user, action: "unban" });
        break;
      case "delete":
        deleteUser.mutate(confirmState.user);
        break;
      case "promote":
        updateUser.mutate({ user: confirmState.user, action: "setRole", role: "ADMIN" });
        break;
      case "demote":
        updateUser.mutate({ user: confirmState.user, action: "setRole", role: "USER" });
        break;
    }
  }

  const confirmMeta = confirmState ? userConfirmMeta(confirmState) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchField
          value={rawSearch}
          onChange={setRawSearch}
          placeholder="Cari username / nama..."
          ariaLabel="Cari pengguna"
        />
        <p className="text-xs text-muted-foreground sm:ml-auto sm:self-center">
          {usersQuery.isFetching ? "Memuat..." : `${users.length} pengguna`}
        </p>
      </div>

      {usersQuery.isLoading && <UsersSkeleton />}
      {usersQuery.isError && <ErrorState onRetry={() => usersQuery.refetch()} />}
      {!usersQuery.isLoading && !usersQuery.isError && users.length === 0 && (
        <EmptyState icon={UserRound}>
          {search ? `Tidak ada pengguna yang cocok dengan "${search}".` : "Belum ada pengguna terdaftar."}
        </EmptyState>
      )}

      {users.length > 0 && (
        <>
          {/* Mobile: kartu */}
          <ul className="flex flex-col gap-3 md:hidden">
            {users.map((u) => (
              <li key={u.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start gap-3">
                  <UserAvatarLink
                    name={u.displayName}
                    color={u.avatarColor}
                    avatar={u.avatar}
                    username={u.username}
                    size={36}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <a
                        href={profileHref(u.username)}
                        className="max-w-full truncate text-sm font-semibold hover:underline"
                      >
                        {u.displayName}
                      </a>
                      {isSelf(u) && (
                        <Badge variant="secondary" className="rounded-full">
                          Anda
                        </Badge>
                      )}
                      <RoleBadge role={u.role} />
                      <UserStatus user={u} />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">@{u.username}</p>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {formatCount(u.postCount)} post · {formatCount(u.followerCount)} pengikut · bergabung{" "}
                      {timeAgo(u.createdAt)}
                    </p>
                    {u.bannedAt !== null && u.banReason && (
                      <p className="mt-1 line-clamp-1 text-xs text-destructive">Alasan: {u.banReason}</p>
                    )}
                  </div>
                  <UserMenu
                    user={u}
                    isSelf={isSelf(u)}
                    onBan={openBan}
                    onConfirm={(kind, user) => setConfirmState({ kind, user })}
                  />
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: tabel */}
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pengguna</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Post</TableHead>
                  <TableHead className="text-right">Pengikut</TableHead>
                  <TableHead>Bergabung</TableHead>
                  <TableHead className="w-14">
                    <span className="sr-only">Aksi</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="max-w-56">
                      <div className="flex items-center gap-3">
                        <UserAvatarLink
                          name={u.displayName}
                          color={u.avatarColor}
                          avatar={u.avatar}
                          username={u.username}
                          size={36}
                        />
                        <div className="min-w-0 leading-tight">
                          <div className="flex items-center gap-1.5">
                            <a
                              href={profileHref(u.username)}
                              className="truncate text-sm font-semibold hover:underline"
                            >
                              {u.displayName}
                            </a>
                            {isSelf(u) && (
                              <Badge variant="secondary" className="rounded-full">
                                Anda
                              </Badge>
                            )}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">@{u.username}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={u.role} />
                    </TableCell>
                    <TableCell>
                      <UserStatus user={u} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCount(u.postCount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCount(u.followerCount)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      bergabung {timeAgo(u.createdAt)}
                    </TableCell>
                    <TableCell>
                      <UserMenu
                        user={u}
                        isSelf={isSelf(u)}
                        onBan={openBan}
                        onConfirm={(kind, user) => setConfirmState({ kind, user })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Dialog ban dengan alasan wajib */}
      <Dialog open={banTarget !== null} onOpenChange={(open) => (open ? undefined : closeBan())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ban @{banTarget?.username}</DialogTitle>
            <DialogDescription>
              User yang dibanned tidak bisa login atau beraktivitas di SkelzHub sampai ban dihapus.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="ban-reason">
              Alasan pemblokiran <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="ban-reason"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Contoh: melanggar aturan komunitas SkelzHub..."
              className="min-h-[90px] resize-none"
              maxLength={300}
            />
            <p className="text-right text-xs text-muted-foreground">{banReason.length}/300</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="h-10" onClick={closeBan} disabled={updateUser.isPending}>
              Batal
            </Button>
            <Button
              variant="destructive"
              className="h-10"
              onClick={submitBan}
              disabled={updateUser.isPending || !banReason.trim()}
            >
              {updateUser.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Ban sekarang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog konfirmasi aksi user */}
      <AlertDialog
        open={confirmState !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmState(null);
        }}
      >
        {confirmState && confirmMeta && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmMeta.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirmMeta.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction
                className={
                  confirmMeta.destructive
                    ? "bg-destructive text-white hover:bg-destructive/90"
                    : "bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90"
                }
                onClick={handleConfirm}
              >
                {confirmMeta.actionLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  );
}

// ---- Tab 3: Post ----

type PostFilter = "all" | "video" | "reported";

const POST_FILTERS: { value: PostFilter; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "video", label: "Video" },
  { value: "reported", label: "Dilaporkan" },
];

function PostsTab() {
  const [rawSearch, setRawSearch] = useState("");
  const search = useDebounced(rawSearch);
  const [filter, setFilter] = useState<PostFilter>("all");
  const qc = useQueryClient();
  const invalidate = useInvalidateAdmin();

  const postsQuery = useQuery({
    queryKey: ["admin", "posts", search, filter],
    queryFn: () => api.adminPosts({ search, filter }),
  });

  const [deleteTarget, setDeleteTarget] = useState<AdminPost | null>(null);

  const deletePost = useMutation({
    mutationFn: (postId: string) => api.adminDeletePost(postId),
    onSuccess: (_result, postId) => {
      toast({ title: "Post dihapus" });
      qc.removeQueries({ queryKey: ["post", postId] });
      qc.removeQueries({ queryKey: ["comments", postId] });
      invalidate({ posts: true });
    },
    onError: adminErrorToast,
  });

  const posts = postsQuery.data?.posts ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SearchField
          value={rawSearch}
          onChange={setRawSearch}
          placeholder="Cari caption / username..."
          ariaLabel="Cari post"
        />
        <FilterGroup options={POST_FILTERS} value={filter} onChange={setFilter} ariaLabel="Filter post" />
      </div>

      {postsQuery.isLoading && <PostsSkeleton />}
      {postsQuery.isError && <ErrorState onRetry={() => postsQuery.refetch()} />}
      {!postsQuery.isLoading && !postsQuery.isError && posts.length === 0 && (
        <EmptyState icon={ImageIcon}>
          {search
            ? `Tidak ada post yang cocok dengan "${search}".`
            : filter === "video"
              ? "Tidak ada post video."
              : filter === "reported"
                ? "Tidak ada post yang dilaporkan."
                : "Belum ada post."}
        </EmptyState>
      )}

      {posts.length > 0 && (
        <>
          {/* Mobile: kartu */}
          <ul className="flex flex-col gap-3 md:hidden">
            {posts.map((p) => (
              <li key={p.id} className="rounded-xl border bg-card p-3">
                <div className="flex items-start gap-3">
                  <ThumbWithPlay
                    media={p.media}
                    type={p.type}
                    alt={`Post oleh @${p.author.username}`}
                    className="h-16 w-16"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm">{p.caption || "tanpa keterangan"}</p>
                    <a
                      href={profileHref(p.author.username)}
                      className="mt-0.5 block truncate text-xs text-muted-foreground hover:underline"
                    >
                      @{p.author.username} · {timeAgo(p.createdAt)}
                    </a>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Heart className="h-3.5 w-3.5" aria-hidden="true" />
                        {formatCount(p.likeCount)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        {formatCount(p.commentCount)}
                      </span>
                      {p.reportCount > 0 && (
                        <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                          <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                          {formatCount(p.reportCount)} laporan
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-end gap-2 border-t pt-2">
                  <Button asChild variant="outline" size="sm" className="h-10 rounded-lg">
                    <a href={`#/post/${p.id}`}>
                      <Eye /> Lihat
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeleteTarget(p)}
                  >
                    <Trash2 /> Hapus
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: tabel */}
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Post</TableHead>
                  <TableHead className="text-right">Suka</TableHead>
                  <TableHead className="text-right">Komentar</TableHead>
                  <TableHead className="text-right">Laporan</TableHead>
                  <TableHead>Waktu</TableHead>
                  <TableHead className="w-32">
                    <span className="sr-only">Aksi</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-md whitespace-normal">
                      <div className="flex items-center gap-3">
                        <ThumbWithPlay
                          media={p.media}
                          type={p.type}
                          alt={`Post oleh @${p.author.username}`}
                          className="h-16 w-16"
                        />
                        <div className="min-w-0 leading-tight">
                          <p className="line-clamp-2 text-sm">{p.caption || "tanpa keterangan"}</p>
                          <a
                            href={profileHref(p.author.username)}
                            className="mt-0.5 block truncate text-xs text-muted-foreground hover:underline"
                          >
                            @{p.author.username} · {p.author.displayName}
                          </a>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Heart className="h-3.5 w-3.5" aria-hidden="true" />
                        {formatCount(p.likeCount)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        {formatCount(p.commentCount)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.reportCount > 0 ? (
                        <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                          <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                          {formatCount(p.reportCount)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {timeAgo(p.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button asChild variant="outline" size="sm" className="h-10 rounded-lg">
                          <a href={`#/post/${p.id}`}>
                            <Eye /> Lihat
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Hapus post oleh @${p.author.username}`}
                          onClick={() => setDeleteTarget(p)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        {deleteTarget && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus post ini?</AlertDialogTitle>
              <AlertDialogDescription>
                Post dari @{deleteTarget.author.username} akan dihapus permanen beserta semua komentar dan
                sukanya. Tindakan ini tidak bisa dibatalkan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() => deletePost.mutate(deleteTarget.id)}
              >
                Hapus post
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  );
}

// ---- Tab 4: Komentar ----

function CommentsTab() {
  const [rawSearch, setRawSearch] = useState("");
  const search = useDebounced(rawSearch);
  const qc = useQueryClient();
  const invalidate = useInvalidateAdmin();

  const commentsQuery = useQuery({
    queryKey: ["admin", "comments", search],
    queryFn: () => api.adminComments(search),
  });

  const [deleteTarget, setDeleteTarget] = useState<AdminComment | null>(null);

  const deleteComment = useMutation({
    mutationFn: (commentId: string) => api.adminDeleteComment(commentId),
    onSuccess: () => {
      toast({ title: "Komentar dihapus" });
      qc.invalidateQueries({ queryKey: ["comments"] });
      invalidate({ posts: true });
    },
    onError: adminErrorToast,
  });

  const comments = commentsQuery.data?.comments ?? [];

  return (
    <div className="space-y-4">
      <SearchField
        value={rawSearch}
        onChange={setRawSearch}
        placeholder="Cari komentar / username..."
        ariaLabel="Cari komentar"
      />

      {commentsQuery.isLoading && <CommentsSkeleton />}
      {commentsQuery.isError && <ErrorState onRetry={() => commentsQuery.refetch()} />}
      {!commentsQuery.isLoading && !commentsQuery.isError && comments.length === 0 && (
        <EmptyState icon={MessageCircle}>
          {search ? `Tidak ada komentar yang cocok dengan "${search}".` : "Belum ada komentar."}
        </EmptyState>
      )}

      {comments.length > 0 && (
        <>
          {/* Mobile: kartu */}
          <ul className="flex flex-col gap-3 md:hidden">
            {comments.map((c) => (
              <li key={c.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start gap-3">
                  <UserAvatarLink
                    name={c.author.displayName}
                    color={c.author.avatarColor}
                    avatar={c.author.avatar}
                    username={c.author.username}
                    size={36}
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <a
                        href={profileHref(c.author.username)}
                        className="text-sm font-semibold hover:underline"
                      >
                        @{c.author.username}
                      </a>
                      <span className="text-xs text-muted-foreground">{timeAgo(c.createdAt)}</span>
                    </p>
                    <p className="whitespace-pre-wrap break-words text-sm">{c.text}</p>
                    <a
                      href={`#/post/${c.postId}`}
                      className="flex items-center gap-2 rounded-lg border p-1.5 transition-colors hover:bg-muted/60"
                    >
                      <MediaThumb
                        src={c.postMedia}
                        type={c.postType}
                        alt={`Post oleh @${c.postAuthor.username}`}
                        className="h-10 w-10 shrink-0 rounded-md"
                      />
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        di post: {c.postCaption || "tanpa keterangan"}
                      </span>
                    </a>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 shrink-0 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Hapus komentar oleh @${c.author.username}`}
                    onClick={() => setDeleteTarget(c)}
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: tabel */}
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Komentar</TableHead>
                  <TableHead>Di post</TableHead>
                  <TableHead>Waktu</TableHead>
                  <TableHead className="w-14">
                    <span className="sr-only">Aksi</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comments.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-lg whitespace-normal">
                      <div className="flex items-start gap-3">
                        <UserAvatarLink
                          name={c.author.displayName}
                          color={c.author.avatarColor}
                          avatar={c.author.avatar}
                          username={c.author.username}
                          size={36}
                        />
                        <div className="min-w-0">
                          <a
                            href={profileHref(c.author.username)}
                            className="text-sm font-semibold hover:underline"
                          >
                            @{c.author.username}
                          </a>
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">
                            {c.text}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs whitespace-normal">
                      <a
                        href={`#/post/${c.postId}`}
                        className="flex items-center gap-2 rounded-lg border p-1 transition-colors hover:bg-muted/60"
                      >
                        <MediaThumb
                          src={c.postMedia}
                          type={c.postType}
                          alt={`Post oleh @${c.postAuthor.username}`}
                          className="h-10 w-10 shrink-0 rounded-md"
                        />
                        <span className="min-w-0 truncate text-xs text-muted-foreground">
                          di post: {c.postCaption || "tanpa keterangan"}
                        </span>
                      </a>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {timeAgo(c.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Hapus komentar oleh @${c.author.username}`}
                        onClick={() => setDeleteTarget(c)}
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        {deleteTarget && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus komentar ini?</AlertDialogTitle>
              <AlertDialogDescription>
                Komentar dari @{deleteTarget.author.username} akan dihapus permanen dan tidak bisa
                dikembalikan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() => deleteComment.mutate(deleteTarget.id)}
              >
                Hapus komentar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  );
}

// ---- Tab 5: Laporan ----

type ReportFilter = "all" | ReportStatus;

const REPORT_FILTERS: { value: ReportFilter; label: string }[] = [
  { value: "PENDING", label: "Menunggu" },
  { value: "RESOLVED", label: "Selesai" },
  { value: "DISMISSED", label: "Diabaikan" },
  { value: "all", label: "Semua" },
];

function ReportCard({
  report,
  onDeletePost,
  onResolve,
  deletePending,
  resolvePending,
}: {
  report: ReportItem;
  onDeletePost: () => void;
  onResolve: (action: "resolve" | "dismiss") => void;
  deletePending: boolean;
  resolvePending: boolean;
}) {
  return (
    <article className="rounded-xl border bg-card p-4" aria-label={`Laporan post oleh @${report.post.author.username}`}>
      <header className="flex flex-wrap items-center gap-2">
        <Flag className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
        <span className="text-sm font-semibold">Dilaporkan {timeAgo(report.createdAt)}</span>
        <ReportStatusBadge status={report.status} />
      </header>

      <div className="mt-2.5 flex items-center gap-2">
        <UserAvatarLink
          name={report.reporter.displayName}
          color={report.reporter.avatarColor}
          avatar={report.reporter.avatar}
          username={report.reporter.username}
          size={28}
        />
        <p className="text-xs text-muted-foreground">
          oleh{" "}
          <a href={profileHref(report.reporter.username)} className="font-medium text-foreground hover:underline">
            @{report.reporter.username}
          </a>
        </p>
      </div>

      <p className="mt-2 text-sm">
        {report.reason ? (
          <>
            <span className="text-muted-foreground">Alasan: </span>
            {report.reason}
          </>
        ) : (
          <span className="italic text-muted-foreground">tanpa alasan</span>
        )}
      </p>

      <a
        href={`#/post/${report.post.id}`}
        className="mt-3 block overflow-hidden rounded-lg border transition-colors hover:bg-muted/40"
      >
        <div className="max-h-40 w-full overflow-hidden bg-muted">
          <MediaThumb
            src={report.post.media}
            type={report.post.type}
            alt={`Post dilaporkan: ${report.post.caption || "tanpa keterangan"}`}
            className="max-h-40 w-full object-cover"
          />
        </div>
        <div className="p-3">
          <p className="line-clamp-2 text-sm">{report.post.caption || "tanpa keterangan"}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <a
              href={profileHref(report.post.author.username)}
              className="font-medium text-foreground hover:underline"
            >
              @{report.post.author.username}
            </a>
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3.5 w-3.5" aria-hidden="true" />
              {formatCount(report.post.likeCount)}
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
              {formatCount(report.post.commentCount)}
            </span>
            {report.post.reportCount > 0 && (
              <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                {formatCount(report.post.reportCount)} laporan
              </span>
            )}
          </p>
        </div>
      </a>

      {report.status === "PENDING" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="destructive"
            size="sm"
            className="h-10 rounded-lg"
            onClick={onDeletePost}
            disabled={deletePending}
          >
            {deletePending && <Loader2 className="h-4 w-4 animate-spin" />}
            <Trash2 /> Hapus post
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-10 rounded-lg"
            onClick={() => onResolve("resolve")}
            disabled={resolvePending}
          >
            {resolvePending && <Loader2 className="h-4 w-4 animate-spin" />}
            <Check /> Tandai selesai
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-10 rounded-lg"
            onClick={() => onResolve("dismiss")}
            disabled={resolvePending}
          >
            <X /> Abaikan laporan
          </Button>
        </div>
      )}
    </article>
  );
}

function ReportsTab() {
  const [status, setStatus] = useState<ReportFilter>("PENDING");
  const qc = useQueryClient();
  const invalidate = useInvalidateAdmin();

  const reportsQuery = useQuery({
    queryKey: ["admin", "reports", status],
    queryFn: () => api.adminReports(status),
  });

  const [deleteTarget, setDeleteTarget] = useState<ReportItem | null>(null);

  const deletePost = useMutation({
    mutationFn: (postId: string) => api.adminDeletePost(postId),
    onSuccess: (_result, postId) => {
      toast({ title: "Post dihapus" });
      qc.removeQueries({ queryKey: ["post", postId] });
      qc.removeQueries({ queryKey: ["comments", postId] });
      invalidate({ posts: true });
    },
    onError: adminErrorToast,
  });

  const resolveReport = useMutation({
    mutationFn: (vars: { reportId: string; action: "resolve" | "dismiss" }) =>
      api.adminResolveReport(vars.reportId, vars.action),
    onSuccess: (_result, vars) => {
      toast({
        title: vars.action === "resolve" ? "Laporan ditandai selesai" : "Laporan diabaikan",
      });
      invalidate();
    },
    onError: adminErrorToast,
  });

  const reports = reportsQuery.data?.reports ?? [];
  const statusLabel =
    status === "all" ? "" : (REPORT_FILTERS.find((f) => f.value === status)?.label.toLowerCase() ?? "");

  return (
    <div className="space-y-4">
      <FilterGroup
        options={REPORT_FILTERS}
        value={status}
        onChange={setStatus}
        ariaLabel="Filter status laporan"
      />

      {reportsQuery.isLoading && <ReportsSkeleton />}
      {reportsQuery.isError && <ErrorState onRetry={() => reportsQuery.refetch()} />}
      {!reportsQuery.isLoading && !reportsQuery.isError && reports.length === 0 && (
        <EmptyState icon={Flag}>
          {status === "all" ? "Tidak ada laporan sama sekali." : `Tidak ada laporan ${statusLabel}.`}
        </EmptyState>
      )}

      {reports.length > 0 && (
        <ul className="flex flex-col gap-4">
          {reports.map((r) => (
            <li key={r.id}>
              <ReportCard
                report={r}
                onDeletePost={() => setDeleteTarget(r)}
                onResolve={(action) => resolveReport.mutate({ reportId: r.id, action })}
                deletePending={deletePost.isPending && deletePost.variables === r.post.id}
                resolvePending={resolveReport.isPending && resolveReport.variables?.reportId === r.id}
              />
            </li>
          ))}
        </ul>
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        {deleteTarget && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus post terlapor ini?</AlertDialogTitle>
              <AlertDialogDescription>
                Post dari @{deleteTarget.post.author.username} akan dihapus permanen beserta semua komentar
                dan sukanya. Tindakan ini tidak bisa dibatalkan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() => deletePost.mutate(deleteTarget.post.id)}
              >
                Hapus post
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  );
}

// ---- Akses ditolak ----

function AccessDenied() {
  return (
    <div className="mx-auto w-full max-w-5xl px-2 py-10 sm:px-4">
      <div className="mx-auto flex w-full max-w-md flex-col items-center rounded-xl border bg-card p-8 text-center shadow-sm">
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <ShieldAlert className="h-7 w-7 text-destructive" aria-hidden="true" />
        </span>
        <h1 className="text-lg font-bold tracking-tight">Akses ditolak</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Panel admin hanya bisa diakses oleh akun admin.
        </p>
        <Button asChild variant="outline" className="mt-6 h-11 rounded-full px-6">
          <a href="#/">Kembali ke beranda</a>
        </Button>
      </div>
    </div>
  );
}

// ---- Panel Admin utama ----

export function AdminView({ me }: { me: Me | null }) {
  useEffect(() => {
    document.title = "Panel Admin · SkelzHub";
  }, []);

  const isAdmin = !!me && (me.role === "ADMIN" || me.role === "OWNER");

  // Statistik dipakai untuk badge jumlah laporan menunggu di tab (dan dibagikan
  // ke OverviewTab lewat key cache yang sama).
  const statsQuery = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: api.adminStats,
    enabled: isAdmin,
    staleTime: 30_000,
  });

  if (!isAdmin) {
    return <AccessDenied />;
  }

  const pendingReports = statsQuery.data?.pendingReports ?? 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-2 py-4 sm:px-4 sm:py-6">
      <header className="mb-4 sm:mb-6">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-rose-500 to-orange-400 text-white shadow-sm"
            aria-hidden="true"
          >
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight sm:text-xl">Panel Admin</h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Kelola pengguna, post, komentar, dan laporan konten SkelzHub.
            </p>
          </div>
        </div>
      </header>

      <Tabs defaultValue="ringkasan" className="w-full gap-4">
        <TabsList className="h-11 w-full justify-start gap-0.5 overflow-x-auto">
          <TabsTrigger value="ringkasan" className="flex-none px-2 text-xs sm:px-3 sm:text-sm">
            <LayoutDashboard />
            <span className="whitespace-nowrap">Ringkasan</span>
          </TabsTrigger>
          <TabsTrigger value="pengguna" className="flex-none px-2 text-xs sm:px-3 sm:text-sm">
            <Users />
            <span className="whitespace-nowrap">Pengguna</span>
          </TabsTrigger>
          <TabsTrigger value="post" className="flex-none px-2 text-xs sm:px-3 sm:text-sm">
            <ImageIcon />
            <span className="whitespace-nowrap">Post</span>
          </TabsTrigger>
          <TabsTrigger value="komentar" className="flex-none px-2 text-xs sm:px-3 sm:text-sm">
            <MessageCircle />
            <span className="whitespace-nowrap">Komentar</span>
          </TabsTrigger>
          <TabsTrigger value="laporan" className="flex-none px-2 text-xs sm:px-3 sm:text-sm">
            <Flag />
            <span className="whitespace-nowrap">
              Laporan{pendingReports > 0 ? ` (${pendingReports})` : ""}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ringkasan" className="outline-none">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="pengguna" className="outline-none">
          <UsersTab me={me} />
        </TabsContent>
        <TabsContent value="post" className="outline-none">
          <PostsTab />
        </TabsContent>
        <TabsContent value="komentar" className="outline-none">
          <CommentsTab />
        </TabsContent>
        <TabsContent value="laporan" className="outline-none">
          <ReportsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

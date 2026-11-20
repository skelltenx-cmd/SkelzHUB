import { db } from "@/lib/db";
import { getSessionInfo, getSessionUserId } from "@/lib/session";
import { verifyPassword, hashPassword } from "@/lib/password";
import type { Comment, Post, User, UserBrief, MediaType, Role, FollowStatus } from "@/lib/types";
import { Prisma } from "@prisma/client";

// Shared types & serialization helpers

/** Normalisasi role untuk keluaran API (OWNER diteruskan apa adanya) */
export function roleOut(role: string | null | undefined): Role {
  return role === "OWNER" ? "OWNER" : role === "ADMIN" ? "ADMIN" : "USER";
}

/** Apakah role ini berhak atas aksi admin (ADMIN atau OWNER)? */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "OWNER";
}

// Alias DTO (dipakai route lama) -> tipe di lib/types
export type PostDTO = Post;
export type PostAuthorDTO = UserBrief;
export type CommentDTO = Comment;
export type UserDTO = User;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function jsonError(err: unknown) {
  if (err instanceof ApiError) {
    return jsonNoStore({ error: err.message }, err.status);
  }
  console.error("[skelzhub] API error:", err);
  return jsonNoStore({ error: "Terjadi kesalahan pada server" }, 500);
}

/** Respons JSON yang dilarang di-cache (data realtime: chat, notifikasi, story).
 *  Header no-store memastikan browser/CDN/Vercel edge selalu minta data segar. */
export function jsonNoStore(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}

function bannedMessage(banReason: string | null): string {
  return `Akun kamu telah dibanned${banReason ? `: ${banReason}` : ""}`;
}

/** User aktif dari session; null jika belum login / session tidak valid / banned.
 *
 *  Micro-cache 5 detik per userId: satu request API sering memanggil helper
 *  ini berkali-kali (mis. polling chat), dan banyak request beruntun dari user
 *  yang sama — tanpa cache tiap panggilan menambah SATU query database.
 *  Umur cache hanya 5 detik sehingga ban / logout paksa tetap berlaku nyaris
 *  seketika. */
type CachedUser = { at: number; user: Awaited<ReturnType<typeof loadUser>> };
const userMicroCache = new Map<string, CachedUser>();
const USER_CACHE_TTL_MS = 5_000;
const USER_CACHE_MAX = 512;

async function loadUser(userId: string) {
  return db.user.findUnique({ where: { id: userId } });
}

export async function getCurrentUser() {
  const info = await getSessionInfo();
  if (!info) return null;
  const cached = userMicroCache.get(info.userId);
  if (cached && Date.now() - cached.at < USER_CACHE_TTL_MS) {
    const user = cached.user;
    if (!user) return null;
    if (info.version !== user.sessionVersion) return null; // session dicabut
    return user;
  }
  const user = await loadUser(info.userId);
  if (userMicroCache.size > USER_CACHE_MAX) userMicroCache.clear();
  userMicroCache.set(info.userId, { at: Date.now(), user });
  if (!user) return null;
  if (info.version !== user.sessionVersion) return null; // session dicabut (ban / logout paksa)
  // Presence: catat "terakhir aktif" (throttle 60 detik agar tidak menulis DB tiap request)
  if (!user.lastSeenAt || Date.now() - user.lastSeenAt.getTime() > 60_000) {
    db.user
      .update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })
      .catch(() => null);
  }
  return user;
}

/** Wajib login & tidak banned. Melempar 401/403. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new ApiError("Kamu harus login dulu", 401);
  if (user.bannedAt) throw new ApiError(bannedMessage(user.banReason), 403);
  return user;
}

export async function requireUserId(): Promise<string> {
  const user = await requireUser();
  return user.id;
}

/** Wajib admin (ADMIN / OWNER). Melempar 401/403. */
export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdminRole(user.role)) throw new ApiError("Akses khusus admin", 403);
  return user;
}

// ---------- Privasi akun privat ----------

/** Filter Prisma: hanya post dari akun publik, milikku, atau pengikut yang disetujui */
export function visibleAuthorWhere(viewerId: string | null): Prisma.PostWhereInput {
  if (!viewerId) return { author: { isPrivate: false } };
  return {
    author: {
      OR: [
        { isPrivate: false },
        { id: viewerId },
        { followers: { some: { followerId: viewerId, status: "ACCEPTED" } } },
      ],
    },
  };
}

/** Apakah viewer boleh melihat konten milik targetUser? */
export async function canViewPrivateContent(viewerId: string | null, target: { id: string; isPrivate: boolean }): Promise<boolean> {
  if (!target.isPrivate) return true;
  if (!viewerId) return false;
  if (viewerId === target.id) return true;
  const f = await db.follow.findUnique({
    where: { followerId_followingId: { followerId: viewerId, followingId: target.id } },
    select: { status: true },
  });
  return f?.status === "ACCEPTED";
}

/** Status follow viewer -> target */
export async function followStatusOf(viewerId: string | null, targetId: string): Promise<FollowStatus> {
  if (!viewerId) return "NONE";
  const f = await db.follow.findUnique({
    where: { followerId_followingId: { followerId: viewerId, followingId: targetId } },
    select: { status: true },
  });
  if (!f) return "NONE";
  return f.status === "PENDING" ? "PENDING" : "ACCEPTED";
}

// ---------- Serialisasi ----------

/** Bentuk payload "me" yang seragam untuk login/register/verify (disimpan ke cache client) */
export function mePayload(user: {
  id: string;
  username: string;
  email?: string | null;
  displayName: string;
  bio: string;
  avatarColor: number;
  avatarMediaId?: string | null;
  isPrivate: boolean;
  role: string;
}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email ?? null,
    displayName: user.displayName,
    bio: user.bio,
    avatarColor: user.avatarColor,
    avatar: user.avatarMediaId ? `/api/media/${user.avatarMediaId}` : null,
    isPrivate: user.isPrivate,
    role: roleOut(user.role),
  };
}

type PostInclude = {
  author: { id: string; username: string; displayName: string; avatarColor: number; role?: string; avatarMedia?: { id: string } | null };
  _count: { likes: number; comments: number; reposts: number };
  repostOf?: RawPost | null;
};

type RawPost = {
  id: string;
  caption: string;
  mediaId: string | null;
  type: string;
  repostOfId: string | null;
  createdAt: Date;
  author: PostInclude["author"];
  _count: PostInclude["_count"];
  repostOf?: RawPost | null;
};

function brief(
  user:
    | { id: string; username: string; displayName: string; avatarColor: number; role?: string; avatarMedia?: { id: string } | null }
): UserBrief {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarColor: user.avatarColor,
    avatar: user.avatarMedia ? `/api/media/${user.avatarMedia.id}` : null,
    role: roleOut(user.role),
  };
}

export type ViewerSets = { likedIds: Set<string>; savedIds: Set<string>; repostedIds: Set<string> };

export function toPostDTO(
  post: RawPost,
  viewer: ViewerSets | null,
  previewComments: CommentDTO[] = []
): PostDTO {
  // Repost: semua interaksi (suka/komentar/simpan) mengarah ke post ASLI
  const original = post.repostOf ?? null;
  const eff = original ?? post;
  const effId = original ? original.id : post.id;
  const repostOfDTO = original ? toPostDTO(original, null) : null;

  return {
    id: post.id,
    caption: post.caption,
    media: eff.mediaId ? `/api/media/${eff.mediaId}` : null,
    type: (eff.type === "VIDEO" ? "VIDEO" : "IMAGE") as MediaType,
    createdAt: post.createdAt.toISOString(),
    author: brief(post.author),
    likeCount: eff._count.likes,
    commentCount: eff._count.comments,
    repostCount: eff._count.reposts,
    likedByMe: viewer ? viewer.likedIds.has(effId) : false,
    savedByMe: viewer ? viewer.savedIds.has(effId) : false,
    repostedByMe: viewer ? viewer.repostedIds.has(effId) : false,
    repostOf: repostOfDTO,
    previewComments,
  };
}

// Ambil 2 komentar terbaru per post untuk preview feed (1 query untuk semua post)
export async function getPreviewComments(postIds: string[]): Promise<Map<string, CommentDTO[]>> {
  if (postIds.length === 0) return new Map();
  const comments = await db.comment.findMany({
    where: { postId: { in: postIds } },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      text: true,
      createdAt: true,
      postId: true,
      parentId: true,
      user: { select: { id: true, username: true, displayName: true, avatarColor: true, role: true, avatarMedia: { select: { id: true } } } },
      parent: { select: { user: { select: { id: true, username: true, displayName: true, avatarColor: true, role: true, avatarMedia: { select: { id: true } } } } } },
    },
  });
  const map = new Map<string, CommentDTO[]>();
  for (const c of comments) {
    const list = map.get(c.postId) ?? [];
    if (list.length < 2) {
      list.push({
        id: c.id,
        text: c.text,
        createdAt: c.createdAt.toISOString(),
        parentId: c.parentId,
        replyTo: c.parent?.user ? brief(c.parent.user) : null,
        author: brief(c.user),
      });
      map.set(c.postId, list);
    }
  }
  return map;
}

export async function getViewerSets(userId: string | null, postIds: string[]): Promise<ViewerSets | null> {
  if (!userId || postIds.length === 0) return null;
  const [likes, saves, reposts] = await Promise.all([
    db.like.findMany({ where: { userId, postId: { in: postIds } }, select: { postId: true } }),
    db.saved.findMany({ where: { userId, postId: { in: postIds } }, select: { postId: true } }),
    db.post.findMany({
      where: { authorId: userId, repostOfId: { in: postIds } },
      select: { repostOfId: true },
    }),
  ]);
  return {
    likedIds: new Set(likes.map((l) => l.postId)),
    savedIds: new Set(saves.map((s) => s.postId)),
    repostedIds: new Set(reposts.map((r) => r.repostOfId as string).filter(Boolean)),
  };
}

export const postInclude = {
  author: { select: { id: true, username: true, displayName: true, avatarColor: true, isPrivate: true, role: true, avatarMedia: { select: { id: true } } } },
  _count: { select: { likes: true, comments: true, reposts: true } },
  repostOf: {
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarColor: true, isPrivate: true, role: true, avatarMedia: { select: { id: true } } } },
      _count: { select: { likes: true, comments: true, reposts: true } },
    },
  },
} as const;

export function toUserDTO(
  user: {
    id: string;
    username: string;
    displayName: string;
    bio: string;
    avatarColor: number;
    avatarMedia?: { id: string } | null;
    isPrivate?: boolean;
    role?: string;
    lastSeenAt?: Date | null;
    _count?: { posts: number; followers: number; following: number };
  },
  extra?: { isFollowing?: boolean; followStatus?: FollowStatus; isMe?: boolean }
): UserDTO {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    avatarColor: user.avatarColor,
    avatar: user.avatarMedia ? `/api/media/${user.avatarMedia.id}` : null,
    isPrivate: !!user.isPrivate,
    role: roleOut(user.role),
    lastSeenAt: user.lastSeenAt ? user.lastSeenAt.toISOString() : null,
    postCount: user._count?.posts ?? 0,
    followerCount: user._count?.followers ?? 0,
    followingCount: user._count?.following ?? 0,
    ...extra,
  };
}

export const userInclude = {
  avatarMedia: { select: { id: true } },
  _count: { select: { posts: true, followers: true, following: true } },
} as const;

/** Buat notifikasi (lewat helper agar tidak mengirim ke diri sendiri) */
export async function notify(opts: {
  userId: string; // penerima
  actorId: string;
  type: "LIKE" | "COMMENT" | "FOLLOW" | "FOLLOW_REQUEST" | "FOLLOW_ACCEPT" | "REPOST" | "STORY_VIEW" | "STORY_LIKE" | "STORY_COMMENT" | "POST_VIEW";
  postId?: string;
  commentText?: string;
}) {
  if (opts.userId === opts.actorId) return; // jangan notifikasi ke diri sendiri
  try {
    await db.notification.create({
      data: {
        userId: opts.userId,
        actorId: opts.actorId,
        type: opts.type,
        postId: opts.postId,
        commentText: opts.commentText?.slice(0, 120),
      },
    });
  } catch {
    // notifikasi tidak boleh mem gagalkan aksi utama
  }
}

const MB = 1024 * 1024;

// ============================================================
// Batas ukuran unggahan
//
// Ada dua jalur unggah:
//  1. LANGSUNG (POST /api/upload): satu request multipart — di Vercel
//     fungsi serverless punya limit request body ~4.5MB (batas platform,
//     tidak bisa dinaikkan), jadi jalur ini hanya untuk file kecil.
//  2. BERTAHAP / CHUNK (POST /api/upload/chunk -> /api/upload/complete):
//     file besar otomatis dipecah browser jadi potongan ~4MB, dikirim
//     satu per satu, lalu digabung lagi di server masuk ke database.
//     Ini membuat ukuran unggahan praktis TANPA BATAS (ratusan MB).
//
// Batas total per jenis (berlaku untuk gabungan potongan):
export const MAX_TOTAL_BYTES = {
  VIDEO: 200 * MB, // video Shorts/post/story/chat — sangat longgar
  IMAGE: 60 * MB, // foto (biasanya sudah dikompresi jauh lebih kecil)
  AUDIO: 40 * MB, // pesan suara / voice chat
} as const;

// Batas jalur langsung: Vercel memang membatasi body request ~4.5MB, jadi
// di sana file besar WAJIB lewat jalur chunk (dipilih otomatis oleh browser).
// Di lokal (dev) tidak ada batas platform — pakai batas total supaya longgar.
const MAX_DIRECT_BYTES = process.env.VERCEL ? 4.4 * MB : MAX_TOTAL_BYTES.VIDEO;

/** Klasifikasi MIME -> kind + validasi format. Dipakai jalur langsung & chunk. */
export function classifyMime(mime: string): { mime: string; kind: "IMAGE" | "VIDEO" | "AUDIO" } {
  if (mime.startsWith("video/")) {
    const allowed = ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska", "video/3gpp"];
    if (!allowed.includes(mime)) {
      throw new ApiError("Format video tidak didukung (MP4, WebM, MOV)", 400);
    }
    return { mime, kind: "VIDEO" };
  }
  if (mime.startsWith("image/")) {
    return { mime, kind: "IMAGE" };
  }
  if (mime.startsWith("audio/")) {
    const allowed = [
      "audio/webm",
      "audio/webm;codecs=opus",
      "audio/ogg",
      "audio/mpeg",
      "audio/mp3",
      "audio/mp4",
      "audio/aac",
      "audio/wav",
      "audio/x-wav",
      "audio/wave",
    ];
    const base = mime.split(";")[0].trim();
    if (!allowed.some((a) => a === mime || a === base)) {
      throw new ApiError("Format audio tidak didukung (WebM/Opus, OGG, MP3, WAV)", 400);
    }
    return { mime: base, kind: "AUDIO" };
  }
  throw new ApiError("Hanya file gambar, video, atau audio yang didukung", 400);
}

export async function readFileFromRequest(
  request: Request
): Promise<{ buffer: Buffer; mime: string; kind: "IMAGE" | "VIDEO" | "AUDIO" }> {
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") {
    throw new ApiError("File tidak ditemukan", 400);
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) throw new ApiError("File kosong", 400);

  const mime = file.type || "image/jpeg";
  const cls = classifyMime(mime);
  const limit = MAX_TOTAL_BYTES[cls.kind];
  if (buffer.length > Math.min(limit, MAX_DIRECT_BYTES)) {
    const capMB = Math.round(Math.min(limit, MAX_DIRECT_BYTES) / MB);
    throw new ApiError(
      `Ukuran ${cls.kind === "VIDEO" ? "video" : cls.kind === "IMAGE" ? "gambar" : "rekaman"} maksimal ${capMB}MB untuk sekali kirim${
        process.env.VERCEL ? " — file lebih besar seharusnya dikirim otomatis bertahap, coba muat ulang halaman" : ""
      }`,
      400
    );
  }
  return { buffer, mime: cls.mime, kind: cls.kind };
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError("Body request tidak valid", 400);
  }
}

// ---------- Ganti password ----------

export async function changeOwnPassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError("User tidak ditemukan", 404);
  if (!verifyPassword(currentPassword, user.password)) {
    throw new ApiError("Password lama salah", 403);
  }
  if (newPassword.length < 6) throw new ApiError("Password baru minimal 6 karakter");
  await db.user.update({
    where: { id: userId },
    data: { password: hashPassword(newPassword), sessionVersion: { increment: 1 } },
  });
}

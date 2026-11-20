import type {
  Me,
  MeResponse,
  Post,
  PostsPage,
  Comment,
  CommentsPage,
  User,
  Role,
  NotificationItem,
  NotificationsResponse,
  AdminStats,
  AdminUser,
  AdminPost,
  AdminComment,
  ReportItem,
  ReportStatus,
  ConversationItem,
  ChatMessage,
  ChatPresence,
  MessagesPage,
  NewMessagesResponse,
  FollowListItem,
  FollowStatus,
  StoryGroup,
  StoryDetail,
  StoryComment,
  LoginResponse,
  SearchResponse,
} from "./types";

// API client untuk SkelzHub (client-side)

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  // cache: "no-store" — data realtime (chat/notifikasi/story) TIDAK boleh
  // diambil dari cache browser/edge, supaya pesan baru selalu muncul instan
  // tanpa perlu refresh halaman.
  const res = await fetch(path, { cache: "no-store", ...init });
  let data: unknown = {};
  try {
    data = await res.json();
  } catch {
    // response tanpa body
  }
  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : null) || "Terjadi kesalahan, coba lagi";
    throw new Error(message);
  }
  return data as T;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// ============================================================
// Upload media (dipakai semua fitur: post, Shorts, story, avatar,
// lampiran chat, dan pesan suara)
//
// Ada DUA jalur, dipilih otomatis:
//
//  A. CLOUDFLARE R2 (aktif jika server mengonfigurasi R2 — produksi):
//     1) minta URL presigned ke /api/upload/r2-presign
//     2) PUT file LANGSUNG ke R2 (progres real, TANPA batas ukuran
//        sampai 5GB — melewati batas body serverless Vercel)
//     3) konfirmasi /api/upload/r2-complete → media dilayani CDN.
//     Kalau R2 gagal di tengah jalan, otomatis jatuh ke jalur B
//     (selama ukuran file masih dalam jangkauan jalur B).
//
//  B. DATABASE (jalur klasik — lokal / R2 belum dipasang):
//     File <= 4MB : dikirim LANGSUNG dalam satu request (paling cepat).
//     File besar  : otomatis dipecah jadi potongan 4MB lalu dikirim satu
//                   per satu ke /api/upload/chunk dan digabung server di
//                   /api/upload/complete — melewati batas ukuran satu request
//                   serverless (~4.5MB di Vercel) sehingga video sampai ~268MB.
const UPLOAD_DIRECT_LIMIT = 4 * 1024 * 1024;
const UPLOAD_CHUNK_SIZE = 4_194_399; // 4MB-1 — kelipatan 3 (syarat penggabungan base64)
const UPLOAD_CHUNK_MAX = 64; // sama dengan batas server (64 x ~4MB = ~268MB)

const UPLOAD_CLASSIC_CAP = UPLOAD_CHUNK_SIZE * UPLOAD_CHUNK_MAX; // ~268MB

type UploadResult = { mediaId: string; url: string; kind: "IMAGE" | "VIDEO" | "AUDIO"; mimeType: string };

/** Ambil pesan error dari balasan XHR yang gagal. */
function xhrErrorMessage(xhr: XMLHttpRequest): string {
  let msg = "Terjadi kesalahan, coba lagi";
  try {
    const data = JSON.parse(xhr.responseText);
    if (data && typeof data.error === "string") msg = data.error;
  } catch {
    /* body bukan JSON (mis. 413 mentah dari server) */
    if (xhr.status === 413) msg = "File terlalu besar untuk server unggahan";
  }
  return msg;
}

/** Unggah langsung (file <= 4MB): satu request, progress penuh. */
function uploadDirect(blob: Blob, filename: string, onProgress?: (pct: number) => void): Promise<UploadResult> {
  return new Promise<UploadResult>((resolve, reject) => {
    const form = new FormData();
    form.append("file", blob, filename);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.responseType = "text";
    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as UploadResult);
        } catch {
          reject(new Error("Balasan server tidak valid"));
        }
      } else {
        reject(new Error(xhrErrorMessage(xhr)));
      }
    };
    xhr.onerror = () => reject(new Error("Koneksi terputus saat mengunggah"));
    xhr.onabort = () => reject(new Error("Unggahan dibatalkan"));
    xhr.send(form);
  });
}

/** Kirim satu potongan file besar. */
function uploadChunkPart(
  key: string,
  index: number,
  total: number,
  slice: Blob,
  filename: string,
  onInner?: (fraction: number) => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const form = new FormData();
    form.append("key", key);
    form.append("index", String(index));
    form.append("total", String(total));
    form.append("file", slice, filename);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload/chunk");
    xhr.responseType = "text";
    if (xhr.upload && onInner) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onInner(e.loaded / e.total);
      };
    }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhrErrorMessage(xhr))));
    xhr.onerror = () => reject(new Error("Koneksi terputus saat mengunggah"));
    xhr.onabort = () => reject(new Error("Unggahan dibatalkan"));
    xhr.send(form);
  });
}

/** Unggah file besar: pecah jadi potongan 4MB, kirim satu per satu, gabung di server. */
async function uploadBigFile(blob: Blob, filename: string, onProgress?: (pct: number) => void): Promise<UploadResult> {
  const total = Math.ceil(blob.size / UPLOAD_CHUNK_SIZE);
  if (total > UPLOAD_CHUNK_MAX) {
    throw new Error("File terlalu besar — maksimal 200MB untuk video / 60MB untuk gambar");
  }
  // Kunci unggahan acak (huruf kecil, angka, tanda minus — sesuai validasi server)
  let key: string;
  try {
    key = crypto.randomUUID();
  } catch {
    key = `u${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
  for (let i = 0; i < total; i++) {
    const slice = blob.slice(i * UPLOAD_CHUNK_SIZE, Math.min((i + 1) * UPLOAD_CHUNK_SIZE, blob.size));
    await uploadChunkPart(key, i, total, slice, filename, (inner) => {
      // 0..90% dipakai untuk pengiriman semua potongan
      onProgress?.(Math.min(90, Math.round(((i + inner) / total) * 90)));
    });
  }
  onProgress?.(94);
  const mimeType = blob.type || "image/jpeg";
  const result = await req<UploadResult>(
    "/api/upload/complete",
    jsonInit("POST", { key, totalChunks: total, mimeType })
  );
  onProgress?.(100);
  return result;
}

// ============================================================
// Jalur unggah Cloudflare R2 (produksi) — upload langsung dari browser
// ke penyimpanan via URL presigned: progress real 0-95%, tanpa batas
// ukuran sampai 5GB, dan media dilayani dari CDN (tampilan instan).
// ============================================================

/** Apakah penyimpanan R2 aktif di server? (di-cache agar cuma sekali tanya)
 *
 *  Penting untuk kecepatan & keandalan:
 *   - hasil AKTIF  diingat lama (10 menit) — konfigurasi jarang berubah.
 *   - hasil MATI   hanya diingat 20 detik — kalau tadi gagal karena cold
 *     start / jaringan lambat (bukan karena R2 benar-benar mati), percakapan
 *     berikutnya otomatis mencoba lagi sehingga unggahan besar tidak
 *     "tersesat" ke jalur database yang lebih lambat.
 */
let r2EnabledCache: boolean | null = null;
let r2EnabledCacheAt = 0;
const R2_CACHE_TTL_TRUE = 10 * 60 * 1000;
const R2_CACHE_TTL_FALSE = 20 * 1000;

async function isR2Enabled(): Promise<boolean> {
  const now = Date.now();
  if (
    r2EnabledCache !== null &&
    now - r2EnabledCacheAt < (r2EnabledCache ? R2_CACHE_TTL_TRUE : R2_CACHE_TTL_FALSE)
  ) {
    return r2EnabledCache;
  }
  try {
    // Batasi waktu tunggu probe: jangan bikin unggahan terasa macet saat
    // server sedang bangun dingin (cold start).
    const ctrl = new AbortController();
    const abortTimer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch("/api/upload/r2-presign", { cache: "no-store", signal: ctrl.signal });
    clearTimeout(abortTimer);
    if (!res.ok) {
      r2EnabledCache = false;
      r2EnabledCacheAt = now;
      return false;
    }
    const data = (await res.json()) as { enabled?: boolean };
    r2EnabledCache = !!data.enabled;
    r2EnabledCacheAt = now;
  } catch {
    r2EnabledCache = false;
    r2EnabledCacheAt = now;
  }
  return r2EnabledCache;
}

type R2PresignResult = {
  uploadUrl: string;
  key: string;
  kind: "IMAGE" | "VIDEO" | "AUDIO";
  mimeType: string;
};

/**
 * Batas ukuran unggahan yang BERLAKU SAAT INI (dipakai UI untuk pesan
 * "terlalu besar" yang akurat):
 *  - R2 aktif  : video & gambar sampai 5GB (penyimpanan Cloudflare)
 *  - R2 mati   : video 200MB, gambar 60MB (jalur database)
 */
export async function uploadCaps(): Promise<{ r2: boolean; video: number; image: number }> {
  const r2 = await isR2Enabled();
  const GB = 1024 * 1024 * 1024;
  const MB = 1024 * 1024;
  return r2
    ? { r2: true, video: 5 * GB, image: 5 * GB }
    : { r2: false, video: 200 * MB, image: 60 * MB };
}

/** PUT file langsung ke R2 lewat URL presigned (progres real via XHR). */
function r2PutFile(
  uploadUrl: string,
  mimeType: string,
  blob: Blob,
  onProgress?: (pct: number) => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.responseType = "text";
    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.min(95, Math.round((e.loaded / e.total) * 95)));
      };
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error("Gagal mengirim file ke penyimpanan — coba lagi"));
    xhr.onerror = () => reject(new Error("Koneksi ke penyimpanan terputus"));
    xhr.onabort = () => reject(new Error("Unggahan dibatalkan"));
    // WAJIB sama dengan tipe yang ditandatangani server
    if (mimeType) xhr.setRequestHeader("Content-Type", mimeType);
    xhr.send(blob);
  });
}

/** Unggah penuh via R2: presign → PUT langsung → konfirmasi server. */
async function uploadToR2(blob: Blob, filename: string, onProgress?: (pct: number) => void): Promise<UploadResult> {
  onProgress?.(1);
  const presign = await req<R2PresignResult>(
    "/api/upload/r2-presign",
    jsonInit("POST", { filename, mimeType: blob.type || "image/jpeg", size: blob.size })
  );
  onProgress?.(2);
  await r2PutFile(presign.uploadUrl, presign.mimeType, blob, onProgress);
  onProgress?.(97);
  const result = await req<UploadResult>(
    "/api/upload/r2-complete",
    jsonInit("POST", { key: presign.key, mimeType: presign.mimeType })
  );
  onProgress?.(100);
  return result;
}

export const api = {
  // Auth
  me: () => req<MeResponse>("/api/auth/me"),
  login: (username: string, password: string) =>
    req<LoginResponse>("/api/auth/login", jsonInit("POST", { username, password })),
  loginVerify: (userId: string, code: string) =>
    req<{ step: "done"; user: Me }>("/api/auth/login/verify", jsonInit("POST", { userId, code })),
  register: (username: string, displayName: string, email: string, password: string) =>
    req<LoginResponse>("/api/auth/register", jsonInit("POST", { username, displayName, email, password })),
  logout: () => req<{ ok: boolean }>("/api/auth/logout", jsonInit("POST", {})),
  forgotPassword: (email: string) =>
    req<{ emailSent: boolean; emailConfigured?: boolean; devCode?: string; message?: string }>(
      "/api/auth/forgot-password",
      jsonInit("POST", { email })
    ),
  resetPassword: (email: string, code: string, newPassword: string) =>
    req<{ ok: boolean }>("/api/auth/reset-password", jsonInit("POST", { email, code, newPassword })),
  heartbeat: () => req<{ ok: boolean }>('/api/me/heartbeat', { method: "POST" }),

  // Posts
  posts: (params: { feed?: string; username?: string; page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params.feed) qs.set("feed", params.feed);
    if (params.username) qs.set("username", params.username);
    qs.set("page", String(params.page ?? 0));
    qs.set("limit", String(params.limit ?? 12));
    return req<PostsPage>(`/api/posts?${qs.toString()}`);
  },
  post: (id: string) => req<{ post: Post }>(`/api/posts/${id}`),
  createPost: (payload: { caption: string; mediaId?: string; repostOfId?: string }) =>
    req<{ post: Post }>("/api/posts", jsonInit("POST", payload)),
  deletePost: (id: string) => req<{ ok: boolean }>(`/api/posts/${id}`, { method: "DELETE" }),
  // Edit caption post (tanpa perlu hapus + upload ulang)
  editPost: (id: string, caption: string) =>
    req<{ post: Post }>(`/api/posts/${id}`, jsonInit("PATCH", { caption })),

  // Interaksi
  like: (id: string) => req<{ liked: boolean; likeCount: number }>(`/api/posts/${id}/like`, { method: "POST" }),
  save: (id: string) => req<{ saved: boolean }>(`/api/posts/${id}/save`, { method: "POST" }),
  repost: (id: string) => req<{ reposted: boolean; repostCount: number }>(`/api/posts/${id}/repost`, { method: "POST" }),

  // Laporan konten
  reportPost: (postId: string, reason: string) =>
    req<{ ok: boolean }>(`/api/posts/${postId}/report`, jsonInit("POST", { reason })),

  // Komentar (dengan balasan)
  comments: (id: string, page = 0, limit = 30) =>
    req<CommentsPage>(`/api/posts/${id}/comments?page=${page}&limit=${limit}`),
  addComment: (id: string, text: string, parentId?: string) =>
    req<{ comment: Comment }>(
      `/api/posts/${id}/comments`,
      jsonInit("POST", { text, parentId: parentId ?? null })
    ),
  deleteComment: (id: string) => req<{ ok: boolean }>(`/api/comments/${id}`, { method: "DELETE" }),

  // Users
  searchUsers: (search: string) =>
    req<{ users: User[] }>(`/api/users?search=${encodeURIComponent(search)}`),
  user: (username: string) => req<{ user: User }>(`/api/users/${encodeURIComponent(username)}`),
  updateUser: (username: string, data: { displayName?: string; bio?: string }) =>
    req<{ user: User }>(`/api/users/${encodeURIComponent(username)}`, jsonInit("PATCH", data)),
  follow: (username: string) =>
    req<{ following: boolean; pending: boolean; followerCount: number }>(`/api/users/${encodeURIComponent(username)}/follow`, {
      method: "POST",
    }),
  suggestions: () => req<{ users: User[] }>("/api/suggestions"),
  // Pencarian global: akun + post + video dalam satu permintaan
  search: (q: string) =>
    req<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`),
  followers: (username: string) =>
    req<{ users: FollowListItem[] }>(`/api/users/${encodeURIComponent(username)}/followers`),
  following: (username: string) =>
    req<{ users: FollowListItem[] }>(`/api/users/${encodeURIComponent(username)}/following`),

  // Pengaturan akun sendiri
  updateMe: (data: {
    displayName?: string;
    bio?: string;
    isPrivate?: boolean;
    avatarMediaId?: string | null;
    currentPassword?: string;
    newPassword?: string;
  }) => req<{ user: User; passwordChanged: boolean }>("/api/me", jsonInit("PATCH", data)),

  // Permintaan ikuti (akun privat)
  followRequests: () =>
    req<{ requests: { followId: string; createdAt: string; user: import("./types").UserBrief }[] }>("/api/follow-requests"),
  resolveFollowRequest: (followId: string, action: "accept" | "reject") =>
    req<{ ok: boolean; accepted: boolean }>("/api/follow-requests", jsonInit("PATCH", { followId, action })),

  // Pesan / DM
  conversations: () => req<{ conversations: ConversationItem[]; unread: number }>("/api/conversations"),
  startConversation: (username: string) =>
    req<{ conversationId: string }>("/api/conversations", jsonInit("POST", { username })),
  messages: (conversationId: string, page = 0) =>
    req<MessagesPage>(`/api/conversations/${conversationId}/messages?page=${page}`),
  newMessages: (conversationId: string, since: string) =>
    req<NewMessagesResponse>(`/api/conversations/${conversationId}/messages?since=${encodeURIComponent(since)}`),
  sendMessage: (conversationId: string, text: string, replyToId?: string) =>
    req<{ message: ChatMessage }>(
      `/api/conversations/${conversationId}/messages`,
      jsonInit("POST", { text, replyToId: replyToId ?? null })
    ),
  sendMessageMedia: (conversationId: string, mediaId: string, text?: string, replyToId?: string | null) =>
    req<{ message: ChatMessage }>(
      `/api/conversations/${conversationId}/messages`,
      jsonInit("POST", { mediaId, text: text ?? "", replyToId: replyToId ?? null })
    ),
  sendTyping: (conversationId: string) =>
    req<{ ok: boolean }>(`/api/conversations/${conversationId}/typing`, { method: "POST" }).catch(() => null),
  editMessage: (conversationId: string, messageId: string, text: string) =>
    req<{ message: ChatMessage }>(
      `/api/conversations/${conversationId}/messages`,
      jsonInit("PATCH", { messageId, text })
    ),
  deleteMessage: (conversationId: string, messageId: string) =>
    req<{ ok: boolean }>(
      `/api/conversations/${conversationId}/messages?messageId=${encodeURIComponent(messageId)}`,
      { method: "DELETE" }
    ),
  /** Reaksi emoji pada pesan (emoji = null -> hapus reaksi). Toggle di server. */
  reactMessage: (conversationId: string, messageId: string, emoji: string | null) =>
    req<{ ok: boolean; messageId: string; emoji: string | null }>(
      `/api/conversations/${conversationId}/messages/react`,
      jsonInit("POST", { messageId, emoji })
    ),

  // Notifikasi
  notifications: () => req<NotificationsResponse>("/api/notifications"),
  markNotificationsRead: () => req<{ ok: boolean }>("/api/notifications", jsonInit("POST", {})),

  // Upload — jalur tercepat dipilih otomatis:
  //  R2 aktif : upload langsung ke Cloudflare (progres real, sampai 5GB,
  //            media dilayani CDN super cepat)
  //  R2 mati  : file kecil langsung satu request, file besar otomatis
  //            bertahap (chunk) dengan progress bar responsif.
  // Dipakai semua fitur: post, Shorts, story, avatar, lampiran chat, suara.
  upload: async (
    blob: Blob,
    filename: string,
    onProgress?: (pct: number) => void
  ): Promise<UploadResult> => {
    if (await isR2Enabled()) {
      try {
        return await uploadToR2(blob, filename, onProgress);
      } catch (err) {
        // R2 bermasalah di tengah jalan → pulih otomatis ke jalur database
        // selama ukuran file masih dalam jangkauan jalur klasik.
        if (blob.size > UPLOAD_CLASSIC_CAP) throw err;
      }
    }
    return blob.size <= UPLOAD_DIRECT_LIMIT
      ? uploadDirect(blob, filename, onProgress)
      : uploadBigFile(blob, filename, onProgress);
  },

  // Story (hilang otomatis dalam 24 jam) — dengan like & komentar
  stories: () => req<{ groups: StoryGroup[] }>("/api/stories"),
  createStory: (payload: { mediaId: string; caption?: string; audioMediaId?: string | null }) =>
    req<{ storyId: string }>("/api/stories", jsonInit("POST", payload)),
  storyDetail: (storyId: string) => req<StoryDetail>(`/api/stories/${storyId}`),
  markStorySeen: (storyId: string) =>
    req<{ ok: boolean }>(`/api/stories/${storyId}/view`, { method: "POST" }),
  deleteStory: (storyId: string) =>
    req<{ ok: boolean }>(`/api/stories/${storyId}`, { method: "DELETE" }),
  storyLike: (storyId: string) =>
    req<{ liked: boolean; likeCount: number }>(`/api/stories/${storyId}/like`, { method: "POST" }),
  storyComments: (storyId: string) =>
    req<{ comments: StoryComment[] }>(`/api/stories/${storyId}/comments`),
  addStoryComment: (storyId: string, text: string, parentId?: string | null) =>
    req<{ comment: StoryComment }>(
      `/api/stories/${storyId}/comments`,
      jsonInit("POST", { text, parentId: parentId ?? null })
    ),
  deleteStoryComment: (storyId: string, commentId: string) =>
    req<{ ok: boolean }>(
      `/api/stories/${storyId}/comments?commentId=${encodeURIComponent(commentId)}`,
      { method: "DELETE" }
    ),

  // ---- Admin panel ----
  adminStats: () => req<AdminStats>("/api/admin/stats"),
  adminUsers: (search = "") =>
    req<{ users: AdminUser[] }>(`/api/admin/users?search=${encodeURIComponent(search)}`),
  adminUpdateUser: (userId: string, data: { action: "ban" | "unban" | "setRole"; reason?: string; role?: Role }) =>
    req<{ ok: boolean }>("/api/admin/users", jsonInit("PATCH", { userId, ...data })),
  adminDeleteUser: (userId: string) => req<{ ok: boolean }>("/api/admin/users", jsonInit("DELETE", { userId })),
  adminPosts: (opts: { search?: string; filter?: "all" | "video" | "reported" } = {}) => {
    const qs = new URLSearchParams();
    if (opts.search) qs.set("search", opts.search);
    if (opts.filter && opts.filter !== "all") qs.set("filter", opts.filter);
    return req<{ posts: AdminPost[] }>(`/api/admin/posts?${qs.toString()}`);
  },
  adminDeletePost: (postId: string) => req<{ ok: boolean }>("/api/admin/posts", jsonInit("DELETE", { postId })),
  adminComments: (search = "") =>
    req<{ comments: AdminComment[] }>(`/api/admin/comments?search=${encodeURIComponent(search)}`),
  adminDeleteComment: (commentId: string) =>
    req<{ ok: boolean }>("/api/admin/comments", jsonInit("DELETE", { commentId })),
  adminReports: (status: "all" | ReportStatus = "PENDING") =>
    req<{ reports: ReportItem[] }>(`/api/admin/reports?status=${status}`),
  adminResolveReport: (reportId: string, action: "dismiss" | "resolve") =>
    req<{ ok: boolean }>("/api/admin/reports", jsonInit("PATCH", { reportId, action })),
};

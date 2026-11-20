// Cache in-memory sisi server (aman untuk SQLite lokal & Vercel serverless).
// Menyimpan: user aktif per sesi, buffer media kecil, dan keputusan izin akses media.
// Semua entri bermasa berlaku pendek (TTL) supaya perubahan (ban, ganti foto,
// upload chunked) otomatis terlihat dalam hitungan detik tanpa restart.

import type { User } from "@prisma/client";

// ---------- Cache sesi user ----------
// Kunci: session token. Nilai: user (atau null) + kedaluwarsa.
// TTL pendek 8 detik: cukup untuk menahan beban polling berat (chat tiap 1,5 dtk),
// tetap responsif terhadap ban/logout paksa.

const SESSION_TTL_MS = 8_000;
const sessionCache = new Map<string, { user: User | null; expires: number }>();

export function sessionCacheGet(token: string): { user: User | null; hit: boolean } {
  const entry = sessionCache.get(token);
  if (!entry) return { user: null, hit: false };
  if (entry.expires < Date.now()) {
    sessionCache.delete(token);
    return { user: null, hit: false };
  }
  return { user: entry.user, hit: true };
}

export function sessionCacheSet(token: string, user: User | null) {
  // Batasi ukuran cache sesi agar tidak tumbuh tanpa batas di instance panjang umur
  if (sessionCache.size > 5000) sessionCache.clear();
  sessionCache.set(token, { user, expires: Date.now() + SESSION_TTL_MS });
}

/** Cabut user dari cache sesi (dipanggil saat ban / ganti password / logout paksa) */
export function invalidateUserSessions(userId: string) {
  for (const [token, entry] of sessionCache) {
    if (entry.user?.id === userId) sessionCache.delete(token);
  }
}

// ---------- Cache buffer media ----------
// Menyimpan media kecil (avatar, thumbnail, foto) yang sudah ter-decode dari base64.
// Media besar (video) TIDAK di-cache supaya memori aman.

export type MediaBuffer = { buffer: Buffer; mimeType: string; kind: string; externalUrl: string | null };

const MAX_CACHED_MEDIA_BYTES = 22 * 1024 * 1024; // per media (video Shorts ikut ter-cache)
const MAX_TOTAL_CACHED_BYTES = 128 * 1024 * 1024; // total 128MB per instance
const MAX_CACHED_MEDIA_COUNT = 600;
const mediaCache = new Map<string, { buf: MediaBuffer; bytes: number; expires: number }>();
let mediaCacheBytes = 0;

export function mediaCacheGet(id: string): MediaBuffer | null {
  const entry = mediaCache.get(id);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    mediaCache.delete(id);
    mediaCacheBytes -= entry.bytes;
    return null;
  }
  // LRU ringan: sentuh ulang agar tetap "baru"
  mediaCache.delete(id);
  mediaCache.set(id, entry);
  return entry.buf;
}

export function mediaCacheSet(id: string, buf: MediaBuffer) {
  const bytes = buf.buffer.length;
  if (bytes === 0 || bytes > MAX_CACHED_MEDIA_BYTES) return;
  // Buang entri terlama kalau melebihi anggaran memori / jumlah entri
  while ((mediaCacheBytes + bytes > MAX_TOTAL_CACHED_BYTES || mediaCache.size >= MAX_CACHED_MEDIA_COUNT) && mediaCache.size > 0) {
    const oldest = mediaCache.keys().next().value as string;
    const entry = mediaCache.get(oldest);
    if (!entry) break;
    mediaCache.delete(oldest);
    mediaCacheBytes -= entry.bytes;
  }
  mediaCache.set(id, { buf, bytes, expires: Date.now() + 5 * 60_000 });
  mediaCacheBytes += bytes;
}

/** Media berubah (upload chunked menambah data / avatar diganti) -> buang dari cache */
export function invalidateMediaCache(id: string) {
  const entry = mediaCache.get(id);
  if (entry) {
    mediaCacheBytes -= entry.bytes;
    mediaCache.delete(id);
  }
  thumbCache.delete(id);
}

// ---------- Cache thumbnail (varian kecil gambar, dibuat pakai sharp) ----------
// Feed/grid memakai ?size=thumb -> transfer ±10x lebih kecil -> halaman terasa instan.
// Thumbnail tidak pernah berubah untuk media yang sama, TTL panjang tak masalah.

const MAX_TOTAL_THUMB_BYTES = 48 * 1024 * 1024;
const MAX_THUMB_COUNT = 500;
const thumbCache = new Map<string, { buffer: Buffer; bytes: number }>();
let thumbCacheBytes = 0;

export function thumbCacheGet(id: string): Buffer | null {
  return thumbCache.get(id)?.buffer ?? null;
}

export function thumbCacheSet(id: string, buffer: Buffer) {
  const bytes = buffer.length;
  if (bytes === 0) return;
  while ((thumbCacheBytes + bytes > MAX_TOTAL_THUMB_BYTES || thumbCache.size >= MAX_THUMB_COUNT) && thumbCache.size > 0) {
    const oldest = thumbCache.keys().next().value as string;
    const entry = thumbCache.get(oldest);
    if (!entry) break;
    thumbCache.delete(oldest);
    thumbCacheBytes -= entry.bytes;
  }
  thumbCache.set(id, { buffer, bytes });
  thumbCacheBytes += bytes;
}

// ---------- Cache keputusan izin akses media ----------
// "Media X boleh dilihat viewer Y?" -> dihitung sekali, dipakai ulang 60 dtk.

const PERM_TTL_MS = 60_000;
const permCache = new Map<string, { allow: boolean; expires: number }>();

export function permCacheGet(mediaId: string, viewerId: string | null): boolean | null {
  const key = `${mediaId}|${viewerId ?? "anon"}`;
  const entry = permCache.get(key);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    permCache.delete(key);
    return null;
  }
  return entry.allow;
}

export function permCacheSet(mediaId: string, viewerId: string | null, allow: boolean) {
  if (permCache.size > 5000) permCache.clear();
  permCache.set(`${mediaId}|${viewerId ?? "anon"}`, { allow, expires: Date.now() + PERM_TTL_MS });
}

// ---------- Throttle pembersihan story 24 jam ----------
// Berapa kali instance ini terakhir membersihkan story kedaluwarsa.

export const storyCleanupState = { lastRun: 0 };

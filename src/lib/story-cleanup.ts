import { db } from "@/lib/db";
import { invalidateMediaCache, storyCleanupState } from "@/lib/server-cache";

// Pembersih otomatis: story yang sudah lewat 24 jam BENAR-BENAR
// dihapus dari database (story + daftar penonton + file media ikut dibersihkan).
// Dijalankan throttled tiap 60 dtk per instance dari GET /api/stories —
// tempat yang pasti dikunjungi tiap kali app dibuka.

const CLEANUP_INTERVAL_MS = 60_000;
const ORPHAN_SWEEP_INTERVAL_MS = 6 * 3600 * 1000; // sapu bersih media yatim tiap ±6 jam

let lastOrphanSweep = 0;

/** Hapus story kedaluwarsa (grace 10 menit) + media yang jadi yatim. */
export async function cleanupExpiredStories() {
  try {
    const now = Date.now();
    if (now - storyCleanupState.lastRun < CLEANUP_INTERVAL_MS) return;
    storyCleanupState.lastRun = now;

    const expired = await db.story.findMany({
      where: { expiresAt: { lt: new Date(now - 10 * 60_000) } },
      select: { id: true, mediaId: true },
      take: 200,
    });
    if (expired.length === 0) return;

    const ids = expired.map((s) => s.id);
    await db.storyView.deleteMany({ where: { storyId: { in: ids } } });
    await db.story.deleteMany({ where: { id: { in: ids } } });

    const mediaIds = [...new Set(expired.map((s) => s.mediaId))];
    await deleteUnreferencedMedia(mediaIds);
    for (const id of mediaIds) invalidateMediaCache(id);
  } catch {
    // pembersihan tidak boleh mengganggu respons utama
  }
}

/** Hapus media yang tidak dipakai lagi post/story/pesan/avatar mana pun. */
export async function deleteUnreferencedMedia(mediaIds: string[]) {
  if (mediaIds.length === 0) return;
  try {
    const [inPosts, inMessages, inStories, inAvatars] = await Promise.all([
      db.post.findMany({ where: { mediaId: { in: mediaIds } }, select: { mediaId: true } }),
      db.message.findMany({ where: { mediaId: { in: mediaIds } }, select: { mediaId: true } }),
      db.story.findMany({ where: { mediaId: { in: mediaIds } }, select: { mediaId: true } }),
      db.user.findMany({ where: { avatarMediaId: { in: mediaIds } }, select: { avatarMediaId: true } }),
    ]);
    const used = new Set<string>();
    for (const p of inPosts) if (p.mediaId) used.add(p.mediaId);
    for (const m of inMessages) if (m.mediaId) used.add(m.mediaId);
    for (const s of inStories) used.add(s.mediaId);
    for (const u of inAvatars) if (u.avatarMediaId) used.add(u.avatarMediaId);
    const orphans = mediaIds.filter((id) => !used.has(id));
    if (orphans.length > 0) {
      await db.media.deleteMany({ where: { id: { in: orphans } } });
    }
  } catch {
    // diamkan — bisa diulang lain waktu
  }
}

/** Sapu media yatim umur >48 jam (unggahan terbengkalai / chunked setengah jadi). */
export async function sweepAbandonedUploads() {
  try {
    const now = Date.now();
    if (now - lastOrphanSweep < ORPHAN_SWEEP_INTERVAL_MS) return;
    lastOrphanSweep = now;

    const cutoff = new Date(now - 48 * 3600 * 1000);
    const candidates = await db.media.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: 300,
    });
    await deleteUnreferencedMedia(candidates.map((m) => m.id));
  } catch {
    // diamkan
  }
}

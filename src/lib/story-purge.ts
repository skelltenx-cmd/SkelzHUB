import { db } from "@/lib/db";

// Pembersih story kedaluwarsa: story BENAR-BENAR DIHAPUS dari database
// (bukan sekadar disembunyikan) begitu lewat 24 jam, persis perilaku story
// di platform sosial pada umumnya. Media terkait juga dihapus bila sudah
// tidak dipakai tempat lain (post / avatar / pesan / story lain).
//
// Dipanggil secara periodik dari endpoint yang sering disentuh pengguna
// (daftar story & heartbeat) dengan throttle supaya aman untuk serverless.

let lastSweepAt = 0;
const SWEEP_INTERVAL_MS = 5 * 60_000; // cukup sekali per 5 menit per instance

/** Hapus media yang sudah tidak dirujuk konten manapun (aman dipanggil kapanpun) */
export async function deleteMediaIfOrphan(mediaId: string): Promise<void> {
  const used = await db.media.findUnique({
    where: { id: mediaId },
    select: {
      posts: { take: 1, select: { id: true } },
      avatarOf: { select: { id: true } },
      stories: { take: 1, select: { id: true } },
      messages: { take: 1, select: { id: true } },
    },
  });
  if (!used) return;
  if (used.posts.length || used.avatarOf || used.stories.length || used.messages.length) return;
  await db.media.delete({ where: { id: mediaId } }).catch(() => null);
}

/**
 * Sapu bersih story kedaluwarsa (fisik). Throttle internal agar tidak
 * memberatkan request — cukup satu sapuan tiap beberapa menit.
 */
export async function purgeExpiredStories(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;

  try {
    const expired = await db.story.findMany({
      where: { expiresAt: { lte: new Date() } },
      select: { id: true, mediaId: true },
      take: 200,
    });
    if (expired.length === 0) return;

    await db.story.deleteMany({ where: { id: { in: expired.map((s) => s.id) } } });

    // Media story yang sudah tidak dipakai konten lain ikut dibuang
    const mediaIds = [...new Set(expired.map((s) => s.mediaId))];
    for (const mid of mediaIds) {
      await deleteMediaIfOrphan(mid);
    }
  } catch {
    // sapuan tidak boleh mengganggu request utama
  }
}

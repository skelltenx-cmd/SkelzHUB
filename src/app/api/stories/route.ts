import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { jsonError, jsonNoStore, ApiError, requireUser, readJson, roleOut } from "@/lib/api-utils";
import { purgeExpiredStories } from "@/lib/story-purge";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

// GET /api/stories
// Daftar story aktif (belum 24 jam).
// Story bersifat PUBLIK: semua pengguna yang login bisa melihat story akun
// publik — supaya story selalu terlihat dari perangkat/platform manapun.
// Story akun privat tetap hanya untuk pengikut yang disetujui + pemiliknya.
// Setiap kali daftar dibuka, story kedaluwarsa juga disapu (dihapus fisik).
export async function GET() {
  try {
    // Sapu story yang sudah lewat 24 jam (throttle internal, aman)
    await purgeExpiredStories();

    const viewerId = await getSessionUserId();
    if (!viewerId) return Response.json({ groups: [] });

    const now = new Date();
    const stories = await db.story.findMany({
      where: {
        expiresAt: { gt: now },
        author: {
          OR: [
            { isPrivate: false },
            { id: viewerId },
            { followers: { some: { followerId: viewerId, status: "ACCEPTED" } } },
          ],
        },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        caption: true,
        createdAt: true,
        expiresAt: true,
        media: { select: { id: true, kind: true } },
        // Sound/musik latar story (opsional)
        audio: { select: { id: true } },
        author: {
          select: { id: true, username: true, displayName: true, avatarColor: true, role: true, avatarMedia: { select: { id: true } } },
        },
        views: { where: { userId: viewerId }, select: { id: true } },
        // Like / komentar / jumlah penonton untuk aksi story di viewer
        _count: { select: { likes: true, comments: true, views: true } },
        likes: { where: { userId: viewerId }, select: { id: true } },
      },
    });

    // Kelompokkan per author
    const byAuthor = new Map<string, { author: typeof stories[number]["author"]; items: unknown[]; hasUnseen: boolean; latestAt: Date }>();
    for (const s of stories) {
      const seen = s.views.length > 0;
      const g = byAuthor.get(s.author.id) ?? {
        author: s.author,
        items: [],
        hasUnseen: false,
        latestAt: s.createdAt,
      };
      g.items.push({
        id: s.id,
        media: `/api/media/${s.media.id}`,
        type: s.media.kind === "VIDEO" ? "VIDEO" : "IMAGE",
        caption: s.caption,
        createdAt: s.createdAt.toISOString(),
        seen,
        likeCount: s._count.likes,
        likedByMe: s.likes.length > 0,
        commentCount: s._count.comments,
        viewCount: s._count.views,
        audio: s.audio ? `/api/media/${s.audio.id}` : null,
      });
      if (!seen) g.hasUnseen = true;
      if (s.createdAt > g.latestAt) g.latestAt = s.createdAt;
      byAuthor.set(s.author.id, g);
    }

    const groups = [...byAuthor.values()].map((g) => ({
      author: {
        id: g.author.id,
        username: g.author.username,
        displayName: g.author.displayName,
        avatarColor: g.author.avatarColor,
        avatar: g.author.avatarMedia ? `/api/media/${g.author.avatarMedia.id}` : null,
        role: roleOut(g.author.role),
      },
      items: g.items,
      hasUnseen: g.hasUnseen,
      isMe: g.author.id === viewerId,
      latestAt: g.latestAt.toISOString(),
    }));

    // Urutan: story-ku dulu, lalu yang belum dilihat, terakhir yang sudah dilihat
    groups.sort((a, b) => {
      if (a.isMe !== b.isMe) return a.isMe ? -1 : 1;
      if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
      return b.latestAt.localeCompare(a.latestAt);
    });

    return jsonNoStore({ groups });
  } catch (err) {
    return jsonError(err);
  }
}

// POST /api/stories  { mediaId, caption, audioMediaId? }
// Story baru: gambar atau video, otomatis hilang dalam 24 jam.
// audioMediaId opsional: sound/musik latar yang diputar selama story berjalan.
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{ mediaId?: string; caption?: string; audioMediaId?: string | null }>(request);
    const mediaId = (body.mediaId || "").trim();
    const caption = (body.caption || "").trim().slice(0, 500);
    const audioMediaId = (body.audioMediaId || "").trim() || null;
    if (!mediaId) throw new ApiError("Media story wajib diunggah");

    const media = await db.media.findUnique({ where: { id: mediaId } });
    if (!media) throw new ApiError("Media tidak ditemukan, unggah ulang", 400);
    if (media.kind !== "IMAGE" && media.kind !== "VIDEO") {
      throw new ApiError("Story harus berupa gambar atau video", 400);
    }

    // Validasi sound: harus media AUDIO milik unggahan (bukan audio orang lain)
    if (audioMediaId) {
      const audio = await db.media.findUnique({ where: { id: audioMediaId } });
      if (!audio || audio.kind !== "AUDIO") {
        throw new ApiError("Sound tidak valid — unggah ulang audio", 400);
      }
    }

    const story = await db.story.create({
      data: {
        authorId: user.id,
        mediaId,
        audioMediaId,
        caption,
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      },
      select: { id: true },
    });

    return Response.json({ storyId: story.id });
  } catch (err) {
    return jsonError(err);
  }
}

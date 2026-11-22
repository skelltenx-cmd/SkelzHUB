import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import {
  jsonError,
  jsonNoStore,
  getViewerSets,
  getPreviewComments,
  toPostDTO,
  toUserDTO,
  postInclude,
  userInclude,
  visibleAuthorWhere,
} from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk).
export const maxDuration = 60;

// GET /api/search?q=...
// Pencarian global seperti sosmed pada umumnya — satu kata kunci,
// tiga kelompok hasil sekaligus:
//   users  : akun (username / nama tampil)
//   posts  : post gambar (caption mengandung kata kunci)
//   videos : post video / Shorts (caption mengandung kata kunci)
//
// Privasi tetap dijaga: hanya konten akun publik (atau yang kamu ikuti /
// milikmu) yang ikut dicari. Keyword di-lowercase supaya konsisten
// dengan /api/users (contains SQLite case-insensitive untuk ASCII).
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();
    if (!q) return jsonNoStore({ users: [], posts: [], videos: [] });

    const viewerId = await getSessionUserId();
    const needle = q.toLowerCase();

    // ---- Akun: username / nama tampil (urut pengikut terbanyak) ----
    const users = await db.user.findMany({
      where: {
        OR: [
          { username: { contains: needle } },
          { displayName: { contains: needle } },
        ],
      },
      orderBy: { followers: { _count: "desc" } },
      take: 12,
      include: userInclude,
    });

    const followStatusMap = new Map<string, "ACCEPTED" | "PENDING" | "NONE">();
    if (viewerId && users.length > 0) {
      const follows = await db.follow.findMany({
        where: { followerId: viewerId, followingId: { in: users.map((u) => u.id) } },
        select: { followingId: true, status: true },
      });
      for (const f of follows) followStatusMap.set(f.followingId, f.status === "ACCEPTED" ? "ACCEPTED" : "PENDING");
    }

    // ---- Post & video: caption mengandung kata kunci (terbaru dulu) ----
    const visibility = visibleAuthorWhere(viewerId);
    const postWhere = {
      caption: { contains: needle },
      repostOfId: null,
      ...visibility,
    };

    const [imagePosts, videoPosts] = await Promise.all([
      db.post.findMany({
        where: { ...postWhere, type: "IMAGE" },
        orderBy: { createdAt: "desc" },
        take: 18,
        include: postInclude,
      }),
      db.post.findMany({
        where: { ...postWhere, type: "VIDEO" },
        orderBy: { createdAt: "desc" },
        take: 18,
        include: postInclude,
      }),
    ]);

    const combined = [...imagePosts, ...videoPosts];
    const viewerSets = await getViewerSets(viewerId, combined.map((p) => p.id));
    const previews = await getPreviewComments(combined.map((p) => p.id));

    return jsonNoStore({
      users: users.map((u) =>
        toUserDTO(u, {
          isFollowing: followStatusMap.get(u.id) === "ACCEPTED",
          followStatus: followStatusMap.get(u.id) ?? "NONE",
          isMe: viewerId === u.id,
        })
      ),
      posts: imagePosts.map((p) => toPostDTO(p, viewerSets, previews.get(p.id) ?? [])),
      videos: videoPosts.map((p) => toPostDTO(p, viewerSets, previews.get(p.id) ?? [])),
    });
  } catch (err) {
    return jsonError(err);
  }
}

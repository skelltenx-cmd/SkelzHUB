import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import {
  jsonError,
  ApiError,
  readJson,
  requireUserId,
  getViewerSets,
  getPreviewComments,
  toPostDTO,
  postInclude,
  visibleAuthorWhere,
  canViewPrivateContent,
  notify,
  followStatusOf,
} from "@/lib/api-utils";
import { Prisma } from "@prisma/client";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

// GET /api/posts
// ?feed=home|following|explore|shorts|saved|reposts  &username=<filter by author>  &page=0  &limit=12
// feed "profile" (default saat ada username): post asli tanpa repost
// feed "reposts" (dengan username): hanya postingan ulang milik user itu
//
// KEBIJAKAN REPOST (seperti sosial pada umumnya):
//  - Postingan ulang TIDAK muncul di feed beranda / mengikuti / jelajahi / Shorts.
//  - Postingan ulang hanya terlihat di tab "Postingan ulang" pada profil pemiliknya.
//  - Tab repost hanya terlihat oleh pemiliknya sendiri ATAU orang yang mengikuti
//    akun tersebut (status follow ACCEPTED).
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const feed = url.searchParams.get("feed") || "home";
    const username = url.searchParams.get("username");
    const page = Math.max(0, parseInt(url.searchParams.get("page") || "0", 10) || 0);
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "12", 10) || 12));

    const viewerId = await getSessionUserId();
    const visibility = visibleAuthorWhere(viewerId);

    let where: Prisma.PostWhereInput = { ...visibility, repostOfId: null };
    if (feed === "shorts") {
      // Feed video Shorts (gaya video vertikal) — hanya post asli
      where = { type: "VIDEO", ...visibility, repostOfId: null };
    } else if (username) {
      const user = await db.user.findUnique({ where: { username }, select: { id: true, isPrivate: true } });
      if (!user) return Response.json({ posts: [], nextPage: null, hasMore: false });
      const allowed = await canViewPrivateContent(viewerId, user);

      // Tab "reposts" khusus: hanya pemilik + pengikut yang disetujui yang boleh lihat
      if (feed === "reposts" && viewerId && viewerId !== user.id) {
        const fs = await followStatusOf(viewerId, user.id);
        if (fs !== "ACCEPTED") {
          return Response.json({ posts: [], nextPage: null, hasMore: false, hidden: true });
        }
      }

      where = {
        authorId: user.id,
        // Tab profil: "posts" tanpa repost, "reposts" hanya postingan ulang
        ...(feed === "reposts" ? { repostOfId: { not: null } } : { repostOfId: null }),
        ...(allowed ? {} : { id: "___none___" }),
      };
    } else if (feed === "following" && viewerId) {
      const follows = await db.follow.findMany({
        where: { followerId: viewerId, status: "ACCEPTED" },
        select: { followingId: true },
      });
      where = {
        authorId: { in: [...follows.map((f) => f.followingId), viewerId] },
        ...visibility,
        repostOfId: null,
      };
    } else if (feed === "saved" && viewerId) {
      // Post yang disimpan user, urut sesuai waktu menyimpan
      const saves = await db.saved.findMany({
        where: { userId: viewerId },
        orderBy: { createdAt: "desc" },
        skip: page * limit,
        take: limit + 1,
        select: { post: { include: postInclude } },
      });
      const hasMoreSaved = saves.length > limit;
      const savedPosts = (hasMoreSaved ? saves.slice(0, limit) : saves).map((s) => s.post);
      const viewerSetsSaved = await getViewerSets(viewerId, savedPosts.map((p) => p.id));
      const previewSaved = await getPreviewComments(savedPosts.map((p) => p.id));
      return Response.json({
        posts: savedPosts.map((p) =>
          toPostDTO(p, viewerSetsSaved, previewSaved.get(p.id) ?? [])
        ),
        nextPage: hasMoreSaved ? page + 1 : null,
        hasMore: hasMoreSaved,
      });
    }

    const order: Prisma.PostOrderByWithRelationInput[] =
      feed === "explore"
        ? [{ likes: { _count: "desc" } }, { createdAt: "desc" }]
        : [{ createdAt: "desc" }];

    const posts = await db.post.findMany({
      where,
      orderBy: order,
      skip: page * limit,
      take: limit + 1,
      include: postInclude,
    });

    const hasMore = posts.length > limit;
    const pagePosts = hasMore ? posts.slice(0, limit) : posts;

    // Feed "following" yang masih kosong ditambah post trending agar feed tidak sepi
    let filler: typeof pagePosts = [];
    if (feed === "following" && pagePosts.length < limit) {
      const shownIds = pagePosts.map((p) => p.id);
      filler = await db.post.findMany({
        where: { ...(shownIds.length ? { id: { notIn: shownIds } } : {}), ...visibility, repostOfId: null },
        orderBy: [{ likes: { _count: "desc" } }, { createdAt: "desc" }],
        take: limit - pagePosts.length,
        include: postInclude,
      });
    }

    const combined = [...pagePosts, ...filler];
    const viewerSets = await getViewerSets(
      viewerId,
      combined.map((p) => p.id)
    );
    const previews = await getPreviewComments(combined.map((p) => p.id));

    return Response.json({
      posts: combined.map((p) => toPostDTO(p, viewerSets, previews.get(p.id) ?? [])),
      nextPage: hasMore ? page + 1 : null,
      hasMore,
    });
  } catch (err) {
    return jsonError(err);
  }
}

// POST /api/posts  { caption, mediaId }  ATAU  { caption, repostOfId } (repost/quote)
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await readJson<{ caption?: string; mediaId?: string; repostOfId?: string }>(request);
    const caption = (body.caption || "").trim().slice(0, 2200);

    // ---- Repost / quote ----
    if (body.repostOfId) {
      const original = await db.post.findUnique({
        where: { id: body.repostOfId },
        include: { author: { select: { id: true, isPrivate: true } } },
      });
      if (!original) throw new ApiError("Post asli tidak ditemukan", 404);
      if (original.repostOfId) throw new ApiError("Tidak bisa memposting ulang sebuah repost");
      const allowed = await canViewPrivateContent(userId, original.author);
      if (!allowed) throw new ApiError("Post ini dari akun privat", 403);

      // Mencegah duplikasi repost murni (tanpa caption) dari user yang sama
      if (!caption) {
        const dup = await db.post.findFirst({
          where: { authorId: userId, repostOfId: original.id, caption: "" },
          select: { id: true },
        });
        if (dup) throw new ApiError("Kamu sudah memposting ulang post ini");
      }

      const post = await db.post.create({
        data: {
          caption,
          mediaId: null,
          type: original.type,
          repostOfId: original.id,
          authorId: userId,
        },
        include: postInclude,
      });

      await notify({ userId: original.authorId, actorId: userId, type: "REPOST", postId: post.id });

      return Response.json({ post: toPostDTO(post, { likedIds: new Set(), savedIds: new Set(), repostedIds: new Set() }) });
    }

    // ---- Post biasa (media) ----
    const mediaId = body.mediaId || "";
    if (!mediaId) throw new ApiError("Media wajib diunggah");

    const media = await db.media.findUnique({ where: { id: mediaId } });
    if (!media) throw new ApiError("Media tidak ditemukan, unggah ulang", 400);

    const post = await db.post.create({
      data: {
        caption,
        mediaId,
        type: media.kind === "VIDEO" ? "VIDEO" : "IMAGE",
        authorId: userId,
      },
      include: postInclude,
    });

    return Response.json({ post: toPostDTO(post, { likedIds: new Set(), savedIds: new Set(), repostedIds: new Set() }) });
  } catch (err) {
    return jsonError(err);
  }
}

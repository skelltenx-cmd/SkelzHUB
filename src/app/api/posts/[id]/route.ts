import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import {
  jsonError,
  ApiError,
  requireUser,
  readJson,
  getViewerSets,
  getPreviewComments,
  toPostDTO,
  postInclude,
  canViewPrivateContent,
  isAdminRole,
  notify,
} from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

// GET /api/posts/[id] -> detail post (+ repost asli bila repost)
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const viewerId = await getSessionUserId();

    const post = await db.post.findUnique({ where: { id }, include: postInclude });
    if (!post) throw new ApiError("Post tidak ditemukan", 404);

    const allowed = await canViewPrivateContent(viewerId, { id: post.authorId, isPrivate: !!(post.author as { isPrivate?: boolean }).isPrivate });
    if (!allowed) throw new ApiError("Post ini dari akun privat", 403);

    // Notifikasi "post kamu dilihat" — SEKALI per orang per post (tidak spam):
    // catat hanya saat penonton baru membuka post milik orang lain.
    if (viewerId && viewerId !== post.authorId) {
      const seen = await db.notification.findFirst({
        where: { userId: post.authorId, actorId: viewerId, type: "POST_VIEW", postId: id },
        select: { id: true },
      });
      if (!seen) {
        await notify({ userId: post.authorId, actorId: viewerId, type: "POST_VIEW", postId: id });
      }
    }

    const viewerSets = await getViewerSets(viewerId, [post.id]);
    const previews = await getPreviewComments([post.id]);

    return Response.json({ post: toPostDTO(post, viewerSets, previews.get(post.id) ?? []) });
  } catch (err) {
    return jsonError(err);
  }
}

// PATCH /api/posts/[id] -> edit caption post (milik sendiri / admin)
// Supaya salah ketik tidak perlu hapus post lalu upload ulang.
export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await readJson<{ caption?: unknown }>(request);
    if (typeof body.caption !== "string") throw new ApiError("Caption wajib diisi", 400);
    const caption = body.caption.trim().slice(0, 2200);
    if (body.caption.trim().length > 2200) throw new ApiError("Caption terlalu panjang (maks 2200 karakter)", 400);

    const post = await db.post.findUnique({ where: { id }, select: { authorId: true } });
    if (!post) throw new ApiError("Post tidak ditemukan", 404);
    if (post.authorId !== user.id && !isAdminRole(user.role)) {
      throw new ApiError("Kamu hanya bisa mengedit post sendiri", 403);
    }

    await db.post.update({ where: { id }, data: { caption } });

    // Balas dengan DTO lengkap supaya cache frontend langsung akurat
    const updated = await db.post.findUnique({ where: { id }, include: postInclude });
    const viewerSets = await getViewerSets(user.id, [id]);
    const previews = await getPreviewComments([id]);
    return Response.json({ post: toPostDTO(updated!, viewerSets, previews.get(id) ?? []) });
  } catch (err) {
    return jsonError(err);
  }
}

// DELETE /api/posts/[id] -> hapus post milik sendiri (atau repost sendiri)
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const post = await db.post.findUnique({ where: { id }, select: { authorId: true } });
    if (!post) throw new ApiError("Post tidak ditemukan", 404);
    if (post.authorId !== user.id && !isAdminRole(user.role)) {
      throw new ApiError("Kamu hanya bisa menghapus post sendiri", 403);
    }

    await db.post.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}

import { db } from "@/lib/db";
import { jsonError, ApiError, requireAdmin, readJson } from "@/lib/api-utils";
import { Prisma } from "@prisma/client";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

// GET /api/admin/reports?status=PENDING|RESOLVED|DISMISSED|all -> antrean laporan
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "PENDING";

    const where: Prisma.ReportWhereInput =
      status === "all" || !status ? {} : { status };

    const reports = await db.report.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        reason: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
        reporter: { select: { id: true, username: true, displayName: true, avatarColor: true, avatarMedia: { select: { id: true } } } },
        post: {
          select: {
            id: true,
            caption: true,
            type: true,
            mediaId: true,
            createdAt: true,
            author: { select: { id: true, username: true, displayName: true, avatarColor: true } },
            _count: { select: { likes: true, comments: true, reports: true } },
          },
        },
      },
    });

    return Response.json({
      reports: reports.map((r) => ({
        id: r.id,
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
        reporter: {
          ...r.reporter,
          avatar: r.reporter.avatarMedia ? `/api/media/${r.reporter.avatarMedia.id}` : null,
        },
        post: {
          id: r.post.id,
          caption: r.post.caption,
          media: `/api/media/${r.post.mediaId}`,
          type: r.post.type === "VIDEO" ? "VIDEO" : "IMAGE",
          createdAt: r.post.createdAt.toISOString(),
          author: r.post.author,
          likeCount: r.post._count.likes,
          commentCount: r.post._count.comments,
          reportCount: r.post._count.reports,
        },
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}

// PATCH /api/admin/reports  { reportId, action: "dismiss"|"resolve" }
export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = await readJson<{ reportId?: string; action?: "dismiss" | "resolve" }>(request);
    const reportId = body.reportId || "";
    const action = body.action;
    if (!reportId || !action) throw new ApiError("reportId dan action wajib diisi");
    if (action !== "dismiss" && action !== "resolve") throw new ApiError("Action tidak valid");

    const report = await db.report.findUnique({ where: { id: reportId }, select: { id: true } });
    if (!report) throw new ApiError("Laporan tidak ditemukan", 404);

    await db.report.update({
      where: { id: reportId },
      data: {
        status: action === "dismiss" ? "DISMISSED" : "RESOLVED",
        resolvedAt: new Date(),
      },
    });

    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}

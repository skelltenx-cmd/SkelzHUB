import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { jsonError, toUserDTO } from "@/lib/api-utils";
import type { FollowStatus } from "@/lib/types";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

// GET /api/suggestions  -> user populer yang belum diikuti (panel "Saran")
//
// Kenapa bukan orderBy { followers: { _count } }: aggregate berat seperti itu
// memaksa database melakukan JOIN + GROUP BY atas SELURUH tabel follow dan
// user sekaligus (lihat dev.log). Versi ini 3 query ringkas:
//   1. daftar follow milik penonton (satu user),
//   2. hitung pengikut per kandidat (groupBy sederhana, indeks terpakai),
//   3. ambil 12 baris user menurut jumlah pengikut tadi.
// Responsnya kini menyertakan `isMe` dan `followStatus` supaya tombol
// Ikuti/Mengikuti/Diminta di panel saran akurat dari awal (dan bisa dibalik
// secara optimistik oleh client tanpa harus memuat ulang).
export async function GET() {
  try {
    const viewerId = await getSessionUserId();

    // Follow penonton: sekali ambil, dipakai untuk filter + status ikut.
    const myFollows = viewerId
      ? await db.follow.findMany({
          where: { followerId: viewerId },
          select: { followingId: true, status: true },
        })
      : [];
    const statusById = new Map<string, FollowStatus>();
    for (const f of myFollows) statusById.set(f.followingId, f.status === "PENDING" ? "PENDING" : "ACCEPTED");
    const followedIds = [...statusById.keys()];

    // Kandidat: user terpopuler (jumlah pengikut ACCEPTED terbanyak).
    const top = await db.follow.groupBy({
      by: ["followingId"],
      where: { status: "ACCEPTED" },
      _count: { _all: true },
      take: 20,
      orderBy: { _count: { followingId: "desc" } },
    });
    const topIds = top.map((t) => t.followingId);

    // Fallback: user terbaru (kalau belum ada yang punya pengikut).
    // Lewati query ini bila kandidat populer sudah cukup — hemat 1 round-trip
    // database per permintaan (terasa di pooler jauh seperti Supabase).
    const recent = topIds.length >= 12
      ? []
      : await db.user.findMany({
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { id: true },
        });
    const candidateIds = [...new Set([...topIds, ...recent.map((r) => r.id)])]
      .filter((id) => id !== viewerId && !followedIds.includes(id))
      .slice(0, 12);

    const users = await db.user.findMany({
      where: { id: { in: candidateIds } },
      select: {
        id: true,
        username: true,
        displayName: true,
        bio: true,
        avatarColor: true,
        isPrivate: true,
        role: true,
        lastSeenAt: true,
        avatarMedia: { select: { id: true } },
        _count: { select: { posts: true, followers: true, following: true } },
      },
    });

    // Susun berdasarkan popularitas (lengkapi hingga 5 bila kurang).
    const byId = new Map(users.map((u) => [u.id, u]));
    const ordered: typeof users = [];
    for (const id of topIds) {
      const u = byId.get(id);
      if (u) ordered.push(u);
    }
    for (const u of users) if (!ordered.includes(u)) ordered.push(u);

    return Response.json({
      users: ordered.slice(0, 5).map((u) =>
        toUserDTO(u, {
          isMe: viewerId === u.id,
          followStatus: statusById.get(u.id) ?? "NONE",
        })
      ),
    });
  } catch (err) {
    return jsonError(err);
  }
}

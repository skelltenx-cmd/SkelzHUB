import { dbBase, ensureDatabaseReady } from "@/lib/db";
import { dbSetupStatus } from "@/lib/db-setup";

// GET /api/health — cek cepat kondisi web + database (tanpa login).
// Dipakai untuk memastikan deploy baru sehat:
//   { ok: true, mode: "postgres", users: 8, posts: 14 } -> semua beres.
// Sekaligus TRIGGER setup database produksi (buat tabel + konten awal),
// jadi membuka alamat ini setelah deploy mempercepat situs siap.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    await ensureDatabaseReady(dbBase);
    const status = dbSetupStatus();
    let users: number | null = null;
    let posts: number | null = null;
    try {
      [users, posts] = await Promise.all([dbBase.user.count(), dbBase.post.count()]);
    } catch {
      /* database belum siap — biarkan null */
    }
    return Response.json({
      ok: true,
      mode: status.mode,
      provider: status.provider,
      ready: status.ready,
      seeded: status.seeded,
      users,
      posts,
    });
  } catch (err) {
    const status = dbSetupStatus();
    return Response.json(
      {
        ok: false,
        mode: status.mode,
        provider: status.provider,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

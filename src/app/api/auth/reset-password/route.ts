import crypto from "crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { jsonError, ApiError, readJson } from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

// POST /api/auth/reset-password  { email, code, newPassword }
// Verifikasi kode 6 digit lalu ganti password + cabut semua session lama.
export async function POST(request: Request) {
  try {
    const body = await readJson<{ email?: string; code?: string; newPassword?: string }>(request);
    const email = (body.email || "").trim().toLowerCase();
    const code = (body.code || "").trim();
    const newPassword = body.newPassword || "";

    if (!email) throw new ApiError("Email wajib diisi");
    if (!/^\d{6}$/.test(code)) throw new ApiError("Kode verifikasi harus 6 angka");
    if (newPassword.length < 6) throw new ApiError("Password baru minimal 6 karakter");

    const user = await db.user.findFirst({
      where: { email },
      select: { id: true },
    });
    if (!user) throw new ApiError("Kode salah atau sudah kadaluarsa", 400);

    const reset = await db.passwordReset.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!reset) throw new ApiError("Kode salah atau sudah kadaluarsa", 400);

    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    if (reset.codeHash !== codeHash) throw new ApiError("Kode verifikasi salah", 400);

    await db.$transaction([
      db.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      db.user.update({
        where: { id: user.id },
        // sessionVersion +1 -> semua session/perangkat lama otomatis logout
        data: { password: hashPassword(newPassword), sessionVersion: { increment: 1 } },
      }),
    ]);

    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}

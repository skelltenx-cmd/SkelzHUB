import crypto from "crypto";
import { db } from "@/lib/db";
import { setSessionCookie } from "@/lib/session";
import { readJson, jsonError, ApiError, mePayload } from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

const MAX_TRIES = 5;

// POST /api/auth/login/verify  { userId, code }
// Langkah 2 login 2FA: cocokkan kode 6 digit yang dikirim ke email.
// Benar -> buat session login. Salah -> hitung percobaan (maks 5 lalu kode hangus).
export async function POST(request: Request) {
  try {
    const body = await readJson<{ userId?: string; code?: string }>(request);
    const userId = (body.userId || "").trim();
    const code = (body.code || "").trim();
    if (!userId) throw new ApiError("Sesi verifikasi tidak ditemukan — masuk ulang dari awal", 400);
    if (!/^\d{6}$/.test(code)) throw new ApiError("Kode verifikasi harus 6 angka", 400);

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || !user.loginCodeHash || !user.loginCodeExpiry) {
      throw new ApiError("Kode tidak ditemukan — masuk ulang supaya kode baru dikirim", 400);
    }
    if (user.loginCodeExpiry.getTime() < Date.now()) {
      throw new ApiError("Kode sudah kadaluarsa — masuk ulang supaya kode baru dikirim", 400);
    }
    if (user.loginCodeTries >= MAX_TRIES) {
      throw new ApiError("Terlalu banyak percobaan salah — masuk ulang supaya kode baru dikirim", 429);
    }

    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    if (codeHash !== user.loginCodeHash) {
      await db.user.update({ where: { id: user.id }, data: { loginCodeTries: { increment: 1 } } });
      throw new ApiError("Kode verifikasi salah", 400);
    }

    if (user.bannedAt) {
      throw new ApiError(
        `Akun ini telah dibanned${user.banReason ? `: ${user.banReason}` : ""}. Hubungi admin jika ini keliru.`,
        403
      );
    }

    // Sukses: hapus kode (sekali pakai) lalu buat session
    await db.user.update({
      where: { id: user.id },
      data: { loginCodeHash: null, loginCodeExpiry: null, loginCodeTries: 0 },
    });
    await setSessionCookie(user.id, user.sessionVersion);
    return Response.json({ step: "done", user: mePayload(user) });
  } catch (err) {
    return jsonError(err);
  }
}

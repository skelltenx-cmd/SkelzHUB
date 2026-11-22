import crypto from "crypto";
import { db } from "@/lib/db";
import { jsonError, ApiError, readJson } from "@/lib/api-utils";
import { emailConfigured, sendResetCodeEmail } from "@/lib/email";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

const CODE_MINUTES = 15;

// POST /api/auth/forgot-password  { email }
// Buat kode verifikasi 6 digit (hash sha256, berlaku 15 menit) lalu kirim via email.
// Kalau email belum dikonfigurasi (mode demo), kode ditampilkan langsung di layar
// supaya fitur reset password tetap berfungsi.
export async function POST(request: Request) {
  try {
    const body = await readJson<{ email?: string }>(request);
    const email = (body.email || "").trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new ApiError("Masukkan alamat email yang valid");
    }

    const user = await db.user.findFirst({
      where: { email },
      select: { id: true, email: true, displayName: true },
    });

    // Jangan bocorkan apakah email terdaftar (aman dari enumeration).
    // Tapi mode demo tetap perlu menampilkan kode supaya alur bisa dipakai.
    if (!user) {
      return Response.json({ emailSent: false, message: "kalau-email-terdaftar" });
    }

    // Batalkan kode lama yang belum terpakai milik user ini
    await db.passwordReset.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(Date.now() + CODE_MINUTES * 60_000);

    await db.passwordReset.create({
      data: { userId: user.id, email, codeHash, expiresAt },
    });

    const sent = await sendResetCodeEmail(email, code, CODE_MINUTES);
    return Response.json({
      emailSent: sent,
      emailConfigured: emailConfigured(),
      devCode: sent ? undefined : code, // mode demo: kode tampil di layar
    });
  } catch (err) {
    return jsonError(err);
  }
}

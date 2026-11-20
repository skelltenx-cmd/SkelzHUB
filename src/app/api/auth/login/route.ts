import crypto from "crypto";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { setSessionCookie } from "@/lib/session";
import { readJson, jsonError, ApiError, mePayload } from "@/lib/api-utils";
import { emailConfigured, sendLoginCodeEmail } from "@/lib/email";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

const CODE_MINUTES = 10;
const MAX_TRIES = 5;

/** Samarkan email supaya tidak bocor utuh, tapi tetap dikenali pemiliknya:
 *  skelltenx@gmail.com -> sk••••••@gmail.com */
function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  const shown = name.slice(0, 2);
  const dots = Math.max(2, Math.min(name.length - 2, 6));
  return `${shown}${"•".repeat(dots)}@${domain}`;
}

// POST /api/auth/login  { username, password }
// Langkah 1 dari login 2FA: periksa username+password.
//  - Akun dengan email -> buat kode verifikasi 6 digit, kirim ke email,
//    balas { step: "code", userId, email (disamarkan), devCode? }.
//    Session cookie BELUM dibuat sampai kode benar (lihat /api/auth/login/verify).
//  - Akun tanpa email (akun lama) -> masuk langsung { step: "done", user }.
export async function POST(request: Request) {
  try {
    const body = await readJson<{ username?: string; password?: string }>(request);
    const identifier = (body.username || "").trim().toLowerCase();
    const password = body.password || "";
    if (!identifier || !password) throw new ApiError("Isi username dan password");

    const user = await db.user.findFirst({
      where: { OR: [{ username: identifier }, { email: identifier }] },
    });
    if (!user || !verifyPassword(password, user.password)) {
      throw new ApiError("Username atau password salah", 401);
    }

    if (user.bannedAt) {
      throw new ApiError(
        `Akun ini telah dibanned${user.banReason ? `: ${user.banReason}` : ""}. Hubungi admin jika ini keliru.`,
        403
      );
    }

    // Akun lama tanpa email -> tanpa kode verifikasi (masuk langsung)
    if (!user.email) {
      await setSessionCookie(user.id, user.sessionVersion);
      return Response.json({ step: "done", user: mePayload(user) });
    }

    // Buat kode verifikasi login baru (otomatis menimpa kode lama yang belum terpakai)
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    await db.user.update({
      where: { id: user.id },
      data: {
        loginCodeHash: codeHash,
        loginCodeExpiry: new Date(Date.now() + CODE_MINUTES * 60_000),
        loginCodeTries: 0,
      },
    });

    const sent = await sendLoginCodeEmail(user.email, code, CODE_MINUTES);
    return Response.json({
      step: "code",
      userId: user.id,
      email: maskEmail(user.email),
      emailSent: sent,
      emailConfigured: emailConfigured(),
      devCode: sent ? undefined : code, // mode demo: kode tampil di layar
    });
  } catch (err) {
    return jsonError(err);
  }
}

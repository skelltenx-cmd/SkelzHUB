import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { setSessionCookie } from "@/lib/session";
import { readJson, jsonError, ApiError, mePayload } from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

const USERNAME_RE = /^[a-zA-Z0-9._]{3,20}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(request: Request) {
  try {
    const body = await readJson<{ username?: string; displayName?: string; email?: string; password?: string }>(request);
    const username = (body.username || "").trim().toLowerCase();
    const displayName = (body.displayName || "").trim() || username;
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";

    if (!USERNAME_RE.test(username)) {
      throw new ApiError("Username 3-20 karakter, hanya huruf, angka, titik, dan underscore");
    }
    if (!EMAIL_RE.test(email) || email.length > 160) {
      throw new ApiError("Masukkan alamat email yang valid");
    }
    if (password.length < 6) {
      throw new ApiError("Password minimal 6 karakter");
    }

    const [exists, emailTaken] = await Promise.all([
      db.user.findUnique({ where: { username }, select: { id: true } }),
      db.user.findFirst({ where: { email }, select: { id: true } }),
    ]);
    if (exists) throw new ApiError("Username sudah dipakai, pilih yang lain", 409);
    if (emailTaken) throw new ApiError("Email sudah terdaftar — gunakan email lain atau masuk dengan email ini", 409);

    const user = await db.user.create({
      data: {
        username,
        email,
        displayName: displayName.slice(0, 40),
        password: hashPassword(password),
        avatarColor: Math.floor(Math.random() * 8),
      },
    });

    await setSessionCookie(user.id, user.sessionVersion);
    return Response.json({ step: "done", user: mePayload(user) });
  } catch (err) {
    return jsonError(err);
  }
}

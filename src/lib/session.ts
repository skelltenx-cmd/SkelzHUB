import crypto from "crypto";
import { cookies } from "next/headers";

// Cookie-based session (HMAC signed) - works on Vercel & sandbox
// Token berisi userId.sessionVersion.expiry — bump sessionVersion user
// untuk memaksa logout semua sesi lama (mis. saat di-ban admin).
const SECRET = process.env.SESSION_SECRET || "skelzhub-dev-secret";
const COOKIE_NAME = "skelzhub_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type SessionInfo = { userId: string; version: number };

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
}

export function createSessionToken(userId: string, version = 0): string {
  const payload = `${userId}.${version}.${Date.now() + MAX_AGE * 1000}`;
  const b64 = Buffer.from(payload).toString("base64url");
  return `${b64}.${sign(payload)}`;
}

export function verifySessionToken(token: string): SessionInfo | null {
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return null;
  let payload: string;
  try {
    payload = Buffer.from(b64, "base64url").toString();
  } catch {
    return null;
  }
  if (sign(payload) !== sig) return null;
  const [userId, version, exp] = payload.split(".");
  if (!userId || !version || !exp) return null;
  if (Number(exp) < Date.now()) return null;
  return { userId, version: Number(version) || 0 };
}

export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const info = verifySessionToken(token);
  return info?.userId ?? null;
}

export async function getSessionInfo(): Promise<SessionInfo | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function setSessionCookie(userId: string, version = 0): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, createSessionToken(userId, version), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", maxAge: 0, path: "/" });
}

import { PrismaClient } from "@prisma/client";
import { copyFileSync, mkdirSync } from "fs";
import { join } from "path";
import { ensureDatabaseReady, dbSetupConfigure } from "./db-setup";

// ============================================================
// SkelzHub — koneksi database DUA MODE dari satu file kode:
//
//  1. MODE SQLITE (lokal / bun dev):
//     DATABASE_URL = "file:db/custom.db" -> dipakai apa adanya.
//
//  2. MODE POSTGRES / COCKROACHDB (produksi di Vercel):
//     cukup isi DATABASE_URL di Environment Variables Vercel ->
//     - URL dibersihkan otomatis (sslmode=require, connection_limit)
//     - provider prisma diganti otomatis saat build (scripts/prepare-db.mjs)
//     - SEMUA TABEL DIBUAT SENDIRI saat request pertama masuk
//     - kalau database masih kosong -> konten awal diisi otomatis
//     (lihat src/lib/db-setup.ts — tidak perlu prisma db push manual!)
// ============================================================

const rawUrl = (process.env.DATABASE_URL ?? "file:db/custom.db").trim();
const isPostgresMode = /^postgres(ql)?:\/\//i.test(rawUrl);

/** Deteksi penyedia CockroachDB dari bentuk URL-nya. */
function isCockroachUrl(u: URL): boolean {
  return (
    u.port === "26257" ||
    /cockroach/i.test(u.hostname) ||
    (u.searchParams.get("options") ?? "").includes("cluster=")
  );
}

/**
 * Bersihkan connection string produksi:
 *  - postgres:// -> postgresql://
 *  - sslmode=verify-full/verify-ca -> require (driver tidak punya file CA)
 *  - CockroachDB: pastikan sslmode=require + connection_limit=1 (serverless safe)
 *  - Postgres lain (Neon/Supabase dsb.): pgbouncer=true supaya aman lewat
 *    connection pooler serverless (prepared statements dimatikan)
 */
function sanitizePostgresUrl(raw: string): string {
  let s = raw.trim().replace(/^["'`]+|["'`]+$/g, "");
  if (s.startsWith("postgres://")) s = "postgresql://" + s.slice("postgres://".length);
  try {
    const u = new URL(s);
    const cockroach = isCockroachUrl(u);
    const ssl = u.searchParams.get("sslmode");
    if (ssl && /verify-full|verify-ca|verify/.test(ssl)) {
      u.searchParams.set("sslmode", "require");
    } else if (!ssl) {
      u.searchParams.set("sslmode", "require");
    }
    if (cockroach) {
      if (!u.searchParams.get("connection_limit")) u.searchParams.set("connection_limit", "1");
    } else if (!u.searchParams.get("pgbouncer") && !u.searchParams.get("connection_limit")) {
      // Aman untuk pooler serverless (Neon/Supabase) maupun koneksi langsung
      u.searchParams.set("pgbouncer", "true");
    }
    return u.toString();
  } catch {
    return s;
  }
}

/**
 * SQLite lokal: pakai DATABASE_URL apa adanya.
 * Vercel + SQLite (mode demo lama): salin db bundled -> /tmp sebelum dipakai.
 */
function resolveSqliteUrl(raw: string): string {
  if (!raw.startsWith("file:") || !process.env.VERCEL) return raw;
  const rel = raw.slice("file:".length);
  const source = join(process.cwd(), rel);
  const target = "/tmp/skelzhub.db";
  try {
    mkdirSync("/tmp", { recursive: true });
    copyFileSync(source, target);
  } catch {
    return raw;
  }
  return `file:${target}`;
}

const datasourceUrl = isPostgresMode ? sanitizePostgresUrl(rawUrl) : resolveSqliteUrl(rawUrl);

let provider = "sqlite";
if (isPostgresMode) {
  try {
    provider = isCockroachUrl(new URL(rawUrl)) ? "cockroachdb" : "postgresql";
  } catch {
    provider = "postgresql";
  }
}
dbSetupConfigure(isPostgresMode ? "postgres" : "sqlite", provider);

const globalForDb = globalThis as unknown as {
  skelzDb?: ReturnType<typeof createDb>;
  dbBase?: PrismaClient;
};

/** Klien Prisma dasar (tanpa bungkus self-healing). */
export const dbBase =
  globalForDb.dbBase ??
  new PrismaClient({
    datasourceUrl,
    // Hindari spam log query di server produksi (Vercel)
    log: process.env.NODE_ENV === "production" ? [] : ["query"],
  });
if (process.env.NODE_ENV !== "production") globalForDb.dbBase = dbBase;

function createDb() {
  // Bungkus client: query PERTAMA di setiap proses otomatis menyiapkan
  // database produksi (buat tabel + isi konten awal bila kosong), lalu
  // semua query berikutnya jalan normal (hasilnya di-cache per proses).
  return dbBase.$extends({
    query: {
      $allModels: {
        async $allOperations({ query, args }) {
          await ensureDatabaseReady(dbBase);
          return query(args);
        },
      },
    },
  });
}

export const db = globalForDb.skelzDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.skelzDb = db;

/** Paksa setup database sekarang (dipakai /api/health). */
export { ensureDatabaseReady };

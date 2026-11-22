// SkelzHub — Self-healing database untuk produksi (Postgres / CockroachDB).
//
// Masalah yang diselesaikan modul ini:
//  1. Deploy baru dengan database kosong -> tabel belum ada -> semua API error
//     "Terjadi kesalahan pada server" dan feed kosong.
//  2. Instruksi setup ribet (prisma db push dari komputer, dsb.) — sekarang
//     TIDAK PERLU LAGI: cukup isi DATABASE_URL di Vercel, tabel dibuat sendiri
//     saat request pertama masuk, lalu konten awal diisi otomatis.
//  3. CockroachDB v26 mengunci tabel (schema_locked) — setiap DDL pada tabel
//     terkunci harus dibuka dulu dengan `ALTER TABLE ... SET (schema_locked=false)`
//     SATU STATEMENT PER EKSEKUSI. Semua sudah ditangani di sini.
//
// Semua statement idempoten: aman dijalankan berulang di setiap cold start
// serverless (IF NOT EXISTS + toleransi FK duplikat), jadi tidak pernah
// merusak data yang sudah ada.

import type { PrismaClient } from "@prisma/client";
import { DDL_TABLES, DDL_INDEXES, DDL_FOREIGN_KEYS } from "./db-ddl";

// Versi skema saat ini. Naikkan angka ini setiap kali DDL di db-ddl.ts
// berubah — database produksi lalu otomatis menjalankan DDL ulang SATU KALI
// (lalu menandai versi baru dan kembali ke jalur cepat).
export const SCHEMA_VERSION = "1";

// Status terakhir setup (dibaca oleh /api/health untuk diagnosis cepat)
export type DbSetupStatus = {
  mode: "sqlite" | "postgres";
  provider: string;
  ready: boolean;
  seeded: boolean;
  lastError: string | null;
  lastRunAt: string | null;
};

let status: DbSetupStatus = {
  mode: "sqlite",
  provider: "sqlite",
  ready: false,
  seeded: false,
  lastError: null,
  lastRunAt: null,
};

export function dbSetupStatus(): DbSetupStatus {
  return { ...status };
}

export function dbSetupConfigure(mode: "sqlite" | "postgres", provider: string) {
  status.mode = mode;
  status.provider = provider;
}

/** Eksekusi satu statement SQL mentah; kembalikan errornya (tidak throw). */
async function exec(client: PrismaClient, sql: string): Promise<unknown> {
  try {
    await client.$executeRawUnsafe(sql);
    return null;
  } catch (err) {
    return err;
  }
}

/** Gabungan semua teks pesan error (Prisma menyembunyikan detail di meta). */
function errTextOf(err: unknown): string {
  if (err instanceof Error) {
    const meta = (err as { meta?: Record<string, unknown> }).meta;
    const extra =
      meta && typeof meta === "object"
        ? Object.values(meta)
            .filter((v) => typeof v === "string")
            .join(" | ")
        : "";
    return [err.message, extra, String(err)].filter(Boolean).join(" | ").slice(0, 400);
  }
  return String(err);
}
/** Ekstrak nama tabel dari pesan error "table X is locked" (CockroachDB). */
function extractLockedTables(errText: string): string[] {
  const re = /table\s+"?([A-Za-z0-9_]+)"?\s+is\s+locked/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(errText))) out.push(m[1]);
  return out;
}

const isAlreadyExists = (errText: string) =>
  /already exists|duplicate|duplicat|42710|42P07|duplicate key|exists in.*relation|already .*index|multiple unique|redefined/i.test(
    errText
  );

const isLocked = (errText: string) =>
  /is locked|schema_locked|22023|cannot automatically unlock|disallowed/i.test(errText);

/**
 * Jalankan satu statement DDL dengan toleransi:
 *  - "sudah ada" -> lewati (idempoten)
 *  - tabel terkunci CockroachDB -> buka kuncinya lalu ulangi sekali
 *  - error lain -> catat, lanjut (jangan sampai satu index gagal membatalkan semua)
 */
async function runDdl(client: PrismaClient, sql: string, label: string): Promise<boolean> {
  let err = await exec(client, sql);
  if (!err) return true;

  const errText = errTextOf(err);
  if (isAlreadyExists(errText)) return true; // idempoten: sudah ada, aman

  if (isLocked(errText)) {
    const tables = extractLockedTables(errText);
    for (const t of tables) {
      // WAJIB satu statement per eksekusi (syarat schema_locked CockroachDB)
      await exec(client, `ALTER TABLE "${t}" SET (schema_locked = false);`);
    }
    err = await exec(client, sql); // ulangi statement-nya
    if (!err) return true;
    const retryText = errTextOf(err);
    if (isAlreadyExists(retryText)) return true;
    console.warn(`[db-setup] GAGAL ${label}: ${retryText.slice(0, 200)}`);
    return false;
  }

  console.warn(`[db-setup] GAGAL ${label}: ${errText.slice(0, 200)}`);
  return false;
}

/** Pastikan semua tabel ada. Dipanggil sekali per proses (cold start serverless). */
async function ensureTables(client: PrismaClient): Promise<void> {
  for (const sql of DDL_TABLES) await runDdl(client, sql, "table");
  for (const sql of DDL_INDEXES) await runDdl(client, sql, "index");
  for (const sql of DDL_FOREIGN_KEYS) await runDdl(client, sql, "fk");
}

let readyPromise: Promise<void> | null = null;

/**
 * SIAPKAN DATABASE PRODUKSI (dipanggil otomatis sebelum query pertama):
 *  1. buat semua tabel bila belum ada (idempoten)
 *  2. isi konten awal bila database masih kosong (admin skelz, user contoh,
 *     post, Shorts, story, like, komentar, follow, notifikasi)
 *
 * Gagal total (mis. database tidak terjangkau) -> promise direset supaya
 * request berikutnya mencoba lagi.
 */
export function ensureDatabaseReady(client: PrismaClient): Promise<void> {
  if (!readyPromise) {
    readyPromise = run(client).catch((err) => {
      readyPromise = null; // biar dicoba lagi di request berikutnya
      throw err;
    });
  }
  return readyPromise;
}

async function run(client: PrismaClient): Promise<void> {
  if (status.mode !== "postgres") {
    // SQLite lokal: tabel dikelola `prisma db push` — tidak ada yang perlu
    // disiapkan, cukup tandai siap supaya /api/health jelas statusnya.
    status.ready = true;
    status.lastRunAt = new Date().toISOString();
    return;
  }
  const startedAt = Date.now();

  // ---------- JALUR CEPAT (cold start sehari-hari) ----------
  // Cukup SATU query kecil: baca versi skema dari SkelzMeta.
  // Kalau versinya sama dengan kode sekarang -> database pasti sudah siap,
  // 90+ pernyataan DDL tidak dijalankan lagi (hemat beberapa detik per
  // cold start serverless).
  try {
    const rows = (await client.$queryRawUnsafe(
      `SELECT "value" FROM "SkelzMeta" WHERE "key" = 'schema_version' LIMIT 1;`
    )) as Array<{ value: string }>;
    if (rows?.length > 0 && String(rows[0].value) === SCHEMA_VERSION) {
      status.ready = true;
      status.lastError = null;
      status.lastRunAt = new Date().toISOString();
      return;
    }
  } catch {
    // tabel SkelzMeta belum ada (database lama / baru) -> jalur DDL penuh di bawah
  }

  // ---------- JALUR LENGKAP (hanya sekali per versi skema) ----------
  await ensureTables(client);

  // Database masih kosong? -> isi konten awal SEKALI saja.
  // KECUALI kalau MIGRATE_SOURCE_URL terpasang: berarti data lama akan
  // dipindahkan lewat /api/admin/migrate-db — konten demo TIDAK dibuat
  // supaya tidak bercampur dengan data asli hasil migrasi.
  const users = await client.user.count();
  if (users === 0) {
    if (process.env.MIGRATE_SOURCE_URL) {
      console.log(
        "[db-setup] MIGRATE_SOURCE_URL terpasang — konten awal dilewati. " +
          "Jalankan /api/admin/migrate-db untuk memindahkan data lama."
      );
    } else {
      // Lazy import: seed (dan modul beratnya) hanya dimuat saat benar-benar
      // dibutuhkan — cold start serverless sehari-hari tetap ringan.
      const { seedDatabase } = await import("./seed-runtime");
      await seedDatabase(client);
      status.seeded = true;
      console.log("[db-setup] Konten awal berhasil dibuat (admin skelz + demo).");
    }
  }

  // Tandai versi supaya cold start berikutnya cukup jalur cepat 1-query.
  // Kalau penanda GAGAL ditulis, versi tidak berubah -> DDL dijalankan lagi
  // pada cold start berikutnya (idempoten, aman) — tapi kita catat supaya
  // masalahnya kelihatan di log Vercel.
  const markErr = await exec(client,
    `INSERT INTO "SkelzMeta" ("key", "value") VALUES ('schema_version', '${SCHEMA_VERSION}')
     ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value";`
  );
  if (markErr) console.warn("[db-setup] Gagal menandai versi skema:", errTextOf(markErr).slice(0, 200));

  status.ready = true;
  status.lastError = null;
  status.lastRunAt = new Date().toISOString();
  const totalUsers = await client.user.count();
  console.log(`[db-setup] Database siap dalam ${Date.now() - startedAt}ms (${totalUsers} user).`);
}

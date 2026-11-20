// SkelzHub x CockroachDB — SETUP OTOMATIS dalam SATU perintah.
//
// Cara pakai (dari folder root project):
//   bun scripts/setup-cockroach.ts
//   (atau: npx tsx scripts/setup-cockroach.ts)
//
// Script hanya menanyakan 2 hal:
//   1) Tempel connection string CockroachDB-mu (kode rahasia dari tombol "Connect")
//   2) Password baru untuk akun admin "skelz"
//
// Lalu OTOMATIS mengerjakan:
//   - ganti setting database project (sqlite -> cockroachdb)
//   - bikin semua tabel di database cloud kamu (tabel baru di versi apapun
//     otomatis diurus — daftar tabel dibaca langsung dari schema, tidak lagi manual)
//   - isi konten awal (admin skelz, user contoh, post gambar, Shorts, komentar, dll)
//     AMAN DIJALANKAN ULANG: kalau database kamu sudah berisi data, konten awal
//     otomatis DILEWATI supaya data kamu tidak terhapus.
//   - BERSIH-BERSIH: hapus akun demo lama (kalau ada) + pastikan email admin
//     skelz terisi skelltenx@gmail.com
//   - ganti password admin skelz + cabut session lama
//   - simpan .env lokal (backup lama jadi .env.backup)

import { spawnSync } from "child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
const ENV_FILE = join(ROOT, ".env");

const IS_BUN = Boolean((process.versions as Record<string, string | undefined>).bun);
const PRISMA_BIN = IS_BUN ? "bunx" : "npx";

// ---------- Input handling (aman di Bun & Node, terminal maupun pipa) ----------

const IS_TTY = Boolean(process.stdin.isTTY);
let pipedLines: string[] = [];

function readAllStdin(): Promise<void> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (c) => {
      data += typeof c === "string" ? c : Buffer.from(c as Buffer).toString("utf8");
    });
    process.stdin.on("end", () => {
      pipedLines = data.split(/\r?\n/);
      resolve();
    });
    process.stdin.resume();
  });
}

function askInteractive(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin as import("tty").ReadStream;
    stdin.setRawMode(true);
    stdin.resume();
    let line = "";
    const onData = (ch: Buffer) => {
      const c = ch.toString("utf8");
      if (c === "\r" || c === "\n") {
        stdin.setRawMode(false);
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(line.trim());
      } else if (c === "\u0003") {
        // Ctrl+C
        stdin.setRawMode(false);
        console.log("\nDibatalkan.");
        process.exit(130);
      } else if (c === "\u007f" || c === "\b") {
        if (line.length > 0) {
          line = line.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else if (c >= " ") {
        line += c;
        process.stdout.write(c);
      }
    };
    stdin.on("data", onData);
  });
}

async function ask(prompt: string): Promise<string> {
  if (!IS_TTY) {
    process.stdout.write(prompt);
    return pipedLines.shift() ?? "";
  }
  return askInteractive(prompt);
}

// ---------- Connection string helpers ----------

/** Bersihkan connection string hasil copy dari dashboard (otomatis).
 *  - buang tanda kutip/spasi
 *  - postgres:// -> postgresql://
 *  - ganti semua parameter jadi sslmode=require (kompatibel Vercel),
 *    tapi pertahankan options=--cluster=... kalau ada (wajib untuk cluster serverless baru)
 */
function cleanUrl(raw: string): string | null {
  let s = raw.trim().replace(/^["'`]+|["'`]+$/g, "");
  if (!s) return null;
  if (s.startsWith("postgres://")) s = "postgresql://" + s.slice("postgres://".length);

  const q = s.indexOf("?");
  const base = q === -1 ? s : s.slice(0, q);
  let clusterOption = "";
  if (q !== -1) {
    for (const part of s.slice(q + 1).split("&")) {
      if (part.startsWith("options=--cluster=")) clusterOption = part;
    }
  }
  const cleaned = base + "?sslmode=require" + (clusterOption ? "&" + clusterOption : "");
  try {
    const u = new URL(cleaned);
    if ((u.protocol !== "postgresql:" && u.protocol !== "postgres:") || !u.hostname) return null;
    if (!u.username || !u.password) return null;
    return cleaned;
  } catch {
    return null;
  }
}

function mask(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "****";
    return u.toString();
  } catch {
    return url;
  }
}

// ---------- Runner ----------

function run(label: string, cmd: string, args: string[], env: NodeJS.ProcessEnv) {
  console.log(`\n>> ${label}`);
  // Di Windows, "npx" adalah file .cmd -> harus lewat shell agar bisa dijalankan.
  const r = spawnSync(cmd, args, {
    stdio: ["pipe", "inherit", "inherit"],
    cwd: ROOT,
    env: { ...process.env, ...env },
    shell: process.platform === "win32",
  });
  if (r.error) throw new Error(`Perintah "${cmd}" tidak bisa dijalankan: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`Langkah "${label}" gagal (exit code ${r.status}).`);
}

// Semua tabel SkelzHub — dibaca OTOMATIS dari prisma/schema.prisma supaya tabel
// baru (Conversation, Message, dst.) SELALU tercakup tanpa perlu edit list ini lagi.
const FALLBACK_TABLES = [
  "User", "Media", "Post", "Like", "Comment", "Follow", "Saved",
  "Notification", "Report", "Conversation", "Message",
];

function getModelTables(): string[] {
  try {
    const src = readFileSync(SCHEMA, "utf8");
    const names = [...src.matchAll(/^model\s+([A-Za-z0-9_]+)\s*\{/gm)].map((m) => m[1]);
    if (names.length > 0) return names;
  } catch {
    // schema tidak terbaca — pakai fallback
  }
  return FALLBACK_TABLES;
}

/** Ambil nama tabel yang disebut error sebagai terkunci, contoh:
 *  table "Conversation" is locked  ->  ["Conversation"] */
function extractLockedTables(text: string): string[] {
  const names = new Set<string>();
  const re = /table\s+"?([A-Za-z0-9_]+)"?\s+is\s+locked/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) names.add(m[1]);
  return [...names];
}

/** Buka kunci schema_locked CockroachDB untuk tabel yang SUDAH ada (abaikan error
 *  jika tabel belum dibuat / versi DB tanpa fitur ini). Dipakai sebelum/di antara
 *  percobaan `prisma db push` karena CockroachDB v26 mengunci tabel baru secara
 *  otomatis, sehingga pembuatan index oleh Prisma ditolak. */
function unlockTables(url: string, tables: string[]): void {
  // PENTING: satu statement per eksekusi (syarat CockroachDB: schema_locked hanya
  // boleh di-set dalam transaksi implisit satu-statement), TANPA klausa lain.
  for (const t of tables) {
    spawnSync(PRISMA_BIN, ["prisma", "db", "execute", "--schema", "prisma/schema.prisma", "--stdin"], {
      input: `ALTER TABLE "${t}" SET (schema_locked = false);\n`,
      encoding: "utf8",
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: url },
      shell: process.platform === "win32",
    });
    // sengaja abaikan exit code (tabel mungkin belum ada)
  }
}

/** prisma db push dengan retry cerdas. CockroachDB v26 mengunci tabel baru secara
 *  otomatis sehingga langkah berikutnya (buat index) ditolak. Pola: buka kunci
 *  semua tabel yang ada (SATU statement per eksekusi — syarat mutlak CockroachDB,
 *  gabungan beberapa statement akan error 22023) -> push -> kalau masih terkunci,
 *  buka kunci lagi dan ulangi (maks 20x; tiap percobaan selalu ada kemajuan). */
function dbPushWithRetry(url: string): void {
  const MAX_ATTEMPTS = 20;
  const allTables = getModelTables();
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    if (i === 1) {
      console.log("\n>> [3/7] Bikin semua tabel di database cloud kamu");
      console.log(`   (siapkan unlock untuk tabel: ${allTables.join(", ")})`);
    } else {
      console.log(`\n(percobaan db push ke-${i}...)`);
    }
    unlockTables(url, allTables);

    const r = spawnSync(PRISMA_BIN, ["prisma", "db", "push", "--accept-data-loss"], {
      stdio: ["ignore", "inherit", "pipe"],
      encoding: "utf8",
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: url },
      shell: process.platform === "win32",
    });
    const errText = String(r.stderr ?? "");
    if (errText) process.stderr.write(errText);

    if (r.status === 0) return; // sukses
    if (/is locked|schema_locked|22023|cannot automatically unlock/i.test(errText) && i < MAX_ATTEMPTS) {
      const locked = extractLockedTables(errText);
      // Pastikan tabel yang disebut error juga masuk daftar unlock (kalau belum)
      for (const t of locked) if (!allTables.includes(t)) allTables.push(t);
      console.log(
        `\n!! Tabel terkunci CockroachDB${locked.length ? ` (${locked.join(", ")})` : ""} — ` +
          "membuka kuncinya lalu mencoba lagi otomatis..."
      );
      continue;
    }
    throw new Error(`prisma db push gagal (exit code ${r.status}). Lihat tulisan error di atas.`);
  }
  throw new Error("db push masih terkunci setelah beberapa percobaan — kirim tulisan error ke chat ya.");
}

/** Jalankan satu statement SQL langsung ke database (abaikan error, ada log-nya). */
function execSql(url: string, sql: string, label: string): void {
  const r = spawnSync(PRISMA_BIN, ["prisma", "db", "execute", "--schema", "prisma/schema.prisma", "--stdin"], {
    input: sql,
    encoding: "utf8",
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: url },
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    console.log(`   (peringatan: "${label}" mungkin tidak jalan — aman diabaikan)`);
  }
}

// ---------- Main ----------

async function main() {
  if (!IS_TTY) await readAllStdin();

  console.log("=== SkelzHub x CockroachDB — SETUP OTOMATIS ===");
  console.log("(Kalau bingung, kirim tulisan error ke chat untuk dibantu.)\n");

  const rawUrl = await ask("1) Tempel CONNECTION STRING CockroachDB-mu di sini, lalu tekan Enter:\n> ");
  const url = cleanUrl(rawUrl);
  if (!url) {
    console.error(
      "\nConnection string tidak valid :(\n" +
        "Cara benar: di dashboard CockroachDB klik tombol Connect -> pilih 'General connection string' -> Copy.\n" +
        "Bentuknya kira-kira: postgresql://user:password@host:26257/defaultdb?sslmode=verify-full"
    );
    process.exitCode = 1;
    return;
  }

  const newPassword = await ask("\n2) Password BARU untuk akun admin skelz (minimal 6 karakter; ENTER saja = biarkan password lama):\n> ");
  if (newPassword && (newPassword.length < 6 || /\s/.test(newPassword))) {
    console.error("\nPassword harus minimal 6 karakter dan tanpa spasi.");
    process.exitCode = 1;
    return;
  }

  console.log(`\nKoneksi terbaca: ${mask(url)}`);
  console.log("\nRencana setup:");
  console.log("  1. Ganti setting database project ke CockroachDB");
  console.log("  2. Bikin semua tabel di database cloud kamu");
  console.log("  3. Isi konten awal (user, post, Shorts, komentar) — dilewati jika database sudah berisi data");
  console.log("  4. Bersih-bersih: hapus akun demo lama + isi email admin skelz (skelltenx@gmail.com)");
  console.log("  5. Ganti password admin skelz (kosongkan untuk membiarkan password lama)");
  console.log("  6. Simpan setting lokal (.env) — dev lokal ikut pakai database cloud");

  const ok = await ask("\nLanjutkan? ketik y lalu Enter (ketik n untuk batal): > ");
  if (ok.toLowerCase() !== "y") {
    console.log("Dibatalkan — tidak ada yang diubah.");
    return;
  }

  if (existsSync(ENV_FILE)) copyFileSync(ENV_FILE, `${ENV_FILE}.backup`);

  console.log("\n[1/7] Ganti setting database project...");
  let schema = readFileSync(SCHEMA, "utf8");
  if (schema.includes('provider = "cockroachdb"')) {
    console.log("   (sudah cockroachdb, lewati)");
  } else {
    schema = schema.replace(
      /provider = "(sqlite|postgresql|mysql)"/,
      'provider = "cockroachdb"'
    );
    if (!schema.includes('provider = "cockroachdb"')) {
      throw new Error("Tidak bisa mengedit prisma/schema.prisma — tolong lapor ke chat.");
    }
    writeFileSync(SCHEMA, schema);
  }

  const env = { DATABASE_URL: url };

  console.log("\n[2/7] Generate ulang prisma client...");

  dbPushWithRetry(url);

  console.log("\n[4/7] Isi konten awal (seed)...");
  const seedFile = join(ROOT, "scripts", "seed.ts");
  // Seed gagal (mis. database SUDAH berisi data lama) tidak fatal: lanjut ke langkah berikutnya
  try {
    if (IS_BUN) run("bun scripts/seed.ts", "bun", [seedFile], env);
    else run("npx tsx scripts/seed.ts", "npx", ["tsx", seedFile], env);
  } catch (err) {
    console.log("\n!! Konten awal dilewati — database kamu sudah berisi data (error ini normal & aman diabaikan).");
  }

  // Bersih-bersih untuk versi lama: hapus akun demo + pastikan email admin skelz terisi
  console.log("\n[5/7] Bersih-bersih: hapus akun demo lama + pastikan email admin skelz...");
  execSql(url, `DELETE FROM "User" WHERE username = 'demo';`, "hapus akun demo");
  execSql(
    url,
    `UPDATE "User" SET email = 'skelltenx@gmail.com' WHERE username = 'skelz' AND (email IS NULL OR email = '');`,
    "isi email admin skelz"
  );
  // Akun skelz = pemilik platform (badge "Owner", di atas level Admin)
  execSql(
    url,
    `UPDATE "User" SET role = 'OWNER' WHERE username = 'skelz';`,
    "jadikan akun skelz sebagai Owner"
  );
  console.log("   [OK] Akun demo dihapus (kalau ada), email admin skelz terisi, dan skelz kini berstatus OWNER.");

  // Password: kosong (Enter saja) = tidak mengubah password lama
  const passToSet = newPassword.trim();
  if (passToSet) {
    console.log('\n[6/7] Ganti password admin "skelz"...');
    const passFile = join(ROOT, "scripts", "change-password.ts");
    if (IS_BUN) run("bun scripts/change-password.ts", "bun", [passFile, "skelz", passToSet], env);
    else run("npx tsx scripts/change-password.ts", "npx", ["tsx", passFile, "skelz", passToSet], env);
  } else {
    console.log("\n[6/7] Password admin tidak diubah (sesuai pilihanmu).");
  }

  console.log("\n[7/7] Simpan setting lokal (.env)...");
  writeFileSync(ENV_FILE, `DATABASE_URL=${url}\n`);

  console.log("\n================ SELESAI! ================");
  console.log("Database cloud kamu sudah berisi data SkelzHub.");
  console.log('Login admin nanti: username "skelz" + password baru kamu.');
  console.log("Email admin skelz sudah di-set ke skelltenx@gmail.com.");
  console.log("\nLANGKAH TERAKHIR (copy-paste ke terminal):");
  console.log("  git add -A");
  console.log('  git commit -m "Ganti database ke CockroachDB"');
  console.log("  git push");
  console.log("\nLalu buka https://vercel.com/new :");
  console.log("  1. Import repo kamu");
  console.log("  2. Sebelum Deploy, buka Environment Variables dan isi:");
  console.log("       Key   : DATABASE_URL");
  console.log("       Value : connection string kamu (yang sama persis)");
  console.log("  3. Klik Deploy -> tunggu 3 menit -> web kamu online!");
  console.log("\n  (SANGAT DISARANKAN) Supaya kode verifikasi login & reset password");
  console.log("  benar-benar terkirim ke email:");
  console.log("     1. Daftar gratis di resend.com — daftar pakai email skelltenx@gmail.com");
  console.log("     2. Buat API Key di dashboard Resend");
  console.log("     3. Di Vercel tambah Environment Variable:");
  console.log("          RESEND_API_KEY = (api key kamu)");
  console.log("     Kalau belum diisi, kode verifikasi tetap bisa dipakai tapi ditampilkan");
  console.log("     langsung di layar (mode demo) — kurang aman untuk production.");
}

main().catch((err) => {
  console.error(`\nGAGAL: ${err instanceof Error ? err.message : err}`);
  console.error("Copy tulisan error di atas ke chat supaya dibantu perbaiki ya.");
  process.exitCode = 1;
});

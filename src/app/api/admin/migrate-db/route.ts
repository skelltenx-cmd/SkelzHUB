import { Pool } from "pg";
import { dbBase, ensureDatabaseReady } from "@/lib/db";
import { dbSetupStatus } from "@/lib/db-setup";

// ============================================================
// SkelzHub — MIGRASI DATA LAMA (CockroachDB / Postgres lain) -> Supabase.
//
// Kenapa endpoint ini ada:
//  - pindah database biasanya ribet (export/import manual dari komputer).
//  - Di sini cukup PANGGIL SATU ALAMAT dari browser/PowerShell,
//    server yang menyalin semua tabel satu per satu.
//  - Aman dijalankan BERULANG: baris yang sudah pindah otomatis dilewati
//    (ON CONFLICT DO NOTHING), jadi kalau terputus tinggal panggil lagi.
//
// Cara pakai (lihat langkah deploy):
//  1. Vercel -> Environment Variables:
//     - DATABASE_URL        = URL BARU (Supabase, tujuan)
//     - MIGRATE_SOURCE_URL  = URL LAMA (CockroachDB, sumber)  [dihapus lagi setelah selesai]
//     - MIGRATE_SECRET      = teks rahasia apa saja            [dihapus lagi setelah selesai]
//  2. Deploy, lalu buka:  https://www.skelzhub.my.id/api/health
//     (tabel dibuat otomatis; konten demo TIDAK dibuat saat migrasi)
//  3. Panggil endpoint ini (GET dengan ?secret= atau POST dengan header)
//     -> semua data lama tersalin ke database baru.
//  4. Cek hasilnya, lalu HAPUS MIGRATE_SOURCE_URL dan MIGRATE_SECRET.
//
// Kalau datanya banyak dan request terputus (timeout), panggil LAGI:
// migrasi lanjut dari sisanya, tidak ada data yang dobel.
// ============================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Urutan tabel aman-foreign-key: induk dulu, anak menyusul.
// (harus cocok dengan prisma/schema.prisma + db-ddl.ts)
const TABLES: string[] = [
  "User",
  "Media",
  "SkelzMeta",
  "Follow",
  "Saved",
  "Conversation",
  "PasswordReset",
  "Post",
  "Like",
  "Comment",
  "Report",
  "Story",
  "StoryLike",
  "StoryComment",
  "StoryView",
  "Message",
  "MessageReaction",
  "Notification",
  "MediaChunk",
];

// Tabel dengan kolom yang menunjuk KE DIRINYA SENDIRI (balasan/repost):
// disalin dua tahap — baris induk dulu, lalu baris anak.
const SELF_REF: Record<string, string> = {
  Post: "repostOfId",
  Comment: "parentId",
  StoryComment: "parentId",
  Message: "replyToId",
};

// Batas waktu kerja satu pemanggilan (ms) — sisanya diteruskan
// ke pemanggilan berikutnya (endpoint ini aman dipanggil ulang).
const TIME_BUDGET_MS = 45_000;

// Baris per satu baca (baris media bisa berukuran jutaan byte).
const PAGE_ROWS = 25;
// Kelompok multi-INSERT dipecah kalau total barisnya terlalu gemuk.
const INSERT_ROWS = 20;

type Row = Record<string, unknown>;
type TableReport = {
  tabel: string;
  baris: number;
  tersalin: number;
  selesai: boolean;
  error?: string;
};

/** Bersihkan connection string: hapus kutip, samakan protokol, buang query. */
function cleanUrl(raw: string): string {
  let s = raw.trim().replace(/^["'`]+|["'`]+$/g, "");
  if (s.startsWith("postgres://")) s = "postgresql://" + s.slice("postgres://".length);
  const q = s.indexOf("?");
  if (q >= 0) s = s.slice(0, q);
  return s;
}

/** Host+port+path sebagai identitas database (untuk cek sumber != tujuan). */
function urlIdentity(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return url;
  }
}

function poolFor(url: string): Pool {
  return new Pool({
    connectionString: cleanUrl(url),
    // Cockroach maupun Supabase sama-sama lewat TLS; sertifikatnya
    // diverifikasi longgar supaya connection string apa pun langsung jalan.
    ssl: { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: 15_000,
  });
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Sisipkan baris ke tabel tujuan; kembalikan jumlah baris benar-benar masuk. */
async function insertRows(
  dest: Pool,
  table: string,
  cols: string[],
  rows: Row[]
): Promise<number> {
  let inserted = 0;
  // Baris dengan media base64 besar -> sisipkan satu per satu supaya
  // pesan protokol Postgres tidak kegedean.
  const heavy = rows.some(
    (r) => JSON.stringify(r, (_k, v) => (typeof v === "string" ? v : "")).length > 256 * 1024
  );
  const groups = heavy ? rows.map((r) => [r]) : chunk(rows, INSERT_ROWS);
  for (const g of groups) {
    const values: unknown[] = [];
    const tuples = g.map((row) => {
      const placeholders = cols.map((c) => {
        values.push(row[c] ?? null);
        return `$${values.length}`;
      });
      return `(${placeholders.join(",")})`;
    });
    const sql =
      `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES ` +
      `${tuples.join(",")} ON CONFLICT DO NOTHING;`;
    const res = await dest.query(sql, values as never[]);
    inserted += res.rowCount ?? 0;
  }
  return inserted;
}

async function handle(request: Request): Promise<Response> {
  const noStore = { "Cache-Control": "no-store" } as const;

  // ---- Pintu rahasia ----
  const secret = process.env.MIGRATE_SECRET;
  if (!secret) {
    return Response.json(
      { ok: false, pesan: "Fitur migrasi belum diaktifkan (MIGRATE_SECRET kosong di Vercel)." },
      { status: 404, headers: noStore }
    );
  }
  const given =
    request.headers.get("x-migrate-secret") ?? new URL(request.url).searchParams.get("secret");
  if (given !== secret) {
    return Response.json({ ok: false, pesan: "Secret salah." }, { status: 401, headers: noStore });
  }

  // ---- Sumber & tujuan ----
  const destUrl = process.env.DATABASE_URL ?? "";
  if (!/^postgres(ql)?:\/\//i.test(destUrl.trim())) {
    return Response.json(
      {
        ok: false,
        pesan:
          "DATABASE_URL belum berupa Postgres/Supabase. Setel dulu di Vercel lalu redeploy, baru panggil migrasi ini.",
      },
      { status: 400, headers: noStore }
    );
  }

  let sourceUrl: string | undefined = process.env.MIGRATE_SOURCE_URL;
  if (request.method === "POST") {
    try {
      const body = (await request.json()) as { sourceUrl?: unknown };
      if (typeof body?.sourceUrl === "string" && body.sourceUrl.trim()) {
        sourceUrl = body.sourceUrl;
      }
    } catch {
      /* body kosong/bukan JSON — pakai env saja */
    }
  }
  if (!sourceUrl) {
    return Response.json(
      {
        ok: false,
        pesan:
          "Sumber data belum diatur. Isi MIGRATE_SOURCE_URL di Vercel (URL CockroachDB lama) atau kirim sourceUrl di body JSON.",
      },
      { status: 400, headers: noStore }
    );
  }
  if (urlIdentity(sourceUrl) === urlIdentity(destUrl)) {
    return Response.json(
      { ok: false, pesan: "URL sumber sama dengan tujuan — tidak ada yang perlu dipindahkan." },
      { status: 400, headers: noStore }
    );
  }

  // Pastikan tabel tujuan sudah dibuat (db-setup idempoten, sekali saja).
  try {
    await ensureDatabaseReady(dbBase);
  } catch (err) {
    return Response.json(
      {
        ok: false,
        pesan: "Database tujuan belum siap. Buka /api/health dulu, lalu ulangi migrasi ini.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500, headers: noStore }
    );
  }

  const src = poolFor(sourceUrl);
  const dst = poolFor(destUrl);
  const report: TableReport[] = [];
  const startedAt = Date.now();
  let outOfTime = false;

  try {
    // Uji koneksi sumber (pesan error jelas kalau URL salah).
    try {
      await src.query("SELECT 1;");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json(
        {
          ok: false,
          pesan:
            "Tidak bisa terhubung ke database LAMA (MIGRATE_SOURCE_URL). Periksa lagi URL, password, dan izin IP-nya.",
          detail: msg.slice(0, 300),
        },
        { status: 502, headers: noStore }
      );
    }

    // Daftar tabel + kolom dari kedua database.
    const srcTables = new Set(
      (
        await src.query<{ table_name: string }>(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`
        )
      ).rows.map((r) => r.table_name)
    );
    const dstCols = new Map<string, string[]>();
    const dstColRows = (
      await dst.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public';`
      )
    ).rows;
    for (const r of dstColRows) {
      const list = dstCols.get(r.table_name) ?? [];
      list.push(r.column_name);
      dstCols.set(r.table_name, list);
    }
    const srcCols = new Map<string, string[]>();
    const srcColRows = (
      await src.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public';`
      )
    ).rows;
    for (const r of srcColRows) {
      const list = srcCols.get(r.table_name) ?? [];
      list.push(r.column_name);
      srcCols.set(r.table_name, list);
    }

    for (const table of TABLES) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        outOfTime = true;
        break;
      }
      if (!srcTables.has(table)) continue; // tabel tidak ada di sumber -> lewati diam-diam

      // Kolom sama (yang ada di dua-duanya) supaya beda versi skema tetap aman.
      const dstList = dstCols.get(table) ?? [];
      const cols = (srcCols.get(table) ?? []).filter((c) => dstList.includes(c));
      if (cols.length === 0) continue;

      const orderCol = table === "SkelzMeta" ? "key" : "id";
      const selfRef = SELF_REF[table] ?? null;
      const passes = selfRef ? [`${selfRef} IS NULL`, `${selfRef} IS NOT NULL`] : [""];

      let tersalin = 0;
      let baris = 0;
      let selesai = true;
      let errorPesan: string | undefined;

      try {
        for (const where of passes) {
          if (!selesai) break;
          let offset = 0;
          for (;;) {
            if (Date.now() - startedAt > TIME_BUDGET_MS) {
              selesai = false;
              outOfTime = true;
              break;
            }
            const w = where ? `WHERE ${where}` : "";
            const { rows } = await src.query(
              `SELECT ${cols.map((c) => `"${c}"`).join(",")} FROM "${table}" ${w} ORDER BY "${orderCol}" LIMIT ${PAGE_ROWS} OFFSET ${offset};`
            );
            if (rows.length === 0) break;
            baris += rows.length;
            tersalin += await insertRows(dst, table, cols, rows as Row[]);
            if (rows.length < PAGE_ROWS) break;
            offset += PAGE_ROWS;
          }
        }
      } catch (err) {
        // FK belum lengkap dsb. -> catat, lanjut tabel berikutnya.
        // Panggil ulang endpoint ini nanti untuk melengkapi sisanya.
        selesai = false;
        errorPesan = (err instanceof Error ? err.message : String(err)).slice(0, 200);
      }

      report.push({ tabel: table, baris, tersalin, selesai, ...(errorPesan ? { error: errorPesan } : {}) });
    }

    // Hitung ulang isi kedua database supaya hasilnya mudah dicek.
    const counts: Record<string, { lama: number; baru: number }> = {};
    for (const table of TABLES) {
      if (!srcTables.has(table)) continue;
      try {
        const a = await src.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM "${table}";`);
        const b = await dst.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM "${table}";`);
        counts[table] = { lama: Number(a.rows[0]?.n ?? 0), baru: Number(b.rows[0]?.n ?? 0) };
      } catch {
        /* lewati tabel yang tak bisa dihitung */
      }
    }

    const adaError = report.some((r) => r.error);
    const belum = outOfTime || report.some((r) => !r.selesai);
    const pesan = belum
      ? "Migrasi BERJALAN SEBAGIAN. Panggil alamat ini LAGI (aman, tidak akan dobel) sampai selesai."
      : adaError
        ? "Selesai, tapi ada tabel yang error — kirim pesan errornya, atau panggil lagi."
        : "Migrasi SELESAI. Semua data sudah di database baru. Sekarang hapus MIGRATE_SOURCE_URL dan MIGRATE_SECRET dari Vercel.";

    return Response.json(
      {
        ok: !belum && !adaError,
        pesan,
        provider: dbSetupStatus().provider,
        waktu: `${((Date.now() - startedAt) / 1000).toFixed(1)} detik`,
        tabel: report,
        jumlah_baris: counts,
      },
      { headers: noStore }
    );
  } finally {
    src.end().catch(() => undefined);
    dst.end().catch(() => undefined);
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

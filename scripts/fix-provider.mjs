// Menjaga prisma/schema.prisma tetap COCOK dengan DATABASE_URL saat build/install.
// Masalah yang dicegah: zip update berisi schema versi sqlite; kalau ter-push ke
// GitHub lalu di-build Vercel dengan DATABASE_URL postgres (CockroachDB), klien
// Prisma yang dihasilkan salah -> semua API error "Terjadi kesalahan pada server".
// Script ini berjalan sebelum `prisma generate` (postinstall), jadi klien yang
// di-generate selalu benar tanpa perlu mengubah apa pun di repo.

import fs from "node:fs";
import path from "node:path";

const envUrl = (process.env.DATABASE_URL || "").trim();
const schemaPath = path.join(import.meta.dirname, "..", "prisma", "schema.prisma");

if (!envUrl || !fs.existsSync(schemaPath)) process.exit(0);

const want = envUrl.startsWith("postgres") ? "cockroachdb" : "sqlite";

let src = fs.readFileSync(schemaPath, "utf8");
// Hanya provider di dalam blok "datasource db { ... }" (bukan generator client)
const dsRe = /(datasource\s+\w+\s*\{[\s\S]*?provider\s*=\s*")([^"]+)(")/;
const m = dsRe.exec(src);
if (!m || m[2] === want) process.exit(0);

src = src.replace(dsRe, `$1${want}$3`);
fs.writeFileSync(schemaPath, src);
console.log(`[skelzhub] schema provider disesuaikan otomatis: ${m[2]} -> ${want}`);

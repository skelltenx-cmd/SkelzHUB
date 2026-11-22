#!/usr/bin/env node
// SkelzHub — pra-build: samakan provider prisma dengan DATABASE_URL.
//
// Kenapa perlu: schema.prisma di repo memakai "sqlite" (untuk dev lokal),
// sementara produksi (Vercel) memakai DATABASE_URL postgres/cockroachdb.
// Skrip ini jalan SEBELUM `next build` di Vercel: membaca DATABASE_URL,
// mengganti baris provider di prisma/schema.prisma, lalu menjalankan
// `prisma generate` supaya client yang ter-bundle cocok dengan database
// produksi. Di lokal (DATABASE_URL=file:...) tidak mengubah apa pun.
//
// Mode sqlite -> tidak ada perubahan (prisma generate biasa).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const schemaPath = join(root, "prisma", "schema.prisma");
const url = (process.env.DATABASE_URL ?? "").trim();
const isPostgres = /^postgres(ql)?:\/\//i.test(url);

function runGenerate() {
  const candidates = [
    join(root, "node_modules", ".bin", "prisma"),
    "bunx prisma",
    "npx prisma",
  ];
  for (const cmd of candidates) {
    try {
      execSync(`${cmd} generate`, { stdio: "inherit", cwd: root });
      return;
    } catch (err) {
      const text = String(err);
      if (/ENOENT|not found|Cannot find|spawn/i.test(text)) continue; // coba kandidat berikutnya
      throw err;
    }
  }
  throw new Error("prisma generate gagal (coba: npx prisma generate)");
}

function main() {
  if (!existsSync(schemaPath)) {
    console.log("[prepare-db] prisma/schema.prisma tidak ditemukan — lewati.");
    runGenerate();
    return;
  }

  if (!isPostgres) {
    console.log("[prepare-db] Mode lokal SQLite — prisma generate (sqlite).");
    runGenerate();
    return;
  }

  // Deteksi penyedia dari URL
  let provider = "postgresql";
  try {
    const u = new URL(url.startsWith("postgres://") ? "postgresql://" + url.slice("postgres://".length) : url);
    const cockroach =
      u.port === "26257" ||
      /cockroach/i.test(u.hostname) ||
      (u.searchParams.get("options") ?? "").includes("cluster=");
    if (cockroach) provider = "cockroachdb";
  } catch {
    /* format aneh — anggap postgresql */
  }

  const src = readFileSync(schemaPath, "utf8");
  const m = /provider\s*=\s*"(sqlite|postgresql|cockroachdb)"/.exec(src);
  if (m && m[1] === provider) {
    console.log(`[prepare-db] Provider sudah "${provider}" — prisma generate.`);
    runGenerate();
    return;
  }
  const updated = src.replace(
    /provider\s*=\s*"(sqlite|postgresql|cockroachdb)"/,
    `provider = "${provider}"`
  );
  writeFileSync(schemaPath, updated);
  console.log(`[prepare-db] Mode produksi terdeteksi — schema.prisma provider -> "${provider}", lalu prisma generate.`);
  runGenerate();
}

main();

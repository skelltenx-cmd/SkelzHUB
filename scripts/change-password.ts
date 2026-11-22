// Ganti password user SkelzHub (dipakai terutama untuk mengamankan akun admin
// setelah deploy — lihat DEPLOY.md).
//
// Cara pakai (dari folder root repo):
//   npx tsx scripts/change-password.ts <username> <passwordBaru>
//   bun scripts/change-password.ts <username> <passwordBaru>
//
// Semua session user tsb juga dicabut (sessionVersion naik) jadi dia harus
// login ulang dengan password baru di mana pun, termasuk di server Vercel.

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const db = new PrismaClient();

async function main() {
  const [username, password] = process.argv.slice(2);

  if (!username || !password || password.length < 6) {
    console.error(
      "Cara pakai: npx tsx scripts/change-password.ts <username> <passwordBaru>\n" +
        "Password minimal 6 karakter."
    );
    process.exit(1);
  }

  const user = await db.user.update({
    where: { username },
    data: {
      password: hashPassword(password),
      sessionVersion: { increment: 1 }, // cabut semua session lama
    },
  });

  console.log(`Password akun "${user.username}" berhasil diganti.`);
}

main()
  .catch((err) => {
    console.error("Gagal:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

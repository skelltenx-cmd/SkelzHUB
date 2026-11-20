// Seed SkelzHub: admin 'skelz', user contoh, post gambar + video Shorts, like, komentar, follow, notifikasi, laporan
// Jalankan: bun scripts/seed.ts

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const db = new PrismaClient();

// RNG deterministik supaya hasil seed konsisten
let seedState = 42;
function rand(): number {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

const SEED_DIR = join(__dirname, "..", "assets", "seed");

type SeedUser = {
  username: string;
  email: string;
  displayName: string;
  bio: string;
  avatarColor: number;
  password: string;
  role?: "ADMIN";
};

const USERS: SeedUser[] = [
  {
    // AKUN ADMIN UTAMA — login: skelz / skelz123
    username: "skelz",
    email: "skelltenx@gmail.com",
    displayName: "Skelz",
    bio: "Founder & Admin SkelzHub — menjaga platform tetap aman dan seru. Ada masalah? DM aku!",
    avatarColor: 0,
    password: "skelz123",
    role: "ADMIN",
  },
  {
    username: "agung_memes",
    email: "agung@skelzhub.app",
    displayName: "Agung Sang Memelord",
    bio: "Penghasil meme 24 jam nonstop | DM untuk kolaborasi",
    avatarColor: 5,
    password: "password123",
  },
  {
    username: "rina.kuliner",
    email: "rina@skelzhub.app",
    displayName: "Rina Kuliner",
    bio: "Jelajah kuliner nusantara | Jogja → Jakarta | Recipe di caption",
    avatarColor: 1,
    password: "password123",
  },
  {
    username: "budi_gaming",
    email: "budi@skelzhub.app",
    displayName: "Budi Gaming",
    bio: "Rush B tapi ganteng | Valorant, Minecraft, dan makan mie",
    avatarColor: 3,
    password: "password123",
  },
  {
    username: "sari.travels",
    email: "sari@skelzhub.app",
    displayName: "Sari Wanders",
    bio: "Bali → Rinjani → Raja Ampat | Tips traveling hemat tiap minggu",
    avatarColor: 4,
    password: "password123",
  },
  {
    username: "dewa.lens",
    email: "dewa@skelzhub.app",
    displayName: "Dewa Lens",
    bio: "Street photographer | Neon, urban, dan golden hour",
    avatarColor: 6,
    password: "password123",
  },
  {
    username: "putri.estetik",
    email: "putri@skelzhub.app",
    displayName: "Putri Estetik",
    bio: "Estetik itu hidup, hidup itu estetik — lofi & cozy enthusiast",
    avatarColor: 7,
    password: "password123",
  },
  {
    username: "joji.skate",
    email: "joji@skelzhub.app",
    displayName: "Joji Skate",
    bio: "Skate & chill | Komunitas skateboard Jogja",
    avatarColor: 2,
    password: "password123",
  },
];

type SeedPost = {
  file: string;
  author: string;
  caption: string;
};

const POSTS: SeedPost[] = [
  {
    file: "meme_cat.png",
    author: "agung_memes",
    caption: "Kucing ini lebih ganteng dari 90% pengguna SkelzHub, no debat #meme #SkelzHub",
  },
  {
    file: "meme_doge.png",
    author: "agung_memes",
    caption: "Face ketika dosen bilang 'materi ini gampang banget kok' #relate #meme",
  },
  {
    file: "meme_coffee_cat.png",
    author: "budi_gaming",
    caption: "Senin pagi: butuh kopi 10 liter sebelum meeting pertama #worklife #senyinimilan",
  },
  {
    file: "meme_hamster.png",
    author: "agung_memes",
    caption: "Dia makan lebih semangat dibanding semangat kalian deadline #meme #lookatthis",
  },
  {
    file: "meme_duck.png",
    author: "rina.kuliner",
    caption: "Bebek ini lebih enjoy menjalani hidup daripada aku #summer #mood",
  },
  {
    file: "cafe.png",
    author: "rina.kuliner",
    caption: "Iced coffee + croissant = combo produktifitas maksimal #cafehopping #estetik #SkelzHub",
  },
  {
    file: "bali.png",
    author: "sari.travels",
    caption: "Golden hour di Bali tidak pernah mengecewakan #travel #bali #wanderlust",
  },
  {
    file: "mountain.png",
    author: "sari.travels",
    caption: "Sunrise di atas lautan awan, rinjani 3.726 mdpl #hiking #gunung #adventure",
  },
  {
    file: "neon.png",
    author: "dewa.lens",
    caption: "Kota tidak pernah tidur, begitu juga lensaku #streetphotography #neon #urban",
  },
  {
    file: "nasgor.png",
    author: "rina.kuliner",
    caption: "Nasi goreng spesial + telur mata sapi + kerupuk = kesempurnaan #nasigoreng #kuliner #resep",
  },
  {
    file: "lofi.png",
    author: "putri.estetik",
    caption: "Rainy day, hot coffee, and lofi beats to relax to #cozy #lofi #hujansantai",
  },
  {
    file: "skate.png",
    author: "joji.skate",
    caption: "Kickflip saat golden hour #skateboarding #yogyakarta #session",
  },
];

// Post dari akun admin skelz
const ADMIN_POSTS: SeedPost[] = [
  {
    file: "neon.png",
    author: "skelz",
    caption: "Selamat datang di SkelzHub! Tempatnya kreator Indonesia bersinar. Tetap sopan, tetap seru. — Skelz #SkelzHub",
  },
  {
    file: "meme_duck.png",
    author: "skelz",
    caption: "Admin juga manusia, kadang suka meme bebek santuy #SkelzHub #adminmode",
  },
];

// Video Shorts seed (file lokal 720x1280 hasil ffmpeg — biar jalan tanpa internet)
type SeedShort = {
  file: string;
  author: string;
  caption: string;
};

const SHORTS: SeedShort[] = [
  {
    file: "short1.mp4",
    author: "budi_gaming",
    caption: "Saat temen bilang 'gas main rank' padahal koneksi 1 bar #gaming #shorts",
  },
  {
    file: "short4.mp4",
    author: "joji.skate",
    caption: "POV: jalan-jalan sore sambil cari spot skate baru #skate #shorts #vibes",
  },
  {
    file: "short5.mp4",
    author: "agung_memes",
    caption: "Aku kalau disuruh maju presentasi vs kalau disuruh makan gratis #meme #shorts",
  },
  {
    file: "short3.mp4",
    author: "sari.travels",
    caption: "Buka jendela kamar, eh ternyata alam masih ada. Jalan-jalan yuk! #travel #shorts",
  },
  {
    file: "short2.mp4",
    author: "putri.estetik",
    caption: "Estetika PAGI yang bikin melting bukan cuman es kopi #lofi #cozy #shorts",
  },
];

const COMMENTS = [
  "Wkwkwk kocak banget",
  "Ini mah premium quality content",
  "Gila keren parah",
  "Save dulu, nanti ditonton lagi",
  "Komen pertama! Minjem bensin dong",
  "Aku bisa lihat ini 1000 kali sehari",
  "Level berikutnya: viral ke semua orang",
  "Mantap jiwa, langsung follow akunnya",
  "Ini konten yang aku cari selama ini",
  "Kak jangan berhenti posting please",
  "Terlalu estetik untuk mataku",
  "Spot ini dimana ya? destination goals banget",
  "Resepnya dong kak",
  "No debat, ini post terbaik hari ini",
  "Kamera apa ini takenya sejernih itu?",
  "Sekali lihat langsung double like",
  "Captionnya lebih kocak dari gambarnya wkwk",
  "Ni bakal jadi meme abadi era ini",
  "Gila vibes-nya kirim ke seluruh grup",
  "Butuh konten seperti ini untuk healing",
  "Eksekusi rapi banget, salut sama yang bikin",
  "Yang scroll lewat padahal ga like, rugi",
  "Aku yang gak bisa apa-apa cuma bisa kagum",
  "Followed! dasar konten berkualitas",
];

function detectMime(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 6 && buffer.subarray(0, 6).toString("ascii") === "GIF89a" || buffer.subarray(0, 6).toString("ascii") === "GIF87a") return "image/gif";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return "image/jpeg";
}

async function main() {
  console.log("Seeding SkelzHub...");

  // PENTING: kalau database SUDAH berisi user (mis. kamu menjalankan ulang
  // scripts/setup-cockroach.ts untuk UPDATE fitur baru), jangan hapus/isi ulang —
  // data asli kamu (user, post, DM, dll.) harus tetap aman.
  const existingUsers = await db.user.count();
  if (existingUsers > 0) {
    console.log(
      `   Database sudah berisi ${existingUsers} user — konten demo DILEWATI supaya data kamu tidak terhapus.`
    );
    return;
  }

  // Bersihkan data lama (hanya jalan di database yang masih kosong / fresh install)
  await db.notification.deleteMany();
  await db.report.deleteMany();
  await db.comment.deleteMany();
  await db.like.deleteMany();
  await db.saved.deleteMany();
  await db.follow.deleteMany();
  await db.post.deleteMany();
  await db.media.deleteMany();
  await db.user.deleteMany();

  // Users
  const users: Record<string, { id: string; username: string }> = {};
  for (const u of USERS) {
    const user = await db.user.create({
      data: {
        username: u.username,
        email: u.email,
        displayName: u.displayName,
        bio: u.bio,
        avatarColor: u.avatarColor,
        password: hashPassword(u.password),
        role: u.role ?? "USER",
      },
    });
    users[u.username] = { id: user.id, username: user.username };
  }
  console.log(`   [OK] ${USERS.length} user dibuat — ADMIN: skelz/skelz123, lainnya: password123`);

  // ---- Post gambar ----
  if (!existsSync(SEED_DIR)) {
    throw new Error(`Folder seed tidak ada: ${SEED_DIR}`);
  }
  const files = (await readdir(SEED_DIR)).filter((f) => f.endsWith(".png") || f.endsWith(".jpg") || f.endsWith(".jpeg") || f.endsWith(".webp"));

  type SeededPost = { id: string; authorUsername: string; createdAt: Date };
  const postIds: SeededPost[] = [];
  const now = Date.now();
  let index = 0;
  for (const spec of [...ADMIN_POSTS, ...POSTS]) {
    if (!files.includes(spec.file)) {
      console.warn(`   [SKIP] ${spec.file} belum ada`);
      continue;
    }
    const buffer = await readFile(join(SEED_DIR, spec.file));
    const media = await db.media.create({
      data: { mimeType: detectMime(buffer), kind: "IMAGE", data: buffer.toString("base64") },
    });
    const author = users[spec.author];
    if (!author) continue;
    const createdAt = new Date(now - (POSTS.length + ADMIN_POSTS.length - index) * 31 * 3600 * 1000 - Math.floor(rand() * 5 * 3600 * 1000));
    const post = await db.post.create({
      data: { caption: spec.caption, mediaId: media.id, type: "IMAGE", authorId: author.id, createdAt },
    });
    postIds.push({ id: post.id, authorUsername: spec.author, createdAt });
    index++;
  }
  console.log(`   [OK] ${postIds.length} post gambar dibuat`);

  // ---- Post video Shorts (file lokal, disimpan base64) ----
  const SHORTS_DIR = join(__dirname, "..", "assets", "seed-videos");
  const shortIds: SeededPost[] = [];
  for (let i = 0; i < SHORTS.length; i++) {
    const spec = SHORTS[i];
    const author = users[spec.author];
    if (!author) continue;
    const videoPath = join(SHORTS_DIR, spec.file);
    if (!existsSync(videoPath)) {
      console.warn(`   [SKIP] ${spec.file} belum ada`);
      continue;
    }
    const buffer = await readFile(videoPath);
    const media = await db.media.create({
      data: { mimeType: "video/mp4", kind: "VIDEO", data: buffer.toString("base64"), externalUrl: null },
    });
    const createdAt = new Date(now - (SHORTS.length - i) * 7 * 3600 * 1000 - Math.floor(rand() * 3600 * 1000));
    const post = await db.post.create({
      data: { caption: spec.caption, mediaId: media.id, type: "VIDEO", authorId: author.id, createdAt },
    });
    shortIds.push({ id: post.id, authorUsername: spec.author, createdAt });
  }
  console.log(`   [OK] ${shortIds.length} video Shorts dibuat`);

  const allPosts = [...postIds, ...shortIds];
  const userIds = Object.values(users).map((u) => u.id);
  const usernames = Object.values(users).map((u) => u.username);

  // ---- Likes + notifikasi like ----
  let likeCount = 0;
  for (const p of allPosts) {
    const likers = [...userIds].filter(() => rand() < 0.75);
    for (const uid of likers) {
      await db.like.create({ data: { userId: uid, postId: p.id } });
      likeCount++;
    }
  }
  console.log(`   [OK] ${likeCount} like dibuat`);

  // ---- Komentar + notifikasi komentar ----
  let commentCount = 0;
  for (const p of allPosts) {
    const n = 2 + Math.floor(rand() * 5);
    for (let i = 0; i < n; i++) {
      const commenter = pick(usernames.filter((u) => u !== p.authorUsername));
      const uid = users[commenter].id;
      const createdAt = new Date(now - Math.floor(rand() * 20 * 3600 * 1000));
      const text = pick(COMMENTS);
      await db.comment.create({ data: { text, userId: uid, postId: p.id, createdAt } });
      commentCount++;
    }
  }
  console.log(`   [OK] ${commentCount} komentar dibuat`);

  // ---- Follow + notifikasi follow ----
  const memeLord = "agung_memes";
  let followCount = 0;
  for (const follower of usernames) {
    if (follower === memeLord) continue;
    await db.follow.create({ data: { followerId: users[follower].id, followingId: users[memeLord].id } });
    followCount++;
  }
  for (const a of usernames) {
    for (const b of usernames) {
      if (a === b || b === memeLord) continue;
      if (rand() < 0.45) {
        await db.follow
          .create({ data: { followerId: users[a].id, followingId: users[b].id } })
          .catch(() => null);
        followCount++;
      }
    }
  }
  console.log(`   [OK] ${followCount} relasi follow dibuat`);

  // ---- Saved: beberapa user menyimpan post favorit ----
  for (let i = 0; i < 3 && i < postIds.length; i++) {
    const p = postIds[Math.floor(rand() * postIds.length)];
    await db.saved.create({ data: { userId: users["agung_memes"].id, postId: p.id } }).catch(() => null);
  }
  await db.saved.create({ data: { userId: users["skelz"].id, postId: postIds[0]?.id ?? "" } }).catch(() => null);
  console.log("   [OK] Post tersimpan untuk beberapa user contoh");

  // ---- Notifikasi (rekap interaksi, beberapa belum dibaca) ----
  // Ambil interaksi terbaru per user penerima
  const notifLikes = await db.like.findMany({
    orderBy: { createdAt: "desc" },
    take: 120,
    select: { userId: true, postId: true },
  });
  for (const l of notifLikes) {
    const post = await db.post.findUnique({ where: { id: l.postId }, select: { authorId: true } });
    if (!post || post.authorId === l.userId) continue;
    await db.notification.create({
      data: {
        userId: post.authorId,
        actorId: l.userId,
        type: "LIKE",
        postId: l.postId,
        read: rand() < 0.5,
        createdAt: new Date(now - Math.floor(rand() * 30 * 3600 * 1000)),
      },
    });
  }
  const notifComments = await db.comment.findMany({
    orderBy: { createdAt: "desc" },
    take: 80,
    select: { userId: true, postId: true, text: true, createdAt: true },
  });
  for (const c of notifComments) {
    const post = await db.post.findUnique({ where: { id: c.postId }, select: { authorId: true } });
    if (!post || post.authorId === c.userId) continue;
    await db.notification.create({
      data: {
        userId: post.authorId,
        actorId: c.userId,
        type: "COMMENT",
        postId: c.postId,
        commentText: c.text.slice(0, 120),
        read: rand() < 0.5,
        createdAt: c.createdAt,
      },
    });
  }
  const notifFollows = await db.follow.findMany({
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { followerId: true, followingId: true },
  });
  for (const f of notifFollows) {
    await db.notification.create({
      data: {
        userId: f.followingId,
        actorId: f.followerId,
        type: "FOLLOW",
        read: rand() < 0.5,
        createdAt: new Date(now - Math.floor(rand() * 30 * 3600 * 1000)),
      },
    });
  }
  console.log("   [OK] Notifikasi dibuat dari interaksi");

  // ---- Laporan konten (untuk antrean admin) ----
  const reportSpecs: { postId: string; reporter: string; reason: string; status: string }[] = [
    {
      postId: shortIds[2]?.id ?? postIds[1].id,
      reporter: "sari.travels",
      reason: "Konten kurang pantas untuk audiens muda, mohon ditinjau",
      status: "PENDING",
    },
    {
      postId: postIds[1].id,
      reporter: "putri.estetik",
      reason: "Kemungkinan spam promosi di kolom komentar",
      status: "PENDING",
    },
    {
      postId: postIds[3].id,
      reporter: "budi_gaming",
      reason: "Duplikat post dari akun lain",
      status: "PENDING",
    },
    {
      postId: postIds[6].id,
      reporter: "joji.skate",
      reason: "Salah kategori, ini bukan konten travel",
      status: "DISMISSED",
    },
  ];
  for (const r of reportSpecs) {
    if (!r.postId) continue;
    await db.report
      .create({
        data: {
          postId: r.postId,
          reporterId: users[r.reporter].id,
          reason: r.reason,
          status: r.status,
          resolvedAt: r.status === "PENDING" ? null : new Date(now - 5 * 3600 * 1000),
        },
      })
      .catch(() => null);
  }
  console.log(`   [OK] ${reportSpecs.length} laporan dibuat (3 pending untuk admin tinjau)`);

  // ---- Story (24 jam) — biar rail story langsung hidup ----
  const storySpecs = [
    { file: "lofi.png", author: "putri.estetik", caption: "Sore lofi di kafe langanan ✨" },
    { file: "cafe.png", author: "rina.kuliner", caption: "Brunch hari ini: croissant + latte" },
    { file: "bali.png", author: "sari.travels", caption: "Golden hour di Uluwatu 🌅" },
    { file: "meme_cat.png", author: "agung_memes", caption: "" },
  ];
  for (const s of storySpecs) {
    if (!files.includes(s.file)) continue;
    const buffer = await readFile(join(SEED_DIR, s.file));
    const media = await db.media.create({
      data: { mimeType: detectMime(buffer), kind: "IMAGE", data: buffer.toString("base64") },
    });
    await db.story.create({
      data: {
        authorId: users[s.author].id,
        mediaId: media.id,
        caption: s.caption,
        createdAt: new Date(now - Math.floor(rand() * 6 * 3600 * 1000)),
        expiresAt: new Date(now + 20 * 3600 * 1000),
      },
    });
  }
  console.log(`   [OK] ${storySpecs.length} story 24-jam dibuat`);

  console.log("Seed selesai!");
}

main()
  .catch((err) => {
    console.error("Seed gagal:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

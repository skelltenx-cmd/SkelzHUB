// SkelzHub — Isi konten awal OTOMATIS saat database produksi masih kosong.
// (Porting scripts/seed.ts ke runtime server; dipanggil dari db-setup.ts.)
//
// AMAN DIULANG: hanya jalan kalau tabel User masih kosong — data user nyata
// tidak pernah ditimpa. Semua akun demo: skelz/skelz123 (ADMIN), lainnya
// password123.

import type { PrismaClient } from "@prisma/client";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { hashPassword } from "./password";

// RNG deterministik (urutan panggilan sama dengan scripts/seed.ts) supaya
// konten awal yang dibuat identik dengan versi lokal.
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

const SEED_DIR = join(process.cwd(), "assets", "seed");
const SHORTS_DIR = join(process.cwd(), "assets", "seed-videos");

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

type SeedPost = { file: string; author: string; caption: string };

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

type SeedShort = { file: string; author: string; caption: string };

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
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "image/png";
  if (buffer.length >= 6 && buffer.subarray(0, 6).toString("ascii") === "GIF89a" || buffer.subarray(0, 6).toString("ascii") === "GIF87a")
    return "image/gif";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP")
    return "image/webp";
  return "image/jpeg";
}

/**
 * Isi database produksi yang masih kosong. Paralel supaya selesai cepat
 * (serverless punya batas waktu per request).
 */
export async function seedDatabase(db: PrismaClient): Promise<void> {
  if (!existsSync(SEED_DIR)) {
    console.warn(`[seed] Folder aset konten awal tidak ada: ${SEED_DIR} — konten awal dilewati.`);
    return;
  }
  const files = (await readdir(SEED_DIR)).filter(
    (f) => f.endsWith(".png") || f.endsWith(".jpg") || f.endsWith(".jpeg") || f.endsWith(".webp")
  );

  const now = Date.now();

  // ---- Users (paralel) ----
  const userRows = await Promise.all(
    USERS.map((u) =>
      db.user.create({
        data: {
          username: u.username,
          email: u.email,
          displayName: u.displayName,
          bio: u.bio,
          avatarColor: u.avatarColor,
          password: hashPassword(u.password),
          role: u.role ?? "USER",
        },
      })
    )
  );
  const users: Record<string, string> = {};
  USERS.forEach((u, i) => (users[u.username] = userRows[i].id));
  console.log(`[seed] ${USERS.length} user dibuat — ADMIN: skelz/skelz123`);

  // ---- Media gambar (paralel) ----
  const imageSpecs = [...ADMIN_POSTS, ...POSTS].filter((s) => files.includes(s.file));
  const imageBuffers = await Promise.all(
    imageSpecs.map((s) => readFile(join(SEED_DIR, s.file)))
  );
  const imageMedia = await Promise.all(
    imageBuffers.map((buffer) =>
      db.media.create({
        data: { mimeType: detectMime(buffer), kind: "IMAGE", data: buffer.toString("base64") },
      })
    )
  );

  // ---- Media video Shorts (paralel) ----
  const shortSpecs = SHORTS.filter((s) => existsSync(join(SHORTS_DIR, s.file)));
  const shortBuffers = await Promise.all(
    shortSpecs.map((s) => readFile(join(SHORTS_DIR, s.file)))
  );
  const shortMedia = await Promise.all(
    shortBuffers.map((buffer) =>
      db.media.create({
        data: { mimeType: "video/mp4", kind: "VIDEO", data: buffer.toString("base64"), externalUrl: null },
      })
    )
  );

  // ---- Post gambar + Shorts (paralel) ----
  let index = 0;
  type SeededPost = { id: string; authorUsername: string };
  const imagePosts: SeededPost[] = [];
  await Promise.all(
    imageSpecs.map((spec, i) => {
      const author = users[spec.author];
      if (!author) return Promise.resolve(null);
      const createdAt = new Date(
        now - (POSTS.length + ADMIN_POSTS.length - index) * 31 * 3600 * 1000 - Math.floor(rand() * 5 * 3600 * 1000)
      );
      index++;
      return db.post
        .create({ data: { caption: spec.caption, mediaId: imageMedia[i].id, type: "IMAGE", authorId: author, createdAt } })
        .then((p) => {
          imagePosts.push({ id: p.id, authorUsername: spec.author });
        });
    })
  );

  const shortPosts: SeededPost[] = [];
  await Promise.all(
    shortSpecs.map((spec, i) => {
      const author = users[spec.author];
      if (!author) return Promise.resolve(null);
      const createdAt = new Date(now - (SHORTS.length - i) * 7 * 3600 * 1000 - Math.floor(rand() * 3600 * 1000));
      return db.post
        .create({ data: { caption: spec.caption, mediaId: shortMedia[i].id, type: "VIDEO", authorId: author, createdAt } })
        .then((p) => {
          shortPosts.push({ id: p.id, authorUsername: spec.author });
        });
    })
  );
  const allPosts = [...imagePosts, ...shortPosts];
  console.log(`[seed] ${allPosts.length} post (gambar + Shorts) dibuat`);

  const userIds = Object.values(users);
  const usernames = Object.keys(users);

  // ---- Likes (keputusan random dulu agar urutan RNG sama, lalu paralel) ----
  const likeSpecs: { userId: string; postId: string }[] = [];
  for (const p of allPosts) {
    const likers = [...userIds].filter(() => rand() < 0.75);
    for (const uid of likers) likeSpecs.push({ userId: uid, postId: p.id });
  }
  await Promise.all(
    likeSpecs.map((l) => db.like.create({ data: l }).catch(() => null))
  );

  // ---- Komentar ----
  const commentSpecs: { userId: string; postId: string; text: string; createdAt: Date }[] = [];
  for (const p of allPosts) {
    const n = 2 + Math.floor(rand() * 5);
    for (let i = 0; i < n; i++) {
      const commenter = pick(usernames.filter((u) => u !== p.authorUsername));
      commentSpecs.push({
        userId: users[commenter],
        postId: p.id,
        text: pick(COMMENTS),
        createdAt: new Date(now - Math.floor(rand() * 20 * 3600 * 1000)),
      });
    }
  }
  await Promise.all(
    commentSpecs.map((c) => db.comment.create({ data: c }).catch(() => null))
  );
  console.log(`[seed] ${likeSpecs.length} like + ${commentSpecs.length} komentar dibuat`);

  // ---- Follow ----
  const followSpecs: { followerId: string; followingId: string }[] = [];
  const memeLord = "agung_memes";
  for (const follower of usernames) {
    if (follower === memeLord) continue;
    followSpecs.push({ followerId: users[follower], followingId: users[memeLord] });
  }
  for (const a of usernames) {
    for (const b of usernames) {
      if (a === b || b === memeLord) continue;
      if (rand() < 0.45) followSpecs.push({ followerId: users[a], followingId: users[b] });
    }
  }
  await Promise.all(
    followSpecs.map((f) => db.follow.create({ data: f }).catch(() => null))
  );

  // ---- Saved ----
  await Promise.all([
    ...Array.from({ length: 3 }).map(() => {
      const p = imagePosts[Math.floor(rand() * imagePosts.length)];
      return db.saved.create({ data: { userId: users["agung_memes"], postId: p.id } }).catch(() => null);
    }),
    db.saved.create({ data: { userId: users["skelz"], postId: imagePosts[0]?.id ?? "" } }).catch(() => null),
  ]);

  // ---- Notifikasi dari interaksi (dibangun dari data di memori — tanpa query ulang) ----
  const notifSpecs: {
    userId: string;
    actorId: string;
    type: string;
    postId?: string;
    commentText?: string;
    read: boolean;
    createdAt: Date;
  }[] = [];
  const postAuthor: Record<string, string> = {};
  for (const p of allPosts) postAuthor[p.id] = users[p.authorUsername];
  for (const l of likeSpecs) {
    const authorId = postAuthor[l.postId];
    if (!authorId || authorId === l.userId) continue;
    notifSpecs.push({
      userId: authorId,
      actorId: l.userId,
      type: "LIKE",
      postId: l.postId,
      read: rand() < 0.5,
      createdAt: new Date(now - Math.floor(rand() * 30 * 3600 * 1000)),
    });
  }
  for (const c of commentSpecs) {
    const authorId = postAuthor[c.postId];
    if (!authorId || authorId === c.userId) continue;
    notifSpecs.push({
      userId: authorId,
      actorId: c.userId,
      type: "COMMENT",
      postId: c.postId,
      commentText: c.text.slice(0, 120),
      read: rand() < 0.5,
      createdAt: c.createdAt,
    });
  }
  for (const f of followSpecs) {
    notifSpecs.push({
      userId: f.followingId,
      actorId: f.followerId,
      type: "FOLLOW",
      read: rand() < 0.5,
      createdAt: new Date(now - Math.floor(rand() * 30 * 3600 * 1000)),
    });
  }
  await Promise.all(
    notifSpecs.map((n) => db.notification.create({ data: n }).catch(() => null))
  );

  // ---- Laporan untuk antrean admin ----
  const reportSpecs: { postId: string; reporterId: string; reason: string; status: string }[] = [
    {
      postId: shortPosts[2]?.id ?? imagePosts[1]?.id ?? "",
      reporterId: users["sari.travels"],
      reason: "Konten kurang pantas untuk audiens muda, mohon ditinjau",
      status: "PENDING",
    },
    {
      postId: imagePosts[1]?.id ?? "",
      reporterId: users["putri.estetik"],
      reason: "Kemungkinan spam promosi di kolom komentar",
      status: "PENDING",
    },
    {
      postId: imagePosts[3]?.id ?? "",
      reporterId: users["budi_gaming"],
      reason: "Duplikat post dari akun lain",
      status: "PENDING",
    },
    {
      postId: imagePosts[6]?.id ?? "",
      reporterId: users["joji.skate"],
      reason: "Salah kategori, ini bukan konten travel",
      status: "DISMISSED",
    },
  ];
  await Promise.all(
    reportSpecs
      .filter((r) => r.postId)
      .map((r) =>
        db.report
          .create({
            data: {
              postId: r.postId,
              reporterId: r.reporterId,
              reason: r.reason,
              status: r.status,
              resolvedAt: r.status === "PENDING" ? null : new Date(now - 5 * 3600 * 1000),
            },
          })
          .catch(() => null)
      )
  );

  // ---- Story 24 jam ----
  const storySpecs = [
    { file: "lofi.png", author: "putri.estetik", caption: "Sore lofi di kafe langanan ✨" },
    { file: "cafe.png", author: "rina.kuliner", caption: "Brunch hari ini: croissant + latte" },
    { file: "bali.png", author: "sari.travels", caption: "Golden hour di Uluwatu 🌅" },
    { file: "meme_cat.png", author: "agung_memes", caption: "" },
  ].filter((s) => files.includes(s.file));
  await Promise.all(
    storySpecs.map((s) =>
      readFile(join(SEED_DIR, s.file)).then((buffer) =>
        db.media
          .create({ data: { mimeType: detectMime(buffer), kind: "IMAGE", data: buffer.toString("base64") } })
          .then((media) =>
            db.story.create({
              data: {
                authorId: users[s.author],
                mediaId: media.id,
                caption: s.caption,
                createdAt: new Date(now - Math.floor(rand() * 6 * 3600 * 1000)),
                expiresAt: new Date(now + 20 * 3600 * 1000),
              },
            })
          )
      )
    )
  );
  console.log(`[seed] ${storySpecs.length} story dibuat`);
}

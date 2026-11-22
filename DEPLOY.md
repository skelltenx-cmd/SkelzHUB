# Panduan Deploy SkelzHub ke Vercel

Aplikasi Next.js 16 + Prisma. **Database sekarang memasang diri sendiri**:
begitu `DATABASE_URL` produksi diisi, semua tabel + konten awal (akun admin
`skelz`, user contoh, post, Shorts, story) dibuat OTOMATIS saat web pertama
diakses. Tidak perlu `prisma db push` atau script apa pun di komputer.

> Login admin bawaan: **`skelz` / `skelz123`** (kode verifikasi tampil di layar
> kalau email belum dikonfigurasi). Segera ganti password admin setelah deploy.

---

## Cara 1 — Database bawaan Vercel (PALING GAMPANG, ±3 menit)

1. Buka [vercel.com](https://vercel.com) → klik project **SkelzHub**.
2. Klik tab **Storage** (menu atas) → **Create Database** → pilih **Postgres (Neon)**.
3. Klik **Create** → tunggu sampai status *Connected to project*
   (koneksi database otomatis dipasang sebagai `DATABASE_URL`).
4. Tab **Deployments** → klik menu `...` di deploy paling atas → **Redeploy**.
5. Tunggu ±3 menit, lalu buka web — konten muncul otomatis.

Selesai. Kalau mau memastikan: buka `https://www.skelzhub.my.id/api/health` →
harus tampil `"ok": true` beserta jumlah user dan post.

---

## Cara 2 — CockroachDB Serverless (gratis 10GiB, ±7 menit)

1. Daftar [cockroachlabs.com/cloud/signup](https://cockroachlabs.com/cloud/signup)
   (paket **FREE / 10GiB**, tanpa kartu kredit) → **Create cluster**.
2. Klik **Connect** → buat user + password kalau diminta → pilih
   **General connection string** → **Copy** (bentuknya
   `postgresql://user:password@host:26257/defaultdb?sslmode=verify-full`).
3. Vercel → project SkelzHub → **Settings → Environment Variables**:
   - Key: `DATABASE_URL`
   - Value: connection string tadi (tempel apa adanya — aplikasi membersihkan otomatis)
   - Environment: centang **Production**, **Preview**, **Development** → **Save**.
4. Tab **Deployments** → deploy teratas → menu `...` → **Redeploy**.
5. Buka web → konten muncul otomatis dalam 1–2 menit pertama.

---

## Sudah deploy sebelumnya? (update ke versi baru)

1. Push kode terbaru ke GitHub (`git push`) → Vercel deploy otomatis, ATAU
   Deployments → `...` → **Redeploy**.
2. Pastikan `DATABASE_URL` sudah diisi (Cara 1 atau 2 di atas) —
   **nilai lama `file:db/custom.db` WAJIB diganti** dengan connection string baru.

---

## Setelah Deploy (checklist)

- [ ] Buka web → feed, Explore, dan Shorts tampil.
- [ ] Login `skelz` / `skelz123` (kode 2FA tampil di layar kalau email belum diset).
- [ ] **Ganti password admin** dari komputer lokal:
  ```bash
  DATABASE_URL="<connection string produksi>" bun scripts/change-password.ts skelz PasswordBaruKuat123
  ```
- [ ] (Sangat disarankan) Aktifkan **Cloudflare R2** — panduan lengkap di bawah.
- [ ] (Opsional) custom domain: Vercel → **Settings → Domains**.

---

## Bonus: Cloudflare R2 — upload tanpa batas + media super cepat (GRATIS 10GB)

Media (foto/video story, Shorts, post, avatar, lampiran chat) secara default
disimpan di database sebagai base64. Dengan **Cloudflare R2**:

- Upload langsung dari browser ke R2 — file sampai **5GB** per unggahan.
- Media dilayani dari CDN Cloudflare (edge global) → buka story/Shorts nyaris instan.
- 10GB pertama gratis + **egress (data keluar) GRATIS selamanya**.
- Tanpa R2 semuanya tetap jalan (fallback otomatis ke jalur database).

### Langkah

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **R2 Object Storage** → **Create bucket** (mis. `skelzhub-media`).
2. Tab **Settings** bucket → **Public Access** → **Allow Access** (copy URL `https://pub-xxxx.r2.dev`).
3. Bagian **CORS Policy** (masih tab Settings) → tambahkan:
   ```json
   [
     {
       "AllowedOrigins": ["*"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
4. Profil (kanan atas) → **My Profile → API Tokens → Create Token** → template **R2** →
   pilih bucket tadi → copy **Access Key ID** + **Secret Access Key**; **Account ID** ada
   di dashboard R2.
5. Vercel → **Settings → Environment Variables** → tambah (Environment: Production + Preview):

   | Key | Value |
   |---|---|
   | `R2_ACCOUNT_ID` | Account ID |
   | `R2_ACCESS_KEY_ID` | Access Key ID |
   | `R2_SECRET_ACCESS_KEY` | Secret Access Key |
   | `R2_BUCKET` | `skelzhub-media` |
   | `R2_PUBLIC_URL` | `https://pub-xxxx.r2.dev` |

6. Deployments → `...` → **Redeploy**. Cek: buka `/api/upload/r2-presign` → `{"enabled":true}`.

---

## Troubleshooting

| Gejala | Sebab & solusi |
|---|---|
| Halaman kosong / login error "Terjadi kesalahan pada server" | `DATABASE_URL` belum diset / masih `file:db/custom.db`. Isi sesuai Cara 1 / Cara 2 lalu **Redeploy**. Cek `/api/health` untuk detail. |
| `/api/health` tampil `"ok": false` + error `P1001` | Connection string salah ketik / password user database salah — copy ulang dari dashboard penyedia database. |
| Feed tampil tapi lambat saat pertama dibuka setelah deploy | Normal — tabel + konten awal sedang dibuat otomatis (sekali saja). Tunggu ±1 menit lalu muat ulang. |
| Gagal login setelah ganti password | Memang sengaja — ganti password mencabut semua session lama. Login ulang. |
| Upload video gagal "maksimal 4MB" | Jalur database dibatasi body serverless ±4.5MB; aktifkan R2 (gratis) untuk unggahan sampai 5GB. |
| Error `too many connections` (CockroachDB) | Sudah ditangani otomatis (`connection_limit=1`); kalau masih muncul, tambahkan `&connection_limit=1` manual di akhir connection string. |

## Catatan teknis

- Mode lokal tetap SQLite: `.env` → `DATABASE_URL=file:db/custom.db`.
- Provider Prisma diganti otomatis saat build Vercel (`scripts/prepare-db.mjs`)
  sesuai isi `DATABASE_URL` — tidak ada lagi langkah manual ganti `schema.prisma`.
- Schema/tabel produksi dibuat idempoten oleh `src/lib/db-setup.ts`
  (aman untuk CockroachDB v26 yang mengunci tabel baru — `schema_locked`).
- Data akun/post yang dulu dibuat di mode demo SQLite tidak bisa dipindahkan
  (mode itu memang menyimpan sementara). Dengan database permanen sekarang,
  semua data baru tersimpan selamanya.

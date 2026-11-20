# PANDUAN LENGKAP PEMULA — SkelzHub dari Nol sampai Online

Target: web SkelzHub kamu live di internet, gratis, dengan database permanen (CockroachDB).
Waktu total: **±20–30 menit**. Tidak perlu pengalaman coding sama sekali — tinggal ikuti urutannya.

## Kenalan dulu (biar gak bingung)

Aplikasi SkelzHub sudah jadi 100%. Yang kamu lakukan sekarang cuma "menempel" 3 hal:

1. **CockroachDB** = gudang penyimpanan data di internet (gratis 10GB) — tempat nyimpen akun, post, komentar.
2. **GitHub** = tempat nyimpen file kode aplikasi kamu.
3. **Vercel** = mesin yang menjalankan web 24 jam supaya orang lain bisa buka lewat link.

**Connection string** = "alamat + kunci pintu" ke gudang CockroachDB. Kamu akan copy-paste kode ini beberapa kali.

---

## BAGIAN 0 — Persiapan (2 menit)

Yang perlu ada:

- [ ] Komputer + internet
- [ ] Akun Google (untuk CockroachDB)
- [ ] Akun **GitHub** — kalau belum: daftar gratis di [github.com/signup](https://github.com/signup) (username, email, password, selesai)
- [ ] Akun **Vercel** — kalau belum: daftar di [vercel.com/signup](https://vercel.com/signup) (nanti bisa login pakai GitHub)
- [ ] **Node.js terpasang di komputer**: buka Command Prompt (tombol Windows → ketik `cmd` → Enter) → ketik `node --version` → kalau muncul tulisan `v20.x.x` artinya sudah ada. Kalau muncul error "tidak dikenali": download **LTS** dari [nodejs.org](https://nodejs.org) → install → next-next-finish.
- [ ] **File project SkelzHub** di komputermu (unduh/export dari sandbox tempat web ini dibuat, lalu ekstrak zip-nya ke folder, mis. `D:\skelzhub`).

### Cara buka terminal DI DALAM folder project (dipakai terus nanti)

**Windows (paling gampang):** buka folder project di File Explorer → klik sekali kotak alamat (address bar) di atas → ketik `cmd` → tekan Enter → muncul jendela hitam yang sudah "berada" di folder project.
**Mac:** buka Terminal → ketik `cd ` lalu seret folder project ke jendela Terminal → Enter.

---

## BAGIAN 1 — Buat database CockroachDB (5 menit)

1. Buka [cockroachlabs.com/cloud/signup](https://cockroachlabs.com/cloud/signup).
2. Klik **Sign in with Google** → pilih akun Google kamu → Allow.
3. Kalau dimisi nama/organisasi, isi bebas (mis. nama kamu) → **Get started**.
4. Muncul halaman **Create your cluster** → pilih plan **Serverless** (yang bertuliskan **FREE / 10GiB storage**). **Jangan** pilih Standard/Dedicated (berbayar).
5. Region: biarkan default (atau pilih terdekat, mis. Singapore) → klik **Create cluster**.
6. Tunggu 1–2 menit sampai cluster selesai dibuat.
7. Klik tombol **Connect** (biasanya kanan atas, atau di panel "Actions").
8. Kalau diminta membuat **SQL user + password**:
   - Username: `skelz`
   - Password: bikin yang mudah kamu ingat, mis. `GudangSaya123`
   - **CATAT DI NOTEPAD** — kalau lupa tidak bisa dilihat lagi.
   - Klik **Create user / Next**.
9. Pilih opsi **General connection string** → klik **Copy**.
10. Tempel di notepad. Bentuknya kira-kira:
    ```
    postgresql://skelz:GudangSaya123@free-tier12-xyz.gcp-asia-southeast1.crdb.cloud:26257/defaultdb?sslmode=verify-full
    ```

Mulai sekarang kode ini saya sebut **KUNCI**. Simpan baik-baok — dipakai 2x (BAGIAN 2 & 4).

---

## BAGIAN 2 — Sambungkan SkelzHub ke database (5–10 menit)

1. Buka terminal **di dalam folder project** (lihat cara di BAGIAN 0).
2. Install kebutuhan project — sekali saja, ±3 menit:
   ```bash
   npm install
   ```
   Selesai kalau kursor balik ke baris baru tanpa tulisan error merah.
3. Jalankan **perintah ajaib**:
   ```bash
   npx tsx scripts/setup-cockroach.ts
   ```
   - Kalau muncul `Need to install the following packages: tsx... Ok to proceed? (y)` → ketik **y** → Enter.
4. Script nanya **(1)**: tempel CONNECTION STRING → tempel **KUNCI** kamu → Enter.
5. Script nanya **(2)**: password baru admin `skelz` (min. 6 karakter) → ketik password baru → Enter.
   **CATAT** — ini password login admin di web kamu nanti!
6. Muncul "Rencana setup" → ketik **y** → Enter.
7. Tunggu (±2 menit). Berhasil kalau muncul:
   ```
   ================ SELESAI! ================
   ```

Apa yang barusan terjadi otomatis: setting database project diganti ke CockroachDB, semua tabel dibuat di gudang cloud kamu, konten awal diisi (admin + user contoh + post gambar + Shorts + komentar), akun demo lama dihapus (kalau ada), email admin `skelz` di-set ke **skelltenx@gmail.com**, password admin diganti, dan setting lokal disimpan (file `.env` lama di-backup jadi `.env.backup`).

**Kalau gagal** (`P1001 Can't reach database server`): KUNCI salah ketik / kurang lengkap / password SQL user salah. Copy ulang dari tombol Connect, lalu jalankan lagi dari langkah 3 — script aman diulang.

---

## BAGIAN 3 — Naikkan kode ke GitHub (5 menit)

1. Di terminal, ketik `git --version`. Kalau error → download **Git for Windows** di [git-scm.com](https://git-scm.com) → install default (next-next-finish) → buka ulang `cmd`.
2. Buat repo kosong di GitHub:
   - Buka [github.com](https://github.com) → login → klik tombol hijau **New**
   - Repository name: `skelzhub`
   - Pilih **Public**
   - **JANGAN centang** "Add a README", ".gitignore", "license" (repo harus kosong)
   - Klik **Create repository**
3. Kembali ke terminal (di folder project), ketik satu-satu (Enter tiap baris):
   ```bash
   git add -A
   git commit -m "SkelzHub siap deploy"
   git remote add origin https://github.com/USERNAMEKAMU/skelzhub.git
   git push -u origin main
   ```
   Ganti `USERNAMEKAMU` dengan username GitHub kamu. Kalau diminta login, pilih **Sign in with your browser**.
4. Refresh halaman GitHub → file-file project muncul di repo. Berhasil!

---

## BAGIAN 4 — Deploy ke Vercel (5 menit)

1. Buka [vercel.com/new](https://vercel.com/new) → login **Continue with GitHub**.
2. Klik tombol **Import** pada repo `skelzhub` (atau **Add New → Project** → pilih repo-nya).
3. **JANGAAN langsung klik Deploy!** Scroll ke kotak **Environment Variables** dulu:
   - **Key:** `DATABASE_URL`
   - **Value:** tempel **KUNCI** kamu (sama persis)
   - Klik **Add**
4. Sekarang klik tombol biru besar **Deploy**.
5. Tunggu 2–4 menit (ada progress bar). Selesai = muncul halaman **Congratulations**.

Alamat web kamu: `https://skelzhub-xxxx.vercel.app` — klik **Go to Dashboard → Visit** untuk membuka.

---

## BAGIAN 5 — Uji coba

1. Di web kamu, klik **Masuk**: username `skelz` + password baru (yang dibuat di BAGIAN 2 langkah 5).
2. Cek **Admin Panel** (menu Admin) — statistik, kelola user, hapus post, laporan.
3. Cek **Shorts** — video vertikal, geser ke bawah untuk berikutnya.
4. Coba posting gambar / komentar / like.

Selesai — SkelzHub kamu sudah online!

---

## Kalau macet — tabel pertolongan pertama

| Gejala | Sebab | Solusi |
|---|---|---|
| `node` tidak dikenali di cmd | Node.js belum terpasang | Install LTS dari nodejs.org, buka ulang cmd |
| `P1001 Can't reach database server` | KUNCI salah / password SQL salah | Copy ulang dari tombol Connect, jalankan ulang script |
| `table "..." is locked` / `schema_locked` / error `22023` (termasuk `table "Conversation" is locked`) | Fitur CockroachDB v26 mengunci tabel baru otomatis; console SQL tidak bisa dipakai untuk membukanya (dia menggabungkan perintah → error 22023) | **Jangan pakai console SQL.** Solusi: unduh ulang `skelzhub-full.zip` versi TERBARU (script terbaru membaca daftar tabel langsung dari schema — termasuk tabel baru DM — lalu membuka kuncinya satu-satu dan push ulang otomatis sampai jalan) → timpa file lama → jalankan ulang `npx tsx scripts/setup-cockroach.ts`. Selesai — tidak perlu buka console CockroachDB sama sekali |
| `not a git repository` saat git add | Folder belum jadi repo | Ketik `git init -b main` dulu, ulangi dari `git add -A` |
| Git minta "tell me who you are" | Git belum kenal kamu | `git config --global user.name "NamaKamu"` dan `git config --global user.email "email@kamu.com"` lalu ulangi commit |
| Push ditolak / minta login | Belum login GitHub | Kalau muncul popup browser, login; atau pakai Personal Access Token sebagai password |
| Web online tapi kosong / error | `DATABASE_URL` salah di Vercel | Vercel → project → Settings → Environment Variables → perbaiki → tab Deployments → ⋯ → Redeploy |
| Upload video gagal | Sudah jarang terjadi — file besar otomatis dikirim bertahap (chunk) sampai video 200MB / gambar 60MB | Kalau masih gagal: cek koneksi internet (file dipecah jadi potongan ±4MB, koneksi putus = ulangi), pastikan file tidak lebih dari 200MB (video) / 60MB (gambar) |
| Login skelz ditolak | Password admin sudah diganti | Pakai password yang kamu buat di BAGIAN 2, bukan `skelz123` |
| Mau login tapi minta "kode verifikasi" | Login sekarang pakai 2 langkah (2FA): setelah password benar, kode 6 digit dikirim ke email akunmu | Kalau email belum diaktifkan (mode demo), kodenya tampil langsung di layar — tinggal ketik. Supaya dikirim ke email asli: set `RESEND_API_KEY` (lihat bagian bawah) |
| Kode verifikasi salah terus-terusan | Kode beda/sudah 10 menit/coba salah 5x | Klik "Kirim ulang kode" untuk minta kode baru |

**Jalan terakhir:** copy-paste tulisan error kamu ke chat — dibantu sampai jalan.

---

## UPDATE deployment yang SUDAH jalan (setelah ada fitur baru)

Kalau web kamu sudah live di Vercel dan ada versi baru (fitur DM, repost, bahasa, dst.):

1. Unduh `skelzhub-full.zip` dari preview → extract → **timpa semua** file lama di folder project kamu.
2. Jalankan di terminal project: `npx tsx scripts/setup-cockroach.ts`
   - Tempel KUNCI (connection string) kamu seperti biasa
   - Password admin: **tekan ENTER saja** (kosong) supaya password lama tidak berubah
   - Script otomatis menambah tabel baru ke database cloud kamu — data lama aman
   - Script juga otomatis: menghapus akun demo lama (kalau ada) + mengisi email admin `skelz` dengan **skelltenx@gmail.com**
3. `git add -A` → `git commit -m "Update fitur"` → `git push` → Vercel otomatis deploy ulang (2-3 menit).

Selesai — fitur baru langsung aktif di web kamu. Kalau `git push` ditolak (`non-fast-forward`),
pakai: `git push --force --set-upstream origin main`.

Versi zip terbaru mencakup: DM lengkap (foto/video/voice, realtime, typing, dibaca),
Story 24 jam, login 2FA kode verifikasi email, lupa password via email, badge Admin,
status online/terakhir aktif, akun demo dihapus, tulisan login/daftar dirapikan.

---

## Aktifkan email ASLI untuk kode verifikasi (SANGAT disarankan)

Login dan "Lupa password?" sekarang memakai **kode verifikasi 6 digit via email**
(supaya akun lebih aman). Secara bawaan berjalan dalam **MODE DEMO**: kode ditampilkan
langsung di layar (supaya tetap bisa dipakai tanpa setup apa pun). Biar kodenya benar-benar
dikirim ke email, pilih SALAH SATU cara di bawah lalu tambahkan env var di Vercel:

**Cara gampang — Resend (gratis 100 email/hari):**
1. Daftar gratis di `resend.com` — **daftar pakai email skelltenx@gmail.com** (email admin kamu).
2. Dashboard → **API Keys** → **Create API Key** → copy kuncinya (awalannya `re_`).
3. Vercel → project kamu → Settings → Environment Variables → tambah:
   - Key: `RESEND_API_KEY`
   - Value: kunci kamu (`re_...`)
4. Tab Deployments → ⋯ → **Redeploy**.

**Alternatif — SMTP (mis. Gmail):**
1. Aktifkan 2FA di akun Google kamu → buat **App Password** (google.com → Security → App passwords).
2. Tambahkan 5 env var di Vercel:
   - `SMTP_HOST` = `smtp.gmail.com`
   - `SMTP_PORT` = `587`
   - `SMTP_USER` = email Gmail kamu
   - `SMTP_PASS` = app password (16 huruf)
   - `SMTP_FROM` = `SkelzHub <email@gmail.com>`
3. Redeploy.

Setelah itu:
- Saat login, kode 6 digit dikirim ke email akun — masukkan kodenya untuk masuk (2FA).
- Saat user klik "Lupa password?", kode reset dikirim ke email asli mereka.
- Login admin `skelz` kodenya dikirim ke **skelltenx@gmail.com** (email admin sudah
  otomatis terpasang oleh script setup).

Tips: tanpa RESEND_API_KEY pun semua fitur tetap jalan — tapi kode tampil di layar
(mode demo), jadi kurang aman untuk web yang sudah dipakai orang lain.

## Aktifkan Cloudflare R2 — upload video BEBAS + tampilan SUPER CEPAT (disarankan)

Tanpa R2, semua foto/video disimpan di database → lama-lama berat dan tampilan media
butuh waktu (makin lama makin lambat). Dengan R2 (penyimpanan Cloudflare, **10GB pertama
gratis, tampilan media tidak pernah bayar**):

- Upload video sampai **5GB** per file (dulu maksimal 200MB).
- Story/Shorts/post **terbuka nyaris instan** karena media dilayani CDN Cloudflare.
- Database tetap ringan → semua halaman makin cepat.

Cara pasangnya (5 langkah klik-klik, ±10 menit, panduan lengkap dengan gambar urutan
ada di `DEPLOY.md` bagian "Bonus: Cloudflare R2"):

1. Daftar **Cloudflare** (gratis) → menu **R2 Object Storage** → **Create bucket** (mis. `skelzhub-media`).
2. Tab Settings bucket → **Public Access** → Allow → copy URL `https://pub-xxxx.r2.dev`.
3. Masih Settings → **CORS Policy** → paste policy dari DEPLOY.md (WAJIB!).
4. Profil → API Tokens → Create Token (template R2, Read and Write) → copy Access Key + Secret.
5. Vercel → Settings → Environment Variables → tambah `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` → Redeploy.

Cek aktif: buka "Buat post" → teks kecil berubah jadi `Video ... hingga 5GB`.

Tanpa R2 semua fitur tetap jalan (upload besar otomatis bertahap) — jadi ini murni upgrade
kecepatan, pasang kapan saja tanpa risiko.

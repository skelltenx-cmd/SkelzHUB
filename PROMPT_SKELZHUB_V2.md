# PROMPT SKELZHUB v2 — REBUILD NATIVE-GRADE (untuk Google AI Studio)

> Cara pakai: buka https://aistudio.google.com, masuk tab **Build**, tempel SELURUH "PROMPT UTAMA" di bawah, lalu Run.
> Jika ingin APK asli (native sejati, bukan PWA), ganti bagian teknologi dengan "VARIANT FLUTTER" di bagian paling akhir file ini.

---

## PROMPT UTAMA (tempel semuanya, dari sini sampai akhir)

Kamu adalah senior mobile engineer sekaligus product designer dengan standar kelas dunia — pengalaman membangun aplikasi sosial skala jutaan pengguna (kelas Instagram / TikTok, kualitas craft tertinggi). Kerjakan misi ini end-to-end: rancangan, arsitektur, sampai kode final yang benar-benar jalan. Jangan bertanya apa pun: jika ada detail yang belum ditentukan, ambil keputusan terbaik ala aplikasi sosial kelas atas dan lanjut sampai selesai.

# MISI — SkelzHUB v2.0 (REBUILD TOTAL)

Bangun ulang SkelzHUB dari nol sebagai aplikasi mobile versi 2.0 — kelanjutan produk sosmed SkelzHUB yang versi web-nya sudah berjalan. Jika di percakapan ini sudah ada kode aplikasi versi sebelumnya, gunakan hanya sebagai referensi fitur; kerjakan ulang dengan struktur baru, performa baru, dan UI baru. Target rebuild:

1. Performa jauh lebih tinggi — terasa native: responsif, mulus 60fps, ringan, hemat memori dan kuota.
2. Struktur proyek baru yang bersih dan modular (bukan struktur lama).
3. Semua fitur lengkap dan benar-benar berfungsi — tanpa placeholder, tanpa tombol mati.
4. UI/UX minimal setara versi web SkelzHUB, dan untuk versi aplikasi harus LEBIH BAGUS lagi: lebih halus, lebih gestural, lebih manusiawi.
5. Ikon aplikasi baru yang jauh lebih bagus + splash screen.

Hasil akhir wajib: aplikasi lengkap, siap dipakai, nol bug yang terlihat.

# 1. KONTEKS PRODUK

SkelzHUB adalah aplikasi media sosial untuk audiens Indonesia dengan fitur inti: feed postingan foto, story 24 jam, reels video pendek, chat realtime (termasuk kirim foto), pencarian global, profil pengguna, dan notifikasi. Versi web sudah ada dan berjalan (backend REST + penyimpanan media). Aplikasi ini memakai backend yang sama lewat konfigurasi API. Jika API belum dikonfigurasi, jalankan MODE DEMO dengan data contoh realistis sehingga semua fitur tetap bisa dicoba end-to-end.

# 2. TEKNOLOGI (WAJIB)

- React 18+ / TypeScript strict / Vite. Styling: Tailwind atau CSS murni — pilih yang paling ringan. DILARANG memakai library UI berat.
- Manfaatkan API browser secara maksimal: IntersectionObserver, ResizeObserver, React.lazy + Suspense, CSS content-visibility, OffscreenCanvas untuk kompresi gambar, encode WebP.
- PWA penuh: manifest, service worker (precache app shell; data stale-while-revalidate; halaman offline yang rapi), installable, theme-color, orientation portrait.
- State management ringan per-feature (pattern store ringan + hooks). Tidak ada global state raksasa.
- Seluruh bahasa antarmuka: Bahasa Indonesia natural, seperti ditulis manusia.

# 3. TARGET PERFORMA (HARD REQUIREMENT)

- Bundle awal di bawah 300KB gzip; route/fitur di-code-split; font memakai system stack (tanpa webfont besar).
- Feed dan reels WAJIB divirtualisasi (windowing): hanya render item yang terlihat plus buffer kecil.
- Gambar: thumbnail kecil untuk feed/grid (dengan blur-up), resolusi penuh hanya saat dibuka; decoding async; skeleton tanpa layout shift.
- Animasi hanya di property transform dan opacity; dilarang menganimasikan property layout saat scroll.
- Bebas memory leak: cleanup semua listener/observer, abort fetch saat unmount, revoke URL.createObjectURL.
- Lighthouse (mobile) minimal 90 di semua kategori; interaksi tetap responsif di perangkat low-end.
- Dark mode dan light mode penuh (toggle manual + ikut sistem).
- Indikator offline halus + toast "Kamu sedang offline — beberapa fitur terbatas".

# 4. DESIGN SYSTEM v2 (IDENTITAS BARU, LEBIH BAGUS)

- Karakter visual: modern, hangat, energik, terasa "manusiawi" — DILARANG terlihat seperti template AI generik dan DILARANG identitas biru/indigo generik.
- Warna: primary gradient #FF6A00 ke #EE1B7A (oranye ke magenta). Netral: gelap #0F1115 / terang #FAFAFA. Semantic sukses/warning/error standar. Kontras minimal AA.
- Bentuk: radius konsisten (scale 4/8/12/16/24), spacing grid 4pt, elevasi halus dengan shadow lembut — bukan border abu kaku di semua kartu.
- Tipografi: Inter atau system-ui; scale jelas (display/h1/h2/body/caption); judul weight 600.
- Format angka dan waktu khas Indonesia: "1,2 rb pengikut", "2 mnt lalu", "5 jam lalu", "Kemarin", "3 hari lalu".
- Komponen inti (dibangun dulu, dipakai di semua layar): Button, IconButton, Chip, Card, BottomSheet (dengan drag handle), Snackbar, Skeleton, EmptyState, ErrorState + tombol coba lagi, Dialog, Avatar (dengan ring story), TabBar, AppBar.
- Navigasi: bottom tab bar 5 slot — Beranda, Cari, Reels, tombol (+) create di tengah yang menonjol, Chat (badge unread), Profil. Wajib safe-area aware (notch dan home bar).
- Micro-interaction: tap scale 0.97, double-tap like dengan animasi hati meledak, pull-to-refresh dengan indikator, transisi antar layar halus (slide/fade 200-250ms).
- Konsistensi dengan versi web: pertahankan pola bahasa visual SkelzHUB (kartu feed, ring story, chat dua panel di desktop), lalu naikkan kelasnya di mobile dengan gesture dan transisi.
- Satu set ikon konsisten (outline 1.5px, gaya lucide) untuk seluruh aplikasi — jangan campur gaya ikon.

# 5. SPESIFIKASI FITUR (SEMUA WAJIB JALAN)

## 5.1 Autentikasi
Login (email/username + password), register (nama, username, email, password + konfirmasi), validasi inline dengan pesan error jelas, toggle lihat password, loading state di tombol, sesi persist + auto-login, logout dengan konfirmasi. Guest boleh melihat feed, tapi aksi sosial harus minta login.

## 5.2 Feed (Beranda)
- Story rail horizontal di atas feed (avatar + ring, lihat 5.4).
- Shortcut composer: kartu "Mau posting apa hari ini?" yang membuka create.
- Kartu postingan: header (avatar + nama + waktu relatif), carousel foto multi (indikator titik, swipe), caption (clamped + "selengkapnya"), baris aksi like/komentar/share/simpan dengan hitungan, preview komentar 1-2.
- Infinite scroll dengan skeleton saat memuat; pull-to-refresh; jika ada postingan baru, muncul pill "Postingan baru" di atas.

## 5.3 Kualitas Media (KRITIS — bug versi lama: foto jadi buram)
Pipeline upload foto untuk postingan, story, dan chat:
- Normalisasi: benarkan orientasi EXIF, batasi sisi terpanjang 2048px (postingan) atau crop cerdas 1080x1920 (story).
- Kompresi cerdas: encode JPEG/WebP kualitas 0.85-0.9, target maksimal 1.5MB per foto. Hasil TIDAK BOLEH blur atau terkompres berat — kualitas mendekati asli tapi file tetap ringan.
- Tampilkan preview hasil + info ukuran sebelum kirim (contoh: "Asli 4,2 MB menjadi 1,1 MB").
- Setting kualitas default: Hemat / Standar / Tinggi.
- Progres upload (progress bar pada thumbnail) + retry saat gagal.

## 5.4 Story + Interaksi Ring (KRITIS — perilaku baru v2)
- Ring avatar: gradient warna = BELUM dilihat; abu-abu tipis = SUDAH dilihat. Status tersinkron (lokal + server) dan persist setelah aplikasi direstart; hanya kembali gradient jika ada story baru.
- INTERAKSI BARU: menekan ring avatar TIDAK langsung membuka viewer — muncul BottomSheet pilihan: "Lihat Story", "Buka Profil", "Kirim Pesan". Lihat Story membuka viewer; Buka Profil membuka profil; Kirim Pesan membuka room chat.
- Viewer fullscreen: progress bar segmented di atas (per story), tap kanan = next, tap kiri = prev, tahan = pause, swipe down = tutup, reply bar (kirim balasan ke chat), tombol share.
- Pemilik story bisa melihat jumlah penonton dan daftar penonton.

## 5.5 Reels (Video)
Pager vertikal fullscreen; autoplay muted; tap = mute/unmute; double-tap = like dengan animasi hati; bar aksi (like, komentar, share, simpan) di sisi kanan; komentar = bottom sheet dengan input; indikator progres video; preload hanya 1 video berikutnya (hemat kuota).

## 5.6 Chat (KRITIS — bug versi lama: caption foto tidak muncul; layout desktop ada ruang kosong)
- Mobile: daftar chat (search, unread bold + badge, last message + waktu) menuju room fullscreen (header avatar + nama + status online, tombol info).
- Desktop lebar 1024px ke atas: layout DUA PANEL rapi — sidebar daftar chat (lebar tetap sekitar 360px, penuh tinggi) dan room chat mengisi sisanya. TIDAK ADA ruang kosong atau tepi janggal; garis pemisah halus; item chat aktif ter-highlight.
- Bubbles: masuk/keluar beda warna, radius asimetris, timestamp, status terkirim (1 centang) dan dibaca (2 centang warna aksen), grouping pesan berurutan, separator hari ("Hari ini", "Kemarin"), typing indicator 3 titik animasi, badge unread.
- KIRIM FOTO + CAPTION (wajib benar): pilih foto, tampilkan preview inline di composer dengan field caption, kirim sebagai SATU pesan. Di room, pesan foto tampil dengan caption MENYATU di bubble foto (caption di atas atau bawah foto dalam satu bubble yang sama) — bukan dua pesan terpisah. Ini bug versi lama; jangan sampai terulang.
- Lainnya: reply (quote), swipe pesan untuk quick reply/reaksi/hapus, share postingan ke chat, update realtime (WebSocket bila tersedia, fallback polling 3 detik), search chat, mark read.

## 5.7 Pencarian Global (KRITIS)
- Search bar besar di tab Cari + shortcut dari AppBar Beranda.
- Debounce 300ms; request lama di-cancel; input di-trim; karakter khusus di-escape; query dibatasi 100 karakter; TIDAK BOLEH crash dengan input aneh (simbol, spasi semua, query sangat panjang).
- Tab hasil: Semua / Postingan / Video / Akun. Kartu hasil berbeda per tipe: akun (avatar, nama, bio, tombol ikuti), postingan (thumbnail + snippet), video (thumbnail + durasi + views).
- Recent search (persist, bisa hapus satu / semua) + section Trending saat kosong.
- Highlight teks yang cocok di hasil; skeleton saat mencari; empty state "Tidak ada hasil untuk 'xxx'"; error state + tombol coba lagi; "Muat lebih banyak" dengan cursor pagination.
- Klik hasil menuju profil / detail postingan / reels.

## 5.8 Notifikasi
Like / komentar / follow / pesan baru; ikon tipe + teks natural; grouping per hari; badge unread global (tab Chat dan ikon lonceng); mark all read.

## 5.9 Profil
Header: avatar (ring story bila ada), nama, username, bio, stats (postingan / pengikut / mengikuti — bisa dibuka list-nya), tombol kontekstual: sendiri = Edit Profil; orang lain = Ikuti / Sudah Diikuti + Pesan. Tab konten: Postingan (grid 3 kolom dengan indikator multi-foto), Reels, Taggan. Edit profil: ganti foto (crop lingkaran), nama, bio, username (dengan validasi). Follow/unfollow optimistik dengan rollback saat gagal.

## 5.10 Create (Buat Konten)
Pilih media (multi hingga 10 foto atau 1 video), pipeline kualitas dari 5.3 + preview ukuran, editor caption (tag teman, lokasi opsional), pilihan share ke Story / Feed, progres posting, selesai muncul di feed.

## 5.11 Pengaturan
Tampilan (mode gelap/terang/ikut sistem), kualitas upload default, bersihkan cache (tampilkan ukurannya), akun (ganti password, logout), tentang SkelzHUB v2.

# 6. IKON APLIKASI + SPLASH (WAJIB LEBIH BAGUS)

- Konsep ikon: monogram huruf "S" SkelzHUB — latar rounded-square gelap #0F1115, huruf "S" besar dengan gradient oranye ke magenta dan glow tipis di belakangnya; flat-modern premium; tetap terbaca jelas di ukuran 48px; tanpa teks lain. Buat sebagai SVG rapi (viewBox 512) plus versi favicon 32, apple-touch 180, PWA 192 dan 512, dan maskable (konten dalam safe-zone 80%).
- Manifest lengkap: name "SkelzHUB", short_name "SkelzHUB", display standalone, orientation portrait, theme_color dan background_color sesuai identitas.
- Splash: logo muncul dengan animasi scale + fade 600ms menuju auth/feed; boot selalu dengan skeleton (tanpa blank putih).

# 7. ARSITEKTUR DAN STRUKTUR PROYEK BARU

Struktur feature-first (WAJIB — ini struktur baru, bukan struktur lama):
- src/app — root shell, routing, provider
- src/design — tokens (warna, spacing, radius, tipografi) dan komponen UI inti
- src/features — auth, feed, stories, reels, chat, search, profile, notifications, settings, create; masing-masing berisi components, store, hooks, api, types
- src/lib — api client (typed, baseURL dari config, attach token, normalisasi error, retry GET idempoten, abort), media pipeline (compress/crop/EXIF), storage util (persist store), utils
- src/assets — ikon SVG dan logo
- src/config — config.ts (API_BASE_URL, MODE: demo atau live)

MODE DEMO: data seed realistis Bahasa Indonesia — nama orang dan username natural, caption seperti ditulis manusia, komentar, percakapan chat, notifikasi, story aktif, reels — plus timer simulasi chat realtime. Semua fitur harus tetap berfungsi penuh tanpa backend.

Aturan kode: TypeScript strict tanpa any liar; komponen maksimal 200 baris; satu file satu tanggung jawab; named export konsisten.

# 8. KONTRAK API (MODE LIVE)

Klien API typed siap pakai untuk endpoint berikut (request/response DTO jelas): auth (login, register, me), posts (feed cursor, single, create, like, save, comment), stories (aktif, mark-viewed, viewers), reels, search (q, tipe, cursor), chats (list, messages, kirim foto+caption multipart, read), users (profil, follow, followers), notifications, media (presigned upload). Token disimpan aman; refresh sesi otomatis bila tersedia.

# 9. QA — DEFINITION OF DONE (UJI SENDIRI SEBELUM SELESAI)

Jalankan audit ini dan perbaiki semua temuan:
1. Konsol bersih: nol error dan warning.
2. Semua state hadir di tiap layar: loading (skeleton), empty, error + retry, sukses.
3. Responsif 360px sampai 1920px; safe-area notch dan home bar; keyboard mobile tidak menutup composer chat.
4. Skenario kunci berjalan mulus: login, feed (pull-to-refresh, infinite scroll), tap ring story, pilihan di sheet (Lihat Story / Buka Profil / Kirim Pesan), lihat story lalu ring berubah abu secara permanen, buka chat, kirim foto + caption dan caption menyatu di bubble, pencarian global (semua tab, recent search, input aneh tidak crash), buka reels, double-tap like, buka profil, edit profil, logout.
5. Performa: tidak ada jank saat scroll cepat; gambar feed blur-up; bundle awal sesuai target.
6. Aksesibilitas: kontras AA, focus visible, aria-label di semua IconButton, urutan tab logis.
7. DILARANG ada: lorem ipsum, TODO, tombol mati, fungsi palsu, loading yang tidak pernah selesai, ruang kosong aneh, elemen overlap, teks terpotong tanpa ellipsis.
8. Ikon dan manifest lengkap; aplikasi installable sebagai PWA.

# 10. CARA MENGERJAKAN

Langkah 1 — rencana singkat: struktur folder final + daftar layar + urutan kerja (maksimal 40 baris, tanpa kode).
Langkah 2 — implementasi file demi file dengan kode lengkap tanpa dipotong, mulai dari design system, shell navigasi, tiap fitur, ikon dan PWA, lalu QA.
Langkah 3 — setelah selesai: ringkas apa yang dibangun, cara menjalankan, dan cara switch MODE DEMO ke MODE LIVE (isi API_BASE_URL).

Jangan bertanya klarifikasi. Kualitas akhir harus terasa seperti dibuat tim produk sungguhan — bukan template AI.

---

## VARIANT FLUTTER (opsional — jika ingin aplikasi native sejati / APK)

Tempel prompt utama di atas, lalu ganti bagian "TEKNOLOGI (WAJIB)" dengan ini:

Bangun sebagai aplikasi native Flutter (Dart), satu kodebase untuk Android dan iOS, performa 60fps native, offline-first. Semua spesifikasi fitur, design system, ikon, dan QA di atas tetap berlaku sama. Tambahan wajib: state management ringan (Riverpod atau setara), caching gambar (cached_network_image dengan placeholder blur-up), daftar panjang pakai Sliver/virtualisasi, safe-area penuh, adaptive icon Android (foreground/background) dan iOS (120/180/1024 tanpa transparan), splash native kedua platform, konfigurasi API_BASE_URL dan mode demo. Prioritas ringan: hindari package yang tidak perlu; build rilis dengan --split-per-abi.

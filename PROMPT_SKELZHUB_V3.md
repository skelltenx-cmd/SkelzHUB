# PROMPT SKELZHUB v3 — NATIVE FLUTTER, LANGSUNG TERHUBUNG API LIVE skelzhub.my.id (untuk Google AI Studio)

> Cara pakai: buka https://aistudio.google.com → tab **Build** → pilih model terkuat yang tersedia → tempel SELURUH "PROMPT UTAMA" di bawah → Run.
> Jika AI berhenti di tengah, kirim: "Lanjutkan file berikutnya, kode lengkap tanpa dipotong."
> Deliverable: proyek Flutter lengkap (kode penuh) — di-build lokal jadi APK/IPK.

---

## PROMPT UTAMA (tempel semuanya dari sini sampai selesai)

Kamu adalah principal mobile engineer + product designer kelas dunia (standar craft seperti tim yang membangun Instagram, TikTok, dan aplikasi banker terbaik). Kerjakan misi ini end-to-end sampai selesai tanpa bertanya apa pun — kalau ada detail yang belum ditentukan, ambil keputusan terbaik ala aplikasi sosial kelas atas dan lanjut.

# MISI — SkelzHUB v3.0 (APLIKASI NATIVE FLUTTER, LIVE API)

Bangun aplikasi mobile SkelzHUB v3 sebagai aplikasi **native Flutter** yang **langsung terhubung ke API produksi https://www.skelzhub.my.id** — TANPA konfigurasi apa pun, tanpa variabel environment, tanpa setup: setelah di-build, aplikasi langsung bisa login dan dipakai dengan akun asli SkelzHUB. Semua data nyata dari API. DILARANG membuat data dummy/mock — API di bawah ini sudah LIVE dan terverifikasi.

# 1. TEKNOLOGI (WAJIB)

- Flutter terbaru (stabil), Dart, Material 3 dengan tema kustom penuh.
- Package (minimal, jangan lebih): dio + dio_cookie_manager + cookie_jar (sesi login), flutter_riverpod (state), cached_network_image, video_player, image_picker, flutter_image_compress, intl, connectivity_plus, record + just_audio (pesan suara), dev: flutter_launcher_icons, flutter_native_splash.
- Semua request lewat satu ApiClient terpusat (baseUrl: https://www.skelzhub.my.id). Aplikasi native TIDAK kena CORS — jangan tambahkan proxy apa pun.
- Bahasa antarmuka: Bahasa Indonesia natural seperti ditulis manusia.

# 2. AUTENTIKASI (SESI COOKIE — PENTING, IKUTI PERSIS)

Backend memakai cookie sesi httpOnly `skelzhub_session` (masa aktif 30 hari). Di Flutter:
1. Gunakan dio dengan interceptor `CookieManager(PersistCookieJar())` — cookie otomatis tersimpan ke disk dan terkirim ke semua request, jadi login bertahan setelah aplikah ditutup.
2. Login 2 langkah (2FA email — akun yang punya email):
   - POST /api/auth/login {"username","password"} → respons {step:"code", userId, email( tersamarkan), emailSent, emailConfigured, devCode?} → tampilkan layar input kode 6 digit; jika emailConfigured=false dan ada devCode, tampilkan banner "mode dev: kode {devCode}".
   - POST /api/auth/login/verify {"userId","code"} → {step:"done", user} (cookie tersimpan otomatis).
   - Akun lama tanpa email → login langsung balas {step:"done", user}.
3. Register: POST /api/auth/register {"username","displayName","email","password"} → {step:"done", user} (langsung masuk).
4. Boot: GET /api/auth/me → {user} atau {user:null, bannedMessage?}; user null = belum login; bannedMessage = tampilkan dialog lalu logout.
5. POST /api/auth/logout untuk keluar.
6. Interceptor dio: respons 401 → bersihkan sesi dan arahkan ke layar login otomatis.
7. Validasi register mengikuti aturan server: username 3-20 karakter [a-zA-Z0-9._], email valid, password minimal 6 — pesan error server berupa {"error":"..."} Bahasa Indonesia, tampilkan apa adanya.

# 3. KONTRAK API LIVE TERVERIFIKASI (WAJIB DIKODEKAN PERSIS)

BASE = https://www.skelzhub.my.id
Semua error berbentuk {"error":"pesan"} — tampilkan pesannya langsung (sudah Bahasa Indonesia).
SEMUA URL media respons bersifat RELATIF (contoh "/api/media/abc123") → selalu di-prefiks dengan BASE. Media punya ETag/304 dan video mendukung request Range (video_player aman dipakai langsung).

DTO inti (buat sebagai model Dart fromJson/toJson):
- Me: {id, username, email?, displayName, bio, avatarColor(int 0-7), avatar("/api/media/x"|null), isPrivate, role("USER"|"ADMIN"|"OWNER")}
- UserBrief: {id, username, displayName, avatarColor, avatar?, role?}
- User: Me + {lastSeenAt?, postCount, followerCount, followingCount, isFollowing?, followStatus("ACCEPTED"|"PENDING"|"NONE"), isMe?}
- Post: {id, caption, media("/api/media/x"|null), type("IMAGE"|"VIDEO"), createdAt(ISO), author:UserBrief, likeCount, commentCount, repostCount, likedByMe, savedByMe, repostedByMe, repostOf:Post?, previewComments:[Comment] maks 2}
- Comment: {id, text, createdAt, author:UserBrief, parentId?, replyTo?:UserBrief, isMine?}

Endpoint lengkap:
- AUTH: seperti bagian 2. Tambah: POST /api/auth/forgot-password {"email"} → {emailSent, emailConfigured?, devCode?, message?}; POST /api/auth/reset-password {"email","code","newPassword"} → {ok}.
- FEED: GET /api/posts?feed=home|following|explore|shorts|saved|reposts&username={u}&page={n}&limit=12 → {posts:[Post], nextPage:number|null, hasMore, hidden?} — pagination pakai nextPage; explore diurut berdasarkan like; feed=shorts = hanya video vertikal untuk tab Shorts.
- POST detail/aksi: GET /api/posts/{id} → {post}; POST /api/posts {"caption"≤2200, "mediaId"} → {post}; POST /api/posts {"caption", "repostOfId"} → {post} (repost); PATCH /api/posts/{id} {"caption"} (edit caption); DELETE /api/posts/{id}; POST /api/posts/{id}/like → {liked, likeCount}; POST /api/posts/{id}/save → {saved}; POST /api/posts/{id}/repost → {reposted, repostCount}; POST /api/posts/{id}/report {"reason"}.
- KOMENTAR: GET /api/posts/{id}/comments?page={n}&limit=30 → {comments:[Comment], nextPage, hasMore}; POST /api/posts/{id}/comments {"text", "parentId"|null} → {comment}; DELETE /api/comments/{id}. Komentar beranak (parentId) tampil menyatu di bawah induknya.
- PENGGUNA: GET /api/users/{username} → {user:User}; PATCH /api/users/{username} {"displayName","bio"}; POST /api/users/{username}/follow → {following, pending, followerCount} (pending=true berarti akun privat → tombol jadi "Diminta"); GET /api/users/{username}/followers → {users:[{id, status, user:UserBrief}]}; /following sama; GET /api/users?search={q} → {users:[User]}; GET /api/suggestions → {users:[User]} (saran akun untuk "Trending orang"); GET /api/follow-requests → {requests:[{followId, createdAt, user:UserBrief}]}; PATCH /api/follow-requests {"followId","action":"accept"|"reject"}.
- AKUN SAYA: PATCH /api/me {"displayName"?,"bio"?,"isPrivate"?,"avatarMediaId"?,"currentPassword"?,"newPassword"?} → {user, passwordChanged}; POST /api/me/heartbeat (kirim tiap ±25 detik saat app foreground — status "online" berlaku 75 detik).
- STORY: GET /api/stories → {groups:[{author:UserBrief, items:[{id, media, type, caption, createdAt, seen, likeCount, likedByMe, commentCount, viewCount, audio?}], hasUnseen, isMe, latestAt}]} — urutan: story sendiri dulu, belum dilihat, lalu sudah dilihat; POST /api/stories {"mediaId","caption"≤500,"audioMediaId"?} → {storyId}; GET /api/stories/{id} → {story:{...+expiresAt}, viewers:[{id,username,displayName,avatarColor,avatar,role,seenAt}], viewCount}; POST /api/stories/{id}/view → {ok} (tandai dilihat); POST /api/stories/{id}/like → {liked, likeCount}; DELETE /api/stories/{id}; GET /api/stories/{id}/comments → {comments:[Comment]}; POST /api/stories/{id}/comments {"text","parentId"|null}; DELETE /api/stories/{id}/comments?commentId=.
- CHAT: GET /api/conversations → {conversations:[{id, user:UserBrief+{online,lastSeenAt}, lastMessage, lastMessageKind, lastMessageDeleted, lastMessageAt, lastMessageMine, unread}], unread(total)}; POST /api/conversations {"username"} → {conversationId} (tolak ke diri sendiri);
  GET /api/conversations/{id}/messages?page={n}&limit=40 → {messages:[ChatMessage], other:{user, online, lastSeenAt, typing}, nextPage, hasMore} — GET ini OTOMATIS menandai pesan masuk sudah dibaca;
  GET /api/conversations/{id}/messages?since={ISO} (polling tiap 2 detik saat room terbuka) → {messages:[berubah/baru sejak cursor], other, mineLastReadAt} — update pesan dengan id sama (edit/hapus ikut sinkron);
  POST /api/conversations/{id}/messages {"text"?,"mediaId"?,"replyToId"?} → {message} — FOTO+CAPTION DIKIRM SEBAGAI SATU REQUEST (mediaId + text bersamaan) dan text tetap sebagai caption yang menyatu dengan foto;
  PATCH /api/conversations/{id}/messages {"messageId","text"} (edit, hanya TEXT milik sendiri); DELETE /api/conversations/{id}/messages?messageId={id} (soft delete → tampil "Pesan dihapus"); POST /api/conversations/{id}/messages/react {"messageId","emoji"|null} (toggle reaksi); POST /api/conversations/{id}/typing (kirim saat mengetik, minimal interval 3 detik — jendela typing server 5 detik).
- ChatMessage: {id, text, kind("TEXT"|"IMAGE"|"VIDEO"|"VOICE"), media("/api/media/x"|null), mine, createdAt, readAt, editedAt?, deleted?, updatedAt, replyTo:{id,text,kind,senderName,senderMine,deleted}? , reactions:[{emoji,count,mine}]}
- PENCARIAN: GET /api/search?q={q} → {users:[User], posts:[Post], videos:[Post]} — satu kata kunci untuk semua kelompok; server membatasi 12 akun + 18 post + 18 video; privasi akun privat tetap dihormati server.
- NOTIFIKASI: GET /api/notifications → {items:[{id, type("LIKE"|"COMMENT"|"FOLLOW"|"FOLLOW_REQUEST"|"FOLLOW_ACCEPT"|"REPOST"|"STORY_VIEW"|"STORY_LIKE"|"STORY_COMMENT"), read, createdAt, actor:UserBrief, postId?, postMedia?, postType?, commentText?}], unread}; POST /api/notifications (tandai semua dibaca). Poll tiap 30 detik.
- UPLOAD MEDIA (dipakai post, story, chat, avatar, voice): ada dua jalur, pilih otomatis:
  1. Probe: GET /api/upload/r2-presign → jika 200 {"enabled":true} pakai jalur R2: POST /api/upload/r2-presign {"filename","mimeType","size"} → {uploadUrl, key, kind("IMAGE"|"VIDEO"|"AUDIO"), mimeType}; lalu PUT uploadUrl dengan body file dan header Content-Type SAMA PERSIS dengan mimeType (pakai dio + onSendProgress untuk progres 0-95%); lalu POST /api/upload/r2-complete {"key","mimeType"} → hasil.
  2. Jika R2 mati: file ≤4MB → POST /api/upload multipart form-data field "file"; file besar → pecah potongan 4MB: POST /api/upload/chung (fields: key,index,total,file) per potongan lalu POST /api/upload/complete {"key","totalChunks","mimeType"}.
  Hasil upload: {mediaId, url:"/api/media/x", kind, mimeType}. Batas: R2 aktif sampai 5GB; jalur klasik video 200MB / gambar 60MB.

# 4. TARGET PERFORMA NATIVE (HARD)

- 60fps di seluruh layar: ListView.builder/PageView.builder dengan itemCount + pagination (jangan ListView(children:) untuk data panjang); RepaintBoundary pada media; gambar dengan cacheWidth proporsional lebar layar (cached_network_image memCacheWidth) supaya decode kecil.
- Preload video hanya 1 item berikutnya di Shorts (video_player dispose yang keluar layar — WAJIB dispose controller, tidak boleh ada leak).
- Image picker + flutter_image_compress SEBELUM upload: benarkan EXIF, batasi sisi panjang 2048px (post/chat) atau crop 1080x1920 (story), kualitas 85-90 — foto hasil TIDAK BOLEH buram, ukuran ringan. Tampilkan preview "asli X MB → hasil Y MB" sebelum kirim.
- Debounce pencarian 300ms + cancel request lama (CancelToken dio).
- Aplikasi ringan: hindari widget berat, pakai const constructor, hindari Opacity besar di list, shimmer skeleton loading (buat sendiri widget Shimmer ringan).
- Offline: connectivity_plus — banner halus "Kamu sedang offline" + retry otomatis; semua state async punya loading (skeleton), error (snackbar Bahasa Indonesia + tombol "Coba lagi"), empty ("Belum ada apa pun di sini").

# 5. DESIGN SYSTEM v3 (WAJIB ANTI-JADUL, ANTI-OVERFLOW)

Estetika 2025 modern premium — DILARANG tampilan jadul (Material bawaan abu-abu datar, list polos, ikon panah kaku):
- Identitas warna: gradient primer #FF6A00 → #EE1B7A (oranye→magenta) untuk aksi utama, ring story belum dilihat, tombol create, indikator aktif. Latar terang #FAFAFA / gelap #0F1115. Dark & light mode penuh + ikut sistem.
- Bentuk: radius 20-24 untuk kartu, 999 untuk chip/pill; shadow lembut rendah (bukan border abu kaku di semua kartu); tipografi Inter (bundle 400/600/700 saja) — judul bold, hierarki jelas.
- Navigasi bawah kustom: 5 slot — Beranda, Cari, Shorts, tombol (+) create besar di tengah (gradient, menonjol, tap scale), Chat (badge unread), Profil. Item aktif: ikot terisi + pill gradient di atasnya, animasi halus. SafeArea + inset bawah home bar.
- Kartu feed premium: rounded-24 + shadow lembut, header avatar (ring gradient jika story belum dilihat) + nama + waktu relatif ("2 mnt lalu", "Kemarin"), media AspectRatio 4:5 dengan ClipRRect, caption maxLines + ellipsis + "selengkapnya", baris aksi like/komentar/repost/simpan dengan angka format Indonesia ("1,2 rb"), double-tap like dengan animasi hati meledak (scale + fade), pull-to-refresh (RefreshIndicator custom warna brand).
- Avatar: avatar null → avatar gradient dari avatarColor (definisikan 8 pasangan warna gradient bagus untuk index 0-7).
- Micro-interaction: tap scale 0.97 pada tombol, transisi layar slide+fade 220-250ms, Hero pada foto (buka lightbox fullscreen dengan InteractiveViewer untuk zoom), haptic ringan pada aksi utama.
- ATRANGAN KERAS LAYOUT (bug paling sering Flutter): DILARANG ada "RenderFlex overflowed" di mode debug pada lebar 320dp–900dp dan tinggi kecil. Aturan: semua Row/Column longgar pakai Expanded/Flexible; teks panjang selalu ellipsis (maxLines + TextOverflow.ellipsis); layar pakai SafeArea + Scaffold; keyboard chat pakai MediaQuery viewInsets (composer naik, tidak ketutup); grid profil pakai LayoutBuilder; gambar selalu dalam AspectRatio/ClipRRect; ukuran font responsif (clamp). Sebelum selesai, audit setiap layar terhadap overflow di ukuran 320 / 375 / 412 / 768 / 900 dp.
- Semua ikon konsisten satu gaya outline (Material Symbols atau Lucide-style custom) — jangan campur gaya.

# 6. SPESIFIKASI FITUR (SEMUA WAJIB JALAN, DATA NYATA)

6.1 Feed (Beranda): rail story horizontal di atas (avatar+ring); kartu composer shortcut "Mau posting apa hari ini?"; infinite scroll pakai nextPage + skeleton; pull-to-refresh; tab filter Utama / Mengikuti (feed=home/following); like/save/repost optimistik dengan rollback saat gagal; komentar bottom-sheet dengan balasan (parentId) + preview 2 komentar terbaru di kartu; repost tampil bersarang (repostOf); pengguna dibanned/privat ditangani dengan elegan (hidden=true → "Konten tersembunyi").

6.2 Story + interaksi ring (perilaku khusus WAJIB): menekan ring avatar TIDAK langsung membuka viewer — muncul bottom-sheet pilihan: "Lihat Story" / "Buka Profil" / "Kirim Pesan" (buka chat). Ring: gradient = belum dilihat, abu tipis = sudah dilihat (pakai field seen/hasUnseen dari API + POST /view saat story selesai ditampilkan → status persist di server). Viewer fullscreen PageView: progress bar per story di atas, tap kanan/kiri navigasi, tahan = pause, swipe down = tutup, caption di bawah, tombol like + komentar (bottom-sheet) + share. Pemilik story: tombol penonton → GET /api/stories/{id} daftar viewers + jumlah.

6.3 Shorts: PageView vertikal fullscreen video_player (feed=shorts), autoplay muted loop, tap = suara on/off, double-tap = like + animasi hati, bar aksi kanan (like/komentar/share), komentar bottom-sheet, indikator progres tipis, preloading 1 video berikutnya.

6.4 Chat: daftar percakapan (search lokal, unread bold + badge, preview pesan terakhir per kind: "[Foto] [Video] [Suara] [Pesan dihapus]"), polling daftar tiap 5 detik. Room: header avatar + nama + status ("Online" hijau / "Terakhir aktif 5 mnt lalu"), pesan bubble modern (gradient halus untuk pesanku, abu untuk lawan, radius asimetris, timestamp + status: satu centang terkirim, dua centang aksen jika readAt, "Diedit" jika editedAt, placeholder abu jika deleted), grouping pesan berurutan, pemisah hari ("Hari ini"/"Kemarin"), typing indicator 3 titik animasi (poll `since` membawa other.typing), kirim teks/foto/kamera/video/voice note; FOTO+CAPTION: preview inline di composer + field caption, kirim SATU request (mediaId+text) → bubble foto menampilkan caption menyatu di bawah foto (Bukan pesan terpisah — ini bug versi lama, WAJIB benar); reply quote (replyToId), reaksi emoji (react endpoint), edit/hapus pesan sendiri (swipe menu), share post ke chat, polling since 2 detik, otomatis dibaca saat room terbuka (server handle saat GET pertama).

6.5 Pencarian global: halaman Cari dengan search bar besar (autofokus), debounce 300ms + cancel request lama, hasil realtime GET /api/search: tab Semua / Akun / Postingan / Video — akun (avatar, nama, bio, tombol Ikuti), post (thumbnail + cuplikan caption), video (thumbnail + badge durasi + jumlah like). Recent search disimpan lokal (hapus satu/semua). Saat kosong: saran akun dari /api/suggestions + grid post feed=explore. Highlight kata kunci di hasil. Input aneh (spasi saja, simbol, panjang) TIDAK boleh crash — trim + guard. Empty state: "Tidak ada hasil untuk 'xxx'".

6.6 Notifikasi: ikon tipe + teks natural ("rajax menyukai postinganmu", "rajax mengomentari: 'keren banget'"), thumbnail post bila ada, grouping per hari, badge unread di tab Chat + bell AppBar, mark all read, poll 30 detik, tap → buka post terkait / profil.

6.7 Profil: header (avatar besar + ring story bila ada, nama + username + badge role, bio, stats postingan/pengikut/mengikuti — bisa dibuka halaman list dengan tombol ikuti per baris); tombol kontekstual: milik sendiri = Edit Profil, orang lain = Ikuti (atau "Diminta" bila PENDING, "Sudah Diikuti") + tombol Pesan (POST /api/conversations → buka room); tab Postingan / Reposts / Tersimpan (feed=profile default, reposts, saved — milik sendiri saja untuk saved); grid 3 kolom (indikator video & badge like). Akun privat yang tidak kamu ikuti: pesan elegan "Akun ini privat" + tombol Ikuti. Edit profil: nama, bio, toggle privat, ganti avatar (crop lingkaran sederhana → compress → upload → avatarMediaId ke PATCH /api/me), ganti password (currentPassword/newPassword). Follow/unfollow optimistik dengan rollback.

6.8 Create: pilih media (multi foto hingga 10 atau 1 video; kamera/galeri), pipeline kompresi + preview "asli → hasil", caption 2200 karakter, pilih bagikan ke Feed atau Story (POST /api/posts atau POST /api/stories), progres upload (onSendProgress) dengan progress bar, selesai → toast sukses + refresh feed. Story: crop 1080x1920 + caption 500.

6.9 Pengaturan: tampilan (terang/gelap/sistem), keluar akun, ganti password, tentang SkelzHUB v3.

6.10 Layout tablet ≥900dp: chat dua panel (daftar kiri + room kanan, tidak ada ruang kosong janggal); grid feed lebih lebar; sisanya tetap satu kolom mobile-first.

# 7. IKON APLIKASI + SPLASH (WAJIB LEBIH BAGUS)

- Konsep ikon: rounded-square gelap #0F1115 dengan monogram huruf "S" besar gradient #FF6A00→#EE1B7A + glow tipis, flat premium, terbaca di 48px. Buat sebagai SVG/artwork lalu konfigurasi flutter_launcher_icons: adaptive icon Android (foreground/background terpisah, safe-zone) + iOS 1024 tanpa transparansi.
- flutter_native_splash: latar gelap + logo "S" gradient + bar progress kecil; transisi mulus masuk layar pertama.
- Ikon in-app (logo kecil, ikon empty state) satu keluarga gaya.

# 8. STRUKTUR PROYEK (BERSIH & MODULAR)

lib/
- main.dart (bootstrap: jar cookie persist, ProviderScope, theme, connectivity, heartbeat timer)
- core/api/ (api_client.dart — dio + interceptors + CookieManager + helper get/post/patch/delete/uploadMultipart/uploadR2 + progress; api_exception.dart; endpoints.dart — satu konstanta per path)
- core/models/ (me, user, post, comment, conversation, message, story, notification, upload_result — fromJson lengkap + null-safety)
- core/theme/ (app_colors.dart: gradient brand + 8 avatar gradient; app_text.dart; app_shimmer.dart)
- core/widgets/ (avatar_stories ring, app_button, skeleton, empty_state, error_state, media_viewer lightbox, time_ago.dart format Indonesia, number_id.dart "1,2 rb")
- features/auth/ (login 2 langkah + kode 6 digit + register + lupa password)
- features/feed/ (list + kartu post + komentar sheet)
- features/stories/ (rail + ring + sheet pilihan + viewer + viewers)
- features/shorts/
- features/chat/ (daftar + room + composer foto-caption + voice note)
- features/search/
- features/notifications/
- features/profile/ (profil + edit + followers/following)
- features/create/
- features/settings/
- shell/ (bottom nav kustom + scaffold utama)
Aturan kode: tiap file satu tanggung jawab, maksimal ±250 baris, named export, tanpa kode mati; riverpod: provider per fitur (AsyncNotifier + family untuk pagination).

# 9. CARA MENGERJAKAN (WAJIB IKUTI)

Langkah 1 — rencana maksimal 30 baris: daftar file final + urutan pengerjaan (tanpa kode).
Langkah 2 — tulis KODE LENGKAP file demi file (mulai: pubspec.yaml, core/api + models, theme, shell, auth, feed, story, chat, search, profil, create, settings, ikon/splash config, README build). JANGAN pernah memotong file di tengah atau menulis "..." / "// sisanya sama". Jika konteks menipis, selesaikan file aktif dulu lalu lanjut di pesan berikutnya dari file persis yang belum ditulis.
Langkah 3 — README: cara build (flutter create . --platforms=android,ios --project-name skelzhub; flutter pub get; flutter run; flutter build apk --release --split-per-abi) + catatan bahwa TIDAK ada konfigurasi API (baseUrl sudah live).
Langkah 4 — QA self-audit terakhir (bagian 10) dan perbaiki temuan sebelum menutup.

# 10. QA — DEFINITION OF DONE (UJI SENDIRI SEBELUM SELESAI)

1. Tidak ada satu pun error kompilasi; semua import dan tipe konsisten antar file.
2. TIDAK ADA RenderFlex overflow pada 320/375/412/768/900dp; keyboard tidak menutup composer chat; semua teks panjang ellipsis.
3. Skenario kunci benar alur API-nya: login 2 langkah (kode email), login akun tanpa email langsung masuk, register, boot /api/auth/me auto-login, feed infinite scroll + pull-to-refresh, tap ring story → sheet 3 pilihan → viewer → setelah selesai ring jadi abu (persist), chat: kirim teks/foto+caption SATU pesan (caption menyatu di bubble)/voice, typing & read-receipt muncul via polling since, pencarian global (debounce, tab, input aneh tanpa crash), profil + follow + edit, create post & story dengan progres upload, notifikasi, logout.
4. 401 di mana pun → auto logout rapi; offline → banner + retry; semua layar punya skeleton/empty/error state.
5. Semua controller video/audio di-dispose; tidak ada memory leak saat navigasi bolak-balik.
6. UI final: modern, gradient brand konsisten, tidak jadul, tidak ada placeholder/TODO/lorem ipsum, semua teks Bahasa Indonesia natural.
7. Ikon adaptif + splash terpasang via konfigurasi (sertakan flutter_launcher_icons.yaml + flutter_native_splash.yaml).

Kualitas akhir harus terasa seperti aplikasi buatan tim produk sungguhan yang sudah bertahun tahun — bukan template AI dan bukan tampilan jadul.

# PROMPT SKELZHUB v4 — SATU DATABASE + SINKRON SEMPURNA + PUSH NOTIFICATION KE HP (untuk Google AI Studio / Gemini)

> Cara pakai: buka https://aistudio.google.com → tab **Build** → pilih Gemini dengan effort berpikir MAKSIMAL (highest thinking effort) → tempel SELURUH "PROMPT UTAMA" di bawah → Run.
> Jika AI berhenti di tengah, kirim: "Lanjutkan file berikutnya, kode lengkap tanpa dipotong. Kerjakan dengan effort maksimal."
> Deliverable: (A) aplikasi Flutter lengkap terhubung live API, (B) patch backend push-notification untuk dideploy ke website.

---

## PROMPT UTAMA (tempel semuanya dari sini sampai selesai)

Kamu adalah principal mobile engineer + product designer kelas dunia (standar craft tim yang membangun Instagram dan aplikasi bank terbaik). Kerjakan misi ini dengan effort MAKSIMAL — berpikir dalam dan teliti pada setiap file, sampai selesai, tanpa bertanya apa pun; kalau ada detail yang belum ditentukan, ambil keputusan terbaik ala aplikasi sosial kelas atas dan lanjut.

# MISI — SkelzHUB v4.0 (APLIKASI NATIVE FLUTTER, SATU DATABASE DENGAN WEBSITE, PUSH NOTIFICATION KE HP)

Bangun aplikasi mobile SkelzHUB v4 sebagai aplikasi native Flutter yang memakai **PERSIS database dan API yang sama dengan website SkelzHUB** (https://www.skelzhub.my.id), ditambah **notifikasi push yang masuk ke HP** (Firebase Cloud Messaging) dan **patch backend** untuk mengaktifkan push di server. Semua post, story, shorts, chat, profil, like, komentar di aplikasi dan website adalah DATA YANG SAMA — bukan salinan, bukan data lokal.

# 0. PRINSIP #1 — SATU DATABASE, SINKRON SEMPURNA (PALING PENTING DI SELURUH PROMPT INI)

- SATU-SATUNYA sumber data adalah API https://www.skelzhub.my.id. TIDAK ADA database lokal, TIDAK ADA data dummy/mock/demo, TIDAK ADA seed, TIDAK ADA cache-anda yang bisa basi tanpa refresh. Setiap layar menampilkan data asli server.
- Tulis di aplikasi → muncul di website SEKARANG juga (post baru, komentar, like, follow, pesan chat — lewat API yang sama). Tulis di website → muncul di aplikasi (lewat polling + refresh yang benar).
- Sinkronisasi sisi aplikasi (WAJIB diimplementasikan):
  1. Semua request data realtime (chat, notifikasi, story, feed aktif) memakai no-cache (header dio `Cache-Control: no-store` atau `extraOptions`) supaya tidak pernah menampilkan data basi dari cache HTTP.
  2. Polling sesuai fitur: chat room 2 detik (mode `since`), daftar percakapan 5 detik, notifikasi 30 detik, badge unread ikut tiap poll.
  3. AppLifecycleState.resumed (aplikasi dibuka lagi dari background) → refresh otomatis: data tab aktif, daftar percakapan, unread badge. AppLifecycleState.paused → hentikan semua polling (hemat baterai).
  4. Pull-to-refresh di semua daftar (feed, chat, notifikasi, profil, hasil pencarian).
  5. Setelah aksi tulis (post/komentar/like/follow/kirim pesan) → update state lokal dari respons server (bukan tebakan), lalu refresh daftar terkait.
  6. Pull data yang benar-benar baru: setelah upload post sukses, feed di-refresh dengan page=0 (postingan baru langsung terlihat di atas).
- QA sinkron WAJIB: "posting foto dari aplikasi → buka website → muncul di feed web", "like dari website → buka aplikasi → like count ter-update setelah resume/refresh", "chat dari aplikasi ke akun yang dibuka di website → pesan sampai dalam ≤2 detik", "story dibuat di web → muncul di rail aplikasi setelah resume/pull-refresh".

# 1. TEKNOLOGI (WAJIB)

- Flutter terbaru (stabil), Dart, Material 3 tema kustom penuh.
- Package (minimal, jangan lebih): dio + dio_cookie_manager + cookie_jar (sesi), flutter_riverpod, cached_network_image, video_player, image_picker, flutter_image_compress, intl, connectivity_plus, record + just_audio (voice), firebase_core + firebase_messaging + flutter_local_notifications (push), dev: flutter_launcher_icons, flutter_native_splash.
- Semua request lewat satu ApiClient terpusat (baseUrl: https://www.skelzhub.my.id). Aplikasi native TIDAK kena CORS — jangan tambahkan proxy.
- Bahasa antarmuka: Bahasa Indonesia natural seperti ditulis manusia.

# 2. AUTENTIKASI (SESI COOKIE — IKUTI PERSIS)

Backend memakai cookie sesi httpOnly `skelzhub_session` (30 hari):
1. dio dengan interceptor CookieManager(PersistCookieJar()) — cookie tersimpan ke disk, terkirim otomatis ke semua request, login bertahan setelah app ditutup.
2. Login 2 langkah (2FA email): POST /api/auth/login {"username","password"} → {step:"code", userId, email(tersamarkan), emailSent, emailConfigured, devCode?} → layar input kode 6 digit (tampilkan banner "mode dev: kode {devCode}" bila ada); POST /api/auth/login/verify {"userId","code"} → {step:"done", user}. Akun lama tanpa email → login langsung {step:"done", user}.
3. Register: POST /api/auth/register {"username","displayName","email","password"} → {step:"done", user} (langsung masuk). Validasi ikut server: username 3-20 [a-zA-Z0-9._], email valid, password ≥6.
4. Boot: GET /api/auth/me → {user} | {user:null, bannedMessage?}; bannedMessage → dialog lalu logout.
5. POST /api/auth/logout untuk keluar (sekaligus unregister token push, lihat bagian 4).
6. Interceptor: respons 401 → bersihkan sesi → layar login otomatis.
7. Semua error server berbentuk {"error":"pesan"} (Bahasa Indonesia) — tampilkan apa adanya.

# 3. KONTRAK API LIVE TERVERIFIKASI (WAJIB DIKODEKAN PERSIS)

BASE = https://www.skelzhub.my.id
SEMUA URL media respons RELATIF ("/api/media/abc123") → selalu prefiks BASE. Media punya ETag/304; video mendukung Range (video_player aman).

DTO (model Dart fromJson):
- Me: {id, username, email?, displayName, bio, avatarColor(int 0-7), avatar?, isPrivate, role("USER"|"ADMIN"|"OWNER")}
- UserBrief: {id, username, displayName, avatarColor, avatar?, role?}
- User: Me + {lastSeenAt?, postCount, followerCount, followingCount, isFollowing?, followStatus("ACCEPTED"|"PENDING"|"NONE"), isMe?}
- Post: {id, caption, media?, type("IMAGE"|"VIDEO"), createdAt, author:UserBrief, likeCount, commentCount, repostCount, likedByMe, savedByMe, repostedByMe, repostOf:Post?, previewComments:[Comment]≤2}
- Comment: {id, text, createdAt, author:UserBrief, parentId?, replyTo?:UserBrief, isMine?}

Endpoint:
- AUTH: bagian 2 + POST /api/auth/forgot-password {"email"}; POST /api/auth/reset-password {"email","code","newPassword"}.
- FEED: GET /api/posts?feed=home|following|explore|shorts|saved|reposts&username={u}&page={n}&limit=12 → {posts, nextPage, hasMore, hidden?}; explore urut like terbanyak; feed=shorts hanya video.
- POST: GET /api/posts/{id}; POST /api/posts {"caption"≤2200,"mediaId"}; POST /api/posts {"caption","repostOfId"} (repost); PATCH /api/posts/{id} {"caption"}; DELETE /api/posts/{id}; POST /api/posts/{id}/like → {liked,likeCount}; /save → {saved}; /repost → {reposted,repostCount}; POST /api/posts/{id}/report {"reason"}.
- KOMENTAR: GET /api/posts/{id}/comments?page&limit=30 → {comments,nextPage,hasMore}; POST /api/posts/{id}/comments {"text","parentId"|null}; DELETE /api/comments/{id}; komentar beranak tampil menyatu di bawah induk.
- PENGGUNA: GET /api/users/{username} → {user}; PATCH /api/users/{username} {"displayName","bio"}; POST /api/users/{username}/follow → {following, pending, followerCount} (pending=true → tombol "Diminta"); GET /api/users/{username}/followers|/following → {users:[{id,status,user}]}; GET /api/users?search={q}; GET /api/suggestions; GET /api/follow-requests → {requests:[{followId,createdAt,user}]}; PATCH /api/follow-requests {"followId","action":"accept"|"reject"}.
- AKUN SAYA: PATCH /api/me {"displayName"?,"bio"?,"isPrivate"?,"avatarMediaId"?,"currentPassword"?,"newPassword"?} → {user,passwordChanged}; POST /api/me/heartbeat tiap ±25 dtk saat foreground (jendela online 75 dtk).
- STORY: GET /api/stories → {groups:[{author, items:[{id, media, type, caption, createdAt, seen, likeCount, likedByMe, commentCount, viewCount, audio?}], hasUnseen, isMe, latestAt}]} (urutan: storyku → belum dilihat → sudah dilihat); POST /api/stories {"mediaId","caption"≤500,"audioMediaId"?}; GET /api/stories/{id} → {story{...expiresAt}, viewers:[...], viewCount}; POST /api/stories/{id}/view → {ok}; POST /api/stories/{id}/like → {liked,likeCount}; DELETE /api/stories/{id}; GET /api/stories/{id}/comments → {comments}; POST /api/stories/{id}/comments {"text","parentId"}; DELETE /api/stories/{id}/comments?commentId=.
- CHAT: GET /api/conversations → {conversations:[{id,user:UserBrief+{online,lastSeenAt}, lastMessage, lastMessageKind, lastMessageDeleted, lastMessageAt, lastMessageMine, unread}], unread}; POST /api/conversations {"username"} → {conversationId};
  GET /api/conversations/{id}/messages?page&limit=40 → {messages, other:{user,online,lastSeenAt,typing}, nextPage, hasMore} (GET otomatis menandai pesan masuk dibaca);
  GET /api/conversations/{id}/messages?since={ISO} (poll 2 dtk) → {messages(baru/berubah sejak cursor), other, mineLastReadAt} — update per id (edit/hapus ikut sinkron);
  POST /api/conversations/{id}/messages {"text"?,"mediaId"?,"replyToId"?} → {message} — FOTO+CAPTION = SATU REQUEST (mediaId+text bersamaan);
  PATCH /api/conversations/{id}/messages {"messageId","text"} (edit teks milik sendiri); DELETE /api/conversations/{id}/messages?messageId= (soft delete); POST /api/conversations/{id}/messages/react {"messageId","emoji"|null}; POST /api/conversations/{id}/typing (interval ≥3 dtk).
- ChatMessage: {id, text, kind("TEXT"|"IMAGE"|"VIDEO"|"VOICE"), media?, mine, createdAt, readAt, editedAt?, deleted?, updatedAt, replyTo:{id,text,kind,senderName,senderMine,deleted}?, reactions:[{emoji,count,mine}]}.
- PENCARIAN: GET /api/search?q={q} → {users:[User], posts:[Post], videos:[Post]} (server: 12 akun + 18 post + 18 video).
- NOTIFIKASI: GET /api/notifications → {items:[{id,type("LIKE"|"COMMENT"|"FOLLOW"|"FOLLOW_REQUEST"|"FOLLOW_ACCEPT"|"REPOST"|"STORY_VIEW"|"STORY_LIKE"|"STORY_COMMENT"), read, createdAt, actor:UserBrief, postId?, postMedia?, postType?, commentText?}], unread}; POST /api/notifications (mark all read). Poll 30 dtk.
- UPLOAD (post, story, chat, avatar, voice) — dua jalur otomatis:
  1. Probe GET /api/upload/r2-presign → {"enabled":true} → POST /api/upload/r2-presign {"filename","mimeType","size"} → {uploadUrl,key,kind,mimeType} → PUT uploadUrl (Content-Type SAMA PERSIS mimeType, onSendProgress 0-95%) → POST /api/upload/r2-complete {"key","mimeType"}.
  2. R2 mati: ≤4MB → POST /api/upload multipart field "file"; besar → potongan 4MB ke POST /api/upload/chung (key,index,total,file) lalu POST /api/upload/complete {"key","totalChunks","mimeType"}.
  Hasil: {mediaId, url:"/api/media/x", kind, mimeType}. Batas: R2 5GB; klasik video 200MB / gambar 60MB.

# 4. NOTIFIKASI PUSH KE HP (FCM) — DELIVERABLE BARU

## 4A. Sisi aplikasi Flutter (wajib)
-firebase_core + firebase_messaging + flutter_local_notifications (butuh google-services.json Android dari Firebase project — sertakan langkah setup di README; jangan hardcode apiKey palsu).
- Alur: setelah login sukses → minta izin notifikasi (Android 13+ POST_NOTIFICATIONS) → ambil FCM token → POST /api/push/register {"token":..., "platform":"android"}; onTokenRefresh → register ulang; logout → POST /api/push/unregister {"token":...}.
- Token push didaftarkan ULANG setiap app start (idempoten di server).
- Foreground (app terbuka): pesan masuk → tampilkan banner in-app elegan (atas layar, auto-dismiss); jangan bunyi ganda.
- Background/terminated: push muncul di tray notifikasi sistem; TAP → buka app dan navigasi ke tujuan (navigatorKey global + FirebaseMessaging.onMessageOpenedApp + getInitialMessage): type COMMENT/LIKE/REPOST → detail post; FOLLOW/FOLLOW_REQUEST/FOLLOW_ACCEPT → profil actor; STORY_* → story actor; MESSAGE → room chat terkait.
- Payload data push dari server: {type, actorUsername?, postId?, conversationId?, title, body}.
- FALLBACK WAJIB: jika /api/push/register balas 404 (patch backend belum dideploy) → diam-diam lewati (tanpa error ke user), aplikasi tetap berfungsi penuh dengan polling notifikasi. Jangan pernah crash karena push.
- Badge unread di tab bar + ikon bell tetap dari polling /api/notifications (push hanya pelengkap "ngebut", polling sumber kebenaran).
- Ketika notifikasi dibuka/dibaca → tuntaskan sinkronisasi: poll notifikasi sekali langsung supaya badge dan daftar akurat.

## 4B. Patch backend (deliverable kedua — folder `backend-patch/` di output, siap copy ke project website Next.js lalu deploy Vercel)
Tulis file berikut dengan kode LENGKAP (bukan pseudo):
1. `backend-patch/src/lib/push.ts` — kirim push FCM ke semua device seorang user: pakai firebase-admin (init dari env `FCM_SERVER_KEY` = JSON service account, init sekali, lazy); fungsi sendPushToUser(userId, {title, body, data}) — ambil token user dari tabel DeviceToken, kirim multicast, token invalid/expired otomatis dihapus; SEMUA kegagalan push harus silent (try-catch, jangan pernah menggagalkan request API utama).
2. `backend-patch/prisma/schema-addition.prisma` — model DeviceToken: id (cuid), userId (FK ke User, onDelete cascade), token (unique), platform, createdAt, updatedAt.
3. `backend-patch/src/app/api/push/register/route.ts` — POST {token, platform} (requireUser) → upsert DeviceToken (token unik per user) → {ok:true}.
4. `backend-patch/src/app/api/push/unregister/route.ts` — POST {token} (requireUser) → delete token milik user itu → {ok:true}.
5. `backend-patch/src/app/api/push/test/route.ts` — POST tanpa body (requireUser) → sendPushToUser ke diri sendiri dengan judul "SkelzHUB" body "Notifikasi aktif!" → untuk verifikasi setup.
6. `backend-patch/INTEGRASI-NOTIFY.md` — instruksi persis: tambahkan hook di fungsi notify() yang sudah ada di src/lib/api-utils.ts website (setelah baris notify DB create sukses): panggil sendPushToUser(userId, judul + body Bahasa Indonesia sesuai type — "menyukai postinganmu", "mengomentari postinganmu", "mulai mengikuti kamu", "meminta untuk mengikuti kamu", "menerima permintaan ikut kamu", "melihat story-mu", "menyukai story-mu", "mengomentari story-mu", "memposting ulang postinganmu", dan pesan chat baru "Pesan baru dari {nama}"), sertakan cuplikan kode hook-nya; serta PENGECUALIAN: notifikasi MESSAGE (jika ada) hanya push bila penerima sedang TIDAK di room itu — deteksi sederhana: push selalu kecuali penerima aktif dalam 30 detik terakhir di conversation terkait (pakai field presence yang ada).
7. `backend-patch/DEPLOY.md` — langkah deploy: (a) buat Firebase project → aktifkan Cloud Messaging → buat service account → salin JSON ke env Vercel `FCM_SERVER_KEY`; (b) npx prisma db push (model DeviceToken) ke DATABASE_URL produksi; (c) copy file route + push.ts ke project web, integrasikan hook notify(); (d) deploy Vercel; (e) tes: login di aplikasi → POST /api/push/test → push muncul di HP.
Catatan: pesan chat baru saat ini TIDAK membuat notifikasi di server (hanya like/komentar/follow/story) — patch ini boleh menambahkan notify MESSAGE di route messages POST bila mudah (opsional, tandai jelas di INTEGRASI-NOTIFY.md).

# 5. STORY: LIHAT STORY SENDIRI TIDAK DIHITUNG (PERBAIKAN WAJIB DUA SISI)

- Sisi aplikasi: saat membuka story milik sendiri (group isMe=true), JANGAN panggil POST /api/stories/{id}/view — pemilik tidak boleh menambah penontonnya sendiri; progress ring story sendiri tetap jalan normal tanpa mencatat view. Untuk story orang lain, POST /view tetap dipanggil saat story selesai tampil (atau saat melewati 80% durasi) — supaya ring server-side akurat antara web dan app.
- Sisi backend patch (file tambahan):
  8. `backend-patch/src/app/api/stories/[id]/view/route.ts` (REVISI file asli — sertakan kode lengkap): jika viewer === author → balas {ok:true} TANPA membuat StoryView dan TANPA notify (pemilik tidak dihitung dan tidak dapat notifikasi dirinya sendiri).
  9. `backend-patch/src/app/api/stories/[id]/route.ts` (REVISI file asli — kode lengkap): daftar `viewers` dan `viewCount` MENGKELUARKAN pemilik story (filter v.user.id !== story.authorId) — angka penonton yang tampil ke pemilik adalah penonton orang lain saja.
- Sisi aplikasi (tampilan pemilik): halaman penonton menampilkan viewCount dari server + daftar viewers; tampilkan empty state elegan "Belum ada penonton" bila kosong.

# 6. TARGET PERFORMA NATIVE (HARD)

- 60fps: ListView.builder/PageView.builder + pagination nextPage; RepaintBoundary pada media; cached_network_image memCacheWidth proporsional layar; video dispose controller (WAJIB, tanpa leak).
- Kompresi sebelum upload: EXIF dibenarkan, sisi panjang ≤2048px (post/chat) atau crop 1080x1920 (story), kualitas 85-90 — hasil TIDAK boleh buram. Preview "asli X MB → hasil Y MB".
- Debounce pencarian 300ms + CancelToken; polling berhenti saat app background (hemat baterai).
- Offline: connectivity_plus → banner "Kamu sedang offline" + retry; semua state: loading skeleton / empty / error + "Coba lagi".

# 7. DESIGN SYSTEM v4 (ANTI-JADUL, ANTI-OVERFLOW)

- Identitas: gradient primer #FF6A00 → #EE1B7A (oranye→magenta) untuk aksi utama, ring story belum dilihat, tombol create (+) besar di tengah bottom bar, indikator aktif; latar terang #FAFAFA / gelap #0F1115; dark+light mode ikut sistem.
- Bentuk: radius 20-24 kartu, 999 pill; shadow lembut (bukan border abu kaku); tipografi Inter 400/600/700; format angka "1,2 rb", waktu "2 mnt lalu / Kemarin".
- Bottom nav kustom 5 slot: Beranda, Cari, Shorts, (+) create gradient menonjol, Chat (badge unread), Profil; item aktif ikon terisi + pill gradient; safe-area.
- Kartu feed premium: rounded-24, header avatar ring-gradient + nama + waktu relatif, media AspectRatio 4:5 ClipRRect, caption ellipsis + "selengkapnya", baris aksi like/komentar/repost/simpan + angka, double-tap like animasi hati, pull-to-refresh warna brand.
- Avatar null → gradient dari avatarColor (8 pasangan warna untuk index 0-7).
- Micro-interaction: tap scale 0.97, transisi slide+fade 220-250ms, Hero foto → lightbox InteractiveViewer zoom, haptic ringan.
- ATURAN KERAS LAYOUT: nol "RenderFlex overflowed" pada 320/375/412/768/900 dp — Row/Column pakai Expanded/Flexible, teks panjang selalu ellipsis, SafeArea + Scaffold, composer chat naik dengan MediaQuery viewInsets, grid pakai LayoutBuilder, gambar selalu AspectRatio/ClipRRect. Audit tiap layar sebelum selesai.
- Ikon konsisten satu gaya outline.

# 8. SPESIFIKASI FITUR (SEMUA JALAN, DATA NYATA, SINKRON DENGAN WEBSITE)

8.1 Feed: rail story atas; shortcut composer; infinite scroll nextPage + skeleton; pull-to-refresh; tab Utama/Mengikuti; like/save/repost optimistik + rollback; komentar bottom-sheet + balasan + preview 2 komentar; repost bersarang; hidden → "Konten tersembunyi".

8.2 Story + ring: menekan ring avatar → bottom-sheet "Lihat Story" / "Buka Profil" / "Kirim Pesan" (TIDAK langsung buka viewer). Ring gradient = belum dilihat, abu tipis = sudah dilihat (seen/hasUnseen API + POST /view untuk story ORANG LAIN saja — lihat bagian 5). Viewer PageView: progress segmented, tap kanan/kiri, tahan pause, swipe down tutup, like + komentar sheet + share. Pemilik: tombol penonton → GET /api/stories/{id} → daftar + jumlah (server sudah membuang diri sendiri setelah patch); empty "Belum ada penonton".

8.3 Shorts: PageView vertikal (feed=shorts), autoplay muted loop, tap suara, double-tap like + hati, bar aksi kanan, komentar sheet, progres tipis, preload 1 video.

8.4 Chat: daftar (search, unread bold + badge, preview per kind "[Foto] [Video] [Suara] [Pesan dihapus]"), poll 5 dtk. Room: header avatar + nama + "Online"/"Terakhir aktif", bubble modern (gradient pesanku / abu lawan, radius asimetris, timestamp, 1 centang terkirim / 2 centang aksen readAt, "Diedit", placeholder "Pesan dihapus"), grouping, pemisah hari, typing 3 titik (poll since), kirim teks/foto/video/voice; FOTO+CAPTION SATU REQUEST & SATU BUBBLE (caption menyatu di bawah foto — bug lama, WAJIB benar); reply quote, reaksi emoji, edit/hapus (swipe), share post ke chat, poll since 2 dtk, auto-dibaca.

8.5 Pencarian global: search bar besar, debounce 300ms + cancel, GET /api/search, tab Semua/Akun/Postingan/Video; recent search lokal (hapus satu/semua); kosong: /api/suggestions + grid explore; highlight keyword; input aneh tidak boleh crash (trim + guard); empty "Tidak ada hasil untuk 'xxx'".

8.6 Notifikasi: ikon tipe + teks natural, thumbnail post, grouping hari, badge unread (tab + bell), mark all read, poll 30 dtk, tap → tujuan; PLUS push FCM + banner foreground + deep-link (bagian 4A).

8.7 Profil: header avatar + ring story, nama + username + badge role, bio, stats (buka list followers/following + tombol ikuti per baris); tombol: sendiri = Edit Profil; orang lain = Ikuti / "Diminta" / "Sudah Diikuti" + Pesan (POST /api/conversations → room); tab Postingan/Reposts/Tersimpan; grid 3 kolom; akun privat → "Akun ini privat" + Ikuti; edit profil (nama, bio, toggle privat, avatar crop + upload, ganti password); follow optimistik + rollback.

8.8 Create: multi foto ≤10 atau 1 video, kompresi + preview "asli → hasil", caption 2200, share ke Feed atau Story (crop 1080x1920 + caption 500), progres upload onSendProgress + progress bar, selesai → toast + refresh feed page=0.

8.9 Pengaturan: tampilan terang/gelap/sistem, status push (aktif/belum aktif + tombol "Tes notifikasi" memanggil /api/push/test, sembunyikan bila 404), keluar akun, ganti password, tentang SkelzHUB v4.

8.10 Tablet ≥900dp: chat dua panel rapi tanpa ruang kosong janggal; feed grid lebih lebar.

# 9. IKON APLIKASI + SPLASH (LEBIH BAGUS)

- Ikon: rounded-square gelap #0F1115 + monogram "S" gradient #FF6A00→#EE1B7A + glow tipis, flat premium, terbaca 48px; flutter_launcher_icons adaptive Android (foreground/background, safe-zone) + iOS 1024 tanpa transparansi; sertakan flutter_launcher_icons.yaml.
- flutter_native_splash.yaml: latar gelap + logo "S" + bar progress kecil; transisi mulus ke layar pertama.

# 10. STRUKTUR PROYEK (BERSIH & MODULAR)

lib/
- main.dart (bootstrap: cookie jar persist, ProviderScope, theme, connectivity, heartbeat, push init)
- core/api/ (api_client.dart: dio + CookieManager + interceptor 401 + helper get/post/patch/delete/upload; api_exception.dart; endpoints.dart)
- core/models/ (me, user, post, comment, conversation, message, story, notification, upload_result)
- core/theme/ (app_colors: gradient brand + 8 avatar gradient; app_text; app_shimmer)
- core/widgets/ (avatar ring story, app_button, skeleton, empty_state, error_state, media lightbox, time_ago, number_id, in_app_banner notifikasi)
- core/push/ (push_service.dart: init, permission, token, register/unregister, foreground banner, deep-link routing, fallback 404)
- features/auth/ (login 2 langkah + kode + register + lupa password)
- features/feed/ (list + kartu post + komentar sheet)
- features/stories/ (rail + ring + sheet pilihan + viewer + penonton)
- features/shorts/
- features/chat/ (daftar + room + composer foto-caption + voice)
- features/search/
- features/notifications/
- features/profile/ (profil + edit + followers/following)
- features/create/
- features/settings/
- shell/ (bottom nav kustom + lifecycle sync manager)
backend-patch/ (bagian 4B + 5: push.ts, register, unregister, test, view+detail story revisi, schema-addition.prisma, INTEGRASI-NOTIFY.md, DEPLOY.md)
Aturan: file ≤ ±250 baris, satu tanggung jawab per file, riverpod AsyncNotifier + family untuk pagination.

# 11. CARA MENGERJAKAN (EFFORT MAKSIMAL — WAJIB)

Langkah 1 — rencana ≤30 baris: daftar file final urut (app + backend-patch).
Langkah 2 — kode LENGKAP file demi file. JANGAN potong file di tengah, JANGAN tulis "..." atau "// sisanya sama". Konteks menipis → selesaikan file aktif, lanjut di pesan berikutnya dari file persis yang belum ditulis.
Langkah 3 — README: build (flutter create . --platforms=android,ios --project-name skelzhub; flutter pub get; flutter run; flutter build apk --release --split-per-abi), setup Firebase (google-services.json → Firebase project → service account → FCM_SERVER_KEY di Vercel), deploy backend-patch, dan catatan: TANPA konfigurasi API (baseUrl live).
Langkah 4 — QA self-audit (bagian 12) dan perbaiki semua temuan sebelum menutup.

# 12. QA — DEFINITION OF DONE (UJI SENDIRI SEBELUM SELESAI)

1. Nol error kompilasi; import & tipe konsisten.
2. Nol RenderFlex overflow di 320/375/412/768/900dp; keyboard tidak menutup composer; teks panjang selalu ellipsis.
3. SINKRON SATU DATABASE (bukti skenario): post dari app muncul di web; like web terlihat di app setelah resume; chat app↔web sampai ≤2 dtk; story web muncul di app setelah pull-refresh; data TIDAK PERNAH dummy.
4. Push: token terdaftar (register 200 saat patch sudah deploy; 404 → fallback diam tanpa error); foreground banner; background tray; TAP → navigasi benar; tes /api/push/test; push gagal tidak pernah menggagalkan fitur utama.
5. Story sendiri: membuka story sendiri TIDAK menambah penonton; setelah patch backend, daftar penonton & jumlah TIDAK memuat diri sendiri; ring story orang lain jadi abu setelah dilihat (persist server).
6. Login 2 langkah + akun tanpa email; register; auto-login boot; 401 → auto logout; offline banner; semua layar punya skeleton/empty/error.
7. Semua controller video/audio dispose; polling berhenti saat background.
8. UI: modern, gradient brand konsisten, tidak jadul, nol placeholder/TODO/lorem, Bahasa Indonesia natural.

Kualitas akhir harus terasa seperti aplikasi buatan tim produk sungguhan bertahun-tahun — bukan template AI, bukan tampilan jadul, dan SINKRON SEMPURNA dengan website SkelzHUB karena memakai satu database yang sama.

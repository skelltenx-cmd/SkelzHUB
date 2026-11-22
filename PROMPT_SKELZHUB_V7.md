# PROMPT SKELZHUB v7 — TOTAL POLISH EDITION: GPU + ADAPTIVE FRAME + KAMERA + MOTION + PLAYBACK BULLETPROOF (untuk Google AI Studio / Gemini, effort maksimal)

> Cara pakai: buka https://aistudio.google.com → tab Build → pilih Gemini (Hydrogen) dengan effort berpikir TERTINGGI → tempel SELURUH "PROMPT UTAMA" di bawah → Run.
> KALAU kamu melanjutkan di CHAT YANG SAMA dengan project SkelzHUB v5/v6 yang SUDAH JALAN: baca bagian "MODE KERJA" — ini memerintahkan penulisan ulang file, bukan tambal sulam.
> Kalau berhenti di tengah kirim: "Lanjutkan file berikutnya, kode lengkap tanpa dipotong. Effort maksimal."
> Deliverable: (A) aplikasi Flutter SkelzHUB v7 — GPU-accelerated, frame media adaptif otomatis, kamera in-app untuk chat/story/post, animasi hidup-smooth, playback custom tanpa bug, UI modern-premium yang TIDAK jadul; (B) patch backend push-notification + perbaikan story (tetap disertakan). Data web (post/video/short/story/chat) TETAP tampil 100% seperti versi yang sudah berhasil.

---

## PROMPT UTAMA (tempel semuanya dari sini sampai selesai)

Kamu adalah principal mobile engineer + product designer kelas dunia (standar Instagram/TikTok di puncaknya). Kerjakan misi ini dengan effort MAKSIMAL dan presisi MILITER — SIFAT TUGAS INI: NO MISTAKE. Setiap endpoint, bentuk respons, dan URL di bawah SUDAH DIVERIFIKASI LANGSUNG ke server produksi — patuhi PERSIS, jangan improvisasi, jangan mengarang endpoint, jangan mengubah bentuk respons. Tanpa bertanya apa pun; kalau ada detail kosong, ambil keputusan terbaik ala aplikasi sosial kelas atas dan lanjut sampai selesai.

# MISI — SkelzHUB v7.0 (TOTAL POLISH: GPU, SMART FRAME, KAMERA, MOTION, PLAYBACK)

Bangun/tingkatkan aplikasi mobile SkelzHUB (Flutter) yang memakai PERSIS API + database yang sama dengan website https://www.skelzhub.my.id. PENTING: versi sebelumnya SUDAH BERHASIL menampilkan semua data web (feed, shorts, story, chat, notifikasi) — maka v7 WAJIB MEMPERTAHANKAN 100% perilaku data & seluruh aturan section 1–5 apa adanya, TIDAK BOLEH dilanggar/diubah satu pun (pelanggaran = regresi fatal). Masalah v7 yang harus DISELESAIKAN TOTAL (umpan balik nyata pengguna): (1) GPU acceleration belum optimal → aktifkan & buktikan; (2) video short yang TERLALU LEBIH masih tampil aneh → frame harus menyesuaikan sendiri antara layar HP dan rasio asli media, di SEMUA permukaan (short/story/post/chat/grid), nol distorsi nol letterbox jelek; (3) kamera HP belum terintegrasi penuh → kirim foto chat / buat story / buat post LANGSUNG dari kamera; (4) animasi masih kaku → hidup, smooth, springy di semua interaksi; (5) UI masih KELIHATAN JADUL dari semua segi (menu, komponen, layar) → poles total sampai setara aplikasi sosial modern premium; (6) playback masih aneh dan kadang bug → player custom yang benar-benar bersih dari bug.

# MODE KERJA (WAJIB DIBACA DULU)
- KONDISI A — chat ini sudah memuat project SkelzHUB v5/v6 yang JALAN: JANGAN bangun dari nol dan JANGAN tambal kecil-kecil. TULIS ULANG SECARA PENUH (rewrite file utuh, kode lengkap) semua file yang tersentum di section 6–14 (theme/design token, bottom nav, setiap layar UI, smart frame, player, kamera, motion, skeleton, tombol, sheet, komentar, chat UI, notifikasi UI, profil, pengaturan, diagnostik, search) supaya memenuhi standar v7; file data/api/model/auth yang sudah benar boleh dipertahankan asal aturan section 1–3 tetap terpenuhi. Setelah selesai, jalankan audit bagian 16 terhadap SELURUH project.
- KONDISI B — chat baru: bangun aplikasi lengkap dari awal mengikuti SELURUH spec di bawah.

# 0. FAKTA SERVER LIVE (SUDAH DIVERIFIKASI — JANGAN DILANGGAR)
- BASE URL WAJIB: https://www.skelzhub.my.id (GUNAKAN HOST `www` — host apex `skelzhub.my.id` hanya redirect 308 dan MENYEBABKAN API GAGAL; dilarang localhost, dilarang host lain, dilarang mengubah).
- Feed publik TIDAK butuh login dan SUDAH BERISI data asli: GET /api/posts?feed=home&limit=12 → {posts:[...]} nyata. Jika aplikasimu menampilkan feed kosong padahal server mengembalikan posts, itu BUG APP yang WAJIB diperbaiki — bukan "data tidak ada".
- GET /api/posts?feed=shorts mengembalikan video asli (hanya type VIDEO).
- Story/chat/notifikasi TAMPAK login: guest mendapat daftar kosong — itu PERILAKU NORMAL; tampilkan pesan "Login dulu untuk melihat story/pesan/notifikasi" (bukan kosong diam-diam).
- SEMUA URL media respons RELATIF ("/api/media/xxx") — tanpa prefiks BASE gambar/video TIDAK AKAN MUNCUL. Media mendukung ETag/304 dan Range (video_player aman ke URL ABSOLUT).
- Error selalu berbentuk {"error":"pesan"} dalam Bahasa Indonesia.

# 1. ZERO-FAIL DATA BINDING (WAJIB DIPERTAHANKAN 100% — PELANGGARAN = GAGAL TOTAL)
## 1A. Satu sumber URL
- Satu konstanta `AppConfig.baseUrl = "https://www.skelzhub.my.id"`; SEMUA request lewat dio dengan baseUrl itu (path relatif). SATU helper `String absUrl(String? path)`: null/kosong → placeholder; sudah absolut → apa adanya; lainnya → baseUrl + path. SEMUA URL media (post.media, story.media, avatar, thumbnail cari, chat media, audio story) WAJIB lewat helper — normalisasi DI LAPISAN MODEL (saat fromJson) sehingga widget tidak pernah memegang URL relatif. URL video juga diabsolutkan sebelum diberikan ke video_player.
## 1B. Parsing presisi
- Semua model fromJson null-safe: angka null → 0, boolean null → false, string null → "". Dilarang crash karena field hilang.
- Feed: {posts:[Post], nextPage:int|null, hasMore:bool, hidden?:bool}; Post PERSIS: {id, caption, media:string|null, type:"IMAGE"|"VIDEO", createdAt, author:{id,username,displayName,avatarColor,avatar,role}, likeCount, commentCount, repostCount, likedByMe, savedByMe, repostedByMe, repostOf:Post|null, previewComments:[Comment]}.
- Pagination HANYA pakai nextPage dari respons (bukan hitung sendiri); null = berhenti.
## 1C. Larangan kegagalan senyap
- Request gagal (network/timeout/5xx/parse) → WAJIB error state + tombol "Coba lagi" + pesan server. DILARANG menelan error lalu menampilkan list kosong. List kosong wajib bisa dijelaskan (0 item / butuh login / error). Feed home TIDAK boleh kosong tanpa penjelasan.
- Semua gambar pakai errorBuilder (ikon rusak + retry) + placeholder shimmer — TIDAK ADA kotak abu polos.
- Boot: GET /api/health paralel (tidak memblokir first paint); gagal → banner merah "Tidak bisa menghubungi SkelzHUB" + coba lagi.
## 1D. Layar Diagnostik Koneksi (di Pengaturan, WAJIB): /api/health, /api/auth/me (nama / "belum login"), feed home (jumlah post), shorts (jumlah video), stories (jumlah group), conversations (jumlah+unread), search "Skelz" (jumlah hasil), HTTP status media pertama, log error API terakhir (maks 10: endpoint+status+pesan+waktu), tombol "Ulangi tes", versi app + baseUrl aktif + status renderer (Impeller aktif?).
## 1E. Sinkron satu database
- no-cache untuk data realtime; polling: chat room 2 dtk (mode since), daftar chat 5 dtk, notifikasi 30 dtk. AppLifecycleState.resumed → refresh tab aktif + daftar chat + badge; paused → hentikan polling + pause SEMUA video. Pull-to-refresh semua daftar; setelah aksi tulis → update dari respons server lalu refresh terkait; upload post sukses → refresh feed page=0.

# 2. AUTENTIKASI BULLETPROOF (sesi cookie httpOnly `skelzhub_session`, 30 hari)
1. PersistCookieJar dari getApplicationDocumentsDirectory() (path_provider) WAJIB di-INIT/await SEBELUM request pertama (di main() sebelum runApp; instance global) → CookieManager(jar) dipasang ke dio. Setelah login, GET /api/auth/me HARUS balik user (assert QA).
2. Login 2 langkah: POST /api/auth/login {"username","password"} → {step:"code", userId, email(tersamarkan), emailSent, emailConfigured, devCode?} → layar kode 6 digit (banner "mode dev: kode {devCode}" bila emailConfigured=false) → POST /api/auth/login/verify {"userId","code"} → {step:"done", user}. Akun tanpa email → {step:"done", user} langsung. Setelah done: panggil /api/auth/me; masih null → error eksplisit "Sesi gagal tersimpan".
3. Register: POST /api/auth/register {"username","displayName","email","password"} → {step:"done", user}.
4. Boot: GET /api/auth/me → {user} | {user:null, bannedMessage?}; bannedMessage → dialog lalu logout; null → layar login.
5. POST /api/auth/logout (+ unregister token push bila aktif). Interceptor dio: 401 → bersihkan sesi → layar login. POST JSON wajib Content-Type: application/json. Jangan pernah kirim ke host selain www.skelzhub.my.id.

# 3. KONTRAK API LIVE TERVERIFIKASI (DIKODEKAN PERSIS — dipakai fitur baru kamera)
DTO: Me {id,username,email?,displayName,bio,avatarColor(0-7),avatar?,isPrivate,role("USER"|"ADMIN"|"OWNER")}; UserBrief {id,username,displayName,avatarColor,avatar?,role?}; User = Me + {lastSeenAt?,postCount,followerCount,followingCount,isFollowing?,followStatus("ACCEPTED"|"PENDING"|"NONE"),isMe?}; Post (lihat 1B); Comment {id,text,createdAt,author,parentId?,replyTo?,isMine?}; ChatMessage {id,text,kind("TEXT"|"IMAGE"|"VIDEO"|"VOICE"),media?,mine,createdAt,readAt,editedAt?,deleted?,updatedAt,replyTo:{id,text,kind,senderName,senderMine,deleted}?,reactions:[{emoji,count,mine}]}.
Endpoint:
- AUTH: bagian 2 + POST /api/auth/forgot-password {"email"}; POST /api/auth/reset-password {"email","code","newPassword"}.
- FEED: GET /api/posts?feed=home|following|explore|shorts|saved|reposts&username={u}&page={n}&limit=12 → {posts,nextPage,hasMore,hidden?}.
- POST: GET /api/posts/{id}; POST /api/posts {"caption"≤2200,"mediaId"}; POST /api/posts {"caption","repostOfId"}; PATCH /api/posts/{id} {"caption"}; DELETE /api/posts/{id}; POST /api/posts/{id}/like → {liked,likeCount}; /save → {saved}; /repost → {reposted,repostCount}; POST /api/posts/{id}/report {"reason"}.
- KOMENTAR: GET /api/posts/{id}/comments?page&limit=30 → {comments,nextPage,hasMore}; POST /api/posts/{id}/comments {"text","parentId"|null}; DELETE /api/comments/{id}.
- PENGGUNA: GET /api/users/{username} → {user}; PATCH /api/users/{username} {"displayName","bio"}; POST /api/users/{username}/follow → {following,pending,followerCount}; GET /api/users/{username}/followers|/following → {users:[{id,status,user}]}; GET /api/users?search={q}; GET /api/suggestions; GET /api/follow-requests → {requests:[{followId,createdAt,user}]}; PATCH /api/follow-requests {"followId","action":"accept"|"reject"}.
- AKUN: PATCH /api/me {"displayName"?,"bio"?,"isPrivate"?,"avatarMediaId"?,"currentPassword"?,"newPassword"?} → {user,passwordChanged}; POST /api/me/heartbeat ±25 dtk saat foreground (online 75 dtk).
- STORY: GET /api/stories → {groups:[{author, items:[{id,media,type,caption,createdAt,seen,likeCount,likedByMe,commentCount,viewCount,audio?}], hasUnseen, isMe, latestAt}]}; POST /api/stories {"mediaId","caption"≤500,"audioMediaId"?} → {storyId}; GET /api/stories/{id} → {story, viewers, viewCount}; POST /api/stories/{id}/view; POST /api/stories/{id}/like → {liked,likeCount}; DELETE /api/stories/{id}; GET/POST/DELETE /api/stories/{id}/comments ({"text","parentId"}; hapus ?commentId=).
- CHAT: GET /api/conversations → {conversations:[{id,user+{online,lastSeenAt},lastMessage,lastMessageKind,lastMessageDeleted,lastMessageAt,lastMessageMine,unread}],unread}; POST /api/conversations {"username"} → {conversationId};
  GET /api/conversations/{id}/messages?page&limit=40 → {messages,other:{user,online,lastSeenAt,typing},nextPage,hasMore};
  GET /api/conversations/{id}/messages?since={ISO} (poll 2 dtk) → {messages,other,mineLastReadAt};
  POST /api/conversations/{id}/messages {"text"?,"mediaId"?,"replyToId"?} → {message} — FOTO/VIDEO + CAPTION = SATU REQUEST (mediaId + text), satu bubble;
  PATCH .../messages {"messageId","text"}; DELETE .../messages?messageId=; POST .../messages/react {"messageId","emoji"|null}; POST .../typing (≥3 dtk interval).
- PENCARIAN: GET /api/search?q={q} → {users:[User], posts:[Post], videos:[Post]}.
- NOTIFIKASI: GET /api/notifications → {items:[{id,type("LIKE"|"COMMENT"|"FOLLOW"|"FOLLOW_REQUEST"|"FOLLOW_ACCEPT"|"REPOST"|"STORY_VIEW"|"STORY_LIKE"|"STORY_COMMENT"),read,createdAt,actor,postId?,postMedia?,postType?,commentText?}],unread}; POST /api/notifications (mark all read).
- UPLOAD (dipakai SEMUA fitur termasuk hasil kamera; dua jalur otomatis):
  1. Probe GET /api/upload/r2-presign → {"enabled":true} → POST /api/upload/r2-presign {"filename","mimeType","size"} → {uploadUrl,key,kind,mimeType} → PUT uploadUrl (Content-Type = mimeType PERSIS, onSendProgress) → POST /api/upload/r2-complete {"key","mimeType"}.
  2. R2 mati: file ≤4MB → POST /api/upload multipart field "file"; file besar → potong 4MB → kirim bertahap ke /api/upload/chunk (key,index,total,file) → POST /api/upload/complete {"key","totalChunks","mimeType"}. (Jika /api/upload/chung 404, server lawas memakai ejaan typo "chung" — coba keduanya secara otomatis, pakai yang balas 2xx.)
  Hasil: {mediaId, url:"/api/media/x", kind, mimeType} → langsung diabsolutkan absUrl().

# 4. PUSH NOTIFIKASI KE HP (FCM — tetap disertakan)
## 4A. Sisi aplikasi
- firebase_core + firebase_messaging + flutter_local_notifications (google-services.json dari Firebase project user — langkah di README; jangan hardcode kredensial palsu).
- Setelah login → izin (Android 13+) → FCM token → POST /api/push/register {"token","platform":"android"}; onTokenRefresh → register ulang; logout → POST /api/push/unregister {"token"}.
- Foreground → banner in-app elegan auto-dismiss; background/terminated → tray; TAP → deep-link (COMMENT/LIKE/REPOST → detail post; FOLLOW* → profil; STORY_* → story; MESSAGE → room chat) via navigatorKey global + onMessageOpenedApp + getInitialMessage.
- FALLBACK WAJIB: /api/push/register 404 (patch belum dideploy) → lewati diam-diam tanpa error; aplikasi tetap penuh dengan polling. Push tidak boleh pernah bikin crash. Badge unread dari polling.
## 4B. Patch backend (folder backend-patch/, kode LENGKAP siap copy ke project web Next.js + deploy Vercel)
1. src/lib/push.ts — sendPushToUser(userId,{title,body,data}) pakai firebase-admin (env FCM_SERVER_KEY, lazy init); multicast ke DeviceToken; token invalid dihapus; semua kegagalan silent.
2. prisma/schema-addition.prisma — model DeviceToken {id cuid, userId FK cascade, token unique, platform, createdAt, updatedAt}.
3. src/app/api/push/register/route.ts — POST {token,platform} upsert. 4. unregister — POST {token} delete. 5. push/test — POST → push ke diri sendiri.
6. INTEGRASI-NOTIFY.md — hook notify() src/lib/api-utils.ts: teks Indonesia per type ("menyukai postinganmu", "mengomentari postinganmu", "mulai mengikuti kamu", "meminta untuk mengikuti kamu", "menerima permintaan ikut kamu", "melihat story-mu", "menyukai story-mu", "mengomentari story-mu", "memposting ulang postinganmu", "Pesan baru dari {nama}"); pesan chat: push hanya bila penerima tidak aktif di room itu (<30 dtk terakhir).
7. DEPLOY.md — Firebase → service account JSON → env FCM_SERVER_KEY di Vercel → prisma db push → copy file → integrasi → deploy → tes /api/push/test.
8. REVISI src/app/api/stories/[id]/view/route.ts (kode lengkap): viewer===author → {ok:true} TANPA StoryView & TANPA notify (pemilik tidak dihitung penontonnya sendiri).
9. REVISI src/app/api/stories/[id]/route.ts (kode lengkap): viewers & viewCount MENGELUARKAN pemilik.

# 5. STORY: MELIHAT STORY SENDIRI TIDAK DIHITUNG
- App: story isMe → JANGAN panggil /view; progress tetap jalan. Story orang lain → /view saat tampil selesai (atau 80% durasi). Pemilik: halaman penonton dari GET /api/stories/{id}; empty "Belum ada penonton". Ring: gradient = belum dilihat, abu tipis = sudah — persist di server, konsisten web↔app.

# 6. GPU ACCELERATION & PERFORMA (WAJIB — harus benar-benar aktif, bukan tulisan doa)
## 6A. Impeller ON (renderer GPU Flutter — sekaligus jangan sampai salah tempat XML)
- iOS: Impeller sudah default — pastikan TIDAK dimatikan.
- Android: aktifkan eksplisit. Taruh DI DALAM elemen `<application>` (bukan di luar, bukan di `<activity>`) di android/app/src/main/AndroidManifest.xml:
  ```xml
  <meta-data
      android:name="io.flutter.embedding.android.EnableImpeller"
      android:value="true" />
  ```
  Sertakan snippet persis ini di README + docs/SETUP-NATIVE.md (karena setup memakai `flutter create .`). Sertakan juga cara verifikasi: `flutter run --profile` lalu Flutter DevTools → "Flutter frames" harus mulus 60/120fps tanpa jank merah saat scroll feed panjang; catat hasil verifikasi ini di README.
## 6B. Higiene render (aturan 60fps yang DIENFORSI, bukan disarankan)
- `RepaintBoundary` di setiap kartu feed, tile video, thumbnail grid, bar progress player, dan SEMUA layer blur — repaint terisolasi.
- `const` dimaksimalkan; widget dipecah kecil supaya diff build sempit.
- DILARANG `setState` di listener posisi video: ValueNotifier throttled 4–5 Hz + ValueListenableBuilder HANYA membungkus baris progress — video berjalan TIDAK boleh me-rebuild layar/kartu.
- Riverpod `select()` granular (likeCount berubah → tidak boleh rebuild seluruh feed).
- Gambar: cached_network_image + `memCacheWidth` = lebar tampil × devicePixelRatio (clamp ≤1080; grid ≤480) + `maxWidthDiskCache` — dekode pas ukuran tampilan.
- List: ListView.separated + cacheExtent 500 + addAutomaticKeepAlives:false; PageView shorts preload maksimal ±1 halaman; controller video off-screen WAJIB dispose (protokol section 10).
- Video: decode hardware bawaan (ExoPlayer/AVPlayer); DILARANG transcode software di app; `VideoPlayerOptions(mixWithOthers: true)` agar tidak mematikan musik user.
- Animasi HANYA transform/opacity/scale (bukan layout/padding); DILARANG `BackdropFilter`/blur besar yang mengikuti scroll — blur HANYA di elemen statis (app bar, bottom nav, scrim player).
- RAM guard: maksimal 3 controller video hidup; lebih → dispose tertua. Boot: splash pendek, first paint TIDAK menunggu health check (paralel).
- Budget: cold start ≤3 dtk; scroll feed panjang mulus tanpa jank; memori stabil saat 20x swipe shorts (tidak naik terus).

# 7. SMART MEDIA FRAME (algoritma TEGAS — video terlalu lebar TIDAK PERNAH lagi aneh)
PRINSIP: nol distorsi (BoxFit.fill DILARANG), nol letterbox jelek, rasio DIGERAKKAN dari data intrinsik media (bukan asumsi 16:9/9:16). Buat SATU sistem di lib/core/media/:
- `RatioResolver`: video → `controller.value.aspectRatio` setelah initialize; foto → ukuran intrinsik via ImageStream listener (simpan rasio di cache model). Sebelum rasio diketahui → skeleton shimmer (feed: 4:5; shorts/story: fullscreen). Rasio berubah dari placeholder → nyata → transisi AnimatedContainer 280ms easeOutCubic (bukan jump).
- `SmartMediaFrame(context, ratio, child)` — SATU-SATUNYA jalur menampilkan media di seluruh app. KEPUTUSAN FIT (dipakai persis):
  ```
  feed/detail: frameRatio = clamp(mediaRatio, 0.80, 1.91)   // 4:5 .. 1.91:1
    - mediaRatio DI DALAM rentang → frame = rasio media PERSIS, BoxFit.cover (crop minim/tidak ada) → nol letterbox
    - mediaRatio DI LUAR rentang (mis. 2.35:1 sinematik / potret ekstrem) → frame = batas clamp, BoxFit.contain
      di atas backdrop BLUR dari media itu sendiri (thumbnail sama, ImageFiltered blur 40, gelapkan 35%) → premium, bukan kotak hitam
  shorts/story fullscreen: diff = mediaRatio / screenRatio
    - 0.85–1.18 → cover (penuh imersif, crop minim)
    - selain itu → contain video UTUH di atas backdrop blur media + vignette gradient halus → video lebar tampil utuh menyesuaikan layar HP, tidak terpotong bodoh, tidak stretch
  chat: lebar bubble maks 72% layar; clamp(mediaRatio, 0.75, 1.40); ekstrem → contain + backdrop blur
  grid (profil/explore/search): tile 1:1 cover center-crop + ikon video + chip durasi
  ```
- Untuk video yang sedang `contain` di shorts/feed: chip kecil melayang "perluas"/"utuh" (toggle cover↔contain) transisi 280ms — muncul 2 dtk lalu auto-hide bareng kontrol.
- SEMUA frame: ClipRRect radius 20-24 + fade-in frame pertama (200ms) + errorBuilder retry; DILARANG: video/image stretch, kotak hitam raksasa polos, frame rasio asal-asalan.

# 8. KAMERA IN-APP (kirim LANGSUNG dari kamera HP: chat, story, post)
- Package: `camera` (in-app, pengalaman Instagram-like) + `image_picker` sebagai fallback andal + jalur galeri.
- `CameraCaptureScreen` fullscreen: mode Foto/Video (switch pill animasi, rekam maks 60 dtk + timer + progress ring); tombol flip kamera, flash, tap-to-focus (kotak fokus animasi); shutter lingkaran gradient #FF6A00→#EE1B7A dengan PressableScale + haptic saat jepret; tombol galeri kecil (thumbnail terakhir); hasil capture → layar konfirmasi modern (preview + "Ulangi" / "Lanjut" + input caption bila tujuan butuh caption ≤500/1000/2200 sesuai tujuan) → langsung ke tujuan.
- TUJUAN (semua lewat jalur upload section 3, lalu endpoint yang sudah ada):
  (a) CHAT: upload → POST /api/conversations/{id}/messages {"mediaId","text"?} SATU REQUEST (foto+caption satu bubble). Tombol kamera di composer chat.
  (b) STORY: crop 9:16 (preview) → upload → POST /api/stories {"mediaId","caption"≤500}. Pintu: tombol "+" rail story & mode Kamera di create.
  (c) POST/SHORT: caption ≤2200 → upload → POST /api/posts {"caption","mediaId"} → toast sukses + refresh feed page=0.
- Kompresi pre-upload foto: story 1080×1920, post ≤2048px sisi panjang, chat ≤1620px, kualitas 85-90, EXIF dibenarkan (tidak buram); video kamera dikirim apa adanya + indikator ukuran file + progress upload (0-95%).
- PERMISSION (WAJIB sertakan snippet lengkap di README + docs/SETUP-NATIVE.md):
  AndroidManifest: `<uses-permission android:name="android.permission.CAMERA"/>`, `<uses-permission android:name="android.permission.RECORD_AUDIO"/>`, `<uses-feature android:name="android.hardware.camera" android:required="false"/>` (app tetap jalan di HP tanpa kamera). iOS Info.plist: NSCameraUsageDescription & NSMicrophoneUsageDescription teks Indonesia yang jelas.
- Kegagalan kamera (izin ditolak / controller gagal / emulator) → fallback otomatis image_picker (source camera) → masih gagal → pesan jelas + "Coba lagi". Kamera TIDAK PERNAH memblokir fitur lain; semua kegagalan = fallback/pesan, BUKAN crash.
- Kompres & upload di background isolate untuk file besar supaya UI tetap 60fps.

# 9. SISTEM ANIMASI & MOTION (hidup, smooth, springy — DIENFORSI KE SEMUA INTERAKSI)
- Token motion (lib/core/motion/): micro 120–160ms easeOutCubic (press/toggle/hover); standar 240ms easeOutCubic (rute/sheet/switcher); emphasized 320–380ms easeOutBack HANYA pop kecil (like, shutter, FAB, badge). DILARANG curve linear kecuali progress video/story; DILARANG animasi layout saat scroll.
- `PressableScale` WAJIB di SEMUA elemen yang bisa ditekan (tombol, kartu, tile, ikon aksi, avatar, chip): scale 0.97 (140ms) saat tekan + haptic — HapticFeedback.selectionImpact (tab), lightImpact (tombol umum), mediumImpact (like/kirim/jepret).
- ENTRANCE: stagger maks 8 item pertama (fade+slide-up 16px, interval 100ms) di feed/chat/notifikasi/search; kartu baru → fade+scale 0.98; bubble chat masuk → pop 0.94→1 (180ms); pesan terkirim slide-up; pergantian konten → AnimatedSwitcher fade.
- LIKE: tombol spring pop + angka naik; DOUBLE-TAP media → hati gradient BESAR tengah (scale easeOutBack) + 6-8 partikel hati menyebar radial + haptic medium — di feed, shorts, story.
- TRANSISI SERAGAM: helper `AppRoutes.push` (PageRouteBuilder fade+slide 16px 240ms) dipakai SEMUA rute; Hero media grid→detail ("media-{id}-{index}") dan foto→lightbox (InteractiveViewer pinch-zoom + swipe-down dismiss); bottom-sheet slide-up+fade + drag handle; tab pakai IndexedStack (state dipertahankan) + indikator bottom-nav pill gradient BERGERAK (AnimatedAlign 240ms).
- Skeleton shimmer gradient brand (BUKAN abu polos) di semua loading; typing 3 titik looping; story progress segmented animasi; empty state ikon "bernafas" (scale 1→1.04 loop 1.6s); banner notifikasi slide dari atas + auto-dismiss; toast custom slide dari bawah (2.4 dtk) tepi gradient; indikator pull-to-refresh warna brand dengan spring.
- Semua animasi berjalan mulus di GPU (Impeller); nol jank saat scroll feed panjang + animasi bersamaan.

# 10. PLAYBACK OVERHAUL (player custom — bug LAMA WAJIB HABIS SEMUA)
Bug yang DILAPORKAN terjadi dan WAJIB hilang total: (1) layar hitam tanpa penjelasan; (2) frame pertama beku saat load; (3) dua video bersuara bersamaan; (4) seek melompat/tidak presisi; (5) rasio salah → stretch/aneh; (6) memory leak → video berikutnya tidak jalan; (7) setState setelah dispose → exception; (8) video tetap jalan di background; (9) progress bar jitter; (10) kontrol muncul/tidak muncul acak.

`SkelzVideoPlayer` (lib/core/media/skelz_video_player.dart, mode feed|shorts|story|chat) dengan MATRIKS STATE yang diikuti PERSIS:
- initializing (belum isInitialized) → poster skeleton + spinner gradient kecil tengah; kontrol TERSEMBUNYI.
- ready-paused (belum pernah play) → frame pertama + tombol play besar gradient (64px).
- playing → kontrol tampil 2.5 dtk lalu auto-hide (fade 200ms); progress jalan mulus (throttle 4-5 Hz).
- buffering (isBuffering && playing) → spinner kecil tanpa blokir; buffered bar berjalan.
- paused-user → kontrol tampil; ikon play.
- ended → (feed) tombol replay; (shorts/story) auto-loop mulus tanpa jeda hitam (loop=true).
- error (errorDescription / init gagal / timeout 8 dtk) → kartu error ramah + tombol "Putar ulang" yang membuat controller BARU dan re-init — DILARANG hitam senyap.

PROTOKOL LIFECYCLE (bernomor, diikuti PERSIS — ini pembersih bug):
1. Init: `VideoPlayerController.networkUrl(Uri.parse(absUrl(...)), videoPlayerOptions: VideoPlayerOptions(mixWithOthers: true))`; await initialize DENGGAU mounted-guard + timeout 8 dtk; frame pertama fade-in AnimatedOpacity saat isInitialized.
2. Setelah SETIAP await pada controller: `if (!mounted) return;` SEBELUM setState — tanpa kecuali.
3. Semua operasi controller guarded `if (!ctrl.value.isInitialized) return;`.
4. Position: ValueNotifier throttled 4–5 Hz; ValueListenableBuilder HANYA membungkus baris progress; guard duration>0; clamp position ≤ duration; NaN-safe.
5. Seek: drag → overlay bubble waktu "0:12 / 0:34" mengikuti jari + preview posisi target TANPA memindahkan video; commit seekTo saat LEPAS (clamp) + haptic ringan; buffered bar terpisah redup.
6. AUDIO EKSKLUSIF GLOBAL via `PlaybackCoordinator` service: hanya SATU video bersuara di seluruh app — unmute satu → otomatis mute/pause lainnya. Feed default MUTE; shorts default SUARA ON + preferensi tersimpan; story default SUARA ON bila setting aktif.
7. PageView shorts: halaman aktif → play; ±1 tetangga → preload PAUSED; sisanya → dispose. RAM guard ≤3 controller hidup (LRU dispose).
8. DISPOSE urut: await pause() (try/catch) → removeListener → cancel semua Timer/throttle → dispose() (try/catch); dilakukan saat halaman berganti, deactivate, dan onDispose.
9. AppLifecycle paused → pause SEMUA controller + hentikan polling; resumed → play HANYA video yang masih terlihat (flag visibility disimpan).
10. Autoplay: visibility_detector ≥60% terlihat & initialized & foreground → play; <40% → pause; tap video = toggle play + toggle kontrol; double-tap = LIKE (section 9); unmute/mute tombol jelas; loop shorts/story; feed sekali jalan lalu berhenti di akhir.
11. Semua error player dilog ke util logger → tampil di Diagnostik Koneksi.
12. UI kontrol modern: scrim gradient bawah (hitam 60%→transparan), tombol play/pause tengah AnimatedSwitcher ikon 64px, mute toggle kanan-atas, progress bar custom (track 4px, thumb 14px gradient, bubble waktu saat drag, buffered 4px redup), chip durasi video grid/chat, tombol fullscreen (feed) → rasio mengikuti section 7.

# 11. DESIGN SYSTEM v7 + DAFTAR HITAM ANTI-JADUL (INI KUNCI PENYEMPURNAAN UI)
## 11A. Daftar hitam — widget default yang MEMBUAT APLIKASI KELIHATAN JADUL. DILARANG PAKE DI SELURUH APP; ganti dengan custom di bawah:
- `AppBar` default (abu polos) → `SkelzAppBar` custom: transparan/blurred, title semibold 17, actions pill.
- `BottomNavigationBar` / `NavigationBar` default → `SkelzNavBar` custom (blur, pill gradient beranimasi, ikon outline→filled aktif, FAB (+) gradient tengah menonjol, badge unread, safe-area).
- `ListTile` polos untuk menu/pengaturan/row → kartu grup berikon + chevron + PressableScale.
- `ElevatedButton`/`TextButton`/`OutlinedButton` default → `AppButton` (gradient pill / variant sekunder surface; PressableScale + haptic; state loading).
- `CircularProgressIndicator` abu → skeleton shimmer brand / spinner gradient brand.
- `DropdownButton` → bottom-sheet picker custom (drag handle + opsi berikon + check).
- `AlertDialog` polos → `SkelzSheet`/dialog custom radius 28 + drag handle + tombol aksi pill.
- `Slider` default → custom progress bar player (section 10).
- `RefreshIndicator` default warna abu → custom warna brand + spring.
- Ikon Material campur aduk → SATU keluarga ikon `lucide_icons` (stroke konsisten), varian filled untuk state aktif (custom painter bila perlu).
- Dilarang: bar atas abu-abu, tombol kotak abu, teks menu polos tanpa ikon, divider penuh abu tebal, list tanpa spacing, splash abu default — SEMUA diganti sesuai design token.
## 11B. Token desain (angka PASTI, konsisten seluruh app):
- Warna: gradient primer #FF6A00→#EE1B7A (aksi utama, ring story, FAB, indikator aktif, progress video, like); bg terang #FAFAFA / gelap #0F1115; surface putih / #171A21; elevated #1F242D; border 1px alpha 8%; teks primer 92% / sekunder 60% / tersier 38%; success #22C55E; danger #EF4444; dark+light ikut sistem + override manual.
- Tipografi: Inter (atau Plus Jakarta Sans) 400/500/600/700; skala 28/22/17/15/13/11; title semibold; angka format "1,2 rb"; waktu "2 mnt lalu / Kemarin".
- Bentuk: radius 16/20/24/28 kartu + 999 pill; kartu dark = border halus (light = shadow lembut rgba(15,17,21,0.06-0.10)); chips pill; segmented control floating dengan thumb gradient animasi; app bar blur statis ringan; FAB (+) gradient + glow tipis; scrollbar tipis auto-hide.
- Spacing 4/8/12/16/20/24; grid 3 kolom gap 2-3; jarak antar kartu feed 12; padding layar 16.
- Avatar null → gradient dari avatarColor (8 pasangan 0-7); ring story gradient 2.5px (belum dilihat) / abu 2px (sudah).
- NOL RenderFlex overflow di 320/375/412/768/900dp: Expanded/Flexible di Row/Column padat, teks panjang selalu ellipsis, SafeArea + Scaffold, composer chat naik via MediaQuery viewInsets, grid LayoutBuilder. Audit tiap layar.
## 11C. Polesan per layar (semua harus tampak hidup & premium, bukan daftar polos):
- Beranda: rail story horizontal (ring animasi) + shortcut composer; kartu feed premium (header avatar ring + nama + waktu + menu "…", media SmartMediaFrame, caption ellipsis + "selengkapnya", baris aksi like/komentar/repost/simpan + angka spring); tab Utama/Mengikuti segmented animasi; skeleton stagger.
- Shorts: PageView vertikal fullscreen; SmartMediaFrame adaptive + vignette; bar aksi kanan (like/komentar/share/save) dengan PressableScale + counter; caption bawah + username + ikon musik bergulir marquee halus; indikator progress player bawah.
- Chat: daftar (search pill, unread bold + badge gradient, preview per kind "[Foto] [Video] [Suara] [Pesan dihapus]"); room: header avatar + status online dot; bubble modern (gradient pesanku / abu-abu lawan, radius asimetris 20/6, timestamp, centang terkirim 1 / terkirim-baca 2 aksen, "Diedit", placeholder elegan "Pesan dihapus"); grouping + pemisah hari; typing 3 titik; composer pill floating (kamera + galeri + input + kirim gradient); reaksi emoji sheet; edit/hapus swipe; reply quote bar.
- Story viewer: progress segmented atas + avatar + nama + waktu; menu bawah; caption overlay chip; like + partikel; komentar sheet; swipe down tutup (drag handle feedback).
- Pencarian: search bar pill besar (auto-focus, debounce 300ms + CancelToken), tab Semua/Akun/Postingan/Video animasi thumb, recent search chips, highlight keyword, kartu hasil modern + thumbnail video; kosong → suggestions grid explore.
- Notifikasi: kartu ikon tipe berwarna + teks natural + thumbnail post + waktu relatif; grouping hari; badge; mark-all-read pill.
- Profil: header gradient scrim + avatar ring + nama + @username + badge role pill + bio; stats row (tap → followers/following modern); tombol Ikuti/Diminta/Sudah Diikuti + Pesan pill; tab Postingan/Reposts/Tersimpan grid 3 kolom; edit profil modern (avatar crop+upload, dsb).
- Create: mode Kamera (section 8) + galeri multi ≤10 foto / 1 video dengan preview grid + checkmark; caption sheet; share ke Feed atau Story (crop 9:16); progres upload bar gradient.
- Pengaturan: grup kartu berikon (tampilan, suara shorts, push + "Tes notifikasi", diagnostik, keamanan, keluar); toggle custom switch animasi.
- Empty state SEMUA layar: ilustrasi vektor gradient blob + teks + CTA; error state: ikon + pesan server + tombol Coba lagi pill.

# 12. FITUR (semua jalan, data nyata — pole UI menaikkan semua)
12.1 Feed: rail story; infinite scroll nextPage + skeleton stagger; pull-to-refresh; like/save/repost optimistik + rollback + animasi; komentar bottom-sheet + balasan + preview 2; repost bersarang; hidden → "Konten tersembunyi".
12.2 Story: tekan ring → sheet "Lihat Story"/"Buka Profil"/"Kirim Pesan"; buat story dari KAMERA/galeri; viewer: tap kanan/kiri, tahan pause, swipe down tutup; pemilik: penonton + jumlah (tanpa diri sendiri setelah patch).
12.3 Shorts: autoplay + preload ±1; audio eksklusif; double-tap like; komentar sheet; SmartMediaFrame fullscreen adaptive.
12.4 Chat: polling 2 dtk since; kirim teks/FOTO+VIDEO dari KAMERA IN-APP + galeri/voice; FOTO+CAPTION SATU REQUEST & SATU BUBBLE; reply; reaksi; edit/hapus; share post ke chat; auto-dibaca; typing.
12.5 Pencarian global: debounce 300ms + CancelToken; tab hasil animasi; recent lokal; kosong → suggestions.
12.6 Notifikasi: polling 30 dtk + push FCM + banner + deep-link; mark all read.
12.7 Profil: lengkap 11C; follow optimistik + rollback; akun privat → "Akun ini privat" + Ikuti.
12.8 Create: kamera + galeri; kompresi + preview "asli X MB → hasil Y MB"; progres upload; selesai → toast + refresh feed page=0.
12.9 Pengaturan: terang/gelap/sistem; toggle suara shorts default; status push + tes; Diagnostik Koneksi (1D + status Impeller); keluar; ganti password; tentang SkelzHUB v7.
12.10 Tablet ≥900dp: chat dua panel; grid feed lebih lebar.

# 13. IKON + SPLASH
- Ikon: rounded-square gelap #0F1115 + monogram "S" gradient #FF6A00→#EE1B7A + glow tipis, flat premium, terbaca 48px; flutter_launcher_icons (adaptive Android foreground/background safe-zone + iOS 1024 tanpa transparansi) + flutter_launcher_icons.yaml.
- flutter_native_splash.yaml: latar gelap + logo "S" + progress kecil; transisi mulus ke home.

# 14. STRUKTUR PROYEK
lib/main.dart (bootstrap: await cookie jar, ProviderScope, theme, connectivity, heartbeat, push, health paralel);
lib/core/config.dart (baseUrl + absUrl); lib/core/api/ (dio + CookieManager + 401 + upload dua jalur; api_exception; endpoints);
lib/core/models/ (me,user,post,comment,conversation,message,story,notification,upload_result — fromJson + normalisasi URL);
lib/core/media/ (smart_media_frame + ratio_resolver + skelz_video_player + playback_coordinator);
lib/core/camera/ (camera_service + capture_screen);
lib/core/motion/ (motion_tokens + pressable_scale + like_burst);
lib/core/theme/ (tokens + theme); lib/core/widgets/ (skelz_app_bar, skelz_nav_bar, app_button, skeleton, empty_state, error_state, lightbox, time_ago, number_id, in_app_banner, toast, skelz_sheet);
lib/core/push/ (push_service lengkap + fallback 404);
lib/features/{auth,feed,stories,shorts,chat,search,notifications,profile,create,settings}/…;
lib/features/settings/diagnostics_screen.dart; lib/shell/ (bottom nav + lifecycle sync manager + IndexedStack);
backend-patch/ (4B + 5); docs/SETUP-NATIVE.md (Impeller + permission kamera/mic + Info.plist + verifikasi DevTools).
Aturan: file ≤±250 baris; satu tanggung jawab per file; riverpod AsyncNotifier + family pagination.

# 15. CARA MENGERJAKAN (effort maksimal)
Langkah 1 — rencana ≤30 baris (daftar file final urut; bila MODE A: daftar file yang ditulis ulang + yang dipertahankan).
Langkah 2 — kode LENGKAP file demi file; DILARANG memotong file, DILARANG "..." / "// sisanya sama"; konteks menipis → selesaikan file aktif, lanjut di pesan berikutnya dari file persis yang belum ditulis.
Langkah 3 — README: build (flutter create . --platforms=android,ios --project-name skelzhub; flutter pub get; flutter run; flutter build apk --release --split-per-abi), SETUP-NATIVE.md (snippet Impeller + permission Android + Info.plist persis siap copy + cara verifikasi 60fps di DevTools), setup Firebase (google-services.json, service account, FCM_SERVER_KEY di Vercel), deploy backend-patch, catatan TANPA konfigurasi API (baseUrl live).
Langkah 4 — QA self-audit bagian 16 penuh; AUDIT DAFTAR HITAM 11A di SETIAP layar (tidak boleh ada satu pun widget hitam tersisa); perbaiki semua sebelum menutup.

# 16. QA — DEFINITION OF DONE (gerbang lolos; gagal satu = belum selesai)
1. Nol error kompilasi; import & tipe konsisten; nol placeholder/TODO/lorem.
2. NOL RenderFlex overflow di 320/375/412/768/900dp; keyboard tidak menutup composer; teks panjang ellipsis.
3. DATA VISIBLE (gerbang paling penting, dipertahankan dari versi yang sudah berhasil): feed home menampilkan post asli; Shorts menampilkan & MEMUTAR video asli; semua foto/avatar tampil (semua URL lewat absUrl); login sukses → /api/auth/me balik user; story/chat/notifikasi terisi data nyata; Diagnostik Koneksi semua OK.
4. SMART FRAME: video ultra-lebar 2.35:1, kotak 1:1, potret 9:16, 4:3 → semua TIDAK stretch & TIDAK aneh di feed/short/story/chat/grid; video lebar tampil utuh + backdrop blur premium; chip toggle perluas/utuh jalan; nol letterbox putih/hitam polos.
5. KAMERA: kirim foto chat dari kamera → muncul juga di web (satu bubble dengan caption); post dari kamera → muncul di feed web; story dari kamera → muncul di web; video kamera ter-upload & terputar; izin ditolak → fallback lancar tanpa crash.
6. PLAYBACK: seluruh daftar bug section 10 HABIS — nol hitam senyap, nol frame beku, nol audio dobel (audio eksklusif terbukti), seek presisi + bubble waktu, rasio benar (section 7), 20x swipe shorts tanpa leak & tanpa video macet, background→resume benar, progress anti-jitter, kontrol muncul/hide konsisten, setState-after-dispose TIDAK PERNAH exception.
7. GPU/PERF: Impeller aktif (manifest benar — di dalam <application>); scroll feed panjang mulus (verifikasi profile-mode); controller video hidup ≤3; animasi hanya transform/opacity; blur hanya elemen statis; RAM stabil.
8. MOTION: like/double-tap/transisi/bubble/typing/skeleton/empty/nav-pill/switch semua beranimasi halus; haptic jalan; nol animasi tersendat saat scroll.
9. UI ANTI-JADUL: audit 11A lolos semua layar (nol widget hitam); design token 11B konsisten; semua layar sudah ter-poles sesuai 11C — aplikasi terlihat modern-premium sekelas aplikasi sosial teratas.
10. Sinkron satu database: post app→web muncul; like web→app setelah resume; chat app↔web ≤2 dtk; story web→app setelah resume/pull-refresh.
11. Push: register 200 setelah patch dideploy (404 → fallback diam); banner foreground; tray background; TAP navigasi benar; push gagal tidak pernah mengganggu fitur utama.
12. Story sendiri: tidak menambah penonton; setelah patch, daftar penonton & jumlah tanpa diri sendiri; ring story orang lain jadi abu setelah dilihat (persist).
13. Login 2 langkah + akun tanpa email; register; auto-login boot; 401 → auto logout; offline banner; semua layar punya skeleton/empty/error YANG BENAR (1C).
14. Semua controller video/audio dispose; polling berhenti di background.

Standar akhir: aplikasi yang dibuka langsung terbukti nyambung (data live utuh), GPU acceleration aktif terverifikasi, media menyesuaikan layar secara pintar di semua permukaan, kamera HP terintegrasi penuh untuk chat/story/post, animasi hidup-smooth di semua interaksi, playback bersih tanpa satu pun bug, dan tampilan modern-premium yang tidak mungkin disebut jadul. NO MISTAKE.

# PROMPT SKELZHUB v6 — GPU + SMART-FRAME + CAMERA + MOTION EDITION (untuk Google AI Studio / Gemini, effort maksimal)

> Cara pakai: buka https://aistudio.google.com → tab Build → pilih Gemini dengan effort berpikir TERTINGGI → tempel SELURUH "PROMPT UTAMA" → Run.
> Kalau berhenti di tengah kirim: "Lanjutkan file berikutnya, kode lengkap tanpa dipotong. Effort maksimal."
> Deliverable: (A) aplikasi Flutter v6 yang GPU-accelerated dengan frame media adaptif, kamera in-app, animasi hidup, playback baru, dan SELURUH data live (post/video/short/story) tetap tampil 100%, (B) patch backend push-notification + perbaikan story (tetap disertakan).

---

## PROMPT UTAMA (tempel semuanya dari sini sampai selesai)

Kamu adalah principal mobile engineer + product designer kelas dunia. Kerjakan misi ini dengan effort MAKSIMAL dan presisi MILITER — SIFAT TUGAS INI: NO MISTAKE. Setiap endpoint, bentuk respons, dan URL di bawah SUDAH DIVERIFIKASI LANGSUNG ke server produksi — patuhi PERSIS, jangan improvisasi, jangan mengarang endpoint, jangan mengubah bentuk respons. Tanpa bertanya apa pun; kalau ada detail kosong, ambil keputusan terbaik ala aplikasi sosial kelas atas (Instagram/TikTok standar) dan lanjut sampai selesai.

# MISI — SkelzHUB v6.0 (GPU-ACCELERATED, SMART-FRAME ADAPTIF, KAMERA IN-APP, MOTION-FIRST)

Bangun aplikasi mobile SkelzHUB v6 (Flutter) yang memakai PERSIS API + database yang sama dengan website https://www.skelzhub.my.id. PENTING: versi 5 SUDAH BERHASIL menampilkan semua data web (feed, shorts, story, chat, notifikasi) — maka v6 WAJIB MEMPERTAHANKAN 100% perilaku data & seluruh aturan section 1–5 apa adanya, TIDAK BOLEH melanggar/mengubah satu pun (pelanggaran = regresi fatal). Di atas fondasi itu, v6 menambahkan: (1) GPU acceleration (Impeller + higiene render), (2) SMART MEDIA FRAME — frame media menyesuaikan sendiri antara layar HP dan rasio asli video/foto di SEMUA permukaan (short/story/post/chat/grid), nol distorsi nol letterbox aneh, (3) KAMERA IN-APP — kirim foto chat / buat story / buat post langsung dari kamera HP, (4) SISTEM ANIMASI hidup-smooth-halus di seluruh aplikasi, (5) PLAYBACK OVERHAUL — video player custom modern dengan daftar bug yang WAJIB hilang semua, (6) UI dipoles total supaya modern-premium, tidak jadul dari segi mana pun.

# 0. FAKTA SERVER LIVE (SUDAH DIVERIFIKASI — JANGAN DILANGGAR)

- BASE URL WAJIB: https://www.skelzhub.my.id (GUNAKAN HOST `www` — host apex `skelzhub.my.id` hanya redirect 308 dan MENYEBABKAN API GAGAL; dilarang localhost, dilarang host lain, dilarang mengubah).
- Feed publik TIDAK butuh login dan SUDAH BERISI data asli (post video dari akun `skelz`): GET /api/posts?feed=home&limit=12 → {posts:[...]} nyata. Jika aplikasimu menampilkan feed kosong padahal server mengembalikan posts, itu BUG APP yang WAJIB diperbaiki — bukan "data tidak ada".
- GET /api/posts?feed=shorts juga mengembalikan video asli (hanya type VIDEO).
- Story TAMPAK login: guest mendapat {groups:[]} — jadi story/chat/notifikasi kosong sebelum login adalah PERILAKU NORMAL; aplikasi wajib menampilkan pesan "Login dulu untuk melihat story/pesan/notifikasi" (bukan kosong diam-diam).
- SEMUA URL media respons RELATIF ("/api/media/xxx") — tanpa prefiks BASE gambar/video TIDAK AKAN MUNCUL. Media mendukung ETag/304 dan Range (video_player aman dipakai langsung ke URL ABSOLUT).
- Error selalu berbentuk {"error":"pesan"} dalam Bahasa Indonesia.

# 1. ZERO-FAIL DATA BINDING (WAJIB DIPERTAHANKAN 100% DARI v5 — PELANGGARAN = GAGAL TOTAL)

## 1A. Satu sumber URL
- Satu konstanta `AppConfig.baseUrl = "https://www.skelzhub.my.id"` di file config; SEMUA request lewat dio dengan baseUrl itu (path relatif, mis. "/api/posts").
- SATU helper `String absUrl(String? path)`: null/kosong → placeholder; sudah absolut (http/https) → kembalikan apa adanya; lainnya → baseUrl + path. SEMUA URL media (post.media, story.media, avatar, notifikasi.postMedia, chat message.media, thumbnail hasil cari, audio story) WAJIB melewati helper ini TANPA KECUALI — normalisasi dilakukan DI LAPISAN MODEL (saat fromJson), sehingga widget tidak pernah memegang URL relatif.
- Video: URL video juga relatif → absolutkan dengan helper yang sama sebelum diberikan ke video_player.

## 1B. Parsing presisi (bentuk respons PERSIS — jangan dikarang)
- Semua model fromJson null-safe; angka mungkin null → default 0; boolean null → false; string null → "". Dilarang crash karena field hilang.
- Feed: {posts:[Post], nextPage:int|null, hasMore:bool, hidden?:bool}; Post PERSIS: {id, caption, media:string|null, type:"IMAGE"|"VIDEO", createdAt, author:{id,username,displayName,avatarColor,avatar,role}, likeCount, commentCount, repostCount, likedByMe, savedByMe, repostedByMe, repostOf:Post|null, previewComments:[Comment]}.
- Pagination HANYA pakai nextPage (bukan offset sendiri): page berikut = nextPage dari respons; null = berhenti.

## 1C. LARANGAN KEGAGALAN SENYAP (aturan emas)
- Setiap request yang gagal (network/timeout/5xx/parse) WAJIB terlihat: error state dengan tombol "Coba lagi" + pesan server apa adanya. DILARANG menelan error lalu menampilkan list kosong.
- List kosong WAJIB bisa dijelaskan: (1) server balas 0 item → EmptyState "Belum ada postingan"; (2) butuh login → EmptyState + tombol "Login sekarang"; (3) request gagal → error state. Feed home TIDAK boleh kosong tanpa penjelasan.
- Semua gambar pakai errorBuilder (placeholder ikon foto rusak + retry) dan placeholder shimmer saat memuat — TIDAK ADA kotak abu polos.
- Boot: panggil GET /api/health — gagal → banner merah "Tidak bisa menghubungi SkelzHUB — cek koneksi" + tombol coba lagi; sukses → lanjut. JANGAN memblokir first paint menunggu health check (jalankan paralel).

## 1D. LAYAR DIAGNOSTIK (WAJIB — bukti semua nyambung)
Di Pengaturan: "Diagnostik Koneksi" realtime: /api/health, /api/auth/me (nama user / "belum login"), feed home (jumlah post), shorts (jumlah video), stories (jumlah group), conversations (jumlah+unread), search "Skelz" (jumlah hasil), media test (status HTTP media post pertama), log error API terakhir (maks 10: endpoint+status+pesan+waktu), tombol "Ulangi tes" semua, versi app + baseUrl aktif + status GPU render (Impeller).

## 1E. Sinkron sempurna (satu database dengan web)
- no-cache untuk semua data realtime; polling: chat room 2 dtk (mode since), daftar chat 5 dtk, notifikasi 30 dtk.
- AppLifecycleState.resumed → refresh tab aktif + daftar chat + badge; paused → hentikan polling + pause SEMUA video.
- Pull-to-refresh di semua daftar; setelah aksi tulis (post/like/komentar/follow/kirim pesan) → update state dari respons server lalu refresh terkait; upload post sukses → refresh feed page=0.
- QA sinkron wajib lolos: post dari app muncul di web; like dari web terlihat di app setelah resume; chat app↔web ≤2 dtk; story dari web muncul di app setelah resume/pull-refresh.

# 2. AUTENTIKASI BULLETPROOF (sesi cookie — tiga jebakan WAJIB dihindari)

Backend memakai cookie sesi httpOnly `skelzhub_session` (30 hari):
1. PersistCookieJar: WAJIB dibuat dengan path dari getApplicationDocumentsDirectory() (package path_provider) dan WAJIB di-INIT/await SEBELUM request pertama (inisialisasi di main() sebelum runApp; simpan instance global). CookieManager(jar) dipasang sebagai interceptor dio. Jebakan #1: jar belum siap → cookie hilang → semua fitur login-gated kosong diam-diam. WAJIB: setelah login, GET /api/auth/me HARUS mengembalikan user (assert di QA).
2. Login 2 langkah (2FA email): POST /api/auth/login {"username","password"} → {step:"code", userId, email(tersamarkan), emailSent, emailConfigured, devCode?} → layar kode 6 digit (banner "mode dev: kode {devCode}" bila emailConfigured=false); POST /api/auth/login/verify {"userId","code"} → {step:"done", user}. Akun lama tanpa email → {step:"done", user} langsung. Setelah "done": panggil /api/auth/me sekali lagi untuk memastikan sesi tersimpan (masih null → error eksplisit "Sesi gagal tersimpan", jangan lanjut diam-diam).
3. Register: POST /api/auth/register {"username","displayName","email","password"} → {step:"done", user}. Validasi ikut server (username 3-20 [a-zA-Z0-9._], email valid, password ≥6).
4. Boot: GET /api/auth/me → {user}|{user:null, bannedMessage?}; bannedMessage → dialog lalu logout; user null → layar login.
5. POST /api/auth/logout (dan unregister token push bila aktif).
6. Interceptor dio: 401 → bersihkan sesi → layar login (kecuali endpoint memang guest-friendly).
7. POST JSON wajib header Content-Type: application/json. Jangan pernah kirim ke host selain www.skelzhub.my.id.

# 3. KONTRAK API LIVE TERVERIFIKASI (DIKODEKAN PERSIS)

DTO model Dart: Me {id,username,email?,displayName,bio,avatarColor(0-7),avatar?,isPrivate,role("USER"|"ADMIN"|"OWNER")}; UserBrief {id,username,displayName,avatarColor,avatar?,role?}; User = Me + {lastSeenAt?,postCount,followerCount,followingCount,isFollowing?,followStatus("ACCEPTED"|"PENDING"|"NONE"),isMe?}; Post (lihat 1B); Comment {id,text,createdAt,author,parentId?,replyTo?,isMine?}; ChatMessage {id,text,kind("TEXT"|"IMAGE"|"VIDEO"|"VOICE"),media?,mine,createdAt,readAt,editedAt?,deleted?,updatedAt,replyTo:{id,text,kind,senderName,senderMine,deleted}?,reactions:[{emoji,count,mine}]}.

Endpoint:
- AUTH: bagian 2 + POST /api/auth/forgot-password {"email"}; POST /api/auth/reset-password {"email","code","newPassword"}.
- FEED: GET /api/posts?feed=home|following|explore|shorts|saved|reposts&username={u}&page={n}&limit=12 → {posts,nextPage,hasMore,hidden?}.
- POST: GET /api/posts/{id}; POST /api/posts {"caption"≤2200,"mediaId"}; POST /api/posts {"caption","repostOfId"}; PATCH /api/posts/{id} {"caption"}; DELETE /api/posts/{id}; POST /api/posts/{id}/like → {liked,likeCount}; /save → {saved}; /repost → {reposted,repostCount}; POST /api/posts/{id}/report {"reason"}.
- KOMENTAR: GET /api/posts/{id}/comments?page&limit=30 → {comments,nextPage,hasMore}; POST /api/posts/{id}/comments {"text","parentId"|null}; DELETE /api/comments/{id}; komentar beranak menyatu di bawah induk.
- PENGGUNA: GET /api/users/{username} → {user}; PATCH /api/users/{username} {"displayName","bio"}; POST /api/users/{username}/follow → {following,pending,followerCount} (pending=true → tombol "Diminta"); GET /api/users/{username}/followers|/following → {users:[{id,status,user}]}; GET /api/users?search={q}; GET /api/suggestions; GET /api/follow-requests → {requests:[{followId,createdAt,user}]}; PATCH /api/follow-requests {"followId","action":"accept"|"reject"}.
- AKUN SAYA: PATCH /api/me {"displayName"?,"bio"?,"isPrivate"?,"avatarMediaId"?,"currentPassword"?,"newPassword"?} → {user,passwordChanged}; POST /api/me/heartbeat ±25 dtk saat foreground (online 75 dtk).
- STORY: GET /api/stories → {groups:[{author, items:[{id,media,type,caption,createdAt,seen,likeCount,likedByMe,commentCount,viewCount,audio?}], hasUnseen, isMe, latestAt}]}; POST /api/stories {"mediaId","caption"≤500,"audioMediaId"?}; GET /api/stories/{id} → {story{...expiresAt}, viewers:[...], viewCount}; POST /api/stories/{id}/view; POST /api/stories/{id}/like → {liked,likeCount}; DELETE /api/stories/{id}; GET/POST/DELETE /api/stories/{id}/comments ({"text","parentId"}; hapus pakai ?commentId=).
- CHAT: GET /api/conversations → {conversations:[{id,user+{online,lastSeenAt},lastMessage,lastMessageKind,lastMessageDeleted,lastMessageAt,lastMessageMine,unread}],unread}; POST /api/conversations {"username"} → {conversationId};
  GET /api/conversations/{id}/messages?page&limit=40 → {messages,other:{user,online,lastSeenAt,typing},nextPage,hasMore} (otomatis mark read);
  GET /api/conversations/{id}/messages?since={ISO} (poll 2 dtk) → {messages(baru/berubah),other,mineLastReadAt} — update per id;
  POST /api/conversations/{id}/messages {"text"?,"mediaId"?,"replyToId"?} → {message} — FOTO+CAPTION SATU REQUEST (termasuk hasil kamera);
  PATCH .../messages {"messageId","text"}; DELETE .../messages?messageId=; POST .../messages/react {"messageId","emoji"|null}; POST .../typing (interval ≥3 dtk).
- PENCARIAN: GET /api/search?q={q} → {users:[User], posts:[Post], videos:[Post]}.
- NOTIFIKASI: GET /api/notifications → {items:[{id,type("LIKE"|"COMMENT"|"FOLLOW"|"FOLLOW_REQUEST"|"FOLLOW_ACCEPT"|"REPOST"|"STORY_VIEW"|"STORY_LIKE"|"STORY_COMMENT"),read,createdAt,actor,postId?,postMedia?,postType?,commentText?}],unread}; POST /api/notifications (mark all read).
- UPLOAD (post/story/chat/camera/avatar/voice) dua jalur otomatis:
  1. Probe GET /api/upload/r2-presign → {"enabled":true} → POST /api/upload/r2-presign {"filename","mimeType","size"} → {uploadUrl,key,kind,mimeType} → PUT uploadUrl (Content-Type = mimeType PERSIS, onSendProgress 0-95%) → POST /api/upload/r2-complete {"key","mimeType"}.
  2. R2 mati: ≤4MB → POST /api/upload multipart field "file"; besar → potongan 4MB → POST /api/upload/chung (key,index,total,file) → POST /api/upload/complete {"key","totalChunks","mimeType"}.
  Hasil: {mediaId, url:"/api/media/x", kind, mimeType}.

# 4. PUSH NOTIFIKASI KE HP (FCM)

## 4A. Sisi aplikasi
- firebase_core + firebase_messaging + flutter_local_notifications (google-services.json dari Firebase project — langkah di README; jangan hardcode kredensial palsu).
- Setelah login → izin notifikasi (Android 13+) → FCM token → POST /api/push/register {"token","platform":"android"}; onTokenRefresh → register ulang; logout → POST /api/push/unregister {"token"}.
- Foreground → banner in-app elegan auto-dismiss; background/terminated → tray sistem; TAP → buka tujuan (COMMENT/LIKE/REPOST → detail post; FOLLOW* → profil; STORY_* → story; MESSAGE → room chat) via navigatorKey global + onMessageOpenedApp + getInitialMessage.
- FALLBACK WAJIB: /api/push/register 404 (backend patch belum dideploy) → lewati diam-diam tanpa error; aplikasi tetap penuh dengan polling. Push tidak boleh pernah bikin crash.
- Badge unread dari polling /api/notifications (push hanya pelengkap).

## 4B. Patch backend (folder backend-patch/, kode LENGKAP siap copy ke project web Next.js + deploy Vercel)
1. backend-patch/src/lib/push.ts — sendPushToUser(userId,{title,body,data}) pakai firebase-admin (env FCM_SERVER_KEY, lazy init); multicast ke DeviceToken user; token invalid dihapus; semua kegagalan silent.
2. backend-patch/prisma/schema-addition.prisma — model DeviceToken {id cuid, userId FK cascade, token unique, platform, createdAt, updatedAt}.
3. backend-patch/src/app/api/push/register/route.ts — POST {token,platform} upsert.
4. backend-patch/src/app/api/push/unregister/route.ts — POST {token} delete.
5. backend-patch/src/app/api/push/test/route.ts — POST → push ke diri sendiri "SkelzHUB / Notifikasi aktif!".
6. backend-patch/INTEGRASI-NOTIFY.md — hook di notify() src/lib/api-utils.ts web: teks Bahasa Indonesia per type ("menyukai postinganmu", "mengomentari postinganmu", "mulai mengikuti kamu", "meminta untuk mengikuti kamu", "menerima permintaan ikut kamu", "melihat story-mu", "menyukai story-mu", "mengomentari story-mu", "memposting ulang postinganmu", "Pesan baru dari {nama}") + cuplikan kode; pesan chat: push hanya bila penerima tidak aktif di room itu (aktif <30 dtk terakhir).
7. backend-patch/DEPLOY.md — Firebase project → service account JSON → env FCM_SERVER_KEY di Vercel → prisma db push → copy file → integrasi notify() → deploy → tes /api/push/test dari app.
8. backend-patch/src/app/api/stories/[id]/view/route.ts (REVISI, kode lengkap): viewer===author → {ok:true} TANPA StoryView & TANPA notify (pemilik tidak dihitung penontonnya sendiri).
9. backend-patch/src/app/api/stories/[id]/route.ts (REVISI, kode lengkap): viewers & viewCount MENGKELUARKAN pemilik (filter v.user.id !== authorId).

# 5. STORY: MELIHAT STORY SENDIRI TIDAK DIHITUNG
- App: story milik sendiri (isMe) → JANGAN panggil /view; progress tetap jalan. Story orang lain → /view saat selesai tampil (atau 80% durasi).
- Pemilik: halaman penonton dari GET /api/stories/{id} (server patch sudah membuang diri sendiri); empty "Belum ada penonton".
- Ring: gradient = belum dilihat, abu tipis = sudah (seen/hasUnseen) — persist di server, konsisten web↔app.

# 6. GPU ACCELERATION & PERFORMA (BARU — jalankan di atas renderer modern)

## 6A. Impeller ON (renderer GPU modern Flutter — wajib)
- iOS: Impeller sudah default — pastikan TIDAK dimatikan.
- Android: WAJIB diaktifkan eksplisit dengan menambah ke `android/app/src/main/AndroidManifest.xml` di dalam `<application>`:
  ```xml
  <meta-data
      android:name="io.flutter.embedding.android.EnableImpeller"
      android:value="true" />
  ```
  Sertakan langkah ini di README + file docs/SETUP-NATIVE.md (karena `flutter create .` dipakai saat setup). Setelah itu semua animasi/efek berjalan di GPU dengan jank shader minim.

## 6B. Higiene render (aturan 60fps)
- `RepaintBoundary` di setiap kartu feed & tile video & thumbnail grid (repaint terisolasi, tidak melukis ulang seluruh list).
- Konstruktor `const` dimaksimalkan; widget dipecah kecil supaya diff build sempit.
- DILARANG `setState` di listener video/scroll: posisi video → ValueNotifier yang di-throttle 4-5 Hz + ValueListenableBuilder hanya membungkus baris progress; scrollbar/posisi → tanpa rebuild list.
- Riverpod `select()` untuk granular (mis. likeCount berubah tidak boleh rebuild seluruh feed).
- Gambar: cached_network_image + `memCacheWidth` = lebar tampil × devicePixelRatio (clamp ≤1080; grid ≤480) + `maxWidthDiskCache` — dekode pas ukuran tampilan (hemat RAM + lebih cepat).
- List: ListView.separated + cacheExtent 500 + addAutomaticKeepAlives:false; PageView shorts preload maksimal ±1 halaman; controller video off-screen WAJIB dispose.
- Video pakai decode hardware bawaan (ExoPlayer/AVPlayer) — dilarang transcode/software di app; `VideoPlayerOptions(mixWithOthers: true)` supaya tidak mematikan musik latar user.
- Animasi HANYA menganimasikan transform/opacity/scale (bukan layout/padding/blur besar saat scroll) — daftar durasi & curve di section 9.
- RAM guard: maksimal 3 controller video hidup bersamaan; lebih dari itu → dispose yang tertua.
- Boot: splash pendek, first paint feed TIDAK menunggu health check (paralel).

# 7. SMART MEDIA FRAME (BARU — frame menyesuaikan sendiri ke layar HP & rasio asli media, di SEMUA permukaan)

PRINSIP: nol distorsi (dilarang BoxFit.fill), nol letterbox aneh, rasio DIGERAKKAN dari data — bukan asumsi 16:9/9:16. Buat SATU sistem reusable di lib/core/media/:
- `RatioResolver`: video → `controller.value.aspectRatio` setelah init; foto → ukuran intrinsik via ImageStream listener (simpan rasio di cache model). Sebelum rasio diketahui → placeholder shimmer rasio 4:5 (feed) / layar penuh (shorts/story).
- `SmartMediaFrame(context: feed|shorts|story|chat|grid, ratio, child)` — satu-satunya jalur menampilkan media; semua permukaan memakainya.

ATURAN PER PERMUKAAN:
- FEED & DETAIL POST: lebar frame = lebar kartu; rasio frame = clamp(rasioIntrinsik, 0.8–1.91 [4:5…1.91:1]); media: selisih rasio media vs frame ≤12% → BoxFit.cover crop tengah; lebih dari itu → BoxFit.contain di atas permukaan gelap #0F1115 (light: #F0F1F3) — VIDEO LEBAR (mis. 2.35:1 sinematik) TIDAK pernah dipaksa penuh/stretch, ia DITAMPILKAN UTUH (contain) dan ukuran frame menyesuaikan supaya enak dilihat.
- SHORTS (fullscreen vertikal): bandingkan rasio video vs rasio layar — selisih ≤15% → cover (penuh imersif, crop minim); selisih besar → contain (video utuh) di atas latar gelap + vignette gradient halus — video ultra-lebar tampil utuh rapi menyesuaikan layar HP, tidak aneh, tidak terpotong bodoh.
- STORY: fullscreen contain, latar hitam; progress bar & caption overlay di area aman.
- CHAT: foto/video dalam bubble — lebar maks 72% lebar layar; rasio intrinsik clamp 0.75–1.4; foto tampil langsung; video tampil sebagai preview frame + chip durasi + ikon play, tap → player fullscreen.
- GRID (profil/explore/search): tile 1:1 cover (center-crop aman) + ikon video + chip durasi.
- Selalu ClipRRect (radius 20-24) + animasi fade-in frame pertama + errorBuilder retry; TIDAK ADA video/image yang stretch, TIDAK ADA kotak hitam raksasa tanpa konten.

# 8. KAMERA IN-APP (BARU — kirim langsung dari kamera HP: chat, story, post)

- Package: `camera` untuk kamera in-app + `image_picker` sebagai fallback andal + jalur galeri.
- `CameraCaptureScreen`: preview live fullscreen; mode Foto/Video (rekam maks 60 dtk + timer + progress); tombol flip kamera, flash, tap-to-focus; shutter lingkaran gradient #FF6A00→#EE1B7A dengan animasi tekan; setelah capture → layar konfirmasi (preview + opsi "Ulangi" / "Lanjut" + input caption bila tujuan butuh caption) → langsung ke tujuan.
- TUJUAN (semua pakai jalur upload section 3 lalu endpoint yang sudah ada):
  (a) CHAT: kirim → upload → POST /api/conversations/{id}/messages {"mediaId","text"?} SATU REQUEST (foto+caption satu bubble, caption dari layar konfirmasi); tombol kamera ada di composer chat.
  (b) STORY: crop 9:16 (opsional preview) → upload → POST /api/stories {"mediaId","caption"≤500}; pintu masuk: tombol "+" di rail story & mode Kamera di create screen.
  (c) POST/SHORT: caption ≤2200 → upload → POST /api/posts {"caption","mediaId"} → toast sukses + refresh feed page=0.
- Kompresi pre-upload foto: story 1080x1920, post ≤2048px sisi panjang, chat ≤1620px, kualitas 85-90, EXIF dibenarkan (tidak buram); video kamera dikirim apa adanya (hasil rekaman hardware) dengan indikator ukuran file pre-upload + progress upload.
- PERMISSION & fallback: izin kamera/mic ditolak ATAU inisialisasi controller gagal (termasuk di emulator) → otomatis fallback `image_picker` (source kamera) → tetap gagal → pesan jelas + tombol coba lagi. Manifest Android: `<uses-permission android:name="android.permission.CAMERA"/>`, `<uses-permission android:name="android.permission.RECORD_AUDIO"/>`, `<uses-feature android:name="android.hardware.camera" android:required="false"/>` (app tetap jalan di HP tanpa kamera); iOS Info.plist: NSCameraUsageDescription & NSMicrophoneUsageDescription dengan teks Bahasa Indonesia yang jelas — sertakan snippet lengkap di README + docs/SETUP-NATIVE.md.
- Kamera tidak pernah memblokir fitur lain: semua kegagalan kamera = fallback/pesan, BUKAN crash.

# 9. SISTEM ANIMASI & MOTION (BARU — hidup, smooth, halus di semua interaksi)

- Tabel token motion (lib/core/motion/): micro 120–160ms easeOutCubic (hover/press/toggle); standar 240ms easeOutCubic (transisi halaman/bottom-sheet/switcher); emphasized 320–380ms easeOutBack HANYA untuk pop kecil (like, shutter, FAB); DILARANG animasi layout saat scroll; semua animasi transform/opacity/scale saja.
- `PressableScale`: semua tombol/kartu yang bisa ditepak → scale 0.97 saat tekan (140ms) + haptic (HapticFeedback.selectionImpact tab, lightImpact tombol umum, mediumImpact like/kirim).
- ENTRANCE: stagger maksimal 8 item pertama (fade + slide-up 16px, interval 120ms) di feed/daftar chat/notifikasi; kartu baru muncul → fade+scale 0.98; bubble chat masuk → pop 0.94→1 (180ms) + pesan terkirim slide-up; konten habis berganti → AnimatedSwitcher fade.
- LIKE (semua media): tombol spring pop + angka berubah naik; DOUBLE-TAP media → hati gradient BESAR di tengah (scale spring easeOutBack) + 6-8 partikel hati kecil menyebar radial + haptic medium — di feed, shorts, story.
- TRANSISI: helper `AppRoutes.push` (PageRouteBuilder fade + slide 16px, 240ms) dipakai SERAGAM; Hero media grid→detail (tag "media-{id}-{index}") dan foto→lightbox (InteractiveViewer zoom); bottom-sheet slide-up+fade; IndexedStack untuk tab (state dipertahankan) + indikator bottom nav pill gradient bergerak (AnimatedAlign/AnimatedContainer).
- SKELETON shimmer gradient brand (bukan abu polos); typing 3 titik looping; story progress bar animasi width linear per durasi; empty state ikon "bernafas" (scale 1→1.04 loop 1.6s); banner notifikasi in-app slide dari atas + auto-dismiss; toast custom slide dari bawah (2.4 dtk) dengan tepi gradient.
- Semua animasi dijalankan di GPU (Impeller aktif) dan tidak boleh menyebabkan jank saat scroll feed panjang.

# 10. PLAYBACK OVERHAUL (BARU — player custom modern; daftar bug LAMA yang WAJIB HABIS SEMUA)

Bug yang DILAPORKAN terjadi di versi sebelumnya dan WAJIB hilang: (1) layar hitam tanpa penjelasan; (2) frame pertama beku saat load; (3) dua video bersuara bersamaan; (4) seek melompat/tidak presisi; (5) rasio salah → video stretch/aneh; (6) memory leak → video berikutnya tidak mau jalan; (7) setState setelah dispose → exception; (8) video tetap jalan saat app ke background; (9) progress bar jitter.

Arsitektur & aturan `SkelzVideoPlayer` (lib/core/media/skelz_video_player.dart, satu widget reusable dengan mode feed|shorts|story|chat):
- INIT: `VideoPlayerController.networkUrl(Uri.parse(absUrl(...)), videoPlayerOptions: VideoPlayerOptions(mixWithOthers: true))`; await initialize dengan guard mounted + timeout 8 dtk; frame pertama fade-in via AnimatedOpacity saat isInitialized; state loading → shimmer/spinner gradient; state error (termasuk value.errorDescription) → pesan + tombol "Putar ulang" yang re-init controller — DILARANG hitam senyap.
- POSISI: ValueNotifier throttled 4-5 Hz; baris progress dibungkus ValueListenableBuilder TERSENDIRI (video berjalan TIDAK me-rebuild layar); guard duration>0; clamp position ≤ duration; NaN-safe.
- SEEK: drag thumb → overlay bubble waktu "0:12 / 0:34" mengikuti jari; saat drag tampilkan posisi target TANPA memindahkan video; commit `seekTo` saat dilepas (clamp) + haptic ringan; buffered bar terpisah warna redup.
- CONTROLS UI: scrim gradient bawah (hitam 60%→transparan); tombol play/pause tengah ikon 64px AnimatedSwitcher; tap video = toggle play + tampilkan kontrol (auto-hide 2.5 dtk); double-tap = LIKE (section 9); toggle mute (feed default MUTE, shorts default SUARA ON + preferensi tersimpan di setting); loop untuk shorts & story; feed main sekali lalu berhenti di akhir (bukan loop).
- AUTOPLAY: visibility_detector ≥60% terlihat & initialized & app foreground → play; turun <40% → pause (+dispose untuk feed; shorts simpan ±1 tetangga, sisanya dispose); AppLifecycleState.paused → pause SEMUA controller; resumed → lanjutkan video yang masih terlihat.
- AUDIO EKSKLUSIF: hanya SATU video bersuara aktif — unmute satu → mute yang lain otomatis.
- DISPOSE: await pause() lalu dispose() di deactivate/onDispose dengan try/catch; SEMUA operasi controller guarded isInitialized; log error ke util logger (tampil di Diagnostik).

# 11. DESIGN SYSTEM v6 (anti-jadul TOTAL — polesan premium di semua segi)

- Warna: gradient primer #FF6A00→#EE1B7A (aksi utama, ring story, FAB, indikator aktif, progress video); bg terang #FAFAFA / gelap #0F1115; surface kartu putih / #171A21; elevated #1F242D; border 1px alpha 8% surface; success #22C55E; danger #EF4444; dark+light ikut sistem + override manual di Pengaturan.
- Tipografi: Inter (400/500/600/700) atau Plus Jakarta Sans + fallback sistem; skala 28/22/17/15/13/11; angka "1,2 rb"; waktu "2 mnt lalu / Kemarin".
- Bentuk & material: radius 16/20/24/28 kartu + 999 pill; kartu dark = border halus tanpa shadow berat (light = shadow lembut); chips pill; segmented control floating dengan thumb gradient beranimasi; app bar blur statis ringan (BackdropFilter HANYA di bar statis, dilarang saat scroll cepat); FAB (+) gradient + glow tipis + PressableScale; scrollbar tipis auto-hide.
- Ikon satu keluarga outline konsisten, varian filled untuk state aktif; avatar null → gradient dari avatarColor (8 pasangan 0-7).
- Bottom nav 5 slot: Beranda, Cari, Shorts, (+) gradient menonjol, Chat (badge unread), Profil; safe-area; item aktif pill gradient + ikon terisi + label.
- Kartu feed premium: header avatar ring-gradient + nama + waktu relatif; media SmartMediaFrame; caption ellipsis + "selengkapnya"; baris aksi like/komentar/repost/simpan + angka; pull-to-refresh warna brand.
- NOL RenderFlex overflow di 320/375/412/768/900dp: Expanded/Flexible di Row/Column padat, teks panjang selalu ellipsis, SafeArea + Scaffold, composer chat naik via MediaQuery viewInsets, grid LayoutBuilder. Audit tiap layar.

# 12. FITUR (semua jalan, data nyata, dengan peningkatan v6)
12.1 Feed: rail story; shortcut composer; infinite scroll nextPage + skeleton stagger; pull-to-refresh; tab Utama/Mengikuti (segmented animasi); like/save/repost optimistik + rollback + animasi; komentar bottom-sheet + balasan + preview 2; repost bersarang; hidden → "Konten tersembunyi".
12.2 Story + ring: tekan ring → bottom-sheet "Lihat Story"/"Buka Profil"/"Kirim Pesan"; buat story dari KAMERA (section 8) atau galeri. Viewer: progress segmented animasi, tap kanan/kiri, tahan pause, swipe down tutup, like + partikel + komentar sheet; video story fullscreen contain. Pemilik: penonton + jumlah.
12.3 Shorts: PageView vertikal feed=shorts; SmartMediaFrame fullscreen adaptive (cover/contain rule) + vignette; autoplay, preload ±1; audio eksklusif; double-tap like + hati; bar aksi kanan mengikuti area aman; komentar sheet.
12.4 Chat: daftar (search, unread bold + badge, preview per kind "[Foto] [Video] [Suara] [Pesan dihapus]"), poll 5 dtk. Room: header avatar + nama + Online/Terakhir aktif; bubble modern (gradient pesanku/abu-abu lawan, radius asimetris, timestamp, 1 centang terkirim/2 centang aksen readAt, "Diedit", placeholder "Pesan dihapus"); grouping + pemisah hari; typing 3 titik; kirim teks/FOTO & VIDEO DARI KAMERA IN-APP + galeri/voice; FOTO+CAPTION SATU REQUEST & SATU BUBBLE; reply quote; reaksi emoji; edit/hapus swipe; share post ke chat; poll since 2 dtk; auto-dibaca.
12.5 Pencarian global: debounce 300ms + CancelToken; GET /api/search; tab Semua/Akun/Postingan/Video (thumb animasi); recent search lokal; kosong → /api/suggestions + grid explore; highlight keyword; empty "Tidak ada hasil untuk 'xxx'".
12.6 Notifikasi: ikon tipe + teks natural, thumbnail post, grouping hari, badge (tab + bell), mark all read, poll 30 dtk, tap → tujuan; PLUS push + banner in-app + deep-link.
12.7 Profil: header avatar + ring story, nama + username + badge role, bio, stats (buka followers/following + ikuti per baris); sendiri = Edit Profil; orang lain = Ikuti/"Diminta"/"Sudah Diikuti" + Pesan; tab Postingan/Reposts/Tersimpan grid 3 kolom (SmartMediaFrame grid); akun privat → "Akun ini privat" + Ikuti; edit profil (nama, bio, privat, avatar crop+upload, ganti password); follow optimistik + rollback.
12.8 Create: MODE KAMERA (section 8: foto/video dari kamera HP langsung) + galeri; multi foto ≤10 atau 1 video; kompresi + preview "asli X MB → hasil Y MB"; caption 2200; share ke Feed atau Story (crop 1080x1920, caption 500); progres upload; selesai → toast + refresh feed page=0.
12.9 Pengaturan: terang/gelap/sistem; toggle suara shorts default; status push + "Tes notifikasi"; "Diagnostik Koneksi" (section 1D, + status Impeller); keluar akun; ganti password; tentang SkelzHUB v6.
12.10 Tablet ≥900dp: chat dua panel rapi; grid feed lebih lebar.

# 13. IKON + SPLASH
- Ikon: rounded-square gelap #0F1115 + monogram "S" gradient #FF6A00→#EE1B7A + glow tipis, flat premium, terbaca 48px; flutter_launcher_icons (adaptive Android foreground/background safe-zone + iOS 1024 tanpa transparansi) + flutter_launcher_icons.yaml.
- flutter_native_splash.yaml: latar gelap + logo "S" + progress kecil; transisi mulus ke home.

# 14. STRUKTUR PROYEK
lib/main.dart (bootstrap: await cookie jar, ProviderScope, theme, connectivity, heartbeat, push, health paralel);
lib/core/config.dart (baseUrl + absUrl);
lib/core/api/ (api_client: dio + CookieManager + 401 + upload dua jalur; api_exception; endpoints);
lib/core/models/ (me,user,post,comment,conversation,message,story,notification,upload_result — fromJson + normalisasi URL via absUrl);
lib/core/media/ (smart_media_frame + ratio_resolver + skelz_video_player — section 7 & 10);
lib/core/camera/ (camera_service + capture_screen — section 8);
lib/core/motion/ (motion_tokens + pressable_scale + like_burst — section 9);
lib/core/theme/; lib/core/widgets/ (avatar ring, app_button, skeleton shimmer, empty_state, error_state, media lightbox, time_ago, number_id, in_app_banner, toast);
lib/core/push/ (push_service: init, permission, token, register/unregister, banner, deep-link, fallback 404);
lib/features/{auth,feed,stories,shorts,chat,search,notifications,profile,create,settings}/…;
lib/features/settings/diagnostics_screen.dart (bagian 1D);
lib/shell/ (bottom nav + lifecycle sync manager + IndexedStack);
backend-patch/ (bagian 4B + 5); docs/SETUP-NATIVE.md (Impeller + permission kamera/mic + Info.plist).
Aturan: file ≤±250 baris; satu tanggung jawab per file; riverpod AsyncNotifier + family pagination.

# 15. CARA MENGERJAKAN (effort maksimal)
Langkah 1 — rencana ≤30 baris (daftar file final urut).
Langkah 2 — kode LENGKAP file demi file; DILARANG memotong file, DILARANG "..." / "// sisanya sama"; konteks menipis → selesaikan file aktif, lanjut di pesan berikutnya dari file persis yang belum ditulis.
Langkah 3 — README: build (flutter create . --platforms=android,ios --project-name skelzhub; flutter pub get; flutter run; flutter build apk --release --split-per-abi), SETUP-NATIVE.md (snippet Impeller + permission Android + Info.plist iOS persis siap copy), setup Firebase (google-services.json, service account, FCM_SERVER_KEY di Vercel), deploy backend-patch, catatan TANPA konfigurasi API (baseUrl live).
Langkah 4 — QA self-audit bagian 16, perbaiki semua sebelum menutup.

# 16. QA — DEFINITION OF DONE (gerbang lolos; gagal satu = belum selesai)
1. Nol error kompilasi; import & tipe konsisten.
2. NOL RenderFlex overflow di 320/375/412/768/900dp; keyboard tidak menutup composer; teks panjang ellipsis.
3. DATA VISIBLE (gerbang paling penting, dipertahankan dari v5): feed home menampilkan post asli; Shorts menampilkan & MEMUTAR video asli; semua foto/avatar tampil (semua URL lewat absUrl); login sukses → /api/auth/me balik user; story/chat/notifikasi terisi data nyata; Diagnostik Koneksi semua OK.
4. SMART FRAME (baru): video ultra-lebar 2.35:1, kotak 1:1, potret 9:16 → semua TIDAK stretch & TIDAK aneh di feed/short/story/chat/grid; video lebar tampil utuh & frame menyesuaikan layar; nol letterbox putih.
5. KAMERA (baru): kirim foto chat dari kamera → muncul juga di web; post dari kamera → muncul di feed web; story dari kamera → muncul di web; video kamera ter-upload & terputar; izin ditolak → fallback lancar tanpa crash.
6. PLAYBACK (baru): seluruh daftar bug section 10 HABIS — nol hitam senyap, nol frame beku, nol audio dobel, seek presisi + bubble waktu, rasio benar, 20x swipe shorts tanpa leak, background→resume benar, progress anti-jitter.
7. GPU/PERF (baru): Impeller aktif (patch README dijalankan); scroll feed panjang mulus; controller video hidup ≤3; animasi hanya transform/opacity; higiene section 6 dipatuhi.
8. MOTION (baru): like/double-tap/transisi/bubble/typing/skeleton/empty semua beranimasi halus; haptic jalan; nol animasi tersendat saat scroll.
9. Sinkron satu database: post app→web muncul; like web→app setelah resume; chat app↔web ≤2 dtk; story web→app setelah resume/pull-refresh.
10. Push: register 200 setelah patch dideploy (404 → fallback diam); banner foreground; tray background; TAP navigasi benar; push gagal tidak pernah mengganggu fitur utama.
11. Story sendiri: tidak menambah penonton; setelah patch, daftar penonton & jumlah tanpa diri sendiri; ring story orang lain jadi abu setelah dilihat (persist).
12. Login 2 langkah + akun tanpa email; register; auto-login boot; 401 → auto logout; offline banner; semua layar punya skeleton/empty/error YANG BENAR (1C).
13. Semua controller video/audio dispose; polling berhenti di background.
14. UI modern premium, gradient konsisten, nol placeholder/TODO/lorem, Bahasa Indonesia natural.

Standar akhir: aplikasi yang dibuka langsung terbukti nyambung (data live utuh dari v5), dengan GPU acceleration aktif, media yang menyesuaikan layar secara pintar, kamera HP terintegrasi, animasi hidup-smooth, playback tanpa bug, dan tampilan modern-premium. NO MISTAKE.

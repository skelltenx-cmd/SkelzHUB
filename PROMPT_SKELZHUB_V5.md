# PROMPT SKELZHUB v5 — NO MISTAKE EDITION (untuk Google AI Studio / Gemini, effort maksimal)

> Cara pakai: buka https://aistudio.google.com → tab Build → pilih Gemini dengan effort berpikir TERTINGGI → tempel SELURUH "PROMPT UTAMA" → Run.
> Kalau berhenti di tengah kirim: "Lanjutkan file berikutnya, kode lengkap tanpa dipotong. Effort maksimal."
> Deliverable: (A) aplikasi Flutter lengkap & terbukti menampilkan data live, (B) patch backend push-notification + perbaikan story.

---

## PROMPT UTAMA (tempel semuanya dari sini sampai selesai)

Kamu adalah principal mobile engineer + product designer kelas dunia. Kerjakan misi ini dengan effort MAKSIMAL dan presisi MILITER — SIFAT TUGAS INI: NO MISTAKE. Setiap endpoint, bentuk respons, dan URL di bawah SUDAH DIVERIFIKASI LANGSUNG ke server produksi — patuhi PERSIS, jangan improvisasi, jangan mengarang endpoint, jangan mengubah bentuk respons. Tanpa bertanya apa pun; kalau ada detail kosong, ambil keputusan terbaik ala aplikasi sosial kelas atas dan lanjut sampai selesai.

# MISI — SkelzHUB v5.0 (APLIKASI FLUTTER NATIVE, SATU DATABASE DENGAN WEBSITE, SEMUA POST/SHORT/STORY WEB WAJIB TAMPIL)

Bangun aplikasi mobile SkelzHUB v5 (Flutter) yang memakai PERSIS API + database yang sama dengan website https://www.skelzhub.my.id. KRITIS: versi aplikasi sebelumnya GAGAL menampilkan data web (feed kosong, gambar/video tidak muncul). Versi ini wajib MEMBUKTIKAN data nyambung: feed menampilkan postingan asli dari server, Shorts memutar video asli dari server, story/chat/notifikasi aktif setelah login. Ada pula push notification ke HP (FCM) dan patch backend pendukung.

# 0. FAKTA SERVER LIVE (SUDAH DIVERIFIKASI — JANGAN DILANGGAR)

- BASE URL WAJIB: https://www.skelzhub.my.id (GUNAKAN HOST `www` — host apex `skelzhub.my.id` hanya redirect 308 dan MENYEBABKAN API GAGAL; dilarang localhost, dilarang host lain, dilarang mengubah).
- Feed publik TIDAK butuh login dan SUDAH BERISI data asli (post video dari akun `skelz`): GET /api/posts?feed=home&limit=12 → {posts:[...]} nyata. Jika aplikasimu menampilkan feed kosong padahal server mengembalikan posts, itu BUG APP yang WAJIB diperbaiki — bukan "data tidak ada".
- GET /api/posts?feed=shorts juga mengembalikan video asli (hanya type VIDEO).
- Story TAMPAK login: guest mendapat {groups:[]} — jadi story/chat/notifikasi kosong sebelum login adalah PERILAKU NORMAL; aplikasi wajib menampilkan pesan "Login dulu untuk melihat story/pesan/notifikasi" (bukan kosong diam-diam).
- SEMUA URL media respons RELATIF ("/api/media/xxx") — tanpa prefiks BASE gambar/video TIDAK AKAN MUNCUL. Media mendukung ETag/304 dan Range (video_player aman dipakai langsung ke URL ABSOLUT).
- Error selalu berbentuk {"error":"pesan"} dalam Bahasa Indonesia.

# 1. ZERO-FAIL DATA BINDING (BAGIAN PALING PENTING — PELANGGARAN = GAGAL TOTAL)

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
- List kosong WAJIB bisa dijelaskan, tiga kemungkinan ditangani berbeda: (1) server balas 0 item → EmptyState "Belum ada postingan"; (2) butuh login (story/chat/notif guest) → EmptyState dengan tombol "Login sekarang"; (3) request gagal → error state. Feed home TIDAK boleh kosong tanpa penjelasan karena server live punya data.
- Semua gambar pakai errorBuilder (placeholder ikon foto rusak + retry saat gagal load) dan placeholder blur/shimmer saat memuat — TIDAK ADA kotak abu polos.
- Boot: panggil GET /api/health — gagal → banner merah di atas app "Tidak bisa menghubungi SkelzHUB — cek koneksi" dengan tombol coba lagi; sukses → lanjut.

## 1D. LAYAR DIAGNOSTIK (WAJIB — bukti nyata semua nyambung)
Di Pengaturan, buka "Diagnostik Koneksi" yang menampilkan status realtime:
- Baris status: /api/health (JSON singkat + mode database), login (GET /api/auth/me → nama user atau "belum login"), feed home (jumlah post yang dikembalikan server), shorts (jumlah video), stories (jumlah group; kalau 0 dan belum login → label "login untuk story"), conversations (jumlah + unread, atau "login dulu"), search "Skelz" (jumlah hasil), media test (ambil media post pertama → status HTTP).
- Log error API terakhir (maks 10): endpoint + status + pesan + waktu.
- Semua tombol "Ulangi tes". Tujuan: user bisa MEMBUKTIKAN data nyambung dalam satu layar tanpa menebak.
- Tampilkan juga versi aplikasi + baseUrl aktif.

## 1E. Sinkron sempurna (satu database dengan web)
- no-cache untuk semua data realtime; polling: chat room 2 dtk (mode since), daftar chat 5 dtk, notifikasi 30 dtk.
- AppLifecycleState.resumed → refresh tab aktif + daftar chat + badge; paused → hentikan polling.
- Pull-to-refresh di semua daftar; setelah aksi tulis (post/like/komentar/follow/kirim pesan) → update state dari respons server lalu refresh terkait; upload post sukses → refresh feed page=0.
- QA sinkron wajib lolos: post dari app muncul di web; like dari web terlihat di app setelah resume; chat app↔web ≤2 dtk; story dari web muncul di app setelah resume/pull-refresh.

# 2. AUTENTIKASI BULLETPROOF (sesi cookie — tiga jebakan WAJIB dihindari)

Backend memakai cookie sesi httpOnly `skelzhub_session` (30 hari):
1. PersistCookieJar: WAJIB dibuat dengan path dari getApplicationDocumentsDirectory() (package path_provider) dan WAJIB di-INIT/await SEBELUM request pertama (inisialisasi di main() sebelum runApp; simpan instance global). CookieManager(jar) dipasang sebagai interceptor dio. Jebakan #1: jar belum siap → cookie hilang → semua fitur login-gated kosong diam-diam. WAJIB: setelah login, GET /api/auth/me HARUS mengembalikan user (assert di QA).
2. Login 2 langkah (2FA email): POST /api/auth/login {"username","password"} → {step:"code", userId, email(tersamarkan), emailSent, emailConfigured, devCode?} → layar kode 6 digit (banner "mode dev: kode {devCode}" bila emailConfigured=false); POST /api/auth/login/verify {"userId","code"} → {step:"done", user}. Akun lama tanpa email → {step:"done", user} langsung. Setelah "done": panggil /api/auth/me sekali lagi untuk memastikan sesi tersimpan (jika masih null → tampilkan error eksplisit "Sesi gagal tersimpan", jangan lanjut diam-diam).
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
  POST /api/conversations/{id}/messages {"text"?,"mediaId"?,"replyToId"?} → {message} — FOTO+CAPTION SATU REQUEST;
  PATCH .../messages {"messageId","text"}; DELETE .../messages?messageId=; POST .../messages/react {"messageId","emoji"|null}; POST .../typing (interval ≥3 dtk).
- PENCARIAN: GET /api/search?q={q} → {users:[User], posts:[Post], videos:[Post]}.
- NOTIFIKASI: GET /api/notifications → {items:[{id,type("LIKE"|"COMMENT"|"FOLLOW"|"FOLLOW_REQUEST"|"FOLLOW_ACCEPT"|"REPOST"|"STORY_VIEW"|"STORY_LIKE"|"STORY_COMMENT"),read,createdAt,actor,postId?,postMedia?,postType?,commentText?}],unread}; POST /api/notifications (mark all read).
- UPLOAD (post/story/chat/avatar/voice) dua jalur otomatis:
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

# 6. PERFORMA NATIVE
- 60fps: ListView.builder/PageView.builder + pagination nextPage; RepaintBoundary media; cached_network_image memCacheWidth proporsional layar; video_player controller WAJIB dispose.
- Kompresi pre-upload: EXIF dibenarkan, ≤2048px (post/chat) / crop 1080x1920 (story), kualitas 85-90 — tidak boleh buram; preview "asli X MB → hasil Y MB".
- Debounce pencarian 300ms + CancelToken; polling berhenti saat background.
- Offline: connectivity_plus → banner + retry; semua state: skeleton / empty / error + "Coba lagi".

# 7. DESIGN SYSTEM v5 (anti-jadul, anti-overflow)
- Gradient primer #FF6A00→#EE1B7A (aksi utama, ring story belum dilihat, tombol (+) create tengah, indikator aktif); latar #FAFAFA / #0F1115; dark+light ikut sistem.
- Radius 20-24 kartu, 999 pill; shadow lembut; Inter 400/600/700; angka "1,2 rb"; waktu "2 mnt lalu / Kemarin".
- Bottom nav 5 slot: Beranda, Cari, Shorts, (+) gradient menonjol, Chat (badge unread), Profil; safe-area; item aktif ikon terisi + pill gradient.
- Kartu feed premium: rounded-24; header avatar ring-gradient + nama + waktu relatif; media AspectRatio 4:5 ClipRRect; caption ellipsis + "selengkapnya"; baris aksi like/komentar/repost/simpan + angka; double-tap like animasi hati; pull-to-refresh warna brand.
- Avatar null → gradient dari avatarColor (8 pasangan untuk 0-7).
- Tap scale 0.97; transisi slide+fade 220-250ms; Hero foto → lightbox InteractiveViewer zoom; haptic ringan.
- NOL RenderFlex overflow di 320/375/412/768/900dp: Expanded/Flexible di Row/Column padat, teks panjang selalu ellipsis, SafeArea + Scaffold, composer chat naik via MediaQuery viewInsets, grid LayoutBuilder, gambar selalu AspectRatio/ClipRRect. Audit tiap layar.
- Ikon konsisten satu gaya outline.

# 8. FITUR (semua jalan, data nyata)
8.1 Feed: rail story; shortcut composer; infinite scroll nextPage + skeleton; pull-to-refresh; tab Utama/Mengikuti; like/save/repost optimistik + rollback; komentar bottom-sheet + balasan + preview 2; repost bersarang; hidden → "Konten tersembunyi".
8.2 Story + ring: tekan ring → bottom-sheet "Lihat Story"/"Buka Profil"/"Kirim Pesan". Viewer: progress segmented, tap kanan/kiri, tahan pause, swipe down tutup, like + komentar sheet + share. Pemilik: penonton + jumlah.
8.3 Shorts: PageView vertikal feed=shorts, autoplay muted loop, tap suara, double-tap like + hati, bar aksi kanan, komentar sheet, preload 1 video.
8.4 Chat: daftar (search, unread bold + badge, preview per kind "[Foto] [Video] [Suara] [Pesan dihapus]"), poll 5 dtk. Room: header avatar + nama + Online/Terakhir aktif; bubble modern (gradient pesanku/abu lawan, radius asimetris, timestamp, 1 centang terkirim/2 centang aksen readAt, "Diedit", placeholder "Pesan dihapus"); grouping; pemisah hari; typing 3 titik; kirim teks/foto/video/voice; FOTO+CAPTION SATU REQUEST & SATU BUBBLE (caption menyatu di bawah foto); reply quote; reaksi emoji; edit/hapus swipe; share post ke chat; poll since 2 dtk; auto-dibaca.
8.5 Pencarian global: debounce 300ms + cancel; GET /api/search; tab Semua/Akun/Postingan/Video; recent search lokal; kosong → /api/suggestions + grid explore; highlight keyword; input aneh tidak crash; empty "Tidak ada hasil untuk 'xxx'".
8.6 Notifikasi: ikon tipe + teks natural, thumbnail post, grouping hari, badge (tab + bell), mark all read, poll 30 dtk, tap → tujuan; PLUS push + banner + deep-link.
8.7 Profil: header avatar + ring story, nama + username + badge role, bio, stats (buka list followers/following + ikuti per baris); sendiri = Edit Profil; orang lain = Ikuti/"Diminta"/"Sudah Diikuti" + Pesan (POST /api/conversations → room); tab Postingan/Reposts/Tersimpan; grid 3 kolom; akun privat → "Akun ini privat" + Ikuti; edit profil (nama, bio, toggle privat, avatar crop + upload, ganti password); follow optimistik + rollback.
8.8 Create: multi foto ≤10 atau 1 video, kompresi + preview "asli → hasil", caption 2200, share ke Feed atau Story (crop 1080x1920, caption 500), progres upload, selesai → toast + refresh feed page=0.
8.9 Pengaturan: tampilan terang/gelap/sistem; status push + "Tes notifikasi" (sem bunyikan bila 404); "Diagnostik Koneksi" (bagian 1D); keluar akun; ganti password; tentang SkelzHUB v5.
8.10 Tablet ≥900dp: chat dua panel rapi; grid feed lebih lebar.

# 9. IKON + SPLASH
- Ikon: rounded-square gelap #0F1115 + monogram "S" gradient #FF6A00→#EE1B7A + glow tipis, flat premium, terbaca 48px; flutter_launcher_icons (adaptive Android foreground/background safe-zone + iOS 1024 tanpa transparansi) + flutter_launcher_icons.yaml.
- flutter_native_splash.yaml: latar gelap + logo "S" + progress kecil; transisi mulus.

# 10. STRUKTUR PROYEK
lib/main.dart (bootstrap: await cookie jar, ProviderScope, theme, connectivity, heartbeat, push, health check);
lib/core/config.dart (baseUrl + absUrl);
lib/core/api/ (api_client: dio + CookieManager + 401 + upload; api_exception; endpoints);
lib/core/models/ (me,user,post,comment,conversation,message,story,notification,upload_result — fromJson + normalisasi URL via absUrl);
lib/core/theme/; lib/core/widgets/ (avatar ring, app_button, skeleton, empty_state, error_state, media lightbox, time_ago, number_id, in_app_banner);
lib/core/push/ (push_service: init, permission, token, register/unregister, banner, deep-link, fallback 404);
lib/features/{auth,feed,stories,shorts,chat,search,notifications,profile,create,settings}/…;
lib/features/settings/diagnostics_screen.dart (bagian 1D);
lib/shell/ (bottom nav + lifecycle sync manager);
backend-patch/ (bagian 4B + 5).
Aturan: file ≤±250 baris; satu tanggung jawab per file; riverpod AsyncNotifier + family pagination.

# 11. CARA MENGERJAKAN (effort maksimal)
Langkah 1 — rencana ≤30 baris (daftar file final urut).
Langkah 2 — kode LENGKAP file demi file; DILARANG memotong file, DILARANG "..." / "// sisanya sama"; konteks menipis → selesaikan file aktif, lanjut di pesan berikutnya dari file persis yang belum ditulis.
Langkah 3 — README: build (flutter create . --platforms=android,ios --project-name skelzhub; flutter pub get; flutter run; flutter build apk --release --split-per-abi), setup Firebase (google-services.json, service account, FCM_SERVER_KEY di Vercel), deploy backend-patch, catatan TANPA konfigurasi API (baseUrl live).
Langkah 4 — QA self-audit bagian 12, perbaiki semua sebelum menutup.

# 12. QA — DEFINITION OF DONE (gerbang lolos; gagal satu = belum selesai)
1. Nol error kompilasi; import & tipe konsisten.
2. NOL RenderFlex overflow di 320/375/412/768/900dp; keyboard tidak menutup composer; teks panjang ellipsis.
3. DATA VISIBLE (gerbang paling penting): buka app tanpa login → feed home MENAMPILKAN postingan asli dari server (server live punya data; feed kosong = BUG yang wajib diperbaiki); Shorts menampilkan dan MEMUTAR video asli; semua foto/avatar tampil (tidak ada gambar putus — semua URL lewat absUrl); login sukses → /api/auth/me mengembalikan user; story/chat/notifikasi terisi data nyata; Diagnostik Koneksi menampilkan semua status OK.
4. Sinkron satu database: post app→web muncul; like web→app setelah resume; chat app↔web ≤2 dtk; story web→app setelah resume/pull-refresh.
5. Push: register 200 setelah patch dideploy (404 → fallback diam); banner foreground; tray background; TAP navigasi benar; /api/push/test berhasil; push gagal tidak pernah mengganggu fitur utama.
6. Story sendiri: tidak menambah penonton; setelah patch, daftar penonton & jumlah tidak memuat diri sendiri; ring story orang lain jadi abu setelah dilihat (persist).
7. Login 2 langkah + akun tanpa email; register; auto-login boot; 401 → auto logout; offline banner; semua layar punya skeleton/empty/error YANG BENAR (1C).
8. Semua controller video/audio dispose; polling berhenti di background.
9. UI modern, gradient konsisten, tidak jadul, nol placeholder/TODO/lorem, Bahasa Indonesia natural.

Standar akhir: aplikasi yang dibuka langsung terbukti nyambung — feed berisi, video jalan, gambar tampil, tanpa satu pun data kosong yang tak terjelaskan. NO MISTAKE.

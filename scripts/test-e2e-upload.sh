#!/bin/bash
# E2E browser: upload video besar 13MB via UI (jalur chunk) — post + story
# Dijalankan dalam SATU panggilan bash bersama dev server.
set -u
cd /home/z/my-project
PASS=0; FAIL=0
ok() { echo "  [OK] $1"; PASS=$((PASS+1)); }
no() { echo "  [GAGAL] $1"; FAIL=$((FAIL+1)); }
BIG=/home/z/my-project/assets/test/big-video.mp4

echo "=== [1] Start dev server ==="
rm -f dev.log
bun run dev > /dev/null 2>&1 &
SERVER_PID=$!
code=000
for i in $(seq 1 45); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ --max-time 5 2>/dev/null)
  [ "$code" = "200" ] && break
  sleep 1
done
[ "$code" = "200" ] && ok "server siap" || { no "server tidak siap ($code)"; kill $SERVER_PID 2>/dev/null; exit 1; }

SESSION=$(awk '$6=="skelzhub_session"{print $7}' /tmp/sk-cookies.txt)

echo "=== [2] Buka aplikasi + pasang session ==="
agent-browser close >/dev/null 2>&1
agent-browser open "http://localhost:3000/" >/dev/null 2>&1
sleep 1
agent-browser cookies set skelzhub_session "$SESSION" >/dev/null 2>&1
agent-browser open "http://localhost:3000/" >/dev/null 2>&1
sleep 3
ok "aplikasi termuat ($(agent-browser get url 2>/dev/null))"

# fungsi bantu: ambil ref dari snapshot terbaru
snap() { agent-browser snapshot -i > /tmp/snap.txt 2>/dev/null; }
ref_of() { grep -m1 "$1" /tmp/snap.txt | sed -n 's/.*\[ref=e\([0-9]*\)\].*/\1/p'; }

echo "=== [3] Buat Post: pilih video 13MB ==="
agent-browser open "http://localhost:3000/#/create" >/dev/null 2>&1
sleep 2
# pastikan input file masuk a11y tree
agent-browser eval "document.querySelectorAll('input[type=file]').forEach(i=>{i.classList.remove('sr-only','hidden'); i.style.position='static'; i.style.width='300px'; i.style.height='30px'; i.style.opacity='1';})" >/dev/null 2>&1
snap
FREF=$(ref_of "No file chosen")
echo "  ref input file: ${FREF:-?}"
if [ -n "$FREF" ]; then
  agent-browser upload "@e$FREF" "$BIG" 2>&1 | head -2
  sleep 2
  snap
  if grep -qi "Ganti media" /tmp/snap.txt; then ok "video 13MB terpilih (preview muncul)"; else no "video tidak terpilih"; fi
else
  no "input file tidak ketemu"
fi

echo "=== [4] Isi keterangan + bagikan ==="
CREF=$(ref_of "Keterangan")
BREF=$(ref_of "Bagikan ke Shorts"); [ -z "$BREF" ] && BREF=$(ref_of "Bagikan")
echo "  ref textarea: ${CREF:-?} | tombol: ${BREF:-?}"
[ -n "$CREF" ] && agent-browser fill "@e$CREF" "Uji unggah video besar 13MB (bertahap)" >/dev/null 2>&1
[ -n "$BREF" ] && { agent-browser scrollintoview "@e$BREF" >/dev/null 2>&1; agent-browser click "@e$BREF" >/dev/null 2>&1; }
echo "  menunggu unggahan selesai..."
DONE=0
for i in $(seq 1 90); do
  U=$(agent-browser get url 2>/dev/null)
  case "$U" in *shorts*) DONE=1; break;; esac
  sleep 2
done
if [ "$DONE" = "1" ]; then ok "upload 13MB dari UI BERHASIL -> halaman Shorts"; else no "upload UI tidak selesai (URL: $(agent-browser get url 2>/dev/null))"; fi

echo "=== [5] Bukti jalur chunk di network ==="
agent-browser network requests --filter "upload" 2>/dev/null | head -10

echo "=== [6] Error console? ==="
ERRS=$(agent-browser errors 2>/dev/null | head -8)
if [ -z "$ERRS" ] || [ "$ERRS" = "[]" ]; then ok "tidak ada error JavaScript"; else echo "  error: $ERRS"; fi

echo "=== [7] Video diputar di Shorts? ==="
sleep 3
VSTATE=$(agent-browser eval "(()=>{const v=document.querySelector('video'); if(!v) return 'TIDAK ADA VIDEO'; return JSON.stringify({readyState:v.readyState,dur:Math.round(v.duration||0),w:v.videoWidth,h:v.videoHeight});})()" 2>/dev/null)
echo "  state video: $VSTATE"
case "$VSTATE" in *TIDAK\ ADA*) no "video tidak ditemukan di Shorts";; *readyState*) ok "video Shorts termuat: $VSTATE";; *) no "state tidak terbaca: $VSTATE";; esac

echo "=== [8] Feed menampilkan post? ==="
agent-browser open "http://localhost:3000/#/" >/dev/null 2>&1
sleep 3
FEEDTXT=$(agent-browser eval "document.body.innerText.includes('Uji unggah video besar 13MB')" 2>/dev/null)
echo "  caption ada di feed: $FEEDTXT"
[ "$FEEDTXT" = "true" ] && ok "post muncul di feed" || no "post tidak terlihat di feed"

echo "=== [9] Buat STORY dengan video 13MB (jalur chunk juga) ==="
# hapus story lama milik skelz supaya tombol rail = "Tambah story"
STORY_IDS=$(curl -s -b /tmp/sk-cookies.txt http://localhost:3000/api/stories | bun -e "const chunks=[]; for await (const c of Bun.stdin.stream()) chunks.push(c); const d=JSON.parse(Buffer.concat(chunks).toString()); const g=(d.groups||[]).find(x=>x.isMe); console.log(((g?.items)||[]).map(s=>s.id).join(' '));" 2>/dev/null)
echo "  story lama skelz: ${STORY_IDS:-tidak ada}"
for SID in $STORY_IDS; do
  curl -s -b /tmp/sk-cookies.txt -X DELETE "http://localhost:3000/api/stories/$SID" > /dev/null
done
# muat ulang halaman supaya cache React Query di browser ambil data story terbaru
agent-browser reload >/dev/null 2>&1
sleep 5
snap
# tombol tambah story di bar story (ikon plus) — label id/en/es
SREF=$(ref_of "dd story"); [ -z "$SREF" ] && SREF=$(ref_of "ambah story")
echo "  ref tombol story: ${SREF:-?}"
if [ -n "$SREF" ]; then
  agent-browser click "@e$SREF" >/dev/null 2>&1
  sleep 2
  # dialog story terbuka: pastikan input filenya kelihatan
  agent-browser eval "document.querySelectorAll('input[type=file]').forEach(i=>{i.classList.remove('sr-only','hidden'); i.style.position='static'; i.style.width='300px'; i.style.height='30px'; i.style.opacity='1';})" >/dev/null 2>&1
  snap
  SFREF=$(ref_of "No file chosen"); echo "  ref input story: ${SFREF:-?}"
  if [ -n "$SFREF" ]; then
    agent-browser upload "@e$SFREF" "$BIG" 2>&1 | head -2
    sleep 2
    snap
    grep -qi "Ganti" /tmp/snap.txt && ok "video story terpilih" || no "video story tidak terpilih"
    # isi caption story (aria-label: Caption (optional) / Keterangan (opsional))
    STREF=$(ref_of "[Cc]aption"); [ -z "$STREF" ] && STREF=$(ref_of "eterangan")
    echo "  ref caption story: ${STREF:-?}"
    [ -n "$STREF" ] && agent-browser fill "@e$STREF" "Story video besar!" >/dev/null 2>&1
    SSBTN=$(ref_of "[Ss]hare story"); [ -z "$SSBTN" ] && SSBTN=$(ref_of "agikan story")
    echo "  ref tombol bagikan story: ${SSBTN:-?}"
    if [ -n "$SSBTN" ]; then
      agent-browser scrollintoview "@e$SSBTN" >/dev/null 2>&1
      agent-browser click "@e$SSBTN" 2>&1 | head -2
      DONE2=0
      for i in $(seq 1 60); do
        HASDIALOG=$(agent-browser eval "!!document.querySelector('[role=dialog]')" 2>/dev/null)
        [ "$HASDIALOG" = "false" ] && DONE2=1 && break
        sleep 2
      done
      [ "$DONE2" = "1" ] && ok "story 13MB terunggah (dialog tertutup)" || no "story tidak selesai"
      # verifikasi story masuk daftar via API dari dalam browser
      STCHECK=$(agent-browser eval "fetch('/api/stories').then(r=>r.json()).then(d=>{const g=d.groups||[]; const my=g.find(x=>x.isMe); return JSON.stringify({grup:g.length, punya:!!my, jumlah:my?my.items.length:0});}).catch(e=>'ERR:'+e)" 2>/dev/null)
      echo "  cek API story: $STCHECK"
      if echo "$STCHECK" | grep -q "punya.*true"; then ok "story tersimpan di database"; else no "story tidak terdeteksi: $STCHECK"; fi
    else
      no "tombol bagikan story tidak ketemu"
    fi
  else
    no "input file story tidak ketemu"
  fi
else
  no "tombol tambah story tidak ketemu"
fi

echo "=== [10] Screenshot bukti ==="
agent-browser screenshot /home/z/my-project/assets/verify-chunk-upload.png >/dev/null 2>&1
ls -la /home/z/my-project/assets/verify-chunk-upload.png 2>/dev/null | awk '{print "  file:", $NF, $5, "byte"}'

echo ""
echo "=== HASIL: $PASS lulus, $FAIL gagal ==="
agent-browser close >/dev/null 2>&1
kill $SERVER_PID 2>/dev/null
echo "DONE"

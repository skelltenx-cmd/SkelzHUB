#!/bin/bash
# Test lengkap upload bertahap (chunk) SkelzHub — dijalankan dalam satu panggilan
# bersama dev server, karena proses background tidak bertahan antar-panggilan.
set -u
cd /home/z/my-project

echo "=== [1] Start dev server ==="
rm -f dev.log
bun run dev > /dev/null 2>&1 &
SERVER_PID=$!
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ --max-time 5 2>/dev/null)
  [ "$code" = "200" ] && break
  sleep 1
done
if [ "$code" != "200" ]; then
  echo "GAGAL: server tidak siap (kode $code)"
  cat dev.log | tail -20
  kill $SERVER_PID 2>/dev/null
  exit 1
fi
echo "Server siap (HTTP $code)"

echo ""
echo "=== [2] Login skelz + verifikasi kode ==="
LOGIN=$(curl -s -c /tmp/sk-cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" -d '{"username":"skelz","password":"skelz123"}')
USERID=$(echo "$LOGIN" | sed -n 's/.*"userId":"\([^"]*\)".*/\1/p')
DEVCODE=$(echo "$LOGIN" | sed -n 's/.*"devCode":"\([^"]*\)".*/\1/p')
echo "userId=$USERID devCode=$DEVCODE"
VERIFY=$(curl -s -b /tmp/sk-cookies.txt -c /tmp/sk-cookies.txt -X POST http://localhost:3000/api/auth/login/verify \
  -H "Content-Type: application/json" -d "{\"userId\":\"$USERID\",\"code\":\"$DEVCODE\"}")
echo "$VERIFY" | head -c 120; echo ""
echo "$VERIFY" | grep -q '"step":"done"' || { echo "GAGAL login"; kill $SERVER_PID; exit 1; }
echo "Login OK"

echo ""
echo "=== [3] Upload file KECIL (jalur langsung, <4MB) ==="
# bikin gambar jpeg kecil via ffmpeg (150KB)
ffmpeg -y -hide_banner -loglevel error -f lavfi -i "color=red:size=640x480:duration=0.1" -frames:v 1 /tmp/kecil.jpg 2>/dev/null
SMALL=$(curl -s -b /tmp/sk-cookies.txt -X POST http://localhost:3000/api/upload \
  -F "file=@/tmp/kecil.jpg;type=image/jpeg")
echo "$SMALL" | head -c 200; echo ""
SMALL_ID=$(echo "$SMALL" | sed -n 's/.*"mediaId":"\([^"]*\)".*/\1/p')
[ -n "$SMALL_ID" ] && echo "Upload kecil OK ($SMALL_ID)" || echo "GAGAL upload kecil"

echo ""
echo "=== [4] Upload file BESAR 13MB (jalur chunk, 4 potongan) ==="
KEY="test-upload-$(date +%s)"
CHUNK_SIZE=4194399
TOTAL=4
cd /home/z/my-project/assets/test
rm -f part_*
split -b $CHUNK_SIZE big-video.mp4 part_
i=0
for part in part_aa part_ab part_ac part_ad; do
  RESP=$(curl -s -b /tmp/sk-cookies.txt -X POST http://localhost:3000/api/upload/chunk \
    -F "key=$KEY" -F "index=$i" -F "total=$TOTAL" -F "file=@$part;type=video/mp4")
  echo "potongan $i ($part): $RESP"
  echo "$RESP" | grep -q '"ok":true' || { echo "GAGAL potongan $i"; cd /home/z/my-project; kill $SERVER_PID; exit 1; }
  i=$((i+1))
done
cd /home/z/my-project

echo ""
echo "=== [5] Gabungkan (complete) ==="
COMPLETE=$(curl -s -b /tmp/sk-cookies.txt -X POST http://localhost:3000/api/upload/complete \
  -H "Content-Type: application/json" \
  -d "{\"key\":\"$KEY\",\"totalChunks\":$TOTAL,\"mimeType\":\"video/mp4\"}")
echo "$COMPLETE" | head -c 300; echo ""
MEDIA_ID=$(echo "$COMPLETE" | sed -n 's/.*"mediaId":"\([^"]*\)".*/\1/p')
[ -n "$MEDIA_ID" ] && echo "Complete OK ($MEDIA_ID)" || { echo "GAGAL complete"; kill $SERVER_PID; exit 1; }

echo ""
echo "=== [6] Integritas: unduh media & bandingkan md5 dengan file asal ==="
curl -s -b /tmp/sk-cookies.txt "http://localhost:3000/api/media/$MEDIA_ID" -o /tmp/hasil.mp4
MD5_ASAL=$(md5sum /home/z/my-project/assets/test/big-video.mp4 | cut -d" " -f1)
MD5_HASIL=$(md5sum /tmp/hasil.mp4 | cut -d" " -f1)
UKURAN_ASAL=$(stat -c%s /home/z/my-project/assets/test/big-video.mp4)
UKURAN_HASIL=$(stat -c%s /tmp/hasil.mp4)
echo "asal : $UKURAN_ASAL byte  md5=$MD5_ASAL"
echo "hasil: $UKURAN_HASIL byte  md5=$MD5_HASIL"
if [ "$MD5_ASAL" = "$MD5_HASIL" ]; then echo "INTEGRITAS: SAMA PERSIS ✓"; else echo "INTEGRITAS: BEDA ✗"; fi

echo ""
echo "=== [7] Range request (streaming/seek video) ==="
curl -s -b /tmp/sk-cookies.txt -D /tmp/range-headers.txt -o /tmp/range-body.bin \
  -H "Range: bytes=1000000-1000999" "http://localhost:3000/api/media/$MEDIA_ID"
rg "HTTP|Content-Range|Content-Length" /tmp/range-headers.txt | head -4
BODY_SIZE=$(stat -c%s /tmp/range-body.bin)
echo "body range: $BODY_SIZE byte (harus 1000)"
[ "$BODY_SIZE" = "1000" ] && echo "RANGE OK ✓" || echo "RANGE GAGAL ✗"

echo ""
echo "=== [8] Buat post Shorts dari media besar ==="
POST=$(curl -s -b /tmp/sk-cookies.txt -X POST http://localhost:3000/api/posts \
  -H "Content-Type: application/json" \
  -d "{\"caption\":\"Test video besar 13MB (chunk upload)\",\"mediaId\":\"$MEDIA_ID\"}")
echo "$POST" | head -c 200; echo ""
POST_ID=$(echo "$POST" | sed -n 's/.*"post":{"id":"\([^"]*\)".*/\1/p')
[ -n "$POST_ID" ] && echo "POST OK ($POST_ID)" || echo "GAGAL buat post"

echo ""
echo "=== [9] Pastikan potongan sudah dibersihkan ==="
LEFT=$(sqlite3 db/custom.db "SELECT COUNT(*) FROM MediaChunk" 2>/dev/null || echo "?")
echo "MediaChunk tersisa: $LEFT (harus 0)"

echo ""
echo "=== [10] Proteksi: kirim potongan invalid ==="
BADKEY=$(curl -s -b /tmp/sk-cookies.txt -X POST http://localhost:3000/api/upload/chunk \
  -F "key=BAD_KEY!!" -F "index=0" -F "total=1" -F "file=@/tmp/kecil.jpg;type=image/jpeg")
echo "kunci invalid: $BADKEY (harus ditolak)"
BADCOMPLETE=$(curl -s -b /tmp/sk-cookies.txt -X POST http://localhost:3000/api/upload/complete \
  -H "Content-Type: application/json" -d "{\"key\":\"test-tidak-ada-12345678\",\"totalChunks\":2,\"mimeType\":\"video/mp4\"}")
echo "complete tanpa potongan: $BADCOMPLETE (harus ditolak)"

echo ""
echo "=== SELESAI — matikan server ==="
kill $SERVER_PID 2>/dev/null
echo "DONE"

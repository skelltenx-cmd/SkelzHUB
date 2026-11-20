"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, RefreshCcw, SwitchCamera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/**
 * Dialog ambil foto langsung dari kamera (untuk chat):
 * buka kamera -> jepret -> pratinjau -> kirim.
 *
 * Anti "layar hitam" di HP (Android/iOS):
 *  1. Buka kamera bertahap: constraint ideal dulu, lalu longgar, lalu default.
 *  2. Watchdog: jika 2.5 detik frame belum keluar (videoWidth === 0), stream
 *     dibuka ulang dengan constraint lebih sederhana (banyak HP Android
 *     mengirim stream hitam kalau constraint terlalu spesifik).
 *  3. Kalau tetap hitam / izin ditolak -> tawarkan input file `capture`
 *     (membuka aplikasi kamera sistem — selalu berhasil di HP).
 */
export function CameraCaptureDialog({
  onCapture,
  onClose,
}: {
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [error, setError] = useState<null | "open" | "black">(null);
  const [shot, setShot] = useState<Blob | null>(null);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(true);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // Buka kamera dengan retry + watchdog frame (deps minim — hanya kamera
  // dibalik / sedang pratinjau — supaya stream tidak pernah restart tanpa alasan)
  useEffect(() => {
    if (shot) return; // sedang pratinjau hasil jepretan
    let alive = true;
    let stream: MediaStream | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let attempts = 0;

    const cleanup = () => {
      if (poll) clearInterval(poll);
      poll = null;
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      streamRef.current = null;
    };

    const attach = (s: MediaStream) => {
      stream = s;
      streamRef.current = s;
      const v = videoRef.current;
      if (v) {
        v.srcObject = s;
        // Beberapa HP butuh kick eksplisit setelah srcObject dipasang
        v.play().catch(() => null);
      }
    };

    const open = async () => {
      attempts++;
      setStarting(true);
      setError(null);
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
        const constraints: MediaStreamConstraints =
          attempts === 1
            ? { video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false }
            : attempts === 2
              ? { video: { facingMode: facing }, audio: false }
              : { video: true, audio: false };
        const s = await navigator.mediaDevices.getUserMedia(constraints);
        if (!alive) {
          s.getTracks().forEach((track) => track.stop());
          return;
        }
        attach(s);

        // Watchdog: frame harus keluar maks 2.5 dtk, kalau tidak restart /
        // akhirnya jatuh ke fallback kamera sistem.
        const deadline = Date.now() + 2500;
        poll = setInterval(() => {
          if (!alive) {
            cleanup();
            return;
          }
          const v = videoRef.current;
          if (v && v.videoWidth > 0 && v.readyState >= 2) {
            if (poll) clearInterval(poll);
            poll = null;
            setStarting(false);
          } else if (Date.now() > deadline) {
            if (poll) clearInterval(poll);
            poll = null;
            cleanup();
            if (attempts < 3) {
              void open();
            } else {
              setStarting(false);
              setError("black");
            }
          }
        }, 250);
      } catch {
        if (!alive) return;
        cleanup();
        if (attempts < 3) {
          void open();
        } else {
          setStarting(false);
          setError("open");
        }
      }
    };

    void open();
    return () => {
      alive = false;
      cleanup();
    };
  }, [facing, shot]);

  // Bersihkan saat ditutup
  useEffect(() => {
    return () => {
      if (shotUrl) URL.revokeObjectURL(shotUrl);
    };
  }, [shotUrl]);

  function snap() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // Kamera depan: mirror alami seperti layar kamera bawaan
    if (facing === "user") {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setShot(blob);
        setShotUrl(URL.createObjectURL(blob));
        stopStream();
      },
      "image/jpeg",
      0.93
    );
  }

  function retake() {
    if (shotUrl) URL.revokeObjectURL(shotUrl);
    setShot(null);
    setShotUrl(null);
  }

  async function confirm() {
    if (!shot || sending) return;
    setSending(true);
    onCapture(shot);
  }

  const fallbackInputRef = useRef<HTMLInputElement>(null);

  const errMsg =
    error === "black"
      ? t("dm.cameraBlack")
      : t("dm.cameraErr");

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black animate-fade-in" role="dialog" aria-modal="true" aria-label={t("dm.cameraTitle")}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-white">
          <Camera className="h-4 w-4 text-rose-400" aria-hidden="true" />
          {t("dm.cameraTitle")}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full bg-white/10 text-white hover:bg-white/20"
          onClick={() => {
            retake();
            onClose();
          }}
          aria-label="Tutup"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Isi */}
      {shot && shotUrl ? (
        <div className="relative flex flex-1 items-center justify-center overflow-hidden">
          <img src={shotUrl} alt="Pratinjau foto" className="max-h-full max-w-full object-contain animate-pop-in" />
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="h-12 rounded-full bg-white/10 px-6 text-white backdrop-blur hover:bg-white/20"
              onClick={retake}
              disabled={sending}
            >
              <RefreshCcw className="h-5 w-5" /> {t("dm.retake")}
            </Button>
            <Button
              type="button"
              size="lg"
              className="h-12 rounded-full bg-gradient-to-r from-rose-500 to-orange-400 px-6 text-white hover:opacity-90"
              onClick={confirm}
              disabled={sending}
            >
              {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
              {t("dm.usePhoto")}
            </Button>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
            <Camera className="h-8 w-8 text-white/70" aria-hidden="true" />
          </span>
          <p className="max-w-sm text-sm text-white/80">{errMsg}</p>
          <input
            ref={fallbackInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onCapture(f);
            }}
            aria-label={t("dm.camera")}
          />
          {/* Di HP: tombol ini membuka aplikasi kamera sistem (selalu berhasil) */}
          <Button
            className="rounded-full bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90"
            onClick={() => fallbackInputRef.current?.click()}
          >
            <Camera className="h-4 w-4" /> {t("dm.snap")}
          </Button>
          <Button variant="ghost" className="text-white/60" onClick={onClose}>
            {t("dm.back")}
          </Button>
        </div>
      ) : (
        <div className="relative flex-1 overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            disablePictureInPicture
            onLoadedData={() => {
              // Pastikan mulai memutar begitu frame pertama siap (iPad/Android)
              videoRef.current?.play().catch(() => null);
            }}
            className={cn("h-full w-full object-cover", facing === "user" && "scale-x-[-1]")}
            aria-label="Pratinjau kamera"
          />
          {starting && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Loader2 className="h-8 w-8 animate-spin text-white/80" aria-label="Membuka kamera" />
            </div>
          )}
          {/* Bingkai fokus halus */}
          <div className="pointer-events-none absolute inset-8 rounded-2xl ring-1 ring-white/20" aria-hidden="true" />
          {/* Kontrol bawah */}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-8 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-12 w-12 rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
              onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
              aria-label={t("dm.switchCam")}
            >
              <SwitchCamera className="h-6 w-6" />
            </Button>
            <button
              type="button"
              onClick={snap}
              disabled={starting}
              className="group relative flex h-18 w-18 items-center justify-center rounded-full outline-none disabled:opacity-50"
              aria-label={t("dm.snap")}
              style={{ height: "4.5rem", width: "4.5rem" }}
            >
              <span className="absolute inset-0 rounded-full border-4 border-white/80 transition-transform group-active:scale-90" aria-hidden="true" />
              <span className="h-12 w-12 rounded-full bg-white transition-transform group-active:scale-90" aria-hidden="true" />
            </button>
            <span className="w-12" aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  );
}

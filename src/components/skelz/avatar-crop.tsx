"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Minus, Plus, RotateCw, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

/**
 * Dialog crop foto profil — dirancang nyaman di HP maupun desktop:
 *  - Geser: drag satu jari / mouse
 *  - Zoom: slider, tombol +/-, scroll wheel, dan PINCH dua jari di HP
 *  - Putar 90° tiap kali tombol putar ditekan
 *  - Pratinjau mask lingkaran persis seperti avatar hasil
 *  - Reset cepat ke posisi awal
 * Hasil: gambar persegi 400x400 JPEG siap unggah.
 */

const VIEW = 320; // ukuran kotak crop (px logis)
const OUT = 400; // ukuran gambar hasil (px)
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

export function AvatarCropDialog({
  file,
  onCancel,
  onDone,
}: {
  file: File;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
}) {
  const [baseImg, setBaseImg] = useState<HTMLImageElement | null>(null);
  const [rotCanvas, setRotCanvas] = useState<HTMLCanvasElement | null>(null); // sumber setelah diputar
  const [rot, setRot] = useState(0); // kelipatan 90° yang sudah dibakar ke rotCanvas
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);

  // Muat gambar asli sekali
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setBaseImg(image);
      setRot(0);
      setRotCanvas(null);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    image.onerror = () => setError("Gambar tidak bisa dibuka, coba file lain.");
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Bakar rotasi k*90° ke canvas kerja
  const bakeRotation = useCallback(
    (quarters: number) => {
      if (!baseImg) return null;
      if (quarters === 0) return null;
      const swap = quarters % 2 === 1; // 90/270: lebar tinggi bertukar
      const w = swap ? baseImg.naturalHeight : baseImg.naturalWidth;
      const h = swap ? baseImg.naturalWidth : baseImg.naturalHeight;
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return null;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.translate(w / 2, h / 2);
      ctx.rotate((quarters * 90 * Math.PI) / 180);
      ctx.drawImage(baseImg, -baseImg.naturalWidth / 2, -baseImg.naturalHeight / 2);
      return c;
    },
    [baseImg]
  );

  function rotateRight() {
    if (!baseImg) return;
    const next = (rot + 1) % 4;
    setRot(next);
    setRotCanvas(bakeRotation(next));
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  function resetAll() {
    setRot(0);
    setRotCanvas(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  // Sumber aktif: canvas rotasi (bila ada) atau gambar asli
  const src = (rotCanvas ?? baseImg) as CanvasImageSource | null;
  const srcW = rotCanvas ? rotCanvas.width : (baseImg?.naturalWidth ?? 0);
  const srcH = rotCanvas ? rotCanvas.height : (baseImg?.naturalHeight ?? 0);
  // URL tampil untuk canvas rotasi (dihitung sekali per rotasi, bukan tiap render)
  const [rotUrl, setRotUrl] = useState<string | null>(null);
  useEffect(() => {
    setRotUrl(rotCanvas ? rotCanvas.toDataURL("image/jpeg", 0.9) : null);
  }, [rotCanvas]);

  // Skala tampil terkecil agar gambar menutupi penuh kotak crop
  const coverScale = srcW && srcH ? Math.max(VIEW / srcW, VIEW / srcH) : 1;
  const scale = coverScale * zoom;

  const clampOffset = useCallback(
    (x: number, y: number) => {
      if (!srcW || !srcH) return { x: 0, y: 0 };
      const dw = srcW * scale;
      const dh = srcH * scale;
      const maxX = Math.max(0, (dw - VIEW) / 2);
      const maxY = Math.max(0, (dh - VIEW) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, x)),
        y: Math.min(maxY, Math.max(-maxY, y)),
      };
    },
    [srcW, srcH, scale]
  );

  // Saat zoom/rotasi berubah, jaga posisi tetap dalam batas
  useEffect(() => {
    setOffset((o) => clampOffset(o.x, o.y));
  }, [clampOffset]);

  // ---- Pointer: drag satu jari + pinch dua jari ----
  function trackPointer(e: React.PointerEvent) {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!src) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    trackPointer(e);
    if (pointersRef.current.size === 1) {
      dragRef.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    // Pinch zoom (dua jari)
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchRef.current.zoom * (dist / pinchRef.current.dist)));
      setZoom(next);
      return;
    }
    // Drag pan (satu jari / mouse)
    const d = dragRef.current;
    if (!d) return;
    const rect = boxRef.current?.getBoundingClientRect();
    const ratio = rect ? VIEW / rect.width : 1; // tangani kotak yang mengecil di layar kecil
    const nx = d.ox + (e.clientX - d.px) * ratio;
    const ny = d.oy + (e.clientY - d.py) * ratio;
    setOffset(clampOffset(nx, ny));
  }

  function onPointerUp(e: React.PointerEvent) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) dragRef.current = null;
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * (e.deltaY > 0 ? 0.92 : 1.08))));
  }

  async function confirm() {
    if (!src || saving) return;
    setSaving(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Browser tidak mendukung pengolahan gambar");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      // Persegi crop dalam koordinat piksel gambar kerja (rotasi sudah termasuk)
      const cropSize = VIEW / scale;
      const cx = srcW / 2 - offset.x / scale;
      const cy = srcH / 2 - offset.y / scale;
      ctx.drawImage(src, cx - cropSize / 2, cy - cropSize / 2, cropSize, cropSize, 0, 0, OUT, OUT);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      if (!blob) throw new Error("Gagal memproses gambar");
      onDone(blob);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in sm:items-center" role="dialog" aria-modal="true" aria-label="Atur foto profil">
      <div className="w-full max-w-md rounded-t-2xl border bg-card p-4 shadow-xl animate-slide-up sm:rounded-2xl sm:p-6 sm:animate-pop-in">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">Atur foto profil</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onCancel} aria-label="Batal" disabled={saving}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {error ? (
          <p className="py-8 text-center text-sm text-destructive">{error}</p>
        ) : !src ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Memuat gambar" />
          </div>
        ) : (
          <>
            <div className="flex justify-center">
              <div
                ref={boxRef}
                className="relative touch-none overflow-hidden rounded-xl bg-muted"
                style={{ width: "min(320px, 84vw)", height: "min(320px, 84vw)" }}
                onWheel={onWheel}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <img
                  src={rotUrl ?? (baseImg ? baseImg.src : "")}
                  alt="Pratinjau foto profil"
                  draggable={false}
                  className="pointer-events-none absolute select-none"
                  style={{
                    left: "50%",
                    top: "50%",
                    width: srcW,
                    height: srcH,
                    transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
                    transformOrigin: "center",
                  }}
                />
                {/* Mask lingkaran + garis bantu: pratinjau persis seperti avatar hasil */}
                <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                  <div
                    className="absolute inset-0 bg-black/45"
                    style={{
                      maskImage: "radial-gradient(circle closest-side at center, transparent 0%, transparent 94%, black 96%)",
                      WebkitMaskImage: "radial-gradient(circle closest-side at center, transparent 0%, transparent 94%, black 96%)",
                    }}
                  />
                  <div className="absolute inset-[3%] rounded-full ring-2 ring-white/90" />
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-full"
                aria-label="Perkecil"
                onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.2))}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Slider
                value={[zoom]}
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.05}
                onValueChange={(v) => setZoom(v[0] ?? 1)}
                aria-label="Zoom foto"
                className="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-full"
                aria-label="Perbesar"
                onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.2))}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Baris alat: putar & reset */}
            <div className="mt-2 flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" className="h-8 rounded-full px-3 text-xs" onClick={rotateRight} disabled={saving}>
                <RotateCw className="h-3.5 w-3.5" /> Putar
              </Button>
              <Button variant="outline" size="sm" className="h-8 rounded-full px-3 text-xs" onClick={resetAll} disabled={saving}>
                <Undo2 className="h-3.5 w-3.5" /> Reset
              </Button>
            </div>

            <p className="mt-2 text-center text-xs text-muted-foreground">
              Geser untuk mengatur posisi · zoom dengan slider, scroll, atau cubit (dua jari)
            </p>

            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>
                Batal
              </Button>
              <Button
                onClick={confirm}
                disabled={saving}
                className={cn("flex-1 bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90")}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {saving ? "Menyimpan..." : "Gunakan foto"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

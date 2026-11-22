"use client";

// SkelzVideo — pemutar video dengan kontrol custom bergaya SkelzHub
// (mengganti kontrol bawaan browser <video controls> yang tampak jadul).
//
// - autoPlayWhenVisible: main otomatis (bisu) saat ≥50% terlihat & berhenti
//   saat keluar layar — video di feed tidak lagi berjalan serentak.
// - Kontrol: tombol play/pause tengah, bar progres bisa di-drag/scrub,
//   waktu berjalan/total, tombol bisu, tombol layar penuh.
// - Kontrol muncul saat hover/ketuk & sembunyi otomatis 2.5 dtk saat main.
// - Ketuk tunggal = putar/jeda; ketuk ganda = suka (via onDoubleTap).

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

const TAP_DELAY = 250; // ms — jeda maksimum antar ketukan ganda

function fmtTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SkelzVideo({
  src,
  className,
  videoClassName,
  loop = false,
  autoPlayWhenVisible = true,
  defaultMuted = true,
  compact = false,
  ariaLabel,
  onDoubleTap,
}: {
  src: string;
  className?: string;
  videoClassName?: string;
  loop?: boolean;
  autoPlayWhenVisible?: boolean;
  defaultMuted?: boolean;
  /** compact: tanpa tombol layar penuh & lebih kecil (bubble chat) */
  compact?: boolean;
  ariaLabel?: string;
  /** Ketukan ganda pada video — dipakai untuk suka (feed/detail);
   *  posisi ketukan (persen lebar/tinggi) dikirim agar animasi suka muncul
   *  di titik ketukan seperti TikTok. */
  onDoubleTap?: (pos?: { x: number; y: number }) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef(0);

  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(defaultMuted);
  const [progress, setProgress] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused && !scrubbing) setControlsVisible(false);
    }, 2500);
  }, [scrubbing]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    };
  }, []);

  // Autoplay bisu hanya saat terlihat ≥50% (dan berhenti saat keluar layar)
  useEffect(() => {
    if (!autoPlayWhenVisible) return;
    const wrap = wrapRef.current;
    const video = videoRef.current;
    if (!wrap || !video) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [autoPlayWhenVisible, src]);

  // Sinkronkan status bisu ke elemen video
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.muted = muted;
  }, [muted]);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
    showControls();
  }

  function seekFraction(fraction: number) {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const t = Math.min(Math.max(fraction, 0), 1) * video.duration;
    video.currentTime = t;
    setProgress(Math.min(1, t / video.duration));
  }

  // Scrub: tekan-geser-lepas pada bar progres
  function handleScrubStart(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    setScrubbing(true);
    setControlsVisible(true);
    const moveTo = (ev: PointerEvent) => {
      seekFraction((ev.clientX - rect.left) / rect.width);
    };
    const finish = () => {
      setScrubbing(false);
      scheduleHide();
      window.removeEventListener("pointermove", moveTo);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
    seekFraction((e.clientX - rect.left) / rect.width);
    window.addEventListener("pointermove", moveTo);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  function toggleFullscreen() {
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      wrap.requestFullscreen().catch(() => {});
    }
  }

  // Ketuk tunggal = putar/jeda (dengan tunda 250ms agar ketukan ganda tidak
  // ikut memicu); ketukan ganda = suka bila tersedia (dengan posisi ketukan).
  function handleTap(e: React.MouseEvent<HTMLButtonElement>) {
    const now = Date.now();
    if (onDoubleTap && now - lastTapRef.current < TAP_DELAY) {
      lastTapRef.current = 0;
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
      const rect = wrapRef.current?.getBoundingClientRect();
      onDoubleTap(
        rect
          ? { x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 }
          : undefined
      );
      return;
    }
    lastTapRef.current = now;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => {
      tapTimerRef.current = null;
      togglePlay();
    }, onDoubleTap ? TAP_DELAY : 0);
  }

  const showBar = controlsVisible || paused || scrubbing;

  return (
    <div
      ref={wrapRef}
      className={cn("group relative overflow-hidden bg-black", className)}
      onMouseEnter={showControls}
      onMouseLeave={() => {
        if (!paused && !scrubbing) setControlsVisible(false);
      }}
    >
      <video
        ref={videoRef}
        src={src}
        className={cn("h-full w-full object-contain", videoClassName)}
        loop={loop}
        playsInline
        preload="metadata"
        aria-label={ariaLabel}
        onPlay={() => {
          setPaused(false);
          scheduleHide();
        }}
        onPause={() => setPaused(true)}
        onLoadedMetadata={() => {
          const v = videoRef.current;
          if (v && Number.isFinite(v.duration)) setDuration(v.duration);
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (v.duration > 0) {
            setProgress(Math.min(1, v.currentTime / v.duration));
            setCurrent(v.currentTime);
          }
        }}
        onProgress={(e) => {
          const v = e.currentTarget;
          if (v.duration > 0 && v.buffered.length > 0) {
            setBuffered(Math.min(1, v.buffered.end(v.buffered.length - 1) / v.duration));
          }
        }}
      />

      {/* Area ketuk video */}
      <button
        type="button"
        onClick={handleTap}
        className="absolute inset-0 z-0 touch-manipulation select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        aria-label={ariaLabel ? `Kontrol: ${ariaLabel}` : "Putar atau jeda video"}
      />

      {/* Tombol play/pause besar */}
      {(paused || controlsVisible) && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label={paused ? "Putar video" : "Jeda video"}
          className={cn(
            "absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/45 text-white backdrop-blur-sm transition-opacity duration-200 hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
            paused ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        >
          {paused ? (
            <Play className="h-10 w-10 fill-white/90 text-white/90 drop-shadow-lg" aria-hidden="true" />
          ) : (
            <Pause className="h-10 w-10 fill-white/90 text-white/90 drop-shadow-lg" aria-hidden="true" />
          )}
        </button>
      )}

      {/* Bar kontrol bawah */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-10 transition-opacity duration-200",
          showBar ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="pointer-events-none h-12 bg-gradient-to-t from-black/65 to-transparent" aria-hidden="true" />
        <div
          className={cn(
            "pointer-events-auto flex items-center gap-2 bg-black/55 px-2 pb-1.5 pt-0.5 backdrop-blur-sm",
            compact && "gap-1.5"
          )}
        >
          {/* Bar progres (scrub) */}
          <div
            role="slider"
            aria-label="Posisi video"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(current)}
            tabIndex={0}
            onPointerDown={handleScrubStart}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") seekFraction(progress + 0.05);
              if (e.key === "ArrowLeft") seekFraction(progress - 0.05);
            }}
            className="relative flex h-4 flex-1 cursor-pointer touch-none items-center"
          >
            <div className="relative h-[4px] w-full overflow-hidden rounded-full bg-white/25">
              <div className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${buffered * 100}%` }} aria-hidden="true" />
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-rose-500 to-orange-400"
                style={{ width: `${progress * 100}%` }}
                aria-hidden="true"
              />
            </div>
            <div
              className="absolute h-3 w-3 -translate-x-1/2 rounded-full bg-white shadow ring-2 ring-rose-500/80"
              style={{ left: `${progress * 100}%` }}
              aria-hidden="true"
            />
          </div>

          <span className={cn("shrink-0 font-mono text-[11px] tabular-nums text-white/90", compact && "hidden")}>
            {fmtTime(current)} / {fmtTime(duration)}
          </span>

          <button
            type="button"
            onClick={() => {
              setMuted((m) => !m);
              showControls();
            }}
            aria-label={muted ? "Aktifkan suara" : "Bisukan video"}
            className="shrink-0 rounded-full p-1.5 text-white/90 transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            {muted ? (
              <VolumeX className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Volume2 className="h-4 w-4" aria-hidden="true" />
            )}
          </button>

          {!compact && (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label="Layar penuh"
              className="shrink-0 rounded-full p-1.5 text-white/90 transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

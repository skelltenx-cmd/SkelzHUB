"use client";

import { useCallback, useEffect } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";

/**
 * Lightbox foto sederhana (klik untuk memperbesar foto).
 * Dipakai di: cincin story ("Lihat foto profil"), foto profil, dll.
 * src === null -> tidak tampil (komponen aman selalu di-render).
 */
export function PhotoLightbox({
  src,
  alt,
  onClose,
}: {
  src: string | null;
  alt?: string;
  onClose: () => void;
}) {
  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [src, close]);

  return (
    <AnimatePresence>
      {src && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={alt ?? "Pratinjau foto"}
          onClick={close}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-3 top-3 h-11 w-11 rounded-full bg-white/10 text-white hover:bg-white/25 hover:text-white"
            aria-label="Tutup pratinjau"
            onClick={close}
          >
            <X className="h-6 w-6" />
          </Button>
          <motion.img
            src={src}
            alt={alt ?? "Foto"}
            initial={{ scale: 0.92, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="max-h-[86vh] max-w-[94vw] rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            draggable={false}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

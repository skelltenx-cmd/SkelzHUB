import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone hanya dipakai untuk self-host lokal (bun .next/standalone/server.js).
  // Di Vercel, build memakai output normal Next.js.
  output: process.env.VERCEL ? undefined : "standalone",
  // Produksi (Vercel): sertakan aset konten awal (dipakai src/lib/seed-runtime.ts
  // saat database produksi pertama kali disiapkan otomatis).
  outputFileTracingIncludes: {
    "/api/**": ["./assets/seed/**", "./assets/seed-videos/**"],
  },
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;

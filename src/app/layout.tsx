import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/skelz/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SkelzHub — Bagikan momen & meme terbaikmu",
  description:
    "SkelzHub adalah media sosial untuk membagikan meme, foto, dan momen terbaikmu. Suka, komentari, simpan, dan jelajahi konten trending dari semua kreator.",
  keywords: ["SkelzHub", "media sosial", "meme", "berbagi foto", "social media"],
  authors: [{ name: "SkelzHub" }],
  icons: {
    icon: "/skelz.svg",
  },
  openGraph: {
    title: "SkelzHub",
    description: "Media sosial tempat momen & meme terbaik bersinar",
    siteName: "SkelzHub",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Preconnect CDN media (R2 public URL) + Cloudflare storage: TLS handshake
  // dilakukan SEJAK AWAL halaman dimuat — gambar/video pertama langsung
  // terunduh tanpa menunggu negosiasi koneksi (terasa jauh lebih cepat).
  const r2Public = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
  let r2Host: string | null = null;
  if (r2Public) {
    try {
      r2Host = new URL(r2Public).host;
    } catch {
      r2Host = null;
    }
  }
  const cfHost = process.env.R2_ACCOUNT_ID
    ? `${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : null;
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        {r2Host && <link rel="preconnect" href={`https://${r2Host}`} crossOrigin="" />}
        {r2Host && <link rel="dns-prefetch" href={`https://${r2Host}`} />}
        {cfHost && <link rel="dns-prefetch" href={`https://${cfHost}`} />}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}

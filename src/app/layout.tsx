import type { Metadata, Viewport } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { RegistrarSW } from "@/components/RegistrarSW";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

// Serif elegante para títulos y nombres (estética "salón de casino").
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nocturna — divertite y ganá",
  description: "Blackjack, póker, slots y Dino Crash. Apostá, jugá y ganá fichas.",
  manifest: "/manifest.webmanifest",
  applicationName: "Nocturna",
  appleWebApp: { capable: true, title: "Nocturna", statusBarStyle: "black-translucent" },
  openGraph: {
    title: "Nocturna — divertite y ganá",
    description: "Blackjack, póker, slots y Dino Crash. Apostá, jugá y ganá fichas.",
    siteName: "Nocturna",
    type: "website",
    locale: "es_AR",
  },
  twitter: {
    card: "summary",
    title: "Nocturna — divertite y ganá",
    description: "Blackjack, póker, slots y Dino Crash. Apostá, jugá y ganá fichas.",
  },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0d1d15",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${inter.variable} ${cormorant.variable}`}>
      <body className="min-h-screen antialiased">
        <RegistrarSW />
        {children}
      </body>
    </html>
  );
}

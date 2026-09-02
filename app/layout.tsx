import type { Metadata, Viewport } from "next";
import { Open_Sans, Nunito, Salsa, Geist_Mono, Antic_Didone, Sora } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { siteConfig } from "@/config/site";
import { OfflineBanner } from "@/components/offline-banner";
import { ConfirmProvider } from "@/components/ui/confirm";

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const salsa = Salsa({
  variable: "--font-salsa",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const anticDidone = Antic_Didone({
  variable: "--font-antic-didone",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  display: "swap",
});

// Mono used by the GPU deploy page (mono labels, prices, code spans).
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.title,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: siteConfig.keywords,
  authors: [{ name: siteConfig.name, url: siteConfig.url }],
  creator: siteConfig.name,
  publisher: siteConfig.name,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: siteConfig.title,
    description: siteConfig.description,
    images: [
      {
        url: siteConfig.ogImage,
        width: 1200,
        height: 630,
        alt: `${siteConfig.name}: Cloud Infrastructure Platform`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.title,
    description: siteConfig.description,
    images: [siteConfig.ogImage],
    // creator/site omitted deliberately — see config/site.ts. Restore both
    // when there is a real handle; an unverified one credits a stranger.
  },
  // Favicon / touch icons are provided by the file convention
  // (app/icon.png + app/apple-icon.png) — served same-origin with a cache
  // hash, so link-preview crawlers resolve them on any deploy domain.
  alternates: {
    canonical: siteConfig.url,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${openSans.variable} ${nunito.variable} ${salsa.variable} ${geistMono.variable} ${anticDidone.variable} ${sora.variable}`}>
        <OfflineBanner />
        <ConfirmProvider>{children}</ConfirmProvider>
        <Toaster
          position="top-right"
          theme="dark"
          richColors
          closeButton
        />
      </body>
    </html>
  );
}

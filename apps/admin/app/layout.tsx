import type { Metadata } from "next";
import { Open_Sans, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const openSans = Open_Sans({
  subsets: ["latin"],
  variable: "--font-open-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "AhuraSense Admin",
    template: "%s · AhuraSense Admin",
  },
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${openSans.variable} ${geistMono.variable} bg-background text-foreground antialiased`}
      >
        {children}
        <Toaster position="top-right" theme="dark" richColors />
      </body>
    </html>
  );
}

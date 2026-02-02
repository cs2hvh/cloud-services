import type { Metadata } from "next";
import { SUSE } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { siteConfig } from "@/config/site";
import { Navbar } from "@/components/navbar";

const suse = SUSE({
  variable: "--font-suse",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: siteConfig.title,
  description: siteConfig.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${suse.variable}`}>
        <Navbar />
        {children}
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

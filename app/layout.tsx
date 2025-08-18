import type { Metadata } from "next";
import { SUSE } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { siteConfig } from "@/config/site";

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
    <html lang="en" >
      <body className={`${suse.variable}`}>
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}

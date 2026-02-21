import type { Metadata } from "next";
import { Open_Sans, Nunito } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { siteConfig } from "@/config/site";

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
});

const nunito = Nunito({
  variable: "--font-nunito",
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
      <body className={`${openSans.variable} ${nunito.variable}`}>
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

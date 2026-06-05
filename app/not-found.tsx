import Link from "next/link";
import { ArrowRight, Home, LifeBuoy } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

// Global 404 — renders inside the root layout (not the marketing group), so it
// brings its own Navbar + Footer plus a dark shell matching the site theme.

const QUICK_LINKS: Array<{ label: string; href: string }> = [
  { label: "Services", href: "/services/compute" },
  { label: "Pricing", href: "/pricing" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Status", href: "/status" },
];

export default function NotFound() {
  return (
    <>
      <Navbar />
      <main className="relative flex min-h-[calc(100svh-4rem)] items-center justify-center overflow-hidden bg-[#08090b] px-5 pt-16 text-white">
      {/* Ambient background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute left-1/2 top-1/2 h-[680px] w-[980px] -translate-x-1/2 -translate-y-1/2 blur-[90px]"
          style={{ background: "radial-gradient(closest-side, rgba(0,149,255,0.12), transparent)" }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.022) 1px, transparent 0)",
            backgroundSize: "30px 30px",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-xl text-center">
        {/* Big 404 */}
        <p
          className="select-none bg-gradient-to-b from-white to-white/25 bg-clip-text text-[110px] font-bold leading-none tracking-[-0.04em] text-transparent sm:text-[150px]"
          style={{ fontFamily: "var(--font-nunito), system-ui, sans-serif" }}
        >
          4<span className="text-[#0095FF]">0</span>4
        </p>

        <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.01em] sm:text-[26px]">
          This page took a wrong turn
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-white/50">
          The page you&apos;re looking for doesn&apos;t exist, was moved, or the
          link is broken. Let&apos;s get you back on track.
        </p>

        {/* Actions */}
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] px-5 text-[14px] font-semibold text-white transition-all duration-200 sm:w-auto"
            style={{
              background: "linear-gradient(135deg, #1f9dff, #0061c4)",
              boxShadow: "0 12px 34px -10px rgba(0,149,255,0.6), inset 0 1px 0 rgba(255,255,255,0.28)",
            }}
          >
            <Home className="h-4 w-4" />
            Back to home
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/contact"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-white/[0.12] bg-white/[0.03] px-5 text-[14px] font-medium text-white/80 transition-colors hover:bg-white/[0.07] hover:text-white sm:w-auto"
          >
            <LifeBuoy className="h-4 w-4" />
            Contact us
          </Link>
        </div>

        {/* Quick links */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px]">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-white/45 underline-offset-4 transition-colors hover:text-[#0095FF] hover:underline"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
      </main>
      <Footer />
    </>
  );
}

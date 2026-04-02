"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import { createClient } from "@/lib/supabase/client";

const HERO_METRICS = [
  { value: "PITR", label: "Recovery Ready" },
  { value: "<60s", label: "Failover Target" },
  { value: "Private", label: "Network First" },
];

type DatabaseHeroSectionProps = {
  primaryAction?: { label: string; href: string };
  secondaryAction?: { label: string; href: string };
};

export default function DatabaseHeroSection({
  primaryAction,
  secondaryAction,
}: DatabaseHeroSectionProps) {
  const [isRouting, setIsRouting] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const getPrimaryActionTarget = (path: string) => {
    if (path.includes("/services/database")) {
      return "/dashboard/services/database/new";
    }
    return primaryAction?.href ?? "/signin";
  };

  const handlePrimaryActionClick = async () => {
    if (!primaryAction || isRouting) return;
    setIsRouting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const target = user ? getPrimaryActionTarget(pathname) : "/signin";
      router.push(target);
    } finally {
      setIsRouting(false);
    }
  };

  return (
    <section className="relative overflow-hidden bg-black pb-16 pt-28 sm:pb-20 sm:pt-32 lg:pb-24 lg:pt-36">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(255,255,255,0.06),transparent_22%),radial-gradient(circle_at_82%_10%,rgba(0,149,255,0.12),transparent_22%),linear-gradient(180deg,#040507_0%,#06090d_52%,#040507_100%)]" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.65) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.65) 1px, transparent 1px)",
            backgroundSize: "88px 88px",
          }}
        />
        <motion.div
          className="absolute inset-y-0 left-[-16%] w-[30%] bg-gradient-to-r from-transparent via-[#0095ff]/10 to-transparent blur-3xl"
          animate={{ x: ["0%", "240%"] }}
          transition={{ duration: 8.8, repeat: Number.POSITIVE_INFINITY, repeatDelay: 1.1, ease: "easeInOut" }}
        />
      </div>

      <Container>
        <div className="grid gap-14 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center lg:gap-16">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 border border-white/[0.1] bg-white/[0.03] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/56">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
              Managed Databases
            </div>

            <h1 className="mt-6 max-w-3xl text-4xl font-[400] leading-[0.96] tracking-tight text-white sm:text-5xl lg:text-[5.15rem]">
              The data layer for
              <span className="block text-[#8ecaff]">production software</span>
            </h1>

            <p className="mt-6 max-w-xl text-[15px] leading-8 text-white/62 sm:text-[17px]">
              PostgreSQL, MySQL, MongoDB, and Redis clusters that provision fast, fail over cleanly, and stay private by default.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {primaryAction ? (
                <button
                  type="button"
                  onClick={handlePrimaryActionClick}
                  disabled={isRouting}
                  className="inline-flex h-11 items-center gap-2 bg-white px-6 text-sm font-medium text-black transition hover:bg-white/90"
                >
                  {primaryAction.label}
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : null}

              {secondaryAction ? (
                <Link
                  href={secondaryAction.href}
                  className="inline-flex h-11 items-center gap-2 border border-white/[0.12] bg-white/[0.04] px-6 text-sm font-medium text-white/78 transition hover:bg-white/[0.08] hover:text-white"
                >
                  {secondaryAction.label}
                </Link>
              ) : null}
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-3">
              {HERO_METRICS.map((metric) => (
                <div key={metric.label} className="border-t border-white/[0.1] pt-4">
                  <div className="text-[1.15rem] font-medium tracking-tight text-white">{metric.value}</div>
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/36">
                    {metric.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_60%_20%,rgba(0,149,255,0.16),transparent_24%),radial-gradient(circle_at_28%_76%,rgba(255,255,255,0.08),transparent_18%)] blur-2xl" />

            <motion.div
              className="relative mx-auto aspect-square w-full max-w-[360px] sm:max-w-[430px] lg:max-w-[520px]"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <motion.div
                className="pointer-events-none absolute -inset-8 rounded-full bg-[radial-gradient(circle,rgba(0,149,255,0.14),transparent_58%)] blur-3xl"
                animate={{ scale: [1, 1.06, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 5.5, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
              />
              <motion.div
                className="pointer-events-none absolute inset-x-[12%] top-[14%] h-16 bg-gradient-to-r from-transparent via-white/16 to-transparent blur-2xl"
                animate={{ x: ["-12%", "32%"] }}
                transition={{ duration: 4.8, repeat: Number.POSITIVE_INFINITY, repeatDelay: 1.1, ease: "easeInOut" }}
              />
              <Image
                src="/images/main-page/service-home-db-section-1.png"
                alt="Database infrastructure"
                fill
                priority
                className="object-contain"
              />
            </motion.div>
          </div>
        </div>
      </Container>
    </section>
  );
}

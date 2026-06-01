"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import { createClient } from "@/lib/supabase/client";
import PixelBlast from "@/components/hero/pixel-blast";

const HERO_METRICS = [
  { value: "PITR", label: "Recovery Ready" },
  { value: "<60s", label: "Failover Target" },
  { value: "Private", label: "Network First" },
];

const BRAND = "#0095FF";

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
    <section className="relative isolate flex min-h-[760px] flex-col justify-center overflow-hidden bg-[#04060a] pb-20 pt-32 sm:pb-24 sm:pt-36 lg:min-h-[820px] lg:pb-28 lg:pt-40">
      {/* PixelBlast brand-blue ambient backdrop — matches the rest of the site */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.55]"
      >
        <PixelBlast
          variant="circle"
          color={BRAND}
          pixelSize={5}
          patternScale={3}
          patternDensity={0.7}
          pixelSizeJitter={0.4}
          enableRipples={false}
          speed={0.3}
          edgeFade={0.4}
          transparent
        />
      </div>

      <Container className="relative z-10">
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
            <div className="relative mx-auto aspect-square w-full max-w-[360px] sm:max-w-[430px] lg:max-w-[520px]">
              <Image
                src="/images/main-page/service-home-db-section-1.png"
                alt="Database infrastructure"
                fill
                priority
                className="object-contain"
              />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/container";
import { createClient } from "@/lib/supabase/client";
import PixelBlast from "@/components/hero/pixel-blast";

type HeroAction = {
  label: string;
  href: string;
};

type HeroImage = {
  src: string;
  alt?: string;
  priority?: boolean;
};

type ServiceHeroSectionProps = {
  badge?: string;
  title: string;
  description: string;
  primaryAction?: HeroAction;
  secondaryAction?: HeroAction;
  /**
   * @deprecated Kept for backwards-compat with existing service pages.
   * The hero now uses the same PixelBlast ambient backdrop as the homepage
   * regardless of this value.
   */
  backgroundImage?: HeroImage;
  illustration: HeroImage;
  align?: "left" | "right";
  className?: string;
};

type ServiceDashboardTargets = {
  main: string;
  deploy: string;
};

export function ServiceHeroSection({
  badge,
  title,
  description,
  primaryAction,
  secondaryAction,
  illustration,
  align = "right",
  className,
}: ServiceHeroSectionProps) {
  const imageLeft = align === "left";
  const isIllustrationSvg = illustration.src.endsWith(".svg");
  const [isRouting, setIsRouting] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const getServiceDashboardTargets = (path: string): ServiceDashboardTargets | null => {
    if (path.includes("/services/compute") || path.includes("/services/gpu")) {
      return {
        main: "/dashboard/services/compute",
        deploy: "/dashboard/services/compute/vps/new",
      };
    }
    if (path.includes("/services/kubernetes")) {
      return {
        main: "/dashboard/services/kubernetes",
        deploy: "/dashboard/services/kubernetes/new",
      };
    }
    if (path.includes("/services/database")) {
      return {
        main: "/dashboard/services/database",
        deploy: "/dashboard/services/database/new",
      };
    }
    if (path.includes("/services/security")) {
      return {
        main: "/dashboard/services/network-ddos",
        deploy: "/dashboard/services/network-ddos/new",
      };
    }
    if (path.includes("/services/object-storage")) {
      return {
        main: "/dashboard/services/object-storage",
        deploy: "/dashboard/services/object-storage/new",
      };
    }
    if (path.includes("/services/app-deployment") || path.includes("/services/application-deployment")) {
      return {
        main: "/dashboard/services/apps",
        deploy: "/dashboard/services/apps/new",
      };
    }
    return null;
  };

  const getPrimaryActionTarget = (path: string, label: string) => {
    const targets = getServiceDashboardTargets(path);
    if (!targets) return primaryAction?.href ?? "/signin";

    const normalizedLabel = label.toLowerCase();
    const shouldGoToMain =
      normalizedLabel.includes("get started") ||
      normalizedLabel.includes("start");

    return shouldGoToMain ? targets.main : targets.deploy;
  };

  const getSecondaryActionTarget = (label: string, fallbackHref: string) => {
    if (label.toLowerCase().includes("documentation")) {
      return "/api-doc";
    }
    return fallbackHref;
  };

  const handlePrimaryActionClick = async () => {
    if (!primaryAction || isRouting) return;
    setIsRouting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const target = user
        ? getPrimaryActionTarget(pathname, primaryAction.label)
        : "/signin";
      router.push(target);
    } finally {
      setIsRouting(false);
    }
  };

  return (
    <section
      className={cn(
        "relative w-full overflow-x-hidden bg-[#04060a]",
        "min-h-screen flex flex-col",
        className,
      )}
    >
      {/* PixelBlast brand-blue ambient backdrop — matches the homepage hero */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.55]"
      >
        <PixelBlast
          variant="circle"
          color="#0095FF"
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

      {/* Bottom fade — smooth transition into the next section */}
      <div className="absolute bottom-0 left-0 right-0 h-32 md:h-48 bg-gradient-to-t from-[#04060a] to-transparent z-[5]" />

      <div className="relative z-10 flex-1 flex items-center w-full pt-20 pb-12 sm:pt-24 sm:pb-16 md:pt-28 md:pb-20">
        <Container>
          <div className={cn(
            "flex w-full flex-col items-center gap-8 sm:gap-10 md:gap-12",
            "lg:flex-row lg:items-center lg:justify-between lg:gap-16",
          )}>
            <div className={cn(
              "w-full flex-shrink-0",
              "lg:w-1/2 lg:max-w-xl",
              imageLeft && "lg:order-2"
            )}>
              <div className="flex flex-col gap-4 sm:gap-5 md:gap-6">
                {badge && (
                  <div className="inline-flex self-center lg:self-start items-center gap-2 border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm px-3 py-1.5 sm:px-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0095FF] animate-pulse" />
                    <span className="text-[11px] sm:text-xs font-medium text-white/50 tracking-wide uppercase">
                      {badge}
                    </span>
                  </div>
                )}

                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-normal tracking-tight leading-tight sm:leading-tight text-white text-center lg:text-left">
                  {title}
                </h1>

                <p className="text-sm sm:text-base md:text-lg leading-relaxed text-white/50 max-w-xl text-center lg:text-left mx-auto">
                  {description}
                </p>

                {(primaryAction || secondaryAction) && (
                  <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 sm:gap-4 pt-2">
                    {primaryAction && (
                      <button
                        type="button"
                        onClick={handlePrimaryActionClick}
                        disabled={isRouting}
                        className="cursor-pointer inline-flex items-center justify-center gap-2 bg-white text-black px-5 sm:px-6 h-10 sm:h-11 text-xs sm:text-sm font-medium hover:bg-white/90 transition-colors"
                      >
                        {primaryAction.label}
                        <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </button>
                    )}

                    {secondaryAction && (
                      <Link
                        href={getSecondaryActionTarget(
                          secondaryAction.label,
                          secondaryAction.href
                        )}
                        className="cursor-pointer inline-flex items-center justify-center gap-2 border border-white/[0.12] bg-white/[0.04] backdrop-blur-sm text-white/80 px-5 sm:px-6 h-10 sm:h-11 text-xs sm:text-sm font-medium hover:bg-white/[0.08] hover:text-white transition-colors"
                      >
                        {secondaryAction.label}
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className={cn(
              "w-full flex-shrink-0",
              "lg:w-1/2",
              imageLeft && "lg:order-1"
            )}>
              <div className="relative mx-auto aspect-square w-full max-w-[280px] sm:max-w-[360px] md:max-w-[440px] lg:max-w-[520px]">
                {isIllustrationSvg ? (
                  <Image
                    width={100}
                    height={100}
                    src={illustration.src}
                    alt={illustration.alt ?? title}
                    className="h-full w-full object-contain"
                    loading={illustration.priority ? "eager" : "lazy"}
                  />
                ) : (
                  <Image
                    src={illustration.src}
                    alt={illustration.alt ?? title}
                    fill
                    priority={illustration.priority}
                    className="object-contain"
                  />
                )}
              </div>
            </div>
          </div>
        </Container>
      </div>
    </section>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/container";
import { createClient } from "@/lib/supabase/client";

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
  badge: string[];
  title: string;
  description: string;
  primaryAction?: HeroAction;
  secondaryAction?: HeroAction;
  backgroundImage: HeroImage;
  illustration: HeroImage;
  align?: "left" | "right";
  className?: string;
};

export function SolutionsHeroSection({
  badge,
  title,
  description,
  primaryAction,
  secondaryAction,
  backgroundImage,
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

  const getSolutionsDeployTarget = (path: string) => {
    if (path.includes("/solutions/database")) return "/dashboard/services/database/new";
    if (path.includes("/solutions/kubernetes")) return "/dashboard/services/kubernetes/new";
    if (path.includes("/solutions/security")) return "/dashboard/services/network-ddos/new";
    if (path.includes("/solutions/storage")) return "/dashboard/services/object-storage/new";
    if (path.includes("/solutions/ecommerce")) return "/dashboard/services/apps/new";
    if (path.includes("/solutions/web-hosting")) return "/dashboard/services/apps/new";
    if (path.includes("/solutions/game-dev")) return "/dashboard/services/compute/vps/new";
    return null;
  };

  const handlePrimaryActionClick = async () => {
    if (!primaryAction || isRouting) return;
    setIsRouting(true);
    try {
      // Handle hash links for same-page navigation
      if (primaryAction.href.startsWith("#")) {
        const element = document.getElementById(primaryAction.href.slice(1));
        if (element) {
          element.scrollIntoView({ behavior: "smooth" });
        }
        setIsRouting(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const target = getSolutionsDeployTarget(pathname);
      if (user && target) {
        router.push(target);
        return;
      }

      router.push(primaryAction.href);
    } finally {
      setIsRouting(false);
    }
  };

  return (
    <section
      className={cn(
        "relative w-full overflow-x-hidden bg-[#0E0F0F] ",
        "min-h-screen flex flex-col border-b  border-[#737373]",
        className,
      )}
    >
      <div className="absolute inset-0">
        <Image
          src={backgroundImage.src}
          alt={backgroundImage.alt ?? ""}
          fill
          priority={backgroundImage.priority}
          className="object-cover blur-[3px] object-right-top scale-100"
          style={{ objectPosition: "right top" }}
        />
        
      </div>
      

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
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-normal tracking-tight leading-tight sm:leading-tight text-white text-center lg:text-left">
                  {title}
                </h1>

                <p className="text-sm sm:text-base md:text-lg leading-relaxed text-white/50 max-w-xl text-center lg:text-left mx-auto lg:mx-0">
                  {description}
                </p>

                {(primaryAction || secondaryAction) && (
                  <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 sm:gap-4 pt-2">
                    {primaryAction && (
                      <button
                        type="button"
                        onClick={handlePrimaryActionClick}
                        disabled={isRouting}
                        className="inline-flex items-center justify-center gap-2 bg-white text-black px-5 sm:px-6 h-10 sm:h-11 text-xs sm:text-sm font-medium hover:bg-white/90 transition-colors"
                      >
                        {primaryAction.label}
                        <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </button>
                    )}

                    {secondaryAction && (
                      <Link
                        href={secondaryAction.href}
                        className="inline-flex items-center justify-center gap-2 border border-white/[0.12] bg-white/[0.04] backdrop-blur-sm text-white/80 px-5 sm:px-6 h-10 sm:h-11 text-xs sm:text-sm font-medium hover:bg-white/[0.08] hover:text-white transition-colors"
                      >
                        {secondaryAction.label}
                      </Link>
                    )}
                  </div>
                )}

                {badge && (
                  <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 pt-2">
                    {badge.map((item, index) => (
                      <div key={index} className="flex items-center">
                        <span className="text-xs sm:text-sm text-white/80 px-3 py-1.5 border border-white/[0.08] bg-white/[0.03]">
                          {item}
                        </span>
                      </div>
                    ))}
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

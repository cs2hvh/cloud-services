import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

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

  return (
    <section
      className={cn(
        "relative w-full overflow-hidden bg-black",
        "h-screen min-h-[600px] border border-[#737373]",
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
        <div className="absolute inset-0 bg-black/30" />
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black to-transparent z-[5]" />

      <div className="relative z-10 mx-auto flex h-full items-center w-full max-w-[75%] px-[clamp(24px,3vw,80px)]">
        <div className={cn(
          "flex w-full flex-col items-center gap-8 py-6 lg:flex-row lg:items-center lg:justify-between lg:gap-16 lg:py-0",
        )}>
          <div className={cn("w-full max-w-[560px]", imageLeft && "lg:order-2")}>
            <div className="flex flex-col gap-6">
              

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-[400] tracking-tight leading-[1.05] text-white">
                {title}
              </h1>

              <p className="max-w-[480px] text-base lg:text-lg leading-relaxed text-white/50">
                {description}
              </p>

              {(primaryAction || secondaryAction) && (
                <div className="flex flex-wrap items-center gap-4 pt-2">
                  {primaryAction && (
                    <Link
                      href={primaryAction.href}
                      className="inline-flex items-center justify-center gap-2 bg-white text-black px-6 h-10 text-[13px] font-medium hover:bg-white/90 transition-colors"
                    >
                      {primaryAction.label}
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  )}

                  {secondaryAction && (
                    <Link
                      href={secondaryAction.href}
                      className="inline-flex items-center justify-center gap-2 border border-white/[0.12] bg-white/[0.04] backdrop-blur-sm text-white/80 px-6 h-10 text-[13px] font-medium hover:bg-white/[0.08] hover:text-white transition-colors"
                    >
                      {secondaryAction.label}
                    </Link>
                  )}
                </div>
              )}

              {badge && (
                <div className="flex flex-wrap items-center gap-2 mb-8 md:mb-10">
              {badge.map((item, index) => (
                <div key={index} className="flex items-center">
                  <span className="text-xs sm:text-sm text-white/80 px-3 py-1.5">
                    {item}
                  </span>
                </div>
              ))}
            </div>
              )}
            </div>
          </div>

          <div className={cn("w-full", imageLeft && "lg:order-1")}>
            <div className="relative mx-auto aspect-square w-full max-w-[360px] sm:max-w-[500px] lg:max-w-[560px]">
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
      </div>
    </section>
  );
}

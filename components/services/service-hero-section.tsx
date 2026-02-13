import Image from "next/image";
import Link from "next/link";

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
  badge?: string;
  title: string;
  description: string;
  primaryAction?: HeroAction;
  secondaryAction?: HeroAction;
  backgroundImage: HeroImage;
  illustration: HeroImage;
  align?: "left" | "right";
  className?: string;
};

export function ServiceHeroSection({
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
        "min-h-[520px] h-auto",
        "md:min-h-[calc(100vh-80px)]",
        "lg:h-[min(850px,calc(100vh-80px))] lg:min-h-0",
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
        <div className="absolute inset-0 bg-black/0" />
      </div>

      <div className="relative z-10 mx-auto flex h-full w-full max-w-[1320px] px-6 sm:px-8 lg:max-w-[1440px] lg:px-12 min-[1920px]:max-w-[1800px] min-[1920px]:px-16 min-[2560px]:max-w-[2600px] min-[2560px]:px-12">
        <div className="flex w-full flex-col items-start gap-10 py-16 sm:gap-12 lg:flex-row lg:items-center lg:justify-between lg:gap-[96px] lg:py-0 min-[1920px]:gap-[120px] min-[2560px]:gap-[140px]">
          <div className={cn("w-full max-w-[560px] min-[1920px]:max-w-[720px] min-[2560px]:max-w-[820px]", imageLeft && "lg:order-2")}>
            <div className="flex flex-col gap-10 sm:gap-12 lg:gap-16">
              {badge ? (
                <div
                  className="inline-flex items-center border border-white/15 bg-white/5 px-5 py-2 text-[13px] font-normal leading-[25px] text-white/90 backdrop-blur-[8.1px] min-[1920px]:px-6 min-[1920px]:py-3 min-[1920px]:text-[15px] min-[2560px]:text-[16px]"
                  style={{ fontFamily: "Inter, sans-serif" }}
                >
                  {badge}
                </div>
              ) : null}

              <h1
                className={cn(
                  "text-[clamp(38px,3.6vw,96px)] leading-[1.02] font-normal",
                  "drop-shadow-[2px_4px_18px_rgba(255,255,255,0.36)]",
                )}
                style={{ fontFamily: "Nunito Sans, Inter, sans-serif" }}
              >
                <span className="bg-[linear-gradient(90deg,#ffffff_28.8%,rgba(255,255,255,0.76)_45.71%,rgba(255,255,255,0.4)_95%)] bg-clip-text text-transparent">
                  {title}
                </span>
              </h1>

              <p
                className="max-w-[32rem] text-[clamp(16px,1.4vw,24px)] leading-[1.5] font-light text-white/80 lg:max-w-[560px] min-[2560px]:max-w-[640px]"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                {description}
              </p>

              {(primaryAction || secondaryAction) && (
                <div className="flex flex-wrap items-center gap-4 lg:gap-[30px] min-[1920px]:gap-8">
                  {primaryAction ? (
                    <Link
                      href={primaryAction.href}
                      className={cn(
                        "inline-flex items-center justify-center",
                        "bg-[#383838] px-6",
                        "h-9 min-w-[140px] text-[12px] font-medium leading-[25px] text-white",
                        "lg:h-[37px] lg:min-w-[170px]",
                        "min-[1920px]:h-12 min-[1920px]:min-w-[200px] min-[1920px]:text-[14px]",
                        "min-[2560px]:h-14 min-[2560px]:min-w-[240px] min-[2560px]:text-[15px]",
                        "shadow-[0_4px_4px_rgba(0,0,0,0.25)]",
                        "backdrop-blur-[8.1px]",
                      )}
                    >
                      {primaryAction.label}
                    </Link>
                  ) : null}

                  {secondaryAction ? (
                    <Link
                      href={secondaryAction.href}
                      className={cn(
                        "inline-flex items-center justify-center",
                        "border border-[#464A4D] px-6",
                        "h-9 min-w-[140px] text-[12px] font-medium leading-[25px] text-white",
                        "lg:h-[37px] lg:min-w-[170px]",
                        "min-[1920px]:h-12 min-[1920px]:min-w-[200px] min-[1920px]:text-[14px]",
                        "min-[2560px]:h-14 min-[2560px]:min-w-[240px] min-[2560px]:text-[15px]",
                        "shadow-[0_4px_4px_rgba(0,0,0,0.25)]",
                        "backdrop-blur-[8.1px]",
                      )}
                    >
                      {secondaryAction.label}
                    </Link>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div className={cn("w-full", imageLeft && "lg:order-1")}>
            <div className="relative mx-auto aspect-square w-full max-w-[520px] sm:max-w-[600px] lg:max-w-[720px] min-[1920px]:max-w-[880px] min-[2560px]:max-w-[1100px]">
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

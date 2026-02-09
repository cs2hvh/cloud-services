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
        "lg:h-[min(776px,calc(100vh-80px))] lg:min-h-0",
        className,
      )}
    >
      <div className="absolute inset-0">
        <Image
          src={backgroundImage.src}
          alt={backgroundImage.alt ?? ""}
          fill
          priority={backgroundImage.priority}
          className="object-cover blur-[3px] scale-105"
        />
        <div className="absolute inset-0 bg-black/70" />
      </div>

      <div className="relative z-10 mx-auto flex h-full w-full max-w-[1437px] px-6 lg:px-[72px]">
        <div className="flex w-full flex-col items-start gap-12 py-16 lg:flex-row lg:items-center lg:justify-between lg:gap-[96px] lg:py-0">
          <div className={cn("w-full max-w-[540px]", imageLeft && "lg:order-2")}>
            <div className="flex flex-col gap-12 sm:gap-16 lg:gap-16">
              {badge ? (
                <div
                  className="inline-flex items-center border border-white/15 bg-white/5 px-5 py-2 text-[13px] font-normal leading-[25px] text-white/90 backdrop-blur-[8.1px]"
                  style={{ fontFamily: "Inter, sans-serif" }}
                >
                  {badge}
                </div>
              ) : null}

              <h1
                className={cn(
                  "text-[40px] leading-[1] font-normal sm:text-[48px] lg:text-[64px]",
                  "drop-shadow-[2px_4px_18px_rgba(255,255,255,0.36)]",
                )}
                style={{ fontFamily: "Nunito Sans, Inter, sans-serif" }}
              >
                <span className="bg-[linear-gradient(90deg,#ffffff_28.8%,rgba(255,255,255,0.76)_45.71%,rgba(255,255,255,0.4)_95%)] bg-clip-text text-transparent">
                  {title}
                </span>
              </h1>

              <p
                className="max-w-[32rem] text-[16px] leading-[1.4] font-light text-white/80 sm:text-[18px] lg:max-w-[462px] lg:text-[20px] lg:leading-[27px]"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                {description}
              </p>

              {(primaryAction || secondaryAction) && (
                <div className="flex flex-wrap items-center gap-4 lg:gap-[30px]">
                  {primaryAction ? (
                    <Link
                      href={primaryAction.href}
                      className={cn(
                        "inline-flex items-center justify-center",
                        "bg-[#383838] px-6",
                        "h-9 min-w-[140px] text-[12px] font-medium leading-[25px] text-white",
                        "lg:h-[37px] lg:min-w-[170px]",
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
            <div className="relative mx-auto aspect-square w-full max-w-[520px] sm:max-w-[560px] lg:max-w-[621px]">
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

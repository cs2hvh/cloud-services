import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/container";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

type EnvironmentCard = {
  title: string;
  items: string[];
};

type ActionButton = {
  label: string;
  href: string;
  variant: "primary" | "link";
};

type ReferenceDeploymentProps = {
  badge: string;
  title: string;
  description: string;
  environments: EnvironmentCard[];
  tags: string[];
  actions: ActionButton[];
  backgroundImage?: string;
  className?: string;
};

export function ReferenceDeployment({
  badge,
  title,
  description,
  environments,
  tags,
  actions,
  backgroundImage = "/images/main-page/ref-dply-bg.svg",
  className,
}: ReferenceDeploymentProps) {
  return (
    <section
      className={cn(
        "relative w-full border-b border-[#6b6b6b]  py-16 md:py-20 lg:py-24",
        className
      )}
    >
      <Container>
        {/* Main box with border and background */}
        <div
          className="relative border border-[#707070] overflow-hidden bg-[#141414]"
        >
          {/* Background Image */}
          <div >
            <Image
              src={backgroundImage}
              alt=""
              fill
              className="object-cover object-right"
            />
          </div>

          {/* Content */}
          <div className="relative z-10 p-6 sm:p-8 md:p-10 lg:p-12">
            {/* Badge */}
            <span className="text-[#FFFFFF] text-xs sm:text-sm font-medium tracking-wide">
              {badge}
            </span>

            {/* Title */}
            <h2 style={{fontSize:"24px"}} className="sm:text-2xl md:text-3xl lg:text-4xl font-semibold text-white mt-3 mb-4 max-w-3xl">
              {title}
            </h2>

            {/* Description */}
            <p className="text-sm sm:text-base text-white max-w-2xl leading-relaxed mb-8 md:mb-10">
              {description}
            </p>

            {/* Environment Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-8 md:mb-10 max-w-5xl">
              {environments.map((env, index) => (
                <div
                  key={index}
                  className="border border-[#575757] max-w-[476px] gap-2 bg-[#141414] p-5 sm:p-6"
                >
                  <h3 className="text-base sm:text-lg font-medium text-white mb-4">
                    {env.title}
                  </h3>
                  <ul className="space-y-2">
                    {env.items.map((item, itemIndex) => (
                      <li
                        key={itemIndex}
                        className="text-xs sm:text-sm text-white/60 flex items-start"
                      >
                        <span className="mr-2">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Tags */}
            <div className="flex flex-wrap items-center gap-2 mb-8 md:mb-10">
              {tags.map((tag, index) => (
                <div key={index} className="flex items-center">
                  <span className="text-xs sm:text-sm text-white px-3 py-1.5 border border-white/20 bg-[#141414]">
                    {tag}
                  </span>
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-4">
              {actions.map((action, index) => (
                action.variant === "primary" ? (
                  <Link
                    key={index}
                    href={action.href}
                    className="inline-flex items-center justify-center px-5 py-2.5 bg-white text-black text-sm font-medium hover:bg-white/90 transition-colors"
                  >
                    {action.label}
                  </Link>
                ) : (
                  <Link
                    key={index}
                    href={action.href}
                    className="inline-flex items-center gap-1.5 text-white text-sm font-medium hover:text-white/80 transition-colors"
                  >
                    {action.label}
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                )
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

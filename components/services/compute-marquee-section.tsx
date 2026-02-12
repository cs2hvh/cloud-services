import Image from "next/image";

type MarqueeProps = {
  text?: string;
  rows?: number;
  speedSeconds?: number;
  rotateDeg?: number;
  backgroundImage?: string;
  backgroundFit?: "cover" | "contain";
  heightClassName?: string;
  className?: string;
};

const defaultText = "Latest Hardware Advertisement Section Sliding in and out";

const MarqueeRow = ({
  reverse = false,
  speedSeconds = 28,
  text = defaultText,
}: {
  reverse?: boolean;
  speedSeconds?: number;
  text?: string;
}) => {
  const trackClassName = reverse
    ? "animate-[compute-marquee-reverse_var(--marquee-speed)_linear_infinite]"
    : "animate-[compute-marquee_var(--marquee-speed)_linear_infinite]";

  return (
    <div className="relative w-full overflow-hidden">
      <div
        className={`flex w-[200%] items-center gap-10 ${trackClassName} motion-reduce:animate-none will-change-transform`}
        style={{ ["--marquee-speed" as string]: `${speedSeconds}s` }}
      >
        {[0, 1].map((groupIndex) => (
          <div
            key={groupIndex}
            className="flex w-1/2 min-w-max items-center gap-10"
            aria-hidden={groupIndex === 1}
          >
            {Array.from({ length: 4 }).map((_, index) => (
              <span
                key={`${groupIndex}-${index}`}
                className="text-white/95 text-[clamp(16px,2.2vw,36px)] leading-[1.2] whitespace-nowrap"
                style={{
                  fontFamily: '"Share Tech Mono", "IBM Plex Mono", monospace',
                  textShadow: "2px 4px 16px rgba(255, 255, 255, 0.46)",
                }}
              >
                {text}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

const ComputeMarqueeSection = ({
  text = defaultText,
  rows = 1,
  speedSeconds = 28,
  rotateDeg = -3.9,
  backgroundImage = "/images/compute-page/Marquee-bg.png",
  backgroundFit = "contain",
  heightClassName = "aspect-[1437/422]",
  className = "",
}: MarqueeProps) => {
  const backgroundClassName =
    backgroundFit === "contain" ? "object-contain" : "object-cover";

  return (
    <section
      className={`relative isolate overflow-hidden ${heightClassName} ${className}`}
    >
      <div className="absolute inset-0">
        <Image
          src={backgroundImage}
          alt=""
          fill
          sizes="100vw"
          className={`${backgroundClassName} object-center`}
        />
      </div>

      <div
        className="relative flex h-full w-full flex-col items-center justify-center gap-4 px-0"
        style={{ transform: `rotate(${rotateDeg}deg)` }}
      >
        {Array.from({ length: rows }).map((_, index) => (
          <MarqueeRow
            key={index}
            reverse={index % 2 === 1}
            speedSeconds={speedSeconds}
            text={text}
          />
        ))}
      </div>
    </section>
  );
};

export default ComputeMarqueeSection;

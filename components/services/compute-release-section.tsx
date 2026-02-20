import Image from "next/image";
import Link from "next/link";

const releaseCards = [
  {
    id: "01",
    title: "Compute Ultra",
    specs: [
      "vCPU: 16x AMD EPYC / Ryzen 9 class",
      "RAM: 64GB DDR5",
      "Storage: 1TB NVMe SSD",
      "Network: 15 Gbit/s",
      "Use-case: High-traffic SaaS, large APIs, gaming backend clusters",
    ],
  },
  {
    id: "02",
    title: "Compute Performance",
    specs: [
      "vCPU: 12x Ryzen 9 class",
      "RAM: 48GB DDR5",
      "Storage: 600GB NVMe SSD",
      "Network: 10 Gbit/s",
      "Use-case: Production apps, multiplayer game servers",
    ],
  },
];

const ReleaseCard = ({
  id,
  title,
  specs,
}: {
  id: string;
  title: string;
  specs: string[];
}) => {
  return (
    <div className="group relative w-full min-w-0 overflow-hidden rounded-[8px] aspect-[407/277] min-h-[240px] sm:min-h-[260px] md:min-h-[277px]">
      <div className="absolute inset-0">
        <Image
          src="/images/Add/card-bg.png"
          alt=""
          fill
          className="object-contain"
          sizes="(min-width: 1280px) 420px, (min-width: 1024px) 380px, (min-width: 768px) 45vw, 92vw"
          priority={false}
        />
      </div>

      <div className="relative z-10 flex h-full flex-col items-start justify-center px-5 py-5 text-[#0b0b0b] sm:px-8 sm:py-6 md:pl-14 md:pr-8 md:py-7">
        <div className="w-full pr-8 sm:pr-10 md:max-w-[320px] md:pr-0">
          <h3
            className="text-left text-[18px] font-bold leading-tight sm:text-[20px] md:text-[22px] lg:text-[27px]"
            style={{ fontFamily: "Sora, sans-serif" }}
          >
            {title}
          </h3>
          <div
            className="mt-2 flex flex-col gap-1.5 text-left text-[10px] font-normal leading-[1.5] text-black/80 break-words overflow-hidden sm:mt-3 sm:gap-2 sm:text-[11px] sm:leading-[1.6] md:text-[12px] md:leading-[1.7] lg:text-[14px]"
            style={{ fontFamily: "Sora, sans-serif" }}
          >
            {specs.map((spec, i) => (
              <p key={i} className="overflow-hidden text-ellipsis">{spec}</p>
            ))}
          </div>
        </div>
      </div>

      <div
        className="absolute bottom-0.5 left-0 z-20 text-[22px] font-bold leading-none text-white/95 select-none pointer-events-none sm:text-[26px]"
        style={{ fontFamily: "Sansation, sans-serif" ,fontWeight:"bold"}}
      >
        {id}
      </div>
    </div>
  );
};

const ComputeReleaseSection = () => {
  return (
    <section className="relative w-full overflow-hidden bg-[#050505] py-16 lg:py-24">
      {/* Background Image/Gradient */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <Image
          src="/images/main-page/service-home-section-2-bg.svg"
          alt="Background"
          fill
          className="object-cover"
          priority={false}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1440px] px-6 sm:px-8 lg:px-[61px] min-[1920px]:max-w-[1800px] min-[1920px]:px-[80px]">
        <div className="grid w-full grid-cols-1 gap-10 lg:grid-cols-3 lg:items-center lg:gap-8">
          {/* Left Content */}
          <div className="flex w-full max-w-[420px] flex-col lg:pt-2 lg:max-w-none">
            <h2
              className="text-[36px] font-normal leading-[1.1] text-white sm:text-[44px] lg:text-[48px]"
              style={{ fontFamily: "Sansation, sans-serif" }}
            >
              Explore the latest release
            </h2>
            <p
              className="mt-5 text-[15px] leading-[1.7] text-white/70 sm:text-[16px]"
              style={{ fontFamily: "Sansation, sans-serif" }}
            >
              Step into the future with our latest launches, crafted to bring you
              innovation, style, and unmatched performance. From exciting new
              features to premium upgrades, every release is designed to elevate
              your experience and keep you ahead of the curve. Explore what’s new,
              discover what’s next, and be the first to experience the best we have
              to offer.
            </p>

            <div className="mt-8">
              <Link
                href="/docs"
                className="group inline-flex h-[44px] items-center gap-3 rounded-full border border-white/40 bg-white/10 px-6 text-[#49454F] backdrop-blur-xl transition-all hover:border-white/70 hover:bg-white/20"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/50 text-white transition-transform group-hover:scale-110">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                  </svg>
                </div>
                <span className="text-[14px] font-medium text-[#49454F]">Explore</span>
              </Link>
            </div>
          </div>

          {releaseCards.map((card) => (
            <div key={card.id} className="w-full lg:justify-self-start">
              <ReleaseCard {...card} />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Separator Gradient */}
      <div className="absolute bottom-6 left-1/2 h-[3px] w-[min(637px,85%)] -translate-x-1/2 rounded-full bg-gradient-to-r from-white via-[#cfcfcf] to-black/90 opacity-80" />
    </section>
  );
};

export default ComputeReleaseSection;

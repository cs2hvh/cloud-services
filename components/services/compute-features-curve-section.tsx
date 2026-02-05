import Image from "next/image";

type FeatureItem = {
  title: string;
  description: string;
};

const defaultFeatures: FeatureItem[] = [
  {
    title: "Instant Provisioning",
    description:
      "Deploy virtual machines in under 60 seconds. Choose from a wide range of configurations to match your exact requirements.",
  },
  {
    title: "Auto-Scaling",
    description:
      "Automatically scale your infrastructure based on demand. Set custom rules or let our intelligent system optimize for you.",
  },
  {
    title: "Built-in Security & Reliability",
    description:
      "Enterprise-grade security with DDoS protection, firewall rules, and private networking by default. High availability architecture ensures maximum uptime and data protection.",
  },
  {
    title: "Global Regions",
    description:
      "Deploy closer to your users with data centers in over 50 locations worldwide. Low latency guaranteed.",
  },
  {
    title: "Flexible Storage",
    description:
      "NVMe SSD storage with automatic backups and snapshots. Scale storage independently from compute resources.",
  },
  {
    title: "Pay As You Go",
    description:
      "Only pay for what you use with per-second billing. No upfront commitments or hidden fees.",
  },
];

type ComputeFeaturesCurveSectionProps = {
  badge?: string;
  title?: string;
  highlight?: string;
  features?: FeatureItem[];
  curveImage?: string;
  className?: string;
};

const ComputeFeaturesCurveSection = ({
  badge = "Powerful Capabilities",
  title = "Enterprise Cloud",
  highlight = "Without Complexity",
  features = defaultFeatures,
  curveImage = "/images/compute-page/features-curv-logos.png",
  className = "",
}: ComputeFeaturesCurveSectionProps) => {
  return (
    <section className={`relative w-full bg-black px-4 pb-0 pt-12 sm:px-6 lg:px-8 ${className}`}>
      <div 
        className="relative mx-auto w-full max-w-[1375px] overflow-hidden rounded-t-[10px] border border-white/[0.47] border-b-0 bg-[rgba(255,255,255,0.08)] px-6 py-12 sm:px-10 sm:py-14 lg:px-16 lg:py-16"
        style={{ 
          backdropFilter: "blur(17.05px)",
          WebkitBackdropFilter: "blur(17.05px)",
          boxSizing: "border-box"
        }}
      >
        {/* Background gradient overlays */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-[35%] -top-[55%] h-[200%] w-[70%] rotate-[38.71deg] bg-[#494949] blur-[126.85px] opacity-55" />
          <div className="absolute -right-[25%] -top-[40%] h-[160%] w-[60%] rotate-[38.71deg] bg-[#1C1C1C] blur-[90px] opacity-55" />
        </div>
        
        <div className="relative z-10">
          {/* Header section */}
          <div className="relative flex flex-col items-center text-center">
            <p
              className="text-xs font-medium text-white/85 sm:text-sm"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              {badge}
            </p>
            <h2
              className="mt-4 text-[clamp(28px,4vw,42px)] font-semibold leading-tight text-white"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              <span className="block">{title}</span>
              <span className="block text-[#2DA6FF] drop-shadow-[0_4px_12px_rgba(45,166,255,0.35)]">
                {highlight}
              </span>
            </h2>
          </div>

          {/* Curve image and Features section */}
          <div className="mt-12 mx-auto w-full max-w-[1122px]">
            <div className="relative w-full">
              <Image
                src={curveImage}
                alt=""
                width={1122}
                height={216}
                className="h-auto w-full object-contain"
                priority={false}
              />
              {/* Features badge - positioned at center bottom of curve */}
              <div className="pointer-events-none absolute inset-x-0 bottom-[8%] flex justify-center">
                <div 
                  className="flex items-center justify-center rounded-[24px] border border-white/[0.43] bg-[#282828] text-white"
                  style={{ 
                    width: "222px",
                    height: "42px",
                    fontFamily: "Khula, sans-serif",
                    fontSize: "28px",
                    fontWeight: 400,
                    lineHeight: "25px",
                    textShadow: "0px 4px 4px rgba(0, 0, 0, 0.25)"
                  }}
                >
                  Features
                </div>
              </div>
            </div>

            {/* Features grid */}
            <div className="mt-8 grid w-full grid-cols-2 gap-x-4 gap-y-8 text-center sm:grid-cols-3 lg:mt-6 lg:flex lg:justify-between lg:gap-x-6">
              {features.map((feature, index) => (
                <div
                  key={feature.title}
                  className={`flex flex-col items-center mx-auto ${
                    index === 2 ? "lg:w-[162px]" : "lg:w-[143px]"
                  }`}
                  style={{ maxWidth: index === 2 ? "162px" : "154px" }}
                >
                  <h3
                    className="text-[15px] font-medium leading-[25px] text-white text-center"
                    style={{ 
                      fontFamily: "Inter, sans-serif",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minHeight: index === 2 ? "50px" : "25px"
                    }}
                  >
                    {feature.title}
                  </h3>
                  <p
                    className="mt-3 text-[10px] font-medium leading-[17px] text-white text-center"
                    style={{ 
                      fontFamily: "Inter, sans-serif",
                      display: "flex",
                      alignItems: "center"
                    }}
                  >
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ComputeFeaturesCurveSection;

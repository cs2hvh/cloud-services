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
  backgroundImage?: string;
  curveImage?: string;
  className?: string;
};

const ComputeFeaturesCurveSection = ({
  badge = "Powerful Capabilities",
  title = "Enterprise Cloud",
  highlight = "Without Complexity",
  backgroundImage = "/images/compute-page/curve-feature-section-bg.png",
  curveImage = "/images/compute-page/curv-logo-and-content.png",
  className = "",
}: ComputeFeaturesCurveSectionProps) => {
  return (
    <section className={`relative w-full bg-transparent px-4 pb-0 pt-12 sm:px-6 lg:px-8 ${className}`}>
      <div className="relative mx-auto w-full max-w-[1375px] overflow-hidden rounded-t-[10px] border border-white/[0.47] border-b-0 px-6 py-12 sm:px-10 sm:py-14 lg:px-16 lg:py-16">
        <div className="absolute inset-0">
          <Image
            src={backgroundImage}
            alt=""
            fill
            className="object-cover"
            priority={false}
          />
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
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ComputeFeaturesCurveSection;

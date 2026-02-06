import Image from "next/image";

// type FeatureItem = {
//   title: string;
//   description: string;
// };

  // const defaultFeatures: FeatureItem[] = [];

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
    <section className={`relative w-full bg-transparent px-4 pb-0 pt-10 sm:px-6 lg:px-8 ${className}`}>
      <div className="relative mx-auto w-full max-w-[1375px] overflow-hidden rounded-t-[10px] border border-white/[0.47] border-b-0 px-6 pb-12 pt-0 sm:px-10 sm:pb-104 sm:pt-0 lg:px-16 lg:pb-16 lg:pt-8  ">
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
              className="text-[clamp(16px,2.1vw,24px)] font-normal leading-[1.05] text-white"
              style={{
                fontFamily: "Sansation, sans-serif",
                textShadow: "0px 4px 4px rgba(0, 0, 0, 0.25)",
              }}
            >
              {badge}
            </p>
            <h2
              className="mt-30 text-center text-[clamp(32px,4.2vw,48px)] font-normal leading-[0.98] text-white"
              style={{
                fontFamily: "Sansation, sans-serif",
                textShadow: "0px 4px 4px rgba(0, 0, 0, 0.25)",
              }}
            >
              <span className="block">{title}</span>
              <span className="block text-[#2DA6FF]">
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

import Image from "next/image";

type ComputeFeaturesCurveSectionProps = {
  backgroundImage?: string;
  curveImage?: string;
  className?: string;
};

const ComputeFeaturesCurveSection = ({
  backgroundImage = "/images/compute-page/curve-feature-section-bg.png",
  curveImage = "/images/compute-page/curv-logo-and-content.png",
  className = "",
}: ComputeFeaturesCurveSectionProps) => {
  return (
    <section
      className={`relative w-full bg-transparent px-4 pt-12 pb-0 -mb-12 sm:px-6 sm:pt-16 sm:-mb-16 lg:px-8 lg:pt-20 lg:-mb-24 ${className}`}
    >
      <div
        className="
          relative mx-auto w-full
          max-w-[1320px]
          lg:max-w-[1440px]
          min-[1920px]:max-w-[1800px]
          min-[2560px]:max-w-[2400px]
        "
      >
        <div className="relative w-full flex justify-center">

          {/* Background */}
          <Image
            src={backgroundImage}
            alt="Background"
            width={2400}
            height={900}
            sizes="100vw"
            className="absolute inset-0 w-full h-auto object-contain"
          />

          {/* Curve */}
          <Image
            src={curveImage}
            alt="Curve Section"
            width={2400}
            height={900}
            sizes="100vw"
            className="relative z-10 w-full h-auto object-contain translate-y-4 sm:translate-y-6 lg:translate-y-10"
          />

        </div>
      </div>
    </section>
  );
};

export default ComputeFeaturesCurveSection;

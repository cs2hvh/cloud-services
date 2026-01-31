import Image from "next/image";
import {
  Activity,
  Globe,
  Layers,
  ShieldCheck,
  SlidersHorizontal,
  Zap,
} from "lucide-react";

const trustFeatures = [
  {
    title: "Fundamentally Configurable",
    description: (
      <>
        ahura
        <span className="text-[#00AAFF]">cloud</span> products work together and
        can be adapted to any type of solution.
      </>
    ),
    icon: SlidersHorizontal,
  },
  {
    title: "Volume",
    description: (
      <>
        ahura
        <span className="text-[#00AAFF]">cloud</span> processes millions of
        encryption operations every day.
      </>
    ),
    icon: Layers,
  },
  {
    title: "Write and Deploy in Seconds",
    description:
      "Built so developers spend less time and money on data security and compliance.",
    icon: Zap,
  },
  {
    title: "Globally Distributed",
    description: (
      <>
        ahura
        <span className="text-[#00AAFF]">cloud</span> resources are deployed in
        multiple regions to optimize uptime.
      </>
    ),
    icon: Globe,
  },
  {
    title: "Enclave-backed",
    description:
      "Built on isolated, hardened, and highly constrained secure enclaves.",
    icon: ShieldCheck,
  },
  {
    title: "Ultra-Low Latency",
    description:
      "Encryption and decryption operations introduce a minimal latency penalty.",
    icon: Activity,
  },
];

export function WhyTrustUs() {
  return (
    <section className="relative z-10 bg-[#161618] border-b border-[#161618] px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] lg:items-start lg:gap-16">
          <div className="relative overflow-hidden border border-[#2D7CFF] shadow-[0_6px_22px_rgba(45,124,255,0.35)]">
            <div className="absolute inset-0">
              <Image
                src="/images/Complince/why-trust-us-bg.png"
                alt=""
                fill
                className="object-cover object-center"
                sizes="(min-width: 1024px) 460px, (min-width: 640px) 60vw, 90vw"
              />
              <div className="absolute inset-0 bg-black/45" />
            </div>
            <div className="relative z-10 flex h-[520px] flex-col justify-start px-6 pt-16 sm:h-[560px] sm:px-8 sm:pt-20 lg:h-[620px]">
              <h2 className="text-4xl sm:text-5xl lg:text-[64px] leading-tight bg-[radial-gradient(45%_100%_at_50%_50%,#FFFFFF_30%,rgba(255,255,255,0.4)_100%)] bg-clip-text text-transparent">
                Why trust us?
              </h2>
              <p className="mt-6 max-w-[360px] text-sm sm:text-base lg:text-[20px] leading-6 text-[#BABCD2]">
                ahura
                <span className="text-[#00AAFF]">cloud</span> is secure by
                default. We build, manage, and implement security best practices
                into the platform so you don&apos;t have to.
              </p>
            </div>
          </div>

          <div className="space-y-8">
            {trustFeatures.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Icon className="mt-1 h-5 w-5 text-[#DFE1F4]" />
                    <div>
                      <h3 className="text-xl sm:text-2xl lg:text-[32px] leading-tight text-white">
                        {feature.title}
                      </h3>
                      <p className="mt-2 text-sm sm:text-base lg:text-[20px] leading-6 text-[#BABCD2]">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                  {index !== trustFeatures.length - 1 && (
                    <div className="w-full max-w-[420px] border-t-2 border-transparent [border-image:linear-gradient(90deg,#FFFFFF_0%,#007EE5_100%)_1]" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

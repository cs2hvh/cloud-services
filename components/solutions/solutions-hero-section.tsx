import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/container";

const SOLUTION_TAG_GROUPS = [
  [
    "Compute \u00b7 General Purpose Droplets",
    "GPU Instances \u00b7 Accelerated compute",
    "Security \u00b7 Protect apps & data",
  ],
  ["Database \u00b7 Managed"],
];

type SolutionTagProps = {
  label: string;
  className?: string;
};

function SolutionTag({ label, className }: SolutionTagProps) {
  return (
    <div
      className={cn(
        "inline-flex h-[37px] w-full items-center justify-center border border-[#464A4D] bg-[rgba(56,56,56,0.18)] px-3 text-[12px] font-medium leading-none text-white backdrop-blur-[8.1px] sm:justify-start sm:px-4",
        "shadow-[0_4px_4px_rgba(0,0,0,0.25)]",
        className,
      )}
    >
      {label}
    </div>
  );
}

export function SolutionsHeroSection() {
  return (
    <section className="relative isolate min-h-screen lg:h-screen overflow-hidden pt-[96px] bg-[#0E0F0F]">
      <div className="absolute inset-0 -z-20 bg-[#0E0F0F]" />

      <Image
        src="/solution/solution-hero-background.png"
        alt=""
        fill
        priority
        className="-z-10 object-cover object-[58%_42%]"
      />

      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(14,15,15,0.7)_0%,rgba(14,15,15,0.55)_42%,rgba(14,15,15,0.35)_72%,rgba(14,15,15,0.6)_100%)]" />
      <div className="pointer-events-none absolute left-[-28%] top-[-34%] -z-10 h-[135px] w-[75vw] max-w-[1254px] rotate-[38.71deg] bg-[#494949]/45 blur-[126px]" />

      <Container>
        <div className="relative z-10 py-10 lg:py-0 lg:h-[calc(100vh-96px)]">
          <div className="grid lg:h-full items-center gap-10 lg:grid-cols-2 lg:gap-0">
          <div className="text-center sm:text-left lg:h-full flex flex-col justify-center lg:justify-self-start">
            <h1 className="max-w-[570px] text-[clamp(2rem,2.9vw,3.4rem)] font-normal leading-[1.22] text-[#F2F2F2] [text-shadow:2px_4px_18.1px_rgba(255,255,255,0.36)]">
              All solutions for building, scaling, and securing modern apps.
            </h1>

            <p className="mt-5 max-w-[650px] text-[clamp(1rem,1.45vw,1.25rem)] font-light leading-[1.36] text-white">
              Browse solution categories and match them to core products like
              Compute, GPU&apos;s, Managed Databases, Managed Kubernetes, Object
              Storage, AI Agents, Security, and App Deployment.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3 max-sm:flex-col max-sm:items-stretch">
              <Link
                href="/signup"
                className="inline-flex h-[40px] w-full items-center justify-center bg-white px-3 text-[12px] font-medium text-black shadow-[0_4px_4px_rgba(0,0,0,0.25)] sm:w-[168px]"
              >
                Contact sales
              </Link>
              <Link
                href="/docs"
                className="inline-flex h-[40px] w-full items-center justify-center border border-[#464A4D] px-3 text-[12px] font-medium text-white backdrop-blur-[8.1px] sm:w-[168px]"
              >
                Talk to an expert
              </Link>
              <p className="w-full text-[12px] font-bold text-[#949494] sm:w-auto sm:pl-2">
                Typical response: <span className="text-white">same business day</span>
              </p>
            </div>

            <div className="mt-9 grid max-w-[740px] gap-x-8 gap-y-3 sm:grid-cols-[236px_167px]">
              <div className="flex flex-col gap-3">
                {SOLUTION_TAG_GROUPS[0].map((label) => (
                  <SolutionTag key={label} label={label} className="sm:w-[236px]" />
                ))}
              </div>
              <div className="flex flex-col gap-3">
                {SOLUTION_TAG_GROUPS[1].map((label) => (
                  <SolutionTag key={label} label={label} className="sm:w-[167px]" />
                ))}
              </div>
            </div>
          </div>

          <div className="relative w-full max-w-none lg:ml-auto lg:flex lg:justify-end lg:h-full flex items-center justify-center">
            <div className="pointer-events-none absolute left-1/2 top-[30%] h-[64%] w-[64%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(66,214,190,0.32)_0%,rgba(66,214,190,0.08)_45%,transparent_75%)] blur-[28px]" />
            <div className="relative mx-auto h-[clamp(300px,42vw,560px)] min-h-[260px] max-h-[560px] w-[75%] max-w-[620px] lg:mx-0 lg:w-[442px]">
              <Image
                src="/solution/solution-hero-bulb-idea.svg"
                alt="Light bulb and gears solution illustration"
                fill
                priority
                className="object-contain"
              />
            </div>
          </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

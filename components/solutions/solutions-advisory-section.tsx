import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

const PANEL_STYLES =
  "relative isolate overflow-hidden rounded-[4px] border-2 border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.04)] backdrop-blur-[5px] shadow-[0_8px_32px_rgba(0,0,0,0.5)]";

type AdvisoryPanelProps = {
  className?: string;
  heightClass?: string;
};

function AdvisoryPanel({
  className,
  heightClass = "h-[353px]",
}: AdvisoryPanelProps) {
  return (
    <section className={cn(PANEL_STYLES, heightClass, "w-full", className)}>
      <div className="absolute inset-0 z-[1] bg-[linear-gradient(90deg,rgba(18,18,18,0.18)_0%,rgba(18,18,18,0.08)_44%,rgba(18,18,18,0.16)_100%)]" />

      <div className="relative z-10 grid h-full gap-8 px-5 py-7 sm:px-8 sm:py-10 md:px-12 lg:grid-cols-[minmax(0,682px)_295px] lg:gap-[103px] lg:px-[64px] lg:py-[64px]">
        <div className="max-w-[682px]">
          <h2 className="text-[clamp(2rem,2.2vw,32px)] font-normal leading-[1.21875] text-white">
            Not Sure which solution fits?
          </h2>

          <p className="mt-5 text-[clamp(1rem,1.5vw,20px)] font-light leading-[1.2] text-white">
            Share your goals: traffic, data size, latency, compliance. We will
            suggest a practical architecture using the right mix of products.
          </p>

          <ul className="mt-5 space-y-0 text-[clamp(1.05rem,1.45vw,20px)] font-light leading-[1.2] text-white">
            <li>• Architecture review</li>
            <li>• Custom quotes</li>
            <li>• Migration support</li>
            <li>• 24/7 expert help</li>
          </ul>
        </div>

        <div className="flex flex-col gap-[30px] lg:pt-[44px]">
          <Link
            href="/signup"
            className="inline-flex h-[59px] w-full max-w-[295px] items-center justify-center bg-[#D9D9D9] px-4 text-center text-[clamp(1.05rem,1.35vw,20px)] font-normal leading-[1.2] text-black"
          >
            Contact Sales
          </Link>
          <Link
            href="/docs"
            className="inline-flex h-[59px] w-full max-w-[295px] items-center justify-center border border-[#AEAEAE] bg-[rgba(0,0,0,0.08)] px-4 text-center text-[clamp(1.05rem,1.35vw,20px)] font-normal leading-[1.2] text-white"
          >
            Request a Demo
          </Link>
        </div>
      </div>
    </section>
  );
}

export function SolutionsAdvisorySection() {
  return (
    <section className="relative isolate bg-black pb-16 sm:pb-20 lg:pb-24">
      <div className="mx-auto w-full max-w-[1438px] px-4 sm:px-6 md:px-10 lg:px-14 xl:px-16">
        <div className="h-px w-full bg-[#686868]" />

        <div className="relative mx-auto mt-8 w-full max-w-[1246px] sm:mt-10">
          <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-[400px] z-0 h-[calc(100%+180px)] w-[105%] overflow-hidden rounded-[4px]">
            <Image
              src="/solution/thirdsecion/third-bg.png"
              alt=""
              fill
              className="object-cover opacity-[0.95] "
              style={{ objectPosition: "center center" }}
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.25)_0%,rgba(0,0,0,0.12)_45%,rgba(0,0,0,0.3)_100%)]" />
          </div>

          <div className="relative z-10 flex flex-col gap-7 sm:gap-8">
            <AdvisoryPanel heightClass="h-auto min-h-[420px] lg:h-[505px]" />
            <AdvisoryPanel heightClass="h-auto min-h-[353px] lg:h-[353px]" />
          </div>
        </div>
      </div>
    </section>
  );
}

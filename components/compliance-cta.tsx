import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/ui/container";

export function ComplianceCta() {
  return (
    <section className="relative z-10 bg-[#C1C1C1] py-20 sm:py-24">
      <Container>
        <div className="flex flex-col lg:flex-row gap-6 justify-center  items-center  lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <div className="text-center md:text-left">
            <div className="d-flex items-center max-w-xl">
              <h2 className="text-4xl sm:text-5xl lg:text-[56px] leading-tight text-black ">
              Meet compliance requirements. Build customer trust.
            </h2>
            </div>
            <p className="mt-6 text-sm sm:text-[14.4px] leading-6 text-black/80 md:max-w-[420px]">
              Use ahura
              <span className="text-[#00AAFF]">cloud</span>
              &apos;s flexible building blocks to keep your customers&apos; data
              secure and compliant at all times.
            </p>
            <div className="mt-10 flex justify-center md:justify-start">
              <div className="inline-flex items-center rounded-[4px] border border-white/30 bg-black p-1">
                <Link
                  href="#"
                  className="rounded-[5px] px-4 py-2 text-[16px] font-medium text-white"
                >
                  Documentations
                </Link>
                <div className="mx-1 h-5 w-px bg-white/15" />
                <Link
                  href="#"
                  className="rounded-[5px] px-4 py-2 text-[16px] font-medium text-white"
                >
                  Pricing
                </Link>
              </div>
            </div>
          </div>

          <div className="flex justify-center lg:justify-end">
            <Image
              src="/images/Complince/chip-on-brain.svg"
              alt="Brain with chip"
              width={520}
              height={520}
              className="w-full max-w-[360px] sm:max-w-[420px] lg:max-w-[460px]"
              priority
            />
          </div>
        </div>
      </Container>
    </section>
  );
}

import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { ArrowRight } from "lucide-react";

export function ComplianceCta() {
  return (
    <section className="relative z-10 bg-[#C1C1C1] py-20 sm:py-24">
      <Container>
        <div className="flex flex-col lg:flex-row gap-6 justify-center items-center">
          <div className="text-center md:text-left">
            <div className="d-flex items-center max-w-xl">
              <h2 className="text-4xl sm:text-5xl lg:text-[56px] leading-tight text-black">
                Meet compliance requirements. Build customer trust.
              </h2>
            </div>
            <p className="mt-6 text-sm sm:text-[14.4px] leading-6 text-black/80 md:max-w-[420px]">
              Use ahura
              <span className="text-[#0095FF]">sense</span>
              &apos;s flexible building blocks to keep your customers&apos; data
              secure and compliant at all times.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
              <Link
                href="#"
                className="inline-flex items-center justify-center gap-2 bg-black px-6 py-3 text-[16px] font-medium text-white hover:bg-black/85 transition-colors"
              >
                Documentation
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="#"
                className="inline-flex items-center justify-center gap-2 border border-black/20 px-6 py-3 text-[16px] font-medium text-black hover:bg-black/5 transition-colors"
              >
                Pricing
                <ArrowRight className="h-4 w-4" />
              </Link>
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

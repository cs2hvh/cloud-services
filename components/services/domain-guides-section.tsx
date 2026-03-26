import Image from "next/image";
import Link from "next/link";
import { Play, ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";

const guideCards = [
  { title: "Getting started with domains", highlighted: false },
  { title: "Choosing the right domain name", highlighted: true },
  { title: "How domain transfers work", highlighted: false },
  { title: "Managing domains efficiently", highlighted: false },
];

export default function DomainGuidesSection() {
  return (
    <section className="relative overflow-hidden bg-[#8F8F8F] pt-14 sm:pt-16 lg:pt-20 ">
      <Container>
        <div className="mx-auto max-w-[1060px]">
          <h2 className="text-center text-3xl font-semibold text-[#F2F2F2] sm:text-4xl lg:text-[44px]">
            New to Domains? We&apos;ve Got You Covered
          </h2>
          <p className="mx-auto mt-3 max-w-[760px] text-center text-sm text-white/85 sm:text-base">
            Short, practical guides to help you choose, register, and manage domains with confidence.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-5">
            {guideCards.map((card) => (
              <article
                key={card.title}
                className={`rounded-xl border p-2 ${
                  card.highlighted ? "border-[#0095FF] bg-[#7F7F7F]" : "border-white/25 bg-[#9A9A9A]"
                }`}
              >
                <div className="flex h-28 items-center justify-center rounded-lg bg-[#2F3033] sm:h-32">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/85">
                    <Play className="h-6 w-6 fill-black text-black" />
                  </span>
                </div>
                <p className="mt-2 text-center text-[11px] font-semibold text-[#1B1B1B] sm:text-xs">
                  {card.title}
                </p>
              </article>
            ))}
          </div>
        </div>
      </Container>

      <div className="relative mt-16 h-[118px] bg-[#0A0A0C] sm:mt-20 sm:h-[138px]">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(#6F6F6F 1px, transparent 1px)", backgroundSize: "18px 18px" }} />
      </div>

      <Container className="relative z-10">
        <div className="-mt-24 mx-auto w-full max-w-[760px] rounded-[26px] bg-[#D7D7D7] px-5 py-5 shadow-[0_16px_34px_rgba(0,0,0,0.34)] sm:-mt-28 sm:px-8 sm:py-7">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-[430px]">
              <h3 className="text-2xl font-semibold leading-tight text-[#161616] sm:text-[33px]">
                Scaling Beyond a Few Domains?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-black/70 sm:text-base">
                Managing multiple domains doesn&apos;t have to be complex. Get dedicated support,
                bulk pricing, and seamless portfolio management tailored to your business.
              </p>
              <Link
                href="/signup"
                className="mt-3 inline-flex items-center rounded-md bg-[#0095FF] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0084E3]"
              >
                Schedule a Consultation
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>

            <div className="relative h-[108px] w-[170px] shrink-0 sm:h-[128px] sm:w-[200px]">
              <Image src="/images/hero/globe.png" alt="Global domain management" fill className="object-contain" />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

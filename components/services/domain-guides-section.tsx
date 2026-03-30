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
    <section className="relative isolate overflow-hidden bg-[#818181] pt-14 sm:pt-16 lg:pt-20 font-sansation ">
      {/* container-1 */}
      <Container className="relative z-30">
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
                "border-white/25 bg-[#939393]"
                }`}
              >
                <div className="flex h-28 items-center justify-center rounded-lg bg-[#414141] sm:h-32">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/85">
                    <Play className="h-6 w-6 fill-black text-black" />
                  </span>
                </div>
                <p className="mt-2 text-center text-[11px] font-bold text-[#0a0a0a] sm:text-xs">
                  {card.title}
                </p>
              </article>
            ))}
          </div>
        </div>
      </Container>

    
      {/* {background for container-2} */}
      



      {/* container-2 */}
      <Container className="relative z-20 mt-6 pb-6 sm:mt-4 sm:pb-10 lg:mt-2">
        <div className="mx-auto w-full max-w-[760px] rounded-[26px] bg-[#D7D7D7] px-5 py-5 shadow-[0_16px_34px_rgba(0,0,0,0.34)] sm:px-8 sm:py-7">

          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-[430px]">
              <h3 className="text-2xl font-salsa font-semibold leading-tight text-[#161616] sm:text-[33px]">
                Scaling Beyond a Few Domains?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-black/70 sm:text-base">
                Managing multiple domains doesn&apos;t have to be complex. Get dedicated support,
                bulk pricing, and seamless portfolio management tailored to your business.
              </p>
              <Link
                href="/signup"
                className="mt-3 inline-flex font-salsa items-center rounded-md bg-[#0095FF] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0084E3]"
              >
                Schedule a Consultation
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>

            <div className="relative h-[300px] w-[300px] shrink-0 sm:h-[128px] sm:w-[200px]">
              <Image src="/images/main-page/domain-sec-4.svg" alt="Global domain management" fill className="object-contain" />
            </div>
          </div>
        </div>
      </Container>

      {/* {container-3} */}
      <div className="relative z-10 -mt-[72px] h-[252px] overflow-hidden bg-[#05060A] sm:-mt-[94px] sm:h-[304px] lg:-mt-[112px] lg:h-[362px]">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#05060A]/70 to-[#05060A]" />
        <div
          className="absolute inset-0 opacity-55"
          style={{
            backgroundImage:
              "radial-gradient(circle at 12% 26%, rgba(255,255,255,0.24) 1.4px, transparent 2px), radial-gradient(circle at 34% 78%, rgba(255,255,255,0.2) 1.2px, transparent 2px), radial-gradient(circle at 62% 40%, rgba(164,181,255,0.32) 1.2px, transparent 2px), radial-gradient(circle at 82% 68%, rgba(255,255,255,0.22) 1.3px, transparent 2px), radial-gradient(circle at 94% 18%, rgba(155,175,255,0.26) 1.2px, transparent 2px)",
            backgroundSize: "220px 140px, 260px 180px, 300px 200px, 240px 160px, 280px 180px",
          }}
        />
      </div>
        
    </section>
  );
}

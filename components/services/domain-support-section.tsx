"use client";

import { useState } from "react";
import Image from "next/image";
import { Container } from "@/components/ui/container";

type SupportCard = {
  title: string;
  subtitle: string;
  icon: string;
  iconWidth: number;
  iconHeight: number;
  muted?: boolean;
};

const supportCards: SupportCard[] = [
  {
    title: "99.99% Reliability",
    subtitle: "Instant help anytime",
    icon: "/images/main-page/domain-sec-6-security.svg",
    iconWidth: 74,
    iconHeight: 58,
    muted: true,
  },
  {
    title: "Dedicated Support",
    subtitle: "Speak with experts",
    icon: "/images/main-page/domain-sec-6-online.svg",
    iconWidth: 74,
    iconHeight: 58,
  },
  {
    title: "Live Chat",
    subtitle: "Instant help anytime",
    icon: "/images/main-page/domain-sec-6-chat.svg",
    iconWidth: 54,
    iconHeight: 54,
    muted: true,
  },
];

export default function DomainSupportSection() {
  const [activeCardIndex, setActiveCardIndex] = useState(1);

  return (
    <section
      className="relative overflow-hidden bg-gradient-to-b from-[#000309] to-[#000000] py-16 sm:py-20 lg:py-24"
      // style={{
      //   background:
      //     "radial-gradient(120% 160% at 50% -15%, rgba(22,36,87,0.32) 0%, rgba(1,7,15,1) 48%), linear-gradient(180deg, #000309 0%, #000000 100%)",
      // }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-65"
        style={{
          backgroundImage:
            "radial-gradient(36% 60% at 26% 70%, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0) 68%), radial-gradient(36% 60% at 74% 70%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 68%), linear-gradient(180deg, rgba(2,5,10,0.05) 0%, rgba(0,0,0,0.85) 100%)",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-15"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "100% 14px",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute left-1/2 top-[58%] h-[280px] w-[86%] -translate-x-1/2 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(109,134,255,0.12) 44%, rgba(2,7,15,0) 76%)",
        }}
        aria-hidden="true"
      />

      <Container className="relative z-10">
        <div className="mx-auto max-w-[1080px]">
          <div className="flex justify-center">
            <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-1 text-sm font-medium text-white/95 shadow-[0_6px_18px_rgba(0,0,0,0.45)]">
              Support
            </span>
          </div>

          <h2 className="mt-6 text-center text-3xl font-medium tracking-tight text-[#D8DAE5] sm:text-4xl lg:text-[52px] lg:leading-[1.1]">
            Built to Power your Online Presence
            <span className="block font-semibold text-[#BABBC8]">
              24/7 Domain Support
            </span>
          </h2>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-12 sm:grid-cols-2 lg:grid-cols-3 lg:gap-3">
            {supportCards.map((card, index) => {
              const isActive = activeCardIndex === index;

              return (
                <article
                  key={card.title}
                  className={`relative isolate flex min-h-[196px] flex-col overflow-hidden rounded-[14px] border bg-[linear-gradient(112deg,rgba(35,38,46,0.93)_8%,rgba(24,26,33,0.94)_44%,rgba(20,22,29,0.96)_100%)] px-6 pb-6 pt-5 transition-all duration-500 ${
                    isActive
                      ? "scale-[1.03] border-white/25 shadow-[0_26px_56px_rgba(0,0,0,0.56)]"
                      : "scale-[0.96] border-white/10 opacity-75 shadow-[0_14px_28px_rgba(0,0,0,0.42)]"
                  }`}
                >
                  <div
                    className={`pointer-events-none absolute inset-0 bg-[radial-gradient(140%_80%_at_50%_70%,rgba(255,255,255,0.45)_0%,rgba(255,255,255,0)_64%)] ${
                      isActive ? "opacity-45" : "opacity-25"
                    }`}
                  />
                  <div className="pointer-events-none absolute -bottom-[1px] right-0 h-11 w-11 rounded-tl-[24px] bg-[#171A22]" />

                  <div className="relative z-10 mt-auto flex flex-col items-center text-center">
                    <div className="relative flex h-[62px] items-center justify-center">
                      <Image
                        src={card.icon}
                        width={card.iconWidth}
                        height={card.iconHeight}
                        className={`object-contain ${card.muted ? "opacity-70" : "opacity-100"}`}
                        alt={card.subtitle}
                      />
                    </div>

                    <div className="mt-3 h-px w-[110px] bg-gradient-to-r from-transparent via-white/70 to-transparent" />

                    <h3
                      className={`mt-3 text-xl leading-none sm:text-2xl ${
                        card.muted ? "font-medium text-white/65" : "font-semibold text-white/95"
                      }`}
                    >
                      {card.title}
                    </h3>
                    <p
                      className={`mt-1 text-sm leading-none sm:text-base ${
                        card.muted ? "text-white/60" : "text-white/85"
                      }`}
                    >
                      {card.subtitle}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>


          {/* Clickable indicators to zoom the corresponding support card */}
          <div className="mt-10 flex items-center justify-center gap-2 sm:mt-12">
            {supportCards.map((card, index) => {
              const isActive = activeCardIndex === index;

              return (
                <button
                  key={card.title}
                  type="button"
                  aria-label={`Show ${card.title} card`}
                  aria-pressed={isActive}
                  onClick={() => setActiveCardIndex(index)}
                  className={`rounded-full transition-all duration-300 cursor-pointer ${
                    isActive
                      ? "h-[4px] w-16 bg-white"
                      : "h-[3px] w-10 bg-white/35 hover:bg-white/60"
                  }`}
                />
              );
            })}
          </div>
        </div>
      </Container>
    </section>
  );
}

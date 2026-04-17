import { ArrowRight } from "lucide-react";

import { WideContainer } from "@/components/ui/container";
import { AuthAwareServiceCta } from "@/components/services/auth-aware-service-cta";

const mobileCards = [
  {
    title: "Keep it short",
    description:
      "Short domain names are easier to type, remember, and share.",
    number: "1",
    cardColor: "bg-[#139FD3]",
    numberColor: "text-[#DDE6CA]",
  },
  {
    title: "Check availability early",
    description:
      "Check quickly and secure it before someone else does.",
    number: "2",
    cardColor: "bg-[#078EAE]",
    numberColor: "text-[#6EAEF7]",
  },
  {
    title: "Make it clear",
    description:
      "Choose names that are easy to type and easy to remember.",
    number: "3",
    cardColor: "bg-[#767874]",
    numberColor: "text-[#E2E8C4]",
  },
  {
    title: "Act fast",
    description:
      "If you find the right fit, register before it's gone.",
    number: "4",
    cardColor: "bg-[#0656AA]",
    numberColor: "text-[#041B22]",
  },
  {
    title: "Think global",
    description:
      "Pick a name that works across languages and cultures.",
    number: "5",
    cardColor: "bg-[#84AAB0]",
    numberColor: "text-[#0F8AA7]",
  },
];

export default function DomainChoiceSection() {
  return (
    <section className="relative overflow-hidden font-sansation bg-[#171717] py-10 sm:py-14 lg:py-16">
      <WideContainer>
        <div className="mx-auto w-full max-w-[1080px]">
          <div className="lg:hidden">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {mobileCards.map((card) => (
                <article
                  key={card.number}
                  className={`relative overflow-hidden rounded-md border border-white/10 p-3.5 sm:p-4 ${
                    card.number === "5" ? "sm:col-span-2" : ""
                  } ${card.cardColor}`}
                >
                  <span className={`absolute left-3 top-0 text-5xl sm:text-6xl font-semibold leading-none ${card.numberColor}`}>
                    {card.number}
                  </span>
                  <div className="ml-12 sm:ml-14">
                    <h3 className="text-lg sm:text-xl font-medium leading-tight text-white">{card.title}</h3>
                    <p className="mt-1 text-xs sm:text-sm leading-relaxed text-white/85">{card.description}</p>
                  </div>
                </article>
              ))}
            </div>

            <h2 className="mt-7 max-w-[560px] text-[30px] font-medium leading-[0.96] tracking-tight text-white sm:mt-8 sm:text-4xl">
              Choose a Domain That Works for You
            </h2>
            <AuthAwareServiceCta
              service="domain"
              intent="main"
              className="mt-4 inline-flex items-center gap-2 text-base sm:text-lg font-medium text-white/90 transition-opacity hover:opacity-80"
            >
              Get Started
              <ArrowRight className="h-5 w-5" />
            </AuthAwareServiceCta>
          </div>

          <div className="hidden lg:flex justify-center">
            <div className="relative h-[560px] w-[972px] xl:h-[620px] xl:w-[1080px]">
              <div className="absolute left-0 top-0 h-[620px] w-[1080px] origin-top-left scale-[0.9] xl:scale-100">
            <div className="absolute left-0 top-6 flex">
              <div className="flex h-[188px] w-[110px] items-start justify-center bg-[#9FBDD0] pt-2">
                <span className="text-[100px] font-semibold leading-none text-[#DDE6CA]">1</span>
              </div>
              <div className="h-[136px] w-[300px] bg-[#139FD3] px-6 py-3 text-center">
                <h3 className="text-[31px] font-medium leading-none text-white">Keep it short</h3>
                <p className="mx-auto mt-3 max-w-[225px] text-xs leading-relaxed text-white/90">
                  Short domain names are easier to type, remember, and share. Long or complicated
                  names increase the chances of users making mistakes or forgetting your site.
                </p>
              </div>
            </div>

            <div className="absolute left-[92px] top-[205px] flex">
              <div className="flex h-[122px] w-[82px] items-start justify-center bg-[#A5C5DA] pt-4">
                <span className="text-[86px] font-semibold leading-none text-[#6EAEF7]">2</span>
              </div>
              <div className="h-[148px] w-[350px] bg-[#078EAE] px-7 py-3 text-center">
                <h3 className="text-[30px] font-medium leading-none text-white">Check availability early</h3>
                <p className="mx-auto mt-3 max-w-[236px] text-xs leading-relaxed text-white/90">
                  Domain names get taken quickly. Once you have an idea, check availability and
                  secure it as soon as possible to avoid losing it to someone else.
                </p>
              </div>
            </div>

            <div className="absolute left-[406px] top-6 flex">
              <div className="flex h-[102px] w-[86px] items-start justify-center bg-[#A0B7CF] pt-1">
                <span className="text-[88px] font-semibold leading-none text-[#E2E8C4]">3</span>
              </div>
              <div className="h-[162px] w-[324px] bg-[#767874] px-7 py-4 text-center">
                <h3 className="text-[30px] font-medium leading-none text-white">Make it clear</h3>
                <p className="mx-auto mt-3 max-w-[230px] text-xs leading-relaxed text-white/90">
                  Short domain names are easier to type, remember, and share. Long or complicated
                  names increase the chances of users making mistakes or forgetting your site.
                </p>
              </div>
            </div>

            <div className="absolute right-[18px] top-[118px]">
              <div className="relative h-[206px] w-[344px]">
                <div className="absolute left-0 top-[52px] flex h-[150px] w-[90px] items-start justify-center bg-[#78CDD7] pt-3">
                  <span className="text-[86px] font-semibold leading-none text-[#03191F]">4</span>
                </div>
                <div className="absolute right-0 top-0 h-[196px] w-[254px] bg-[#0656AA] px-6 py-4 text-center">
                  <h3 className="text-[36px] font-medium leading-none tracking-tight text-white">
                    Act fast
                  </h3>
                  <p className="mx-auto mt-4 max-w-[138px] text-xs leading-[1.55] text-white/90">
                    Good domain names are limited and in high demand. If you find one that fits
                    your brand well, don&apos;t delay-register it before it&apos;s gone.
                  </p>
                </div>
              </div>
            </div>

            <div className="absolute right-[10px] top-[304px]">
              <div className="ml-auto flex h-[120px] w-[176px] items-center justify-center bg-[#D7D8DA]">
                <span className="rotate-90 text-[102px] font-semibold leading-none text-[#0F8AA7]">5</span>
              </div>
              <div className="mt-0 h-[205px] w-[460px] bg-[#84AAB0] px-8 py-4">
                <div className="flex h-full items-start justify-end gap-5">
                    <p
                    className="max-h-full text-[11px] leading-relaxed text-white/90"
                    style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
                  >
                    Avoid region-specific spelling or slang when possible. A name that is easy to
                    pronounce and understand across different languages and cultures.
                  </p>
                  <p
                    className="text-sm leading-relaxed text-white/95"
                    style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
                  >
                    Think global
                  </p>
                
                </div>
              </div>
            </div>

            <div className="absolute bottom-0 left-3">
              <h2 className="max-w-[520px] text-[60px] font-semibold leading-[0.93] tracking-tight text-white">
                Choose a Domain That Works for You
              </h2>
              <AuthAwareServiceCta
                service="domain"
                intent="main"
                className="mt-5 inline-flex items-center gap-2 text-4xl font-medium text-white transition-opacity hover:opacity-80"
              >
                Get Started
                <ArrowRight className="h-9 w-9" />
              </AuthAwareServiceCta>
            </div>
              </div>
            </div>
          </div>
        </div>
      </WideContainer>
    </section>
  );
}

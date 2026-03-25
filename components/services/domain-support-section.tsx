import { Headset, MessageSquareText, ShieldCheck } from "lucide-react";

import { Container } from "@/components/ui/container";

const supportCards = [
  {
    title: "99.99% Reliability",
    subtitle: "Instant help anytime",
    icon: ShieldCheck,
  },
  {
    title: "Dedicated Support",
    subtitle: "Speak with experts",
    icon: Headset,
  },
  {
    title: "Live Chat",
    subtitle: "Instant help anytime",
    icon: MessageSquareText,
  },
];

export default function DomainSupportSection() {
  return (
    <section className="relative overflow-hidden bg-[#07090D] py-16 sm:py-20 lg:py-24">
      <div
        className="pointer-events-none absolute inset-0 opacity-55"
        style={{
          backgroundImage:
            "radial-gradient(circle at 28% 52%, rgba(255,255,255,0.28), transparent 38%), radial-gradient(circle at 72% 52%, rgba(255,255,255,0.22), transparent 38%), linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,0.75))",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "140px 100%",
        }}
        aria-hidden="true"
      />

      <Container className="relative z-10">
        <div className="mx-auto max-w-[1080px]">
          <h2 className="text-center text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-[44px]">
            Built to Power your Online Presence
            <span className="block text-white/90">24/7 Domain Support</span>
          </h2>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-12 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
            {supportCards.map((card) => {
              const Icon = card.icon;
              return (
                <article
                  key={card.title}
                  className="relative overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(120deg,#1E2028,#12141A_52%,#1B1E25)] px-6 py-7 shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
                >
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(255,255,255,0.2),transparent_58%)] opacity-55" />
                  <div className="relative z-10 flex flex-col items-center text-center">
                    <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white/90">
                      <Icon className="h-8 w-8" />
                    </span>
                    <h3 className="mt-4 text-xl font-medium text-white">{card.title}</h3>
                    <p className="mt-1 text-sm text-white/70">{card.subtitle}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </Container>
    </section>
  );
}

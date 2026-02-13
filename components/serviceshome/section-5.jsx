const defaultFaqs = [
  {
    question: "Where is our data centers located ?",
    answer:
      "We operate multiple global regions across North America, Europe, and Asia-Pacific. Specific locations are available in the dashboard once you sign in.",
  },
  {
    question: "How do I get started with AhuraCloud ?",
    answer:
      "Create an account, verify your email, and launch your first service from the dashboard. You can also contact sales for guided onboarding.",
  },
  {
    question: "What payments methods are accepted ?",
    answer:
      "We accept all major credit and debit cards (Visa, Mastercard, Amex), ACH bank transfers for US-based customers, and wire transfers for enterprise accounts. Annual billing with invoicing is available on Pro and Enterprise plans.",
  },
  {
    question: "What databases are supported ?",
    answer:
      "We support PostgreSQL, MySQL, Redis, and MongoDB with managed and self-hosted options depending on your plan.",
  },
  {
    question: "How does Kubernetes work on AhuraSense ?",
    answer:
      "We provide managed Kubernetes clusters with automated upgrades, node scaling, and built-in observability.",
  },
  {
    question: "Do we offer DDoS Protection ?",
    answer:
      "Yes, DDoS protection is included for network-facing services with configurable rules for advanced scenarios.",
  },
  {
    question: "What support options are available ?",
    answer:
      "Support is available via email and chat on all plans, with 24/7 priority support for enterprise customers.",
  },
];

function ServicesHomeSectionFive({ title = "Frequently Asked Questions", faqs = defaultFaqs }) {
  return (
    <section className="relative w-full bg-black px-6 py-14 sm:px-8 lg:px-12 lg:py-20 min-[1920px]:py-24">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col items-center lg:max-w-[1440px] min-[1920px]:max-w-[1800px] min-[1920px]:px-8 min-[2560px]:max-w-[2600px] min-[2560px]:px-10">
        <div className="flex w-full max-w-[820px] flex-col items-center gap-8 lg:max-w-[960px] min-[1920px]:max-w-[1100px] min-[2560px]:max-w-[1320px]">
          <h2
            className="text-center text-[clamp(22px,2.6vw,42px)] font-normal text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.25)]"
            style={{ fontFamily: "Quantico, sans-serif" }}
          >
            {title}
          </h2>

          <div className="flex w-full flex-col gap-4">
            {faqs.map((faq, index) => (
              <div key={index} className="relative">
                <details
                  key={faq.question}
                  className="group w-full overflow-hidden rounded-[6px] border border-white/35 bg-white/10 text-white shadow-[0_14px_34px_rgba(0,0,0,0.4),inset_0_0_18px_rgba(255,255,255,0.08)] backdrop-blur-[10px]"
                >
                  <summary className="flex h-[56px] cursor-pointer list-none items-center justify-between gap-4 px-6 text-[clamp(14px,1.2vw,20px)] font-normal sm:h-[64px] min-[1920px]:h-[76px] min-[2560px]:h-[84px]">
                    <span style={{ fontFamily: "Nunito, sans-serif" }}>
                      {faq.question}
                    </span>
                    <span className="text-xl leading-none text-white/80 group-open:rotate-180 flex items-center">
                      {/* Chevron Down SVG Icon */}
                      <svg width="35" height="35" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6 8L10 12L14 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                  </summary>
                  {/* Divider: more white, slightly more visible but still subtle */}
                  <div className="mx-6 border-t border-white/40" style={{height:'1.5px', opacity:0.7, background:'linear-gradient(90deg,rgba(255,255,255,0.12),rgba(255,255,255,0.32),rgba(255,255,255,0.12))'}} />
                  <p
                    className="px-6 py-3 text-[clamp(12px,1.05vw,18px)] leading-[1.6] text-white/90"
                    style={{ fontFamily: "Nunito, sans-serif" }}
                  >
                    {faq.answer}
                  </p>
                </details>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default ServicesHomeSectionFive;

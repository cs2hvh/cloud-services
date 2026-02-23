"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Container } from "@/components/ui/container";

const defaultFaqs = [
  {
    question: "Where are our data centers located?",
    answer:
      "We operate multiple global regions across North America, Europe, and Asia-Pacific. Specific locations are available in the dashboard once you sign in.",
  },
  {
    question: "How do I get started with AhuraSense?",
    answer:
      "Create an account, verify your email, and launch your first service from the dashboard. You can also contact sales for guided onboarding.",
  },
  {
    question: "What payment methods are accepted?",
    answer:
      "We accept all major credit and debit cards (Visa, Mastercard, Amex), ACH bank transfers for US-based customers, and wire transfers for enterprise accounts. Annual billing with invoicing is available on Pro and Enterprise plans.",
  },
  {
    question: "What databases are supported?",
    answer:
      "We support PostgreSQL, MySQL, Redis, and MongoDB with managed and self-hosted options depending on your plan.",
  },
  {
    question: "How does Kubernetes work on AhuraSense?",
    answer:
      "We provide managed Kubernetes clusters with automated upgrades, node scaling, and built-in observability.",
  },
  {
    question: "Do you offer DDoS Protection?",
    answer:
      "Yes, DDoS protection is included for network-facing services with configurable rules for advanced scenarios.",
  },
  {
    question: "What support options are available?",
    answer:
      "Support is available via email and chat on all plans, with 24/7 priority support for enterprise customers.",
  },
];

function FaqItem({ question, answer, index }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`border border-white/[0.08] transition-colors duration-200 ${
        open ? "bg-white/[0.03]" : "bg-white/[0.01] hover:bg-white/[0.02]"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="cursor-pointer flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
      >
        <div className="flex items-center gap-4">
          <span className="text-[12px] font-medium text-white/15 tabular-nums w-6 shrink-0">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="text-[14px] lg:text-[15px] font-[400] text-white/80">
            {question}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-white/30 shrink-0 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          open ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-6 pb-5 pl-16">
          <div className="border-t border-white/[0.06] pt-4">
            <p className="text-[13px] lg:text-[14px] leading-[1.7] text-white/40">
              {answer}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ServicesHomeSectionFive({ title = "Frequently Asked Questions", faqs = defaultFaqs }) {
  return (
    <section className="relative w-full bg-black py-16 lg:py-24 overflow-hidden">
      {/* Subtle grid background */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent via-50% to-black" />
      </div>

      <Container>
        <div className="max-w-[800px] mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-[400] tracking-tight text-white">
              {title}
            </h2>
            <p className="mt-3 text-sm text-white/35">
              Everything you need to know about our platform and services.
            </p>
          </div>

          {/* FAQ items */}
          <div className="flex flex-col gap-2">
            {faqs.map((faq, index) => (
              <FaqItem
                key={faq.question}
                question={faq.question}
                answer={faq.answer}
                index={index}
              />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

export default ServicesHomeSectionFive;

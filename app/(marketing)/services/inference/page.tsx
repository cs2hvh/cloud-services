import { ServiceHeroSection } from "@/components/services/service-hero-section";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";
import ServicesHomeSectionSix, {
  type UseCase,
} from "@/components/serviceshome/section-6";
import { Bot, Code, FileText, MessageSquare } from "lucide-react";

const InferencePage = () => {
  const cases: UseCase[] = [
    {
      icon: MessageSquare,
      metric: "Chat",
      title: "Conversational interfaces",
      description:
        "Drop-in OpenAI-compatible endpoint for chatbots, support agents, and assistants. Stream from Claude, GPT, Gemini, Llama 4, or DeepSeek with a single key.",
    },
    {
      icon: Bot,
      metric: "Agents",
      title: "Tool-using agents",
      description:
        "Function calling and strict JSON-schema output across every model that supports them. Configure fallback chains so a single 5xx doesn't take your agent down.",
    },
    {
      icon: Code,
      metric: "Copilots",
      title: "Coding copilots and code review",
      description:
        "Codestral, Qwen-Coder, Claude Sonnet, and GPT-5.2 behind one base URL. Run autocomplete, refactor, and review on whichever model best fits the language.",
    },
    {
      icon: FileText,
      metric: "Content",
      title: "Generation and summarization",
      description:
        "Long-context summarization, structured extraction, multilingual generation. Pick the cheapest model that hits your quality bar; switch tiers without rewriting code.",
    },
  ];

  const faqs = [
    {
      question: "Which models can I call through the API?",
      answer:
        "Every Anthropic, OpenAI, Google, Mistral, Meta, DeepSeek, Qwen, and other major-lab model exposed through our gateway — 400+ in total. The catalog refreshes as new models ship; you do not need to rewrite your code to use them.",
    },
    {
      question: "Is the API OpenAI-compatible?",
      answer:
        "Yes. Point the OpenAI SDK at the gateway base URL with your AhuraCloud key and it works unchanged. We also expose an Anthropic-compatible /v1/messages endpoint for code written against Claude SDKs.",
    },
    {
      question: "How is billing handled?",
      answer:
        "Pass-through pricing at the published rate of each upstream model — no markup on inference. Usage is metered per request and deducted from your AhuraCloud credit balance. Bring your own provider key (BYOK) and we don't bill at all for those calls.",
    },
    {
      question: "What rate limits apply to a new API key?",
      answer:
        "60 requests per minute by default, with per-key budget caps you set. Raise limits in the dashboard at any time — there are no hard ceilings on paid accounts beyond what the upstream provider enforces.",
    },
    {
      question: "Does it support streaming, function calling, and vision?",
      answer:
        "Yes for every model that supports them upstream. The catalog page exposes capability flags per model (vision, tools, JSON mode, context window) so you can pick the right one programmatically.",
    },
    {
      question: "Is my prompt data retained?",
      answer:
        "Off by default for paid keys with the zero-data-retention flag enabled. With ZDR on, prompts and completions are never logged; only metadata required for billing (token counts, latency, model, status) is retained.",
    },
  ];

  return (
    <main className="bg-[#0E0F0F]">
      <ServiceHeroSection
        badge="Inference"
        title="Every AI model. One API."
        description="OpenAI-compatible inference for 400+ frontier and open-source models. Pass-through pricing, single bill, streaming and tool calling on every model that supports them."
        primaryAction={{ label: "Get an API key", href: "/signup" }}
        secondaryAction={{ label: "View Documentation", href: "/docs" }}
        backgroundImage={{ src: "/images/hero/service-hero-bg.png", alt: "" }}
        illustration={{
          src: "/images/main-page/gpu.png",
          alt: "Inference infrastructure",
        }}
      />
      <ServicesHomeSectionFive title="Frequently asked questions" faqs={faqs} />
      <ServicesHomeSectionSix
        cases={cases}
        eyebrow="Use cases"
        heading="Built for the apps you"
        headingAccent="actually ship."
        subtitle="Four workloads our customers ship every day — same endpoint, same key, every model."
      />
    </main>
  );
};

export default InferencePage;

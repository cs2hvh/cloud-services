import InferenceHeroSection from "@/components/services/inference-hero-section";
import InferenceModelsSection from "@/components/services/inference-models-section";
import InferencePrivateHostingSection from "@/components/services/inference-private-hosting-section";
import InferenceFeaturesSection from "@/components/services/inference-features-section";
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
        "Drop-in OpenAI-compatible endpoint for chatbots, support assistants, and product copilots. Stream from Claude, GPT-4o, Gemini, Llama 4, or DeepSeek with a single API key.",
    },
    {
      icon: Bot,
      metric: "Agents",
      title: "Tool-using agents",
      description:
        "Function calling and strict JSON-schema output on every model that supports them. Routing presets give you fallback chains so a single upstream 5xx doesn't take your agent down.",
    },
    {
      icon: Code,
      metric: "Copilots",
      title: "Coding copilots and code review",
      description:
        "Codestral, DeepSeek-Coder, Qwen-Coder, Claude 4.5 Sonnet, GPT-4o — behind one base URL. Run autocomplete on the cheap fast model, review on the smart model, switch without rewriting.",
    },
    {
      icon: FileText,
      metric: "Content",
      title: "Generation and summarization",
      description:
        "Long-context summarization, structured extraction, multilingual generation. Use the Batches API for offline workloads at a 50% discount; tune the semantic cache for high-traffic Q&A.",
    },
  ];

  const faqs = [
    {
      question: "Which models can I call through the API?",
      answer:
        "50+ models across 12 providers: OpenAI (gpt-4o, o1, o3), Anthropic (Claude 4.7 Opus, 4.5 Sonnet), Google (Gemini 2.5), Meta (Llama 4 Scout / Maverick), Mistral, DeepSeek, Qwen, Cohere, xAI, Perplexity, Together, Fireworks. The catalog refreshes as new models ship — your code doesn't have to change.",
    },
    {
      question: "Is the API OpenAI-compatible?",
      answer:
        "Yes. Point the OpenAI SDK at our base URL with your AhuraCloud key and it works unchanged. We also expose an Anthropic-compatible /v1/messages endpoint that translates internally so your existing Anthropic SDK code works as-is.",
    },
    {
      question: "How does billing work?",
      answer:
        "Pass-through pricing at the published rate of each upstream model — zero markup on inference. Usage is metered per request and deducted from your AhuraCloud credit balance. Bring your own provider key (BYOK) and the upstream call bills to your account instead of ours. Off-peak discounts apply automatically when in window.",
    },
    {
      question: "What rate limits and caps are available?",
      answer:
        "Per-API-key rate limit (1–10,000 RPM, default 600 RPM). Per-key monthly hard cap (returns 402 when reached). Org-level monthly hard cap stacked on top — whichever is more restrictive wins. Automatic alerts at 80% / 90% / 100%. All configurable from the dashboard.",
    },
    {
      question: "Does it support streaming, function calling, and vision?",
      answer:
        "Yes on every model that supports them upstream. The catalog page surfaces capability flags per model (streaming / tools / JSON mode / vision / thinking / context window) so you can pick the right one programmatically. Multi-modal content (images) flows through the OpenAI multi-modal message format on supported models.",
    },
    {
      question: "Is my prompt data retained?",
      answer:
        "Off by default. Enable Zero Data Retention (ZDR) per API key and prompts + completions are never logged anywhere — caches skip the request entirely, only billing metadata (token counts, latency, model, status) is retained. ZDR keys are mutually exclusive with semantic cache (which would need to store embeddings).",
    },
    {
      question: "How do I cut cost on duplicate prompts?",
      answer:
        "Two layers of cache. L1 is exact-match — same prompt, same model, same temperature → free cached response (5-min TTL by default). Semantic cache (opt-in per key) embeds your prompt and returns a cached response on near-duplicates within a tunable cosine similarity threshold. Per-key + per-org cache hit rate visible in the dashboard.",
    },
    {
      question: "Where does inference traffic flow?",
      answer:
        "Edge gateway runs on Cloudflare Workers (200+ PoPs). TLS 1.3 terminated at the edge. Customer prompts proxy to the chosen upstream model provider and back. With BYOK, we hold the encrypted provider key (AES-256-GCM); decryption happens at the edge per request and the plaintext never crosses our control-plane boundary.",
    },
  ];

  return (
    <main className="bg-[#0E0F0F]">
      <InferenceHeroSection
        primaryAction={{ label: "Create API key", href: "/signup" }}
        secondaryAction={{ label: "View documentation", href: "/api-docs" }}
      />
      <InferenceModelsSection />
      <InferencePrivateHostingSection />
      <InferenceFeaturesSection />
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

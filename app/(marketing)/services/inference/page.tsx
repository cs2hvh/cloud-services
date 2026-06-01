import InferenceHeroSection from "@/components/services/inference-hero-section";
import InferenceModelsSection from "@/components/services/inference-models-section";
import InferencePrivateHostingSection from "@/components/services/inference-private-hosting-section";
import InferenceFeaturesSection from "@/components/services/inference-features-section";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";

const InferencePage = () => {
  const faqs = [
    {
      question: "Which models can I call?",
      answer:
        "50+ models across 12 providers — OpenAI, Anthropic, Google, Meta, Mistral, DeepSeek, Qwen, Cohere, and more. The catalog refreshes as new models ship; your code doesn't change.",
    },
    {
      question: "Is the API OpenAI-compatible?",
      answer:
        "Yes. Point the OpenAI SDK at our base URL and it works unchanged. An Anthropic-compatible /v1/messages endpoint is also available for existing Anthropic SDK code.",
    },
    {
      question: "How does billing work?",
      answer:
        "Pass-through pricing at each model's published rate — zero markup. Metered per request against your credit balance. With BYOK, the upstream call bills to your account instead. Off-peak discounts apply automatically.",
    },
    {
      question: "What rate limits and caps are available?",
      answer:
        "Per-key rate limits (1–10,000 RPM) and per-key plus org-level monthly hard caps — the tightest wins, returning 402 when reached. Alerts at 80 / 90 / 100%. All configurable in the dashboard.",
    },
    {
      question: "Streaming, function calling, and vision?",
      answer:
        "Supported on every model that supports them upstream. The catalog exposes per-model capability flags (streaming, tools, JSON mode, vision, context window) so you can select programmatically.",
    },
    {
      question: "Is my prompt data retained?",
      answer:
        "Enable Zero Data Retention per key and prompts and completions are never logged — only billing metadata (tokens, latency, model, status). ZDR keys bypass the semantic cache.",
    },
    {
      question: "How do I cut cost on duplicate prompts?",
      answer:
        "Two cache layers. Exact-match returns free cached responses (5-min TTL). Semantic cache (opt-in per key) matches near-duplicates within a tunable cosine threshold. Hit rate is visible per key and per org.",
    },
    {
      question: "Where does inference traffic flow?",
      answer:
        "An edge gateway across 200+ regions, TLS 1.3 terminated at the edge. With BYOK, the provider key is held encrypted (AES-256-GCM) and decrypted per request at the edge — plaintext never crosses the control-plane boundary.",
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
    </main>
  );
};

export default InferencePage;

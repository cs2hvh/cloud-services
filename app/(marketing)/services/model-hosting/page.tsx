import ModelHostingHeroSection from "@/components/services/model-hosting-hero-section";
import ModelHostingFormatsSection from "@/components/services/model-hosting-formats-section";
import ModelHostingLifecycleSection from "@/components/services/model-hosting-lifecycle-section";
import ModelHostingGpuSection from "@/components/services/model-hosting-gpu-section";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";

const ModelHostingPage = () => {
  const faqs = [
    {
      question: "What source formats do you accept?",
      answer:
        "Docker images (any HTTP server, any port) and HuggingFace model ids (provisioned on a pre-built vLLM worker) are live end-to-end. Truss source builds are in early access — open a ticket if you'd like the flag flipped on your org.",
    },
    {
      question: "Which GPUs are available?",
      answer:
        "A40 (48GB), L40S (48GB), A100 80GB, and H100 80GB at per-second metered pricing. You pick the SKU at deploy time and set min/max worker bounds. Multi-GPU and B200 / MI300X land as customer demand justifies — typically days to plumb, not quarters.",
    },
    {
      question: "How does autoscale work?",
      answer:
        "Scale-to-zero by default with a configurable idle window (default 5 minutes). Min workers > 0 keeps the model always-warm for sustained traffic. Burst-scale to your configured max matches incoming load in seconds; cold start is under one second for warm images.",
    },
    {
      question: "How am I billed?",
      answer:
        "Per GPU-second of active serving on the SKU you picked, plus a small per-request platform fee covering the gateway, routing, observability, and the autoscaler. Image and weight storage is per-GB-month. Scaled-to-zero workers cost nothing.",
    },
    {
      question: "Can I attach a deployed model to RAG or fine-tuning?",
      answer:
        "Yes. The model id behaves identically to any other model in your catalog — point /v1/chat/completions or a vector collection's embedding_model_id at it. One key, one bill, end-to-end.",
    },
    {
      question: "Are gated HuggingFace repos supported?",
      answer:
        "Yes. Add your HuggingFace token via the dashboard — we store it AES-256-GCM encrypted at rest, decrypted only inside the worker at boot. Token never travels to your application.",
    },
    {
      question: "Is the endpoint OpenAI-compatible?",
      answer:
        "Yes for vLLM-backed deployments (HuggingFace source is automatically OpenAI-compatible). Docker-source deployments expose whatever your container does — point your SDK at the model id and POST whatever the container expects.",
    },
    {
      question: "What about tenant isolation and private models?",
      answer:
        "Every deployment is scoped to your org. Workers are dedicated — never shared with another tenant. The image and weights live in your tenant's storage; the gateway authenticates every call against an org-scoped API key with optional per-key rate limits and spend caps.",
    },
  ];

  return (
    <main className="bg-[#0E0F0F]">
      <ModelHostingHeroSection
        primaryAction={{ label: "Deploy a model", href: "/signup" }}
        secondaryAction={{ label: "View documentation", href: "/api-docs" }}
      />
      <ModelHostingFormatsSection />
      <ModelHostingLifecycleSection />
      <ModelHostingGpuSection />
      <ServicesHomeSectionFive title="Frequently asked questions" faqs={faqs} />
    </main>
  );
};

export default ModelHostingPage;

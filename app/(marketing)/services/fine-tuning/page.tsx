import { ServiceHeroSection } from "@/components/services/service-hero-section";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";
import ServicesHomeSectionSix, {
  type UseCase,
} from "@/components/serviceshome/section-6";
import { Briefcase, Filter, Languages, Wand2 } from "lucide-react";

const FineTuningPage = () => {
  const cases: UseCase[] = [
    {
      icon: Briefcase,
      metric: "Domain",
      title: "Domain-specific assistants",
      description:
        "Train a LoRA on your internal docs, tickets, or codebase. The adapter ships as a private model ID alongside the base — no rewriting, no separate endpoint.",
    },
    {
      icon: Wand2,
      metric: "Style",
      title: "Tone and brand voice",
      description:
        "Fine-tune for a consistent voice across customer-facing copy. Smaller, cheaper base models hit the quality of much larger ones once they've learned your style.",
    },
    {
      icon: Filter,
      metric: "Structure",
      title: "Structured output and extraction",
      description:
        "Teach a model your exact JSON schema, field-by-field. Less prompt engineering, less retry logic, fewer tokens spent — pure cost reduction at scale.",
    },
    {
      icon: Languages,
      metric: "Multilingual",
      title: "Underserved languages and dialects",
      description:
        "Adapt an open base model to languages, scripts, or dialects the frontier labs underweight. Own the weights, host them with us, swap base anytime.",
    },
  ];

  const faqs = [
    {
      question: "Which base models support fine-tuning?",
      answer:
        "Open-weight bases including Llama 4 Scout, Llama 4 Maverick, DeepSeek V3, Qwen 3, Mistral, and Phi-4. Each ships with a recommended preset; we add bases as new strong open models release.",
    },
    {
      question: "How long does a typical training run take?",
      answer:
        "LoRA on a small dataset (under 10k examples) finishes in 30 minutes to 2 hours on an H100. Larger jobs or qLoRA on bigger bases run multi-hour. You see live cost and ETA in the dashboard.",
    },
    {
      question: "What dataset format do you accept?",
      answer:
        "JSONL with role/content messages — the OpenAI fine-tuning format. Upload to your AhuraCloud object storage, point the job at the file, train. We also accept HF dataset URLs.",
    },
    {
      question: "Where does the trained adapter live?",
      answer:
        "Pushed to your AhuraCloud object storage and registered as a new model ID in your inference catalog — instantly callable from the same /v1/chat/completions endpoint as the base model.",
    },
    {
      question: "What does training cost?",
      answer:
        "Per-GPU-hour billing on the RunPod tier used. No platform markup; you see the exact GPU rate before the job starts. Hosting the resulting adapter for inference is per-second of active GPU only.",
    },
  ];

  return (
    <main className="bg-[#0E0F0F]">
      <ServiceHeroSection
        badge="Fine-Tuning"
        title="Train a LoRA. Get an endpoint."
        description="Train custom adapters on Llama, DeepSeek, Qwen, Mistral, and Phi base models. The output auto-registers as a private model in your inference catalog — call it from the same API the next minute."
        primaryAction={{ label: "Start a training job", href: "/signup" }}
        secondaryAction={{ label: "View Documentation", href: "/docs" }}
        backgroundImage={{ src: "/images/hero/service-hero-bg.png", alt: "" }}
        illustration={{
          src: "/images/main-page/gpu.png",
          alt: "Fine-tuning infrastructure",
        }}
      />
      <ServicesHomeSectionFive title="Frequently asked questions" faqs={faqs} />
      <ServicesHomeSectionSix
        cases={cases}
        eyebrow="Use cases"
        heading="Adapters that pay for"
        headingAccent="themselves quickly."
        subtitle="Four workloads where a small LoRA beats a much larger general model — on quality, cost, and latency."
      />
    </main>
  );
};

export default FineTuningPage;

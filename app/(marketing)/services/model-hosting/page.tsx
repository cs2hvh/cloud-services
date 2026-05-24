import { ServiceHeroSection } from "@/components/services/service-hero-section";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";
import ServicesHomeSectionSix, {
  type UseCase,
} from "@/components/serviceshome/section-6";
import { Container, Cpu, GitFork, Layers } from "lucide-react";

const ModelHostingPage = () => {
  const cases: UseCase[] = [
    {
      icon: GitFork,
      metric: "Custom",
      title: "Bring your own weights",
      description:
        "Upload a Truss, a Docker image, or a Hugging Face repo. We build, deploy, and expose it as a serverless endpoint in the same /v1 catalog as everything else.",
    },
    {
      icon: Layers,
      metric: "Fine-tuned",
      title: "Host adapters from anywhere",
      description:
        "Already trained a LoRA on someone else's platform? Push the artifact, attach it to a base, get an endpoint. Pay only for the seconds the GPU is warm.",
    },
    {
      icon: Cpu,
      metric: "Specialized",
      title: "Specialized inference servers",
      description:
        "vLLM, SGLang, Triton, custom Python — any container with an HTTP server runs. Pin to specific GPU SKUs (A100, H100, L40S) and autoscale by traffic.",
    },
    {
      icon: Container,
      metric: "Internal",
      title: "Private models for internal use",
      description:
        "Models trained on confidential data that you cannot ship to a frontier provider. Hosted on your AhuraCloud tenant, accessed via the same SDK as public models.",
    },
  ];

  const faqs = [
    {
      question: "What deployment formats do you accept?",
      answer:
        "Truss configurations, raw Dockerfiles, and Hugging Face model repos with a serving config. The build runs in our pipeline, the resulting image runs on RunPod serverless workers, and you get a stable model ID.",
    },
    {
      question: "Which GPUs are available?",
      answer:
        "L40S, A100, A40, and H100 across our RunPod fleet. You pick the SKU at deploy time and set min/max worker counts. Cold-start is typically under one second for warm images.",
    },
    {
      question: "How does autoscale work?",
      answer:
        "Scale-to-zero by default, with a configurable idle timeout. Min workers > 0 keeps the model always-warm (cheaper than scale-to-zero at sustained load). Burst scaling matches incoming traffic in seconds.",
    },
    {
      question: "How am I billed?",
      answer:
        "Per GPU-second of active serving plus a small platform fee per request. Storage of the image and weights is per GB-month. No charge for idle workers when scaled to zero.",
    },
    {
      question: "Can I attach a deployed model to my fine-tunes or RAG pipeline?",
      answer:
        "Yes. The model ID works identically to any other model in your catalog — point your /v1/chat/completions or vector collection embedding_model at it.",
    },
  ];

  return (
    <main className="bg-[#0E0F0F]">
      <ServiceHeroSection
        badge="Model Hosting"
        title="Bring your weights. Get a serverless endpoint."
        description="Deploy any container, Truss, or Hugging Face model to autoscaling GPU workers. Pay per second of compute, with cold starts under a second and the same API surface as our hosted models."
        primaryAction={{ label: "Deploy a model", href: "/signup" }}
        secondaryAction={{ label: "View Documentation", href: "/docs" }}
        backgroundImage={{ src: "/images/hero/service-hero-bg.png", alt: "" }}
        illustration={{
          src: "/images/main-page/gpu.png",
          alt: "Model hosting infrastructure",
        }}
      />
      <ServicesHomeSectionFive title="Frequently asked questions" faqs={faqs} />
      <ServicesHomeSectionSix
        cases={cases}
        eyebrow="Use cases"
        heading="The weights are yours. The infra"
        headingAccent="is on us."
        subtitle="Four ways teams ship custom models without managing GPU clusters, queues, or autoscalers."
      />
    </main>
  );
};

export default ModelHostingPage;

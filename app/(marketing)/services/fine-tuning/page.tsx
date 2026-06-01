import FineTuningHeroSection from "@/components/services/fine-tuning-hero-section";
import FineTuningPipelineSection from "@/components/services/fine-tuning-pipeline-section";
import FineTuningBasesSection from "@/components/services/fine-tuning-bases-section";
import FineTuningServingSection from "@/components/services/fine-tuning-serving-section";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";

const FineTuningPage = () => {
  const faqs = [
    {
      question: "Which base models can I fine-tune?",
      answer:
        "Frontier open-weight families: Microsoft Phi (4), Meta Llama (3.3, Llama 4 Scout, Llama 4 Maverick), DeepSeek (V3, Coder-V3), Qwen (3, Coder), Mistral (7B Instruct), Google Gemma (3-27B-IT). Five are HF-gated and need your HuggingFace token — stored encrypted at rest. New bases land in the catalog as the families ship them; no code change on your end.",
    },
    {
      question: "What dataset format do you accept?",
      answer:
        "JSONL where each line is a chat turn: {\"messages\": [{\"role\": \"user\", \"content\": \"...\"}, {\"role\": \"assistant\", \"content\": \"...\"}]}. File cap 200MB. We validate at submit time — bad rows surface in the error banner before you spend GPU minutes. Pre-flight also shows approximate token count + cost preview.",
    },
    {
      question: "How long does a run take?",
      answer:
        "Depends on base size + dataset size. A Phi-4 LoRA on a moderate dataset (~10k rows) finishes in 7-10 minutes on an A40 (~$0.10 total). A Llama-4-Scout LoRA on the same dataset finishes in ~25 minutes on an A100 80GB. The dashboard shows live step / epoch / loss; the eval gate runs automatically at the end and auto-rejects diverged adapters.",
    },
    {
      question: "What's the eval gate?",
      answer:
        "Before we register your adapter as a callable model, we compute final-loss against a baseline and reject the adapter if it diverged (final_loss > baseline × 1.1). Stops bad runs from polluting your catalog. The dashboard surfaces the comparison so you can decide whether to re-run with different hyperparameters.",
    },
    {
      question: "How do I serve the trained adapter?",
      answer:
        "Two paths. (1) Self-serve docker: we mint a 6-hour signed URL for adapter.tar.gz + a ready-to-paste docker run command. Paste it on any GPU pod you control; vLLM launches with --enable-lora on port 8000, OpenAI-compatible. (2) Managed hosted serving: one click in the dashboard, we provision a dedicated GPU instance per customer, route via the same gateway as the rest of inference. Per-second billing, auto-stops on idle. Same adapter, both paths.",
    },
    {
      question: "Can I customize the hyperparameters?",
      answer:
        "Yes. Defaults are sensible (LoRA r=8, alpha=16, learning_rate=2e-4, epochs=3) but every parameter is exposed in the create dialog — rank, alpha, dropout, learning rate, batch size, epochs, warmup, scheduler. Power-users can also override anything the underlying axolotl config supports via a JSON override field.",
    },
    {
      question: "What does it cost?",
      answer:
        "Per-second GPU billing on the SKU you pick. Typical runs: Phi-4 on A40 ~$0.10 per run; Llama-3.3-8B on A40 ~$0.20; Llama-4-Scout on A100 80GB ~$0.80; Llama-4-Maverick on H100 80GB ~$3-5. The dashboard shows a cost preview before submit so there are no surprises. Hosted serving is billed separately per-hour for as long as the pod is running.",
    },
    {
      question: "Is my training data retained?",
      answer:
        "We fetch your dataset once at job start, then discard. Hyperparameters and sample generations are kept on the FT row for your reference but stay org-scoped via RLS. Customer-supplied content is never used for any other purpose — no model training, no analytics, no internal eval. Delete the FT row and the trained adapter goes with it.",
    },
  ];

  return (
    <main className="bg-[#0E0F0F]">
      <FineTuningHeroSection
        primaryAction={{ label: "Start a fine-tune", href: "/signup" }}
        secondaryAction={{ label: "View documentation", href: "/api-docs" }}
      />
      <FineTuningPipelineSection />
      <FineTuningBasesSection />
      <FineTuningServingSection />
      <ServicesHomeSectionFive title="Frequently asked questions" faqs={faqs} />
    </main>
  );
};

export default FineTuningPage;

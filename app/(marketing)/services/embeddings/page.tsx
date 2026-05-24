import { ServiceHeroSection } from "@/components/services/service-hero-section";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";
import ServicesHomeSectionSix, {
  type UseCase,
} from "@/components/serviceshome/section-6";
import { Library, Search, ShieldCheck, Sparkles } from "lucide-react";

const EmbeddingsPage = () => {
  const cases: UseCase[] = [
    {
      icon: Search,
      metric: "Search",
      title: "Semantic search across your corpus",
      description:
        "Index documentation, tickets, transcripts, and code. Query in natural language; get ranked passages with sub-100 ms response on collections up to 50 million vectors.",
    },
    {
      icon: Library,
      metric: "RAG",
      title: "Retrieval-augmented generation",
      description:
        "The other half of a RAG pipeline — pair our embedding endpoint with any inference model. One key, one bill, retrieval that stays in your tenant.",
    },
    {
      icon: Sparkles,
      metric: "Recsys",
      title: "Recommendations and similarity",
      description:
        "Item-to-item similarity, user-to-item retrieval, content-based recommendations. Vector math the way the frontier labs ship it, on your data.",
    },
    {
      icon: ShieldCheck,
      metric: "Classification",
      title: "Zero-shot classification and routing",
      description:
        "Route customer messages, label documents, detect intent — using embeddings instead of training a classifier. Hot-swap labels without redeploying.",
    },
  ];

  const faqs = [
    {
      question: "Which embedding models are available?",
      answer:
        "Top open and closed embedding models including BGE-M3, Qwen3-Embedding, Voyage, Cohere, and OpenAI text-embedding-3. Pick by language, dimension, and price; switch models with a single config change.",
    },
    {
      question: "Is the vector store managed?",
      answer:
        "Yes. Create a collection, choose dimensions and distance metric, upsert vectors via the API. We run pgvector under the hood with per-tenant isolation, dedicated read replicas for query, and online index rebuilds.",
    },
    {
      question: "What's the largest collection you support?",
      answer:
        "Hundreds of millions of vectors per collection on shared infrastructure. Dedicated clusters available for billions. Query latency stays sub-100 ms on properly-indexed collections.",
    },
    {
      question: "How is it billed?",
      answer:
        "Embedding calls are billed per token at the upstream model's published rate. Vector storage is per GB-month, queries are per million requests. No platform markup on the embedding call itself.",
    },
    {
      question: "Can I use my own embedding model?",
      answer:
        "Yes — deploy via our Model Hosting product and reference it as the collection's embedding model. The store is model-agnostic; it only needs to know the dimension.",
    },
  ];

  return (
    <main className="bg-[#0E0F0F]">
      <ServiceHeroSection
        badge="Embeddings & Vector"
        title="Embeddings, vector storage, retrieval."
        description="Hosted embedding endpoints and managed vector collections. Build retrieval and RAG in minutes, scale to billions of vectors, keep everything inside your AhuraCloud tenant."
        primaryAction={{ label: "Create a collection", href: "/signup" }}
        secondaryAction={{ label: "View Documentation", href: "/docs" }}
        backgroundImage={{ src: "/images/hero/service-hero-bg.png", alt: "" }}
        illustration={{
          src: "/images/main-page/gpu.png",
          alt: "Embeddings infrastructure",
        }}
      />
      <ServicesHomeSectionFive title="Frequently asked questions" faqs={faqs} />
      <ServicesHomeSectionSix
        cases={cases}
        eyebrow="Use cases"
        heading="Retrieval that lives next to"
        headingAccent="your inference."
        subtitle="Four workloads where embeddings plus the right vector store unlock results a single LLM call cannot."
      />
    </main>
  );
};

export default EmbeddingsPage;

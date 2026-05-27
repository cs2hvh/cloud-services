import EmbeddingsHeroSection from "@/components/services/embeddings-hero-section";
import EmbeddingsModelsSection from "@/components/services/embeddings-models-section";
import EmbeddingsRagSection from "@/components/services/embeddings-rag-section";
import EmbeddingsVectorStoreSection from "@/components/services/embeddings-vector-store-section";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";

const EmbeddingsPage = () => {
  const faqs = [
    {
      question: "Which embedding models are available?",
      answer:
        "OpenAI text-embedding-3-large (3072d) and -small (1536d) for general-purpose accuracy; ada-002 (1536d) for legacy compatibility; BAAI BGE-M3 (1024d) for multilingual at a tenth of the price; Voyage voyage-3-large (1024d, 32k context) for long-document retrieval; Cohere embed-multilingual-v3 (1024d) for cross-lingual ranking. Hot-swap with one config change.",
    },
    {
      question: "Is the vector store managed?",
      answer:
        "Yes. Create a collection, choose dimensions and distance metric (cosine, L2, inner product), upsert vectors via the API. We run pgvector under the hood with per-tenant isolation via row-level security, dedicated read replicas for query traffic, and online index rebuilds — no maintenance windows.",
    },
    {
      question: "What's the largest collection you support?",
      answer:
        "Hundreds of millions of vectors per collection on shared infrastructure with p95 query latency under 100 ms. Dedicated clusters available for billions of vectors. Indexes: IVFFlat for cheap scans, HNSW for tight latency — picked per collection.",
    },
    {
      question: "Can I filter retrieval by metadata?",
      answer:
        "Yes. Pass JSON metadata predicates alongside the query — they're evaluated inside the ANN search, not as a post-filter. Supports equality, $gt / $gte / $lt / $lte, $in, and boolean combinators. Index your hot filter fields for the cleanest latency.",
    },
    {
      question: "How is it billed?",
      answer:
        "Embedding calls are pass-through at the upstream model's per-token rate — zero platform markup. Vector storage is per-GB-month. Query traffic is per million requests. Everything reconciled on the same invoice as inference and fine-tuning.",
    },
    {
      question: "Can I bring my own embedding model?",
      answer:
        "Yes — deploy via our Model Hosting product, then reference it as the collection's embedding model. The store is model-agnostic; it only needs to know the dimension and metric. Same vector math, your weights.",
    },
    {
      question: "How is tenant isolation enforced?",
      answer:
        "Postgres row-level security on every table. Queries made with a key in org A cannot read vectors in org B — enforced by the database, not by app code. Every write is audit-logged; soft-deletes are recoverable.",
    },
    {
      question: "Do you support hybrid (dense + sparse) retrieval?",
      answer:
        "BGE-M3 emits dense + sparse vectors in one call; we store both and rank with a configurable mix. Other models are dense-only. Reranking with a second-stage cross-encoder is on the roadmap and tracked publicly.",
    },
  ];

  return (
    <main className="bg-[#0E0F0F]">
      <EmbeddingsHeroSection
        primaryAction={{ label: "Create a collection", href: "/signup" }}
        secondaryAction={{ label: "View documentation", href: "/api-docs" }}
      />
      <EmbeddingsRagSection />
      <EmbeddingsModelsSection />
      <EmbeddingsVectorStoreSection />
      <ServicesHomeSectionFive title="Frequently asked questions" faqs={faqs} />
    </main>
  );
};

export default EmbeddingsPage;

import UseCasesHeroSection from "@/components/services/use-cases-hero-section";
import UseCasesChatbotsSection from "@/components/services/use-cases-chatbots-section";
import UseCasesRagSection from "@/components/services/use-cases-rag-section";
import UseCasesCodegenSection from "@/components/services/use-cases-codegen-section";
import UseCasesDocsSection from "@/components/services/use-cases-docs-section";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";

const AiUseCasesPage = () => {
  const faqs = [
    {
      question: "Can I combine multiple use cases in one project?",
      answer:
        "Yes. All four patterns use the same API key and billing account. A single project can embed documents for RAG, run a chatbot with tool calling, generate code, and extract structured data from uploads — same SDK, same bill.",
    },
    {
      question: "Which models work best for each use case?",
      answer:
        "Chatbots: GPT-4o-mini or Llama-3.3-8B for cost-efficient streaming. RAG: pair any chat model with text-embedding-3-small for retrieval. Code: DeepSeek-Coder-V3 or Codestral for completion and refactoring. Document Intelligence: GPT-4o for long-context extraction with JSON mode. All models are available through the same /v1 endpoint.",
    },
    {
      question: "How do I add memory to a chatbot?",
      answer:
        "Pass the conversation history in the messages array — the model is stateless, your application owns the memory. For long-running sessions, summarize older messages or store them in a vector collection and retrieve relevant context per turn.",
    },
    {
      question: "What's the maximum document size for extraction?",
      answer:
        "Depends on the model's context window. GPT-4o supports 128k tokens (~300 pages). For larger documents, chunk them and process in parallel using the batch endpoint — structured JSON output from each chunk, then merge.",
    },
    {
      question: "Is function calling / tool use available on open-source models?",
      answer:
        "Yes. Llama-3.3, DeepSeek-V3, and Qwen-3 all support the OpenAI-compatible tools parameter. The gateway normalizes tool call formatting across providers so your code doesn't change when you switch models.",
    },
    {
      question: "How does billing work across use cases?",
      answer:
        "Per-token on every model call (input + output tokens), per-token on embedding calls, per-GB-month on vector storage, per-million on vector queries. Zero markup on model calls. One invoice, one dashboard, all use cases.",
    },
  ];

  return (
    <main>
      <UseCasesHeroSection />
      <UseCasesChatbotsSection />
      <UseCasesRagSection />
      <UseCasesCodegenSection />
      <UseCasesDocsSection />
      <div className="bg-[#0E0F0F]">
        <ServicesHomeSectionFive title="Frequently asked questions" faqs={faqs} />
      </div>
    </main>
  );
};

export default AiUseCasesPage;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://ahuracloud.com");

export const siteConfig = {
  name: "AhuraSense Cloud",
  title: "AhuraSense Cloud — AI & Cloud Infrastructure Platform",
  description:
    "Run serverless AI inference, fine-tune and deploy open & frontier models, and build AI agents with RAG and vector search — on on-demand GPUs, alongside VMs, Kubernetes, and managed databases across 12 global regions. Enterprise-grade, per-token billing, 99.99% uptime SLA.",
  url: SITE_URL,
  ogImage: `${SITE_URL}/images/main-page/home-section-1.png`,
  keywords: [
    "AI platform",
    "serverless AI inference",
    "LLM API",
    "model fine-tuning",
    "model deployment",
    "AI agents",
    "RAG",
    "vector database",
    "GPU cloud",
    "GPU instances",
    "cloud infrastructure",
    "virtual machines",
    "Kubernetes",
    "managed database",
    "object storage",
    "DDoS protection",
    "VPS hosting",
    "bare metal servers",
    "AhuraSense",
    "AhuraCloud",
  ],
  domain: SITE_URL,
  images: {
    logo: "https://samatva.blr1.cdn.digitaloceanspaces.com/images/logo.gif",
    favicon: "https://samatva.blr1.cdn.digitaloceanspaces.com/images/logo.gif",
  },
  social: {
    twitter: "@ahuracloud",
  },
};

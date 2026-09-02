// The fallback is the LIVE domain, and that matters more than it looks.
//
// NEXT_PUBLIC_SITE_URL is not set in production and VERCEL_URL never will be
// (this deploys to a Linode), so the fallback is not a fallback — it is the
// value, on every page. It used to read "https://ahuracloud.com", a domain
// that does not resolve, which put this in the HTML of the live site:
//
//   <link rel="canonical" href="https://ahuracloud.com"/>
//   <meta property="og:image" content="https://ahuracloud.com/images/..."/>
//
// A canonical tag pointing at a dead host tells search engines the real home
// of every page is somewhere unreachable, and every social preview asked a
// dead host for its image. Nothing about that is visible in the product — it
// only shows up in a crawler's index and in link previews.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://ahurasense.com");

export const siteConfig = {
  name: "AhuraSense Cloud",
  title: "AhuraSense Cloud: AI & Cloud Infrastructure Platform",
  description:
    "Run serverless AI inference, fine-tune and deploy open & frontier models, and build AI agents with RAG and vector search, on on-demand GPUs, alongside VMs, Kubernetes, and managed databases across 15 global regions. Enterprise-grade, per-token billing, 99.99% uptime SLA.",
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

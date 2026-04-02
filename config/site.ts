const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://ahuracloud.com");

export const siteConfig = {
  name: "AhuraSense Cloud",
  title: "AhuraSense Cloud — Cloud Infrastructure Platform",
  description:
    "Deploy virtual machines, Kubernetes clusters, managed databases, GPU instances, and AI agents across 12 global regions. Enterprise-grade cloud infrastructure with 99.99% uptime SLA.",
  url: SITE_URL,
  ogImage: `${SITE_URL}/images/main-page/home-section-1.png`,
  keywords: [
    "cloud infrastructure",
    "cloud computing",
    "virtual machines",
    "Kubernetes",
    "managed database",
    "GPU instances",
    "AI agents",
    "DDoS protection",
    "object storage",
    "cloud hosting",
    "VPS hosting",
    "bare metal servers",
    "cloud platform",
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

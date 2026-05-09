import { Container } from "@/components/ui/container";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const PRODUCTS = [
  {
    title: "Compute",
    description: "Virtual machines with flexible configurations and scalable resources for any workload.",
    href: "/services/compute",
    tags: ["VPS", "Dedicated CPU", "Shared CPU", "Cloud Servers"],
  },
  {
    title: "GPU Instances",
    description: "High-performance GPU acceleration for AI/ML training, inference, and rendering workloads.",
    href: "/services/gpu",
    tags: ["NVIDIA", "A100", "H100", "Training", "Inference"],
  },
  {
    title: "Managed Database",
    description: "Fully managed databases with auto-scaling, automated backups, and high availability.",
    href: "/services/database",
    tags: ["PostgreSQL", "MySQL", "MongoDB", "Redis", "Backups"],
  },
  {
    title: "Kubernetes",
    description: "Managed Kubernetes clusters with automatic scaling and seamless updates.",
    href: "/services/kubernetes",
    tags: ["K8s", "Auto-scaling", "Load Balancing", "GitOps"],
  },
  {
    title: "Object Storage",
    description: "S3-compatible object storage with built-in CDN, versioning, and lifecycle management.",
    href: "/services/object-storage",
    tags: ["S3 API", "CDN", "Versioning", "Lifecycle"],
  },
  {
    title: "Security Suite",
    description: "Comprehensive security with DDoS protection, WAF, and advanced firewall capabilities.",
    href: "/services/security",
    tags: ["DDoS", "WAF", "SSL", "Monitoring"],
  },
  {
    title: "Application Deployment",
    description: "CI/CD pipelines and automated container deployment from your Git repositories.",
    href: "/services/app-deployment",
    tags: ["Docker", "CI/CD", "Auto Deploy", "GitHub", "GitLab"],
  },
];

export default function ProductsPage() {
  return (
    <main className="bg-black min-h-screen">
      {/* Hero Section */}
      <section className="relative w-full py-20 sm:py-24 lg:py-32 border-b border-[#737373]">
        <Container>
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-normal tracking-tight leading-tight text-white mb-6">
              Our <span className="text-[#0095FF]">Products</span>
            </h1>
            <p className="text-base sm:text-lg text-white/50 leading-relaxed">
              Powerful cloud infrastructure products designed to scale with your business.
              From compute to storage, databases to Kubernetes—everything you need to build and deploy modern applications.
            </p>
          </div>
        </Container>
      </section>

      {/* Products Grid */}
      <section className="relative w-full py-16 lg:py-24">
        <Container>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {PRODUCTS.map((product) => (
              <Link
                key={product.href}
                href={product.href}
                className="group block border border-[#737373] bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:border-white/20 transition-all duration-200 cursor-pointer"
              >
                <h3 className="text-xl font-semibold text-white mb-3 group-hover:text-[#0095FF] transition-colors duration-200">
                  {product.title}
                </h3>
                <p className="text-sm text-white/50 leading-relaxed mb-4">
                  {product.description}
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {product.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 text-[10px] font-medium text-white/60 border border-white/20 bg-white/[0.02]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 text-[13px] font-medium text-white/60 group-hover:text-[#0095FF] transition-colors duration-200">
                  Learn more
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-200" />
                </div>
              </Link>
            ))}
          </div>
        </Container>
      </section>
    </main>
  );
}

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const PRODUCTS = [
  {
    icon: "/solution/thirdsecion/icon-1.svg",
    title: "Compute",
    subtitle: "General Purpose Droplets",
    description: "Reliable VMs for everyday workloads and quick scaling.",
    href: "/services/compute",
  },
  {
    icon: "/solution/thirdsecion/icon-2.svg",
    title: "GPU Instance",
    subtitle: "Accelerated compute",
    description: "High-performance GPUs for training, inference, rendering and HPC.",
    href: "/services/gpu",
  },
  {
    icon: "/solution/thirdsecion/icon-3.svg",
    title: "Database",
    subtitle: "Managed",
    description: "Fully managed databases with backups, upgrades and monitoring.",
    href: "/services/database",
  },
  {
    icon: "/solution/thirdsecion/icon-4.svg",
    title: "Security",
    subtitle: "Protect apps & data",
    description: "Identity, network and workload controls for secure-by-default cloud.",
    href: "/services/security",
  },
  {
    icon: "/solution/thirdsecion/icon-5.svg",
    title: "Kubernetes",
    subtitle: "Managed",
    description: "Production Kubernetes without the operational overhead.",
    href: "/services/kubernetes",
  },
  {
    icon: "/solution/thirdsecion/icon-6.svg",
    title: "Object Storage",
    subtitle: "S3 Compatible",
    description: "Durable object storage for media, backups, logs and artifacts.",
    href: "/services/object-storage",
  },
  {
    icon: "/solution/thirdsecion/icon-7.svg",
    title: "AI Agents",
    subtitle: "API Based",
    description: "Composable AI agents that connect tools, data and workflows via APIs.",
    href: "/services/app-deployment",
  },
  {
    icon: "/solution/thirdsecion/icon-8.svg",
    title: "Application Deployment",
    subtitle: "Ship faster",
    description: "Build, deploy and scale apps with streamlined release workflows.",
    href: "/services/app-deployment",
  },
];

export function CoreProductsPanel() {
  return (
    <section className="relative isolate overflow-hidden rounded-[4px] bg-[#121212] px-6 py-8 sm:px-8 sm:py-10 lg:px-16 lg:py-12">
      {/* Header */}
      <div className="absolute inset-0 z-[1] bg-[linear-gradient(90deg,rgba(18,18,18,0.18)_0%,rgba(18,18,18,0.08)_44%,rgba(18,18,18,0.16)_100%)]" />

      <div className="relative z-10 grid h-full gap-8 px-5 py-7 sm:px-8 sm:py-10 md:px-12 lg:grid-cols-[minmax(0,682px)_295px] lg:gap-[103px] lg:px-[64px] lg:py-[64px]"></div>
      <div className="mb-8 sm:mb-10 lg:mb-12">
        <h2 className="text-[clamp(2rem,2.5vw,40px)] font-normal leading-tight text-white">
          Core products
        </h2>
        <p className="mt-3 text-[clamp(0.95rem,1.2vw,18px)] font-light leading-relaxed text-white/80">
          Mix-and-match these building blocks to assemble the right solution for
          your workload.
        </p>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {PRODUCTS.map((product, index) => (
          <article key={index} className="flex min-h-[100px] min-w-[228px] flex-col border border-[#F2F2F2]/70 bg-transparent p-5 sm:p-6">
            <div className="flex items-start gap-3 text-white font-bold">
              <Image src={product.icon} alt="" width={41} height={41} />
              <div>
                <h3 className="text-[16px] font-normal leading-[1.2] text-white">
                  {product.title}
                </h3>
                <p className="mt-2 max-w-[430px] text-[12px] font-light leading-[1.3] text-white">
                  {product.description}
                </p>
              </div>
            </div>

            <div className="mt-auto pt-8">
              <div className="h-px w-full bg-[#686868]" />
              <div className="mt-3 flex items-center justify-between">
                <Link
                  href={product.href}
                  className="text-[10px] font-semibold text-white hover:text-white/80 transition-colors inline-flex items-center gap-2"
                >
                  <span>View Solution</span>
                  <ArrowRight className="w-3.5 h-3.5 text-white/70" />
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

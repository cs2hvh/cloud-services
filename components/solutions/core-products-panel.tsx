import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

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
    description:
      "High-performance GPUs for training, inference, rendering and HPC.",
    href: "/services/gpu",
  },
  {
    icon: "/solution/thirdsecion/icon-3.svg",
    title: "Database",
    subtitle: "Managed",
    description:
      "Fully managed databases with backups, upgrades and monitoring.",
    href: "/services/database",
  },
  {
    icon: "/solution/thirdsecion/icon-4.svg",
    title: "Security",
    subtitle: "Protect apps & data",
    description:
      "Identity, network and workload controls for secure-by-default cloud.",
    href: "/services/security",
  },
  {
    icon: "/solution/thirdsecion/icon-5.svg",
    title: "Kubernetes",
    subtitle: "Managed",
    description:
      "Production Kubernetes without the operational overhead.",
    href: "/services/kubernetes",
  },
  {
    icon: "/solution/thirdsecion/icon-6.svg",
    title: "Object Storage",
    subtitle: "S3 Compatible",
    description:
      "Durable object storage for media, backups, logs and artifacts.",
    href: "/services/object-storage",
  },
  {
    icon: "/solution/thirdsecion/icon-7.svg",
    title: "AI Agents",
    subtitle: "API Based",
    description:
      "Composable AI agents that connect tools, data and workflows via APIs.",
    href: "/services/app-deployment",
  },
  {
    icon: "/solution/thirdsecion/icon-8.svg",
    title: "Application Deployment",
    subtitle: "Ship faster",
    description:
      "Build, deploy and scale apps with streamlined release workflows.",
    href: "/services/app-deployment",
  },
];

export function CoreProductsPanel() {
  return (
    <section className="relative isolate w-full overflow-hidden rounded-[4px] border-2 border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.04)] backdrop-blur-[5px] shadow-[0_8px_32px_rgba(0,0,0,0.5)] lg:min-h-[505px]">
      
      <div className="absolute inset-0 z-[1] bg-[linear-gradient(90deg,rgba(18,18,18,0.18)_0%,rgba(18,18,18,0.08)_44%,rgba(18,18,18,0.16)_100%)]" />

      <div className="relative z-10 px-5 py-7 sm:px-8 sm:py-10 lg:px-[69px] lg:pb-[51px] lg:pt-[39px]">
        
        <div className="mb-7 lg:mb-9">
          <h2 className="text-[32px] font-normal leading-[1.21875] text-white">
            Core products
          </h2>
          <p className="mt-3 text-[16px] font-normal leading-[1.375] text-white lg:text-[18px] lg:leading-[1.22]">
            Mix-and-match these building blocks to assemble the right solution
            for your workload.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-[20px] lg:gap-y-[35px]">
          
          {PRODUCTS.map((product) => (
            <article
              key={product.title}
              className="flex min-h-[128px] flex-col border border-[#AEAEAE] px-[10px] pb-[8px] pt-[10px]"
            >
              
              <div className="flex items-start gap-[6px]">
                <Image
                  src={product.icon}
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 object-contain"
                />

                <div className="pt-[5px]">
                  <h3 className="text-[15px] font-bold leading-[1.2] text-white">
                    {product.title}
                  </h3>

                  <p className="mt-[2px] text-[10px] font-normal leading-[1.2] text-[#C9C9C9]">
                    {product.subtitle}
                  </p>
                </div>
              </div>

              <p className="mt-[8px] max-w-[218px] text-[12px] font-normal leading-[1.25] text-[#C9C9C9]">
                {product.description}
              </p>

              <Link
                href={product.href}
                className="mt-auto pt-2 flex items-center gap-1 text-[12px] font-normal leading-[1.2] text-[#C9C9C9] transition-colors hover:text-white"
              >
                Learn more
                <ArrowRight className="w-3 h-3 text-white/70" />
              </Link>

            </article>
          ))}
        </div>

      </div>
    </section>
  );
}
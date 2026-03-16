import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/container";
import { CoreProductsPanel } from "./core-products-panel";

const PANEL_STYLES =
  "relative isolate overflow-hidden rounded-[4px] border-2 border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.04)] backdrop-blur-[5px] shadow-[0_8px_32px_rgba(0,0,0,0.5)]";

type AdvisoryPanelProps = {
  className?: string;
  heightClass?: string;
};

function AdvisoryPanel({
  className,
  heightClass = "h-[353px]",
}: AdvisoryPanelProps) {
  return (
    <section className={cn(PANEL_STYLES, heightClass, "w-full", className)}>
      <div className="absolute inset-0 z-[1] bg-[linear-gradient(90deg,rgba(18,18,18,0.18)_0%,rgba(18,18,18,0.08)_44%,rgba(18,18,18,0.16)_100%)]" />

      <div className="relative z-10 grid h-full gap-8 px-5 py-7 sm:px-8 sm:py-10 md:px-12 lg:grid-cols-[minmax(0,682px)_295px] lg:gap-[103px] lg:px-[64px] lg:py-[64px]">
        <div className="max-w-[682px]">
          <h2 className="text-[clamp(2rem,2.2vw,32px)] font-normal leading-[1.21875] text-white">
            Not Sure which solution fits?
          </h2>

          <p className="mt-5 text-[clamp(1rem,1.5vw,20px)] font-light leading-[1.2] text-white">
            Share your goals: traffic, data size, latency, compliance. We will
            suggest a practical architecture using the right mix of products.
          </p>

          <ul className="mt-5 space-y-0 text-[clamp(1.05rem,1.45vw,20px)] font-light leading-[1.2] text-white">
            <li>• Architecture review</li>
            <li>• Custom quotes</li>
            <li>• Migration support</li>
            <li>• 24/7 expert help</li>
          </ul>
        </div>

        <div className="flex flex-col gap-[30px] lg:pt-[44px]">
          <Link
            href="/signup"
            className="inline-flex h-[59px] w-full max-w-[295px] items-center justify-center bg-[#D9D9D9] px-4 text-center text-[clamp(1.05rem,1.35vw,20px)] font-normal leading-[1.2] text-black"
          >
            Contact Sales
          </Link>
          <Link
            href="/docs"
            className="inline-flex h-[59px] w-full max-w-[295px] items-center justify-center border border-[#AEAEAE] bg-[rgba(0,0,0,0.08)] px-4 text-center text-[clamp(1.05rem,1.35vw,20px)] font-normal leading-[1.2] text-white"
          >
            Request a Demo
          </Link>
        </div>
      </div>
    </section>
  );
}

function SolutionsOverviewPanel() {
  const SOLUTIONS = [
    {
      icon: "/solution/secondsection/AI.svg",
      title: "AI & Machine Learning",
      subtitle: "Train & Deploy Models",
      description: "Accelerated compute and orchestration for training, fine-tuning, and serving.",
      href: "/solutions/ai-ml",
    },
    {
      icon: "/solution/secondsection/Monitor.svg",
      title: "Web Hosting & SaaS",
      subtitle: "Modern Web Apps",
      description: "Reliable compute and managed services for scalable web applications.",
      href: "/solutions/web-hosting",
    },
    {
      icon: "/solution/secondsection/Shopping%20Bag.svg",
      title: "Ecommerce Infrastructure",
      subtitle: "Scalable Storefronts",
      description: "Fast, secure building blocks for high-traffic ecommerce platforms.",
      href: "/solutions/ecommerce",
    },
    {
      icon: "/solution/secondsection/Game%20Controller.svg",
      title: "Game Development & Hosting",
      subtitle: "Low-Latency Servers",
      description: "Scalable backends and storage for multiplayer games and telemetry.",
      href: "/solutions/game-dev",
    },
    {
      icon: "/solution/secondsection/Database.svg",
      title: "Database Applications",
      subtitle: "Data-Heavy Apps",
      description: "Managed databases with secure networking for production workloads.",
      href: "/solutions/database",
    },
    {
      icon: "/solution/secondsection/Protect.svg",
      title: "Enterprise Security",
      subtitle: "Compliance & Governance",
      description: "Identity controls, network segmentation, and defense in depth.",
      href: "/solutions/security",
    },
    {
      icon: "/solution/secondsection/Kubernetes.svg",
      title: "Cloud-Native Kubernetes",
      subtitle: "Microservices Platform",
      description: "Managed Kubernetes with modern delivery practices and consistent environments.",
      href: "/solutions/kubernetes",
    },
    {
      icon: "/solution/secondsection/Stack.svg",
      title: "Storage & Backup",
      subtitle: "Durable Object Storage",
      description: "Store and protect critical data, backups, media, and build artifacts.",
      href: "/solutions/storage",
    },
  ];

  return (
    <section className="relative isolate w-full overflow-hidden rounded-[4px] border-2 border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.04)] backdrop-blur-[5px] shadow-[0_8px_32px_rgba(0,0,0,0.5)] lg:min-h-[505px]">
      
      <div className="absolute inset-0 z-[1] bg-[linear-gradient(90deg,rgba(18,18,18,0.18)_0%,rgba(18,18,18,0.08)_44%,rgba(18,18,18,0.16)_100%)]" />

      <div className="relative z-10 px-5 py-7 sm:px-8 sm:py-10 lg:px-[69px] lg:pb-[51px] lg:pt-[39px]">
        
        <div className="mb-7 lg:mb-9">
          <h2 className="text-[32px] font-normal leading-[1.21875] text-white">
            All Solutions
          </h2>
          <p className="mt-3 text-[16px] font-normal leading-[1.375] text-white lg:text-[18px] lg:leading-[1.22]">
            Purpose-built architectures combining multiple products to solve specific use cases.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-[20px] lg:gap-y-[35px]">
          
          {SOLUTIONS.map((solution) => (
            <article
              key={solution.title}
              className="flex min-h-[128px] flex-col border border-[#AEAEAE] px-[10px] pb-[8px] pt-[10px]"
            >
              
              <div className="flex items-start gap-[6px]">
                <Image
                  src={solution.icon}
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 object-contain"
                />

                <div className="pt-[5px]">
                  <h3 className="text-[15px] font-bold leading-[1.2] text-white">
                    {solution.title}
                  </h3>

                  <p className="mt-[2px] text-[10px] font-normal leading-[1.2] text-[#C9C9C9]">
                    {solution.subtitle}
                  </p>
                </div>
              </div>

              <p className="mt-[8px] max-w-[218px] text-[12px] font-normal leading-[1.25] text-[#C9C9C9]">
                {solution.description}
              </p>

              <Link
                href={solution.href}
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

export function SolutionsAdvisorySection({ activeTab }: { activeTab: "solutions" | "products" }) {
  return (
    <section className="relative isolate bg-[#0E0F0F] pb-16 sm:pb-20 lg:pb-24">
      <Container>
        <div className="h-px w-full bg-[#686868]" />

        <div className="relative mx-auto mt-8 w-full sm:mt-10">
          <div className=" bg-none pointer-events-none absolute left-1/2 -translate-x-1/2 -top-[400px] z-0 h-[calc(100%+180px)] w-[105%] overflow-hidden rounded-[4px]">
            <Image
              src="/solution/thirdsecion/third-bg.png"
              alt=""
              fill
              className="object-cover opacity-[0.95] "
              style={{ objectPosition: "center center" }}
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.25)_0%,rgba(0,0,0,0.12)_45%,rgba(0,0,0,0.3)_100%)]" />
          </div>

          <div className="relative z-10 flex flex-col gap-7 sm:gap-8">
            {activeTab === "solutions" ? (
              <>
                <CoreProductsPanel />
                <AdvisoryPanel heightClass="h-auto min-h-[353px] lg:h-[353px]" />
              </>
            ) : (
              <>
                <SolutionsOverviewPanel />
                <AdvisoryPanel heightClass="h-auto min-h-[353px] lg:h-[353px]" />
              </>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}

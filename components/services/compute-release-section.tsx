import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Cpu, HardDrive, Network, MemoryStick } from "lucide-react";
import { Container } from "@/components/ui/container";

const bareMetalServers = [
  {
    id: "01",
    badge: "Best Value",
    title: "Intel Xeon E-2388G",
    subtitle: "Entry Bare Metal",
    processor: "Intel",
    specs: [
      { icon: Cpu, label: "8 Cores / 16 Threads", detail: "Up to 5.1 GHz" },
      { icon: MemoryStick, label: "32 GB DDR4 ECC" },
      { icon: HardDrive, label: "2x 512 GB NVMe SSD" },
      { icon: Network, label: "1 Gbit/s Uplink", detail: "10 TB Transfer" },
    ],
    price: 99,
    useCase: "Web hosting, small databases, CI/CD runners",
  },
  {
    id: "02",
    badge: "Most Popular",
    featured: true,
    title: "AMD Ryzen 9 7950X",
    subtitle: "High-Performance Workstation",
    processor: "AMD",
    specs: [
      { icon: Cpu, label: "16 Cores / 32 Threads", detail: "Up to 5.7 GHz" },
      { icon: MemoryStick, label: "64 GB DDR5" },
      { icon: HardDrive, label: "2x 1 TB NVMe SSD" },
      { icon: Network, label: "1 Gbit/s Uplink", detail: "20 TB Transfer" },
    ],
    price: 179,
    useCase: "Game servers, SaaS backends, build pipelines",
  },
  {
    id: "03",
    badge: "Enterprise",
    title: "AMD EPYC 9354P",
    subtitle: "Data Center Grade",
    processor: "AMD",
    specs: [
      { icon: Cpu, label: "32 Cores / 64 Threads", detail: "Up to 3.8 GHz" },
      { icon: MemoryStick, label: "256 GB DDR5 ECC" },
      { icon: HardDrive, label: "2x 3.84 TB NVMe SSD" },
      { icon: Network, label: "10 Gbit/s Uplink", detail: "50 TB Transfer" },
    ],
    price: 549,
    useCase: "Large APIs, multiplayer backends, analytics clusters",
  },
];

const ComputeReleaseSection = () => {
  return (
    <section className="relative w-full overflow-hidden bg-black py-16 lg:py-24">
      {/* Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <Image
          src="/images/main-page/service-home-section-2-bg.svg"
          alt=""
          fill
          className="object-cover opacity-50"
          priority={false}
        />
      </div>

      <Container>
        <div className="relative z-10">
          {/* Header row */}
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-12">
            <div className="max-w-[520px]">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-[400] tracking-tight leading-[1.15] text-white">
                Dedicated{" "}
                <span className="text-[#0095FF]">Bare Metal</span>{" "}
                Servers
              </h2>
              <p className="mt-3 text-sm leading-[1.7] text-white/40">
                No hypervisor. No noisy neighbors. Full hardware access with IPMI remote management, hardware RAID, and custom OS support.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2 border border-white/[0.06] bg-white/[0.02] px-3.5 py-2">
                <Image src="/images/compute-page/intel.png" alt="Intel" width={44} height={18} className="object-contain brightness-0 invert opacity-40" />
                <span className="text-[9px] text-white/20 uppercase tracking-wider">Xeon</span>
              </div>
              <div className="flex items-center gap-2 border border-white/[0.06] bg-white/[0.02] px-3.5 py-2">
                <Image src="/images/compute-page/amd.png" alt="AMD" width={44} height={18} className="object-contain brightness-0 invert opacity-40" />
                <span className="text-[9px] text-white/20 uppercase tracking-wider">EPYC &bull; Ryzen</span>
              </div>
            </div>
          </div>

          {/* Server Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {bareMetalServers.map((server) => {
              const isFeatured = !!(server as any).featured;
              return (
                <div
                  key={server.id}
                  className={`relative p-6 lg:p-7 flex flex-col transition-colors duration-300 border ${
                    isFeatured
                      ? "border-[#0095FF]/30 bg-[#0095FF]/[0.03]"
                      : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14]"
                  }`}
                >
                  {isFeatured && (
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#0095FF]" />
                  )}

                  {/* Badge + Processor icon */}
                  <div className="flex items-center justify-between mb-5">
                    <span className={`text-[10px] font-medium uppercase tracking-widest px-2.5 py-1 ${
                      isFeatured
                        ? "bg-[#0095FF]/10 text-[#0095FF] border border-[#0095FF]/20"
                        : "bg-white/[0.04] text-white/30 border border-white/[0.06]"
                    }`}>
                      {server.badge}
                    </span>
                    <Image
                      src={server.processor === "Intel" ? "/images/compute-page/intel.png" : "/images/compute-page/amd.png"}
                      alt={server.processor}
                      width={34}
                      height={14}
                      className="object-contain brightness-0 invert opacity-25"
                    />
                  </div>

                  {/* Title */}
                  <h3 className="text-[18px] lg:text-[20px] font-[600] text-white tracking-tight leading-tight">
                    {server.title}
                  </h3>
                  <p className="text-[11px] text-white/25 mt-0.5 mb-6">
                    {server.subtitle}
                  </p>

                  {/* Specs — vertical with icon boxes */}
                  <div className="space-y-3 flex-1">
                    {server.specs.map((spec) => (
                      <div key={spec.label} className="flex items-center gap-3">
                        <div className={`flex h-7 w-7 items-center justify-center shrink-0 ${
                          isFeatured
                            ? "bg-[#0095FF]/[0.08] border border-[#0095FF]/15"
                            : "bg-white/[0.03] border border-white/[0.06]"
                        }`}>
                          <spec.icon className={`w-3.5 h-3.5 ${isFeatured ? "text-[#0095FF]" : "text-[#0095FF]/60"}`} />
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[13px] text-white/60">{spec.label}</span>
                          {spec.detail && (
                            <span className="text-[11px] text-white/20">{spec.detail}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Use case */}
                  <p className="mt-5 text-[11px] text-white/15 leading-relaxed">{server.useCase}</p>

                  {/* Price + CTA */}
                  <div className="mt-4 pt-5 border-t border-white/[0.06] flex items-end justify-between">
                    <div>
                      <span className="text-[26px] font-[600] text-white tabular-nums tracking-tight">${server.price}</span>
                      <span className="text-[11px] text-white/20 ml-0.5">/mo</span>
                    </div>
                    <a
                      href="/signup"
                      className={`cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 text-[12px] font-medium transition-colors ${
                        isFeatured
                          ? "bg-[#0095FF] text-white hover:bg-[#0080dd]"
                          : "bg-white text-black hover:bg-white/90"
                      }`}
                    >
                      Configure
                      <ArrowRight className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom link */}
          <div className="mt-6 flex justify-center">
            <Link
              href="/services/compute"
              className="cursor-pointer inline-flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/55 transition-colors"
            >
              View all configurations
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
};

export default ComputeReleaseSection;

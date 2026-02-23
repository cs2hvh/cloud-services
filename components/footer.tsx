import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Shield, Lock, FileCheck } from "lucide-react";

const FOOTER_LINKS = [
  {
    heading: "Company",
    links: [
      { label: "Blog", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Pricing", href: "/pricing" },
      { label: "Customers", href: "#" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "Papers", href: "#" },
      { label: "Press", href: "#" },
      { label: "Changelog", href: "#" },
    ],
  },
  {
    heading: "Solutions",
    links: [
      { label: "Compute", href: "/services/compute" },
      { label: "Managed Database", href: "/services/database" },
      { label: "GPU Instances", href: "/services/gpu" },
      { label: "Kubernetes", href: "/services/kubernetes" },
      { label: "Object Storage", href: "/services/object-storage" },
      { label: "App Deploy", href: "/services/app-deployment" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms of Service", href: "#" },
      { label: "Privacy Policy", href: "#" },
      { label: "Cookies Policy", href: "#" },
      { label: "Data Processing", href: "#" },
    ],
  },
];

const COMPLIANCE_BADGES = [
  { icon: Shield, abbr: "PCI", label: "PCI Level 1" },
  { icon: Lock, abbr: "SOC", label: "SOC 2 Type II" },
  { icon: FileCheck, abbr: "ISO", label: "ISO 27001" },
];

export function Footer() {
  return (
    <footer className="relative z-10 bg-black">

      <Container className="pt-16 lg:pt-20 pb-8 lg:pb-10">
        {/* Main grid */}
        <div className="grid gap-12 lg:grid-cols-[1fr_auto]">
          {/* Left: brand + description */}
          <div className="max-w-[280px]">
            <Link
              href="/"
              className="text-[22px] font-normal text-white font-[family-name:var(--font-nunito)]"
            >
              ahura<span className="text-[#0095FF]">sense</span>
            </Link>
            <p className="mt-4 text-[13px] leading-relaxed text-white/40">
              Enterprise-grade cloud infrastructure with global reach and
              sub-20ms latency.
            </p>

            {/* Compliance badges */}
            <div className="mt-6 flex flex-col gap-3">
              {COMPLIANCE_BADGES.map((badge) => (
                <div
                  key={badge.abbr}
                  className="flex items-center gap-3"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center border border-white/[0.08] bg-white/[0.04]">
                    <badge.icon className="w-3.5 h-3.5 text-[#0095FF]" />
                  </div>
                  <span className="text-[12px] text-white/40">
                    {badge.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: link columns */}
          <div className="grid grid-cols-2 gap-x-12 gap-y-10 sm:grid-cols-4 lg:gap-x-16">
            {FOOTER_LINKS.map((group) => (
              <div key={group.heading}>
                <h3 className="text-[11px] font-medium text-white/30 uppercase tracking-widest mb-4">
                  {group.heading}
                </h3>
                <ul className="space-y-2.5">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-[13px] text-white/50 hover:text-white transition-colors duration-200"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 lg:mt-16 pt-6 border-t border-white/[0.06] flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-white/30">
            &copy; {new Date().getFullYear()} ahurasense. All rights reserved.
          </p>
          <div className="flex items-center gap-2 text-[12px] text-white/30">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>All systems operational</span>
          </div>
        </div>
      </Container>
    </footer>
  );
}

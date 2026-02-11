import Link from "next/link";
import { WideContainer } from "@/components/ui/container";

export function Footer() {
  return (
    <footer className="relative z-10 bg-[#161618]">
      <WideContainer className="pt-[clamp(40px,3vw,64px)] pb-[clamp(24px,2vw,36px)]">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,200px)_1fr_minmax(0,220px)]">
          <div className="flex items-start">
            <div className="text-2xl font-normal tracking-tight text-white">
              <span>ahura</span>
              <span className="text-[#00AAFF]">cloud</span>
            </div>
          </div>

          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <h3 className="text-[15px] text-white mb-4">Company</h3>
              <ul className="space-y-2 text-[13px] text-[#ACACAC] font-mono">
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    Blog
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    Careers
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    Customers
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-[15px] text-white mb-4">Resources</h3>
              <ul className="space-y-2 text-[13px] text-[#ACACAC] font-mono">
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    Documentation
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    Papers
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    Press
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-[15px] text-white mb-4">Solutions</h3>
              <ul className="space-y-2 text-[13px] text-[#ACACAC] font-mono">
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    PCI Compliance
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    Encryption as a Service
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    Credentials Encryption
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    File Encryption
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    PII Encryption
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    HIPAA Compliance
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-[15px] text-white mb-4">Legal</h3>
              <ul className="space-y-2 text-[13px] text-[#ACACAC] font-mono">
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    Cookies Policy
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    Data Processing
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div>
            <h3 className="text-[15px] text-white mb-4">Compliance</h3>
            <div className="space-y-3 text-[13px] text-[#ACACAC] font-mono">
              <div className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[9px] font-semibold text-white/70">
                  PCI
                </span>
                <span>PCI Level 1</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[9px] font-semibold text-white/70">
                  SOC
                </span>
                <span>SOC 2 Type II</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-[clamp(24px,2.5vw,40px)] border-t border-[#2A2B3A] pt-[clamp(16px,1.6vw,24px)] flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12.8px] text-[#BABCD2]">© 2026 ahuracloud. All rights reserved.</p>
          <div className="flex items-center gap-2 text-[12.8px] text-[#BABCD2] font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-[#00AAFF]" />
            <span>All systems normal</span>
          </div>
        </div>
      </WideContainer>
    </footer>
  );
}

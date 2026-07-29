"use client";

import { assetUrl } from "@/lib/asset-url";
import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Menu, X, ChevronDown, User, LogOut, Settings, LayoutDashboard, CreditCard,
  ArrowRight, Activity, LifeBuoy, ExternalLink,
} from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { User as SupabaseUser } from "@supabase/supabase-js";

type NavbarClientProps = {
  initialUser: SupabaseUser | null;
};

type SolutionItem = {
  label: string;
  desc: string;
  href: string;
  tags?: string[];
};

const SOLUTIONS: SolutionItem[] = [
  {
    label: "AI & Machine Learning",
    desc: "Develop, train, and deploy intelligent systems",
    href: "/solutions/ai-ml",
    tags: ["GPUs", "Model Training", "MLOps", "AI APIs", "LLM Deployment", "Computer Vision", "NLP Engines", "AI Inference", "AutoML"],
  },
  {
    label: "Web Hosting & SaaS Deployment",
    desc: "Scalable and reliable application hosting",
    href: "/solutions/web-hosting",
    tags: ["AutoML"],
  },
  {
    label: "Ecommerce Infrastructure",
    desc: "Build and scale online stores",
    href: "/solutions/ecommerce",
  },
  {
    label: "Game Development & Hosting",
    desc: "Low-latency multiplayer infrastructure",
    href: "/solutions/game-dev",
  },
  {
    label: "Database-Driven Applications",
    desc: "High-performance data infrastructure",
    href: "/solutions/database",
  },
  {
    label: "Cloud-Native Kubernetes Platforms",
    desc: "Modern container orchestration",
    href: "/solutions/kubernetes",
  },
  {
    label: "Storage & Backup Solutions",
    desc: "Reliable and scalable data storage",
    href: "/solutions/storage",
  },
];

const PRODUCTS: SolutionItem[] = [
  {
    label: "Compute",
    desc: "Virtual machines with flexible configurations",
    href: "/services/compute",
    tags: ["VPS", "Dedicated CPU", "Shared CPU", "Cloud Servers"],
  },
  {
    label: "GPU Instances",
    desc: "High-performance GPU acceleration for AI/ML",
    href: "/services/gpu",
    tags: ["NVIDIA", "A100", "H100", "Training", "Inference"],
  },
  {
    label: "Managed Database",
    desc: "Fully managed databases with auto-scaling",
    href: "/services/database",
    tags: ["PostgreSQL", "MySQL", "MongoDB", "Redis", "Backups"],
  },
  {
    label: "Kubernetes",
    desc: "Managed Kubernetes clusters at scale",
    href: "/services/kubernetes",
    tags: ["K8s", "Auto-scaling", "Load Balancing", "GitOps"],
  },
  {
    label: "Object Storage",
    desc: "S3-compatible object storage with CDN",
    href: "/services/object-storage",
    tags: ["S3 API", "CDN", "Versioning", "Lifecycle"],
  },
  {
    label: "Application Deployment",
    desc: "CI/CD pipelines and container deployment",
    href: "/services/app-deployment",
    tags: ["Docker", "CI/CD", "Auto Deploy", "GitHub", "GitLab"],
  },
  {
    label: "Game Servers",
    desc: "DDoS-protected game hosting, online in a minute",
    href: "/services/games",
    tags: ["Minecraft", "Rust", "CS2", "FiveM"],
  },
  {
    label: "Domains",
    desc: "Register, transfer, and manage domains",
    href: "/services/domain",
    tags: ["Registrar", "Marketplace", "Transfer", "DNS"],
  },
];

// A.I. Labs — surfaced as its own top-level nav item (not buried under
// Products) so visitors looking for inference / fine-tuning / embeddings
// don't have to dig through compute/storage/networking first.
//
// Three sections in the dropdown so the panel feels full without linking
// to broken pages:
//   • Products   — our four AI services (own marketing landing each)
//   • Use cases  — what you'd build with them (all point at /solutions/ai-ml
//                  until per-use-case landing pages ship)
//   • Resources  — Docs / Pricing / etc.
type AiLabsGroup = { label: string; items: SolutionItem[] };

const AI_LABS_GROUPS: AiLabsGroup[] = [
  {
    label: "Products",
    items: [
      {
        label: "Inference",
        desc: "OpenAI-compatible API for 50+ frontier and open-source models",
        href: "/services/inference",
        tags: ["OpenAI compat", "Streaming", "BYOK"],
      },
      {
        label: "Fine-Tuning",
        desc: "Train LoRA adapters on Llama, DeepSeek, Qwen, Mistral, Phi",
        href: "/services/fine-tuning",
        tags: ["LoRA", "qLoRA", "Auto-deploy"],
      },
      {
        label: "Embeddings & Vector",
        desc: "Hosted embedding models with managed pgvector collections",
        href: "/services/embeddings",
        tags: ["text-embedding-3", "pgvector", "RAG"],
      },
      {
        label: "Model Hosting",
        desc: "Deploy any container or HuggingFace model to a dedicated GPU endpoint",
        href: "/services/model-hosting",
        tags: ["BYO weights", "Docker", "HuggingFace"],
      },
    ],
  },
  {
    label: "Use cases",
    items: [
      {
        label: "Chatbots & Agents",
        desc: "Customer support copilots, internal assistants, tool-using agents",
        href: "/services/ai-use-cases#chatbots",
        tags: ["Streaming", "Tool calling", "Memory"],
      },
      {
        label: "RAG & Knowledge Search",
        desc: "Vector retrieval over your docs with citation-ready answers",
        href: "/services/ai-use-cases#rag",
        tags: ["pgvector", "Reranking", "Citations"],
      },
      {
        label: "Code Generation",
        desc: "Code completion, refactoring, review with frontier + OSS code models",
        href: "/services/ai-use-cases#code",
        tags: ["Codestral", "DeepSeek-Coder", "Qwen-Coder"],
      },
      {
        label: "Document Intelligence",
        desc: "Summarization, extraction, classification, OCR-aware pipelines",
        href: "/services/ai-use-cases#docs",
        tags: ["Long context", "JSON mode", "Batches"],
      },
    ],
  },
];


export function NavbarClient({ initialUser }: NavbarClientProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(initialUser);
  const [isLoading, setIsLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [solutionsOpen, setSolutionsOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const [aiLabsOpen, setAiLabsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const solutionsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiLabsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    setUser(initialUser);
    setIsLoading(false);
  }, [initialUser]);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
          router.refresh();
        }
      },
    );
    return () => subscription.unsubscribe();
  }, [supabase, router]);

  const handleSignOut = async () => {
    try {
      const response = await fetch("/api/auth/signout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        console.error("Sign-out failed:", await response.text());
        return;
      }
      setDropdownOpen(false);
      setUser(null);
      router.refresh();
    } catch (error) {
      console.error("Sign-out error:", error);
    }
  };

  // All three dropdowns share the same mutually-exclusive behavior:
  // opening one closes the other two so we don't get overlapping panels.
  const handleSolutionsEnter = () => {
    if (solutionsTimeout.current) clearTimeout(solutionsTimeout.current);
    if (productsTimeout.current) clearTimeout(productsTimeout.current);
    if (aiLabsTimeout.current) clearTimeout(aiLabsTimeout.current);
    setSolutionsOpen(true);
    setProductsOpen(false);
    setAiLabsOpen(false);
  };

  const handleSolutionsLeave = () => {
    solutionsTimeout.current = setTimeout(() => setSolutionsOpen(false), 150);
  };

  const handleProductsEnter = () => {
    if (productsTimeout.current) clearTimeout(productsTimeout.current);
    if (solutionsTimeout.current) clearTimeout(solutionsTimeout.current);
    if (aiLabsTimeout.current) clearTimeout(aiLabsTimeout.current);
    setProductsOpen(true);
    setSolutionsOpen(false);
    setAiLabsOpen(false);
  };

  const handleProductsLeave = () => {
    productsTimeout.current = setTimeout(() => setProductsOpen(false), 150);
  };

  const handleAiLabsEnter = () => {
    if (aiLabsTimeout.current) clearTimeout(aiLabsTimeout.current);
    if (solutionsTimeout.current) clearTimeout(solutionsTimeout.current);
    if (productsTimeout.current) clearTimeout(productsTimeout.current);
    setAiLabsOpen(true);
    setSolutionsOpen(false);
    setProductsOpen(false);
  };

  const handleAiLabsLeave = () => {
    aiLabsTimeout.current = setTimeout(() => setAiLabsOpen(false), 150);
  };

  const navLinks = [
    { href: "/pricing", label: "Pricing" },
    // { href: "/resources", label: "Resources" },
    { href: "/api-docs", label: "Docs" },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 border-b transition-colors duration-300 ${
        isScrolled
          ? "border-white/[0.08] bg-[#08080a]/85 backdrop-blur-[14px]"
          : "border-transparent bg-transparent"
      }`}
    >
      {/* Boxy bar — sharp corners, wide container, scroll-aware bg */}
      <div className="mx-auto flex h-16 max-w-[1440px] items-center px-5 sm:px-8">
        {/* Logo */}
        <Link href="/" className="text-[22px] font-normal text-white shrink-0 font-[family-name:var(--font-nunito)]">
          ahura<span className="text-[#0095FF]">sense</span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden lg:flex items-center gap-6 ml-auto">
          {/* A.I. Labs with dropdown */}
          <div
            className="relative"
            onMouseEnter={handleAiLabsEnter}
            onMouseLeave={handleAiLabsLeave}
          >
            <button className="group relative flex cursor-pointer items-center gap-1 py-1 text-[13px] font-medium text-white/65 transition-colors duration-200 hover:text-white">
              A.I. Labs
              <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${aiLabsOpen ? "rotate-180" : ""}`} />
              <span className={`pointer-events-none absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-white transition-transform duration-200 group-hover:scale-x-100 ${aiLabsOpen ? "scale-x-100" : ""}`} />
            </button>
          </div>

          {/* Products with dropdown */}
          <div
            className="relative"
            onMouseEnter={handleProductsEnter}
            onMouseLeave={handleProductsLeave}
          >
            <button className="group relative flex cursor-pointer items-center gap-1 py-1 text-[13px] font-medium text-white/65 transition-colors duration-200 hover:text-white">
              Products
              <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${productsOpen ? "rotate-180" : ""}`} />
              <span className={`pointer-events-none absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-white transition-transform duration-200 group-hover:scale-x-100 ${productsOpen ? "scale-x-100" : ""}`} />
            </button>
          </div>

          {/* Solutions with dropdown */}
          <div
            className="relative"
            onMouseEnter={handleSolutionsEnter}
            onMouseLeave={handleSolutionsLeave}
          >
            <button className="group relative flex cursor-pointer items-center gap-1 py-1 text-[13px] font-medium text-white/65 transition-colors duration-200 hover:text-white">
              Solutions
              <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${solutionsOpen ? "rotate-180" : ""}`} />
              <span className={`pointer-events-none absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-white transition-transform duration-200 group-hover:scale-x-100 ${solutionsOpen ? "scale-x-100" : ""}`} />
            </button>
          </div>

          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group relative py-1 text-[13px] font-medium text-white/65 transition-colors duration-200 hover:text-white"
            >
              {link.label}
              <span className="pointer-events-none absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-white transition-transform duration-200 group-hover:scale-x-100" />
            </Link>
          ))}
        </div>

        {/* Auth area */}
        <div className="hidden lg:flex items-center ml-8">
          {isLoading ? (
            <div className="w-7 h-7 rounded-full bg-white/10 animate-pulse" />
          ) : user ? (
            <div className="relative">
              {dropdownOpen && (
                <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
              )}
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="cursor-pointer flex items-center gap-2 px-2 py-1.5 rounded-full hover:bg-white/[0.06] transition-colors duration-200"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#0095FF] to-[#0066CC] flex items-center justify-center text-white font-medium text-xs">
                  {user.email?.charAt(0).toUpperCase()}
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-white/40" />
              </button>

              <AnimatePresence>
                {dropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.97 }}
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute right-0 mt-2 w-[260px] rounded-lg bg-[#0a0a0a]/95 backdrop-blur-[48px] border border-white/[0.08] shadow-[0_18px_48px_rgba(0,0,0,0.65)] overflow-hidden z-50"
                  >
                    {/* Identity header */}
                    <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-4">
                      <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-[#33adff] to-[#0066CC] flex items-center justify-center text-white font-semibold text-[15px] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_4px_14px_rgba(0,149,255,0.35)]">
                        {user.email?.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-white truncate">{user.email}</p>
                        <p className="mt-0.5 font-[var(--font-geist-mono),ui-monospace,monospace] text-[9.5px] uppercase tracking-[0.16em] text-white/40">
                          Personal account
                        </p>
                      </div>
                    </div>

                    {/* Workspace */}
                    <div className="px-1 py-1">
                      <p className="px-3 pt-2 pb-1.5 font-[var(--font-geist-mono),ui-monospace,monospace] text-[9px] uppercase tracking-[0.18em] text-white/30">
                        Workspace
                      </p>
                      <UserMenuItem
                        icon={LayoutDashboard}
                        label="Dashboard"
                        active={pathname === "/dashboard"}
                        onClick={() => { router.push("/dashboard"); setDropdownOpen(false); }}
                      />
                      <UserMenuItem
                        icon={Activity}
                        label="Activity & usage"
                        active={pathname?.startsWith("/dashboard/activity")}
                        onClick={() => { router.push("/dashboard/activity"); setDropdownOpen(false); }}
                      />
                      <UserMenuItem
                        icon={CreditCard}
                        label="Billing"
                        active={pathname?.startsWith("/dashboard/nav/billing")}
                        onClick={() => { router.push("/dashboard/nav/billing"); setDropdownOpen(false); }}
                      />
                    </div>

                    {/* Personal */}
                    <div className="px-1 pb-1 pt-0 border-t border-white/[0.06]">
                      <p className="px-3 pt-2 pb-1.5 font-[var(--font-geist-mono),ui-monospace,monospace] text-[9px] uppercase tracking-[0.18em] text-white/30">
                        Personal
                      </p>
                      <UserMenuItem
                        icon={User}
                        label="Profile"
                        active={pathname?.startsWith("/dashboard/nav/profile")}
                        onClick={() => { router.push("/dashboard/nav/profile"); setDropdownOpen(false); }}
                      />
                      <UserMenuItem
                        icon={Settings}
                        label="Settings"
                        active={pathname?.startsWith("/dashboard/settings")}
                        onClick={() => { router.push("/dashboard/settings"); setDropdownOpen(false); }}
                      />
                      <UserMenuItem
                        icon={LifeBuoy}
                        label="Support"
                        active={pathname?.startsWith("/dashboard/support")}
                        onClick={() => { router.push("/dashboard/support"); setDropdownOpen(false); }}
                      />
                    </div>

                    {/* External: docs */}
                    <div className="px-1 pb-1 pt-0 border-t border-white/[0.06]">
                      <Link
                        href="/api-docs"
                        onClick={() => setDropdownOpen(false)}
                        className="group flex w-full items-center gap-2.5 rounded-[5px] px-3 py-2 text-[13px] text-white/55 transition-colors hover:bg-white/[0.04] hover:text-white"
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-white/40 transition-colors group-hover:text-white/70" strokeWidth={1.75} />
                        <span>API documentation</span>
                      </Link>
                    </div>

                    {/* Sign out */}
                    <div className="border-t border-white/[0.06] p-1">
                      <button
                        onClick={handleSignOut}
                        className="group flex w-full cursor-pointer items-center gap-2.5 rounded-[5px] px-3 py-2 text-[13px] text-red-400 transition-colors hover:bg-red-500/[0.08] hover:text-red-300"
                      >
                        <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
                        <span>Sign out</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/signin"
                className="px-3 py-2 text-[13px] font-medium text-white/65 transition-colors duration-200 hover:text-white"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="group inline-flex h-9 items-center gap-1.5 border border-transparent bg-white px-4 text-[13px] font-semibold text-black transition-colors duration-200 hover:border-[#0095FF] hover:bg-[#0095FF] hover:text-white"
              >
                Get Started
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </div>
          )}
        </div>

        {/* Mobile menu button */}
        <button onClick={() => setIsOpen(!isOpen)} className="cursor-pointer lg:hidden ml-auto p-1.5">
          {isOpen ? <X className="w-5 h-5 text-white" /> : <Menu className="w-5 h-5 text-white" />}
        </button>
      </div>

      {/* Mega-menu panels — absolute so both panels share the same position and never stack */}
      <div className="hidden lg:block absolute inset-x-0 top-16 z-50">
        <div className="mx-auto max-w-[1440px] px-5 sm:px-8 relative">

          <AnimatePresence>
            {solutionsOpen && (
              <motion.div
                key="solutions"
                initial={{ opacity: 0, clipPath: "inset(0 100% 0 0)" }}
                animate={{ opacity: 1, clipPath: "inset(0 0% 0 0)" }}
                exit={{ opacity: 0, clipPath: "inset(0 100% 0 0)" }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-x-0 top-0"
                onMouseEnter={handleSolutionsEnter}
                onMouseLeave={handleSolutionsLeave}
              >
                <div className="bg-[#e5e5e5] shadow-[0_16px_48px_rgba(0,0,0,0.3)] overflow-hidden">
                  <div className="grid grid-cols-3">
                    <div className="col-span-2 p-8">
                      <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                        {SOLUTIONS.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setSolutionsOpen(false)}
                            className="group block"
                          >
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-[14px] font-semibold text-black group-hover:text-[#0095FF] transition-colors duration-200">
                                {item.label}
                              </span>
                              <ArrowRight className="w-3.5 h-3.5 text-black/60 group-hover:text-[#0095FF] group-hover:translate-x-0.5 transition-all duration-200" />
                            </div>
                            <p className="text-[12px] text-black/50 leading-relaxed mb-2">{item.desc}</p>
                            {item.tags && item.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {item.tags.map((tag) => (
                                  <span key={tag} className="px-2 py-0.5 text-[10px] font-medium text-black/60 border border-black/20 rounded bg-white/50">{tag}</span>
                                ))}
                              </div>
                            )}
                          </Link>
                        ))}
                      </div>
                    </div>
                    <div className="relative overflow-hidden">
                      <div className="absolute top-[77px] bottom-[86px] right-[46px] left-0">
                        <Image src={assetUrl("/images/main-page/solutions-navbar-1.png")} alt="Solutions" fill className="object-contain object-right" />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {productsOpen && (
              <motion.div
                key="products"
                initial={{ opacity: 0, clipPath: "inset(0 0% 0 100%)" }}
                animate={{ opacity: 1, clipPath: "inset(0 0% 0 0%)" }}
                exit={{ opacity: 0, clipPath: "inset(0 0% 0 100%)" }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-x-0 top-0"
                onMouseEnter={handleProductsEnter}
                onMouseLeave={handleProductsLeave}
              >
                <div className="bg-[#e5e5e5] shadow-[0_16px_48px_rgba(0,0,0,0.3)] overflow-hidden">
                  <div className="grid grid-cols-3">
                    <div className="col-span-2 p-8">
                      <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                        {PRODUCTS.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setProductsOpen(false)}
                            className="group block"
                          >
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-[14px] font-semibold text-black group-hover:text-[#0095FF] transition-colors duration-200">
                                {item.label}
                              </span>
                              <ArrowRight className="w-3.5 h-3.5 text-black/60 group-hover:text-[#0095FF] group-hover:translate-x-0.5 transition-all duration-200" />
                            </div>
                            <p className="text-[12px] text-black/50 leading-relaxed mb-2">{item.desc}</p>
                            {item.tags && item.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {item.tags.map((tag) => (
                                  <span key={tag} className="px-2 py-0.5 text-[10px] font-medium text-black/60 border border-black/20 rounded bg-white/50">{tag}</span>
                                ))}
                              </div>
                            )}
                          </Link>
                        ))}
                      </div>
                    </div>
                    <div className="relative overflow-hidden">
                      <div className="absolute top-[77px] bottom-[86px] right-[46px] left-0">
                        <Image src={assetUrl("/images/main-page/solutions-navbar-1.png")} alt="Products" fill className="object-contain object-right" />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {aiLabsOpen && (
              <motion.div
                key="ai-labs"
                initial={{ opacity: 0, clipPath: "inset(0 0% 0 100%)" }}
                animate={{ opacity: 1, clipPath: "inset(0 0% 0 0%)" }}
                exit={{ opacity: 0, clipPath: "inset(0 0% 0 100%)" }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-x-0 top-0"
                onMouseEnter={handleAiLabsEnter}
                onMouseLeave={handleAiLabsLeave}
              >
                <div className="bg-[#e5e5e5] shadow-[0_16px_48px_rgba(0,0,0,0.3)] overflow-hidden">
                  {/* 3-column grid: each section gets its own column so the
                      panel reads top-to-bottom within each cluster + has
                      breathing room. Right rail keeps the existing image. */}
                  <div className="grid grid-cols-4">
                    <div className="col-span-3 p-8">
                      <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                        {AI_LABS_GROUPS.map((group) => (
                          <div key={group.label}>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/45 mb-4 pb-2 border-b border-black/10">
                              {group.label}
                            </p>
                            <div className="space-y-5">
                              {group.items.map((item) => (
                                <Link
                                  key={`${group.label}-${item.label}`}
                                  href={item.href}
                                  onClick={() => setAiLabsOpen(false)}
                                  className="group block"
                                >
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <span className="text-[13.5px] font-semibold text-black group-hover:text-[#0095FF] transition-colors duration-200">
                                      {item.label}
                                    </span>
                                    <ArrowRight className="w-3 h-3 text-black/60 group-hover:text-[#0095FF] group-hover:translate-x-0.5 transition-all duration-200" />
                                  </div>
                                  <p className="text-[11.5px] text-black/50 leading-relaxed mb-1.5">{item.desc}</p>
                                  {item.tags && item.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {item.tags.map((tag) => (
                                        <span key={tag} className="px-1.5 py-0.5 text-[9.5px] font-medium text-black/60 border border-black/20 rounded bg-white/50">{tag}</span>
                                      ))}
                                    </div>
                                  )}
                                </Link>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="relative overflow-hidden">
                      <div className="absolute top-[77px] bottom-[86px] right-[46px] left-0">
                        <Image src={assetUrl("/images/main-page/solutions-navbar-1.png")} alt="A.I. Labs" fill className="object-contain object-right" />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden mx-5 sm:mx-8 mt-0 border border-white/[0.08] bg-[#08080a]/95 backdrop-blur-[14px] overflow-hidden"
          >
            <div className="px-5 py-4 space-y-1 max-h-[70vh] overflow-y-auto no-scrollbar">
              {/* A.I. Labs accordion in mobile */}
              <MobileAiLabsAccordion onNavigate={() => setIsOpen(false)} />

              {/* Products accordion in mobile */}
              <MobileProductsAccordion onNavigate={() => setIsOpen(false)} />

              {/* Solutions accordion in mobile */}
              <MobileSolutionsAccordion onNavigate={() => setIsOpen(false)} />

              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block px-3 py-2.5 text-[13px] text-white/60 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors duration-200"
                  onClick={() => setIsOpen(false)}
                >
                  {link.label}
                </Link>
              ))}

              <div className="pt-3 mt-2 border-t border-white/[0.06]">
                {user ? (
                  <>
                    <button onClick={() => { router.push("/dashboard"); setIsOpen(false); }} className="cursor-pointer w-full text-left block px-3 py-2.5 text-[13px] text-white/60 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors duration-200">
                      Dashboard
                    </button>
                    <button onClick={() => { router.push("/dashboard/nav/billing"); setIsOpen(false); }} className="cursor-pointer w-full text-left block px-3 py-2.5 text-[13px] text-white/60 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors duration-200">
                      Billing
                    </button>
                    <button onClick={() => { handleSignOut(); setIsOpen(false); }} className="cursor-pointer w-full text-left px-3 py-2.5 text-[13px] text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors duration-200">
                      Sign out
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col gap-2 pt-1">
                    <button onClick={() => { router.push("/signin"); setIsOpen(false); }} className="cursor-pointer w-full block px-3 py-2.5 text-[13px] text-white/60 hover:text-white hover:bg-white/[0.04] rounded-lg text-center transition-colors duration-200">
                      Log in
                    </button>
                    <button onClick={() => { router.push("/signup"); setIsOpen(false); }} className="cursor-pointer w-full block px-3 py-2.5 text-[13px] font-medium text-white bg-[#0095FF] hover:bg-[#007ad6] rounded-lg text-center transition-colors duration-200">
                      Sign Up
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      
    </nav>
  );
}

function MobileSolutionsAccordion({ onNavigate }: { onNavigate: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="cursor-pointer w-full flex items-center justify-between px-3 py-2.5 text-[13px] text-white/60 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors duration-200"
      >
        Solutions
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="pl-3 py-2 space-y-1 max-h-[50vh] overflow-y-auto no-scrollbar">
              {SOLUTIONS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className="group block px-3 py-2.5 rounded-md hover:bg-white/[0.04] transition-colors duration-200"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-medium text-white/70 group-hover:text-white transition-colors duration-200">
                      {item.label}
                    </span>
                    <ArrowRight className="w-3 h-3 text-white/40 group-hover:text-white/70 group-hover:translate-x-0.5 transition-all duration-200" />
                  </div>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    {item.desc}
                  </p>
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MobileProductsAccordion({ onNavigate }: { onNavigate: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="cursor-pointer w-full flex items-center justify-between px-3 py-2.5 text-[13px] text-white/60 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors duration-200"
      >
        Products
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="pl-3 py-2 space-y-1 max-h-[50vh] overflow-y-auto no-scrollbar">
              {PRODUCTS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className="group block px-3 py-2.5 rounded-md hover:bg-white/[0.04] transition-colors duration-200"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-medium text-white/70 group-hover:text-white transition-colors duration-200">
                      {item.label}
                    </span>
                    <ArrowRight className="w-3 h-3 text-white/40 group-hover:text-white/70 group-hover:translate-x-0.5 transition-all duration-200" />
                  </div>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    {item.desc}
                  </p>
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MobileAiLabsAccordion({ onNavigate }: { onNavigate: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="cursor-pointer w-full flex items-center justify-between px-3 py-2.5 text-[13px] text-white/60 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors duration-200"
      >
        A.I. Labs
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="pl-3 py-2 space-y-3 max-h-[60vh] overflow-y-auto no-scrollbar">
              {AI_LABS_GROUPS.map((group) => (
                <div key={group.label} className="space-y-1">
                  <p className="px-3 pt-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-white/30">
                    {group.label}
                  </p>
                  {group.items.map((item) => (
                    <Link
                      key={`${group.label}-${item.label}`}
                      href={item.href}
                      onClick={onNavigate}
                      className="group block px-3 py-2 rounded-md hover:bg-white/[0.04] transition-colors duration-200"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-medium text-white/70 group-hover:text-white transition-colors duration-200">
                          {item.label}
                        </span>
                        <ArrowRight className="w-3 h-3 text-white/40 group-hover:text-white/70 group-hover:translate-x-0.5 transition-all duration-200" />
                      </div>
                      <p className="text-[11px] text-white/40 mt-0.5">
                        {item.desc}
                      </p>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── User dropdown menu item ────────────────────────────────────────
function UserMenuItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-[5px] px-3 py-2 text-[13px] transition-colors ${
        active
          ? "bg-white/[0.05] text-white"
          : "text-white/55 hover:bg-white/[0.04] hover:text-white"
      }`}
    >
      <span className="flex items-center gap-2.5">
        <Icon
          className={`h-3.5 w-3.5 transition-colors ${
            active ? "text-[#33adff]" : "text-white/40 group-hover:text-white/70"
          }`}
          strokeWidth={1.75}
        />
        <span>{label}</span>
      </span>
      {active && (
        <span
          aria-hidden
          className="block h-1 w-1 rounded-full bg-[#33adff]"
          style={{ boxShadow: "0 0 6px rgba(0,149,255,0.7)" }}
        />
      )}
    </button>
  );
}

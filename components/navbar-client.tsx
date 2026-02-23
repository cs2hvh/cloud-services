"use client";

import Link from "next/link";
import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Menu, X, ChevronDown, User, LogOut, Settings, LayoutDashboard, CreditCard,
  Server, Database, Cpu, Shield, Bot, Box, HardDrive, Rocket,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { User as SupabaseUser } from "@supabase/supabase-js";

type NavbarClientProps = {
  initialUser: SupabaseUser | null;
};

const SOLUTIONS = [
  { icon: Server, label: "Compute", desc: "Elastic virtual machines across 12 regions", href: "/services/compute" },
  { icon: Database, label: "Managed Database", desc: "PostgreSQL, MySQL & Redis clusters", href: "/services/database" },
  { icon: Cpu, label: "GPU Instances", desc: "NVIDIA H100 & A100 on demand", href: "/services/gpu" },
  { icon: Shield, label: "Security", desc: "DDoS protection & managed WAF", href: "/services/security" },
  { icon: Bot, label: "AI Agents", desc: "Deploy autonomous AI agents", href: "/services/ai-agent" },
  { icon: Box, label: "Kubernetes", desc: "Managed K8s clusters in minutes", href: "/services/kubernetes" },
  { icon: HardDrive, label: "Object Storage", desc: "S3-compatible, 11 nines durability", href: "/services/object-storage" },
  { icon: Rocket, label: "App Deploy", desc: "Git-push to 100+ edge locations", href: "/services/app-deployment" },
];

export function NavbarClient({ initialUser }: NavbarClientProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(initialUser);
  const [isLoading, setIsLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [solutionsOpen, setSolutionsOpen] = useState(false);
  const solutionsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    setUser(initialUser);
    setIsLoading(false);
  }, [initialUser]);

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

  const handleSolutionsEnter = () => {
    if (solutionsTimeout.current) clearTimeout(solutionsTimeout.current);
    setSolutionsOpen(true);
  };

  const handleSolutionsLeave = () => {
    solutionsTimeout.current = setTimeout(() => setSolutionsOpen(false), 150);
  };

  const navLinks = [
    { href: "/products", label: "Products" },
    { href: "/pricing", label: "Pricing" },
    { href: "/resources", label: "Resources" },
    { href: "/docs", label: "Docs" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 pt-4 px-4">
      {/* Pill-shaped glass bar */}
      <div className="mx-auto max-w-[75%] flex items-center h-12 px-5 rounded-full bg-white/[0.04] backdrop-blur-[48px] border border-white/[0.08] shadow-[0_0_0_0.5px_rgba(255,255,255,0.06)_inset,0_8px_32px_rgba(0,0,0,0.4)]">
        {/* Logo */}
        <Link href="/" className="text-[22px] font-normal text-white shrink-0 font-[family-name:var(--font-nunito)]">
          ahura<span className="text-[#0095FF]">sense</span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden lg:flex items-center gap-6 ml-auto">
          {/* Solutions with dropdown */}
          <div
            className="relative"
            onMouseEnter={handleSolutionsEnter}
            onMouseLeave={handleSolutionsLeave}
          >
            <button className="cursor-pointer flex items-center gap-1 text-[13px] font-medium text-white/50 hover:text-white transition-colors duration-200">
              Solutions
              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${solutionsOpen ? "rotate-180" : ""}`} />
            </button>
          </div>

          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[13px] font-medium text-white/50 hover:text-white transition-colors duration-200"
            >
              {link.label};
            </Link>
          ))}
        </div>

        {/* Auth area */}
        <div className="hidden lg:flex items-center ml-8">
          {isLoading ? (
            <div className="w-7 h-7 rounded-full bg-white/10 animate-pulse" />
          ) : user ? (
            <div className="relative">
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
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-52 rounded-lg bg-black/90 backdrop-blur-[48px] border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden z-50"
                  >
                    <div className="px-4 py-3 border-b border-white/[0.06]">
                      <p className="text-sm font-medium text-white truncate">{user.email}</p>
                    </div>
                    <div className="py-1">
                      <button onClick={() => router.push("/dashboard")} className="cursor-pointer w-full px-4 py-2 text-left text-[13px] text-white/50 hover:text-white hover:bg-white/[0.04] flex items-center gap-3 transition-colors duration-200">
                        <LayoutDashboard className="w-4 h-4" /><span>Dashboard</span>
                      </button>
                      <button onClick={() => router.push("/dashboard/profile")} className="cursor-pointer w-full px-4 py-2 text-left text-[13px] text-white/50 hover:text-white hover:bg-white/[0.04] flex items-center gap-3 transition-colors duration-200">
                        <User className="w-4 h-4" /><span>Profile</span>
                      </button>
                      <button onClick={() => router.push("/dashboard/settings")} className="cursor-pointer w-full px-4 py-2 text-left text-[13px] text-white/50 hover:text-white hover:bg-white/[0.04] flex items-center gap-3 transition-colors duration-200">
                        <Settings className="w-4 h-4" /><span>Settings</span>
                      </button>
                      <button onClick={() => router.push("/dashboard/nav/billing")} className="cursor-pointer w-full px-4 py-2 text-left text-[13px] text-white/50 hover:text-white hover:bg-white/[0.04] flex items-center gap-3 transition-colors duration-200">
                        <CreditCard className="w-4 h-4" /><span>Billing</span>
                      </button>
                    </div>
                    <div className="border-t border-white/[0.06] py-1">
                      <button onClick={handleSignOut} className="cursor-pointer w-full px-4 py-2 text-left text-[13px] text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center gap-3 transition-colors duration-200">
                        <LogOut className="w-4 h-4" /><span>Sign out</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link href="/signin" className="text-[13px] font-medium text-white/50 hover:text-white transition-colors duration-200">
                Log in
              </Link>
              <Link href="/signup" className="text-[13px] font-medium text-white bg-[#0095FF] hover:bg-[#007ad6] px-4 py-1.5 rounded-full transition-colors duration-200">
                Sign Up
              </Link>
            </div>
          )}
        </div>

        {/* Mobile menu button */}
        <button onClick={() => setIsOpen(!isOpen)} className="cursor-pointer lg:hidden ml-auto p-1.5">
          {isOpen ? <X className="w-5 h-5 text-white" /> : <Menu className="w-5 h-5 text-white" />}
        </button>
      </div>

      {/* Solutions mega-menu dropdown */}
      <AnimatePresence>
        {solutionsOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="hidden lg:block mx-auto max-w-[75%] mt-2"
            onMouseEnter={handleSolutionsEnter}
            onMouseLeave={handleSolutionsLeave}
          >
            <div className="rounded-2xl bg-black/90 backdrop-blur-[48px] border border-white/[0.08] shadow-[0_16px_48px_rgba(0,0,0,0.5)] p-6">
              <div className="grid grid-cols-4 gap-2">
                {SOLUTIONS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSolutionsOpen(false)}
                    className="group flex items-start gap-3 rounded-lg px-3 py-3 hover:bg-white/[0.04] transition-colors duration-200"
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/[0.06] border border-white/[0.08] group-hover:border-[#0095FF]/30 transition-colors duration-200">
                      <item.icon className="w-4 h-4 text-white/50 group-hover:text-[#0095FF] transition-colors duration-200" />
                    </div>
                    <div>
                      <span className="block text-[13px] font-medium text-white/80 group-hover:text-white transition-colors duration-200">
                        {item.label}
                      </span>
                      <span className="block text-[11px] leading-relaxed text-white/35 group-hover:text-white/50 transition-colors duration-200">
                        {item.desc}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden mt-2 mx-auto max-w-[75%] rounded-2xl bg-black/90 backdrop-blur-[48px] border border-white/[0.08] overflow-hidden"
          >
            <div className="px-5 py-4 space-y-1">
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
                    <Link href="/dashboard" className="block px-3 py-2.5 text-[13px] text-white/60 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors duration-200" onClick={() => setIsOpen(false)}>
                      Dashboard
                    </Link>
                    <Link href="/dashboard/nav/billing" className="block px-3 py-2.5 text-[13px] text-white/60 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors duration-200" onClick={() => setIsOpen(false)}>
                      Billing
                    </Link>
                    <button onClick={() => { handleSignOut(); setIsOpen(false); }} className="cursor-pointer w-full text-left px-3 py-2.5 text-[13px] text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors duration-200">
                      Sign out
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col gap-2 pt-1">
                    <Link href="/signin" className="block px-3 py-2.5 text-[13px] text-white/60 hover:text-white hover:bg-white/[0.04] rounded-lg text-center transition-colors duration-200" onClick={() => setIsOpen(false)}>
                      Log in
                    </Link>
                    <Link href="/signup" className="block px-3 py-2.5 text-[13px] font-medium text-white bg-[#0095FF] hover:bg-[#007ad6] rounded-lg text-center transition-colors duration-200" onClick={() => setIsOpen(false)}>
                      Sign Up
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {dropdownOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
      )}
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
            <div className="pl-3 py-1 space-y-0.5">
              {SOLUTIONS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className="flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/50 hover:text-white hover:bg-white/[0.04] rounded-md transition-colors duration-200"
                >
                  <item.icon className="w-3.5 h-3.5 text-white/30" />
                  {item.label}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Menu, X, ChevronDown, User, LogOut, Settings, LayoutDashboard, CreditCard } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { User as SupabaseUser } from "@supabase/supabase-js";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Handle scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Handle auth state
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setIsLoading(false);
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        setIsLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleSignOut = async () => {
    await fetch("/api/auth/signout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    router.push("/signin");
  };

  const navLinks = [
    { name: "Products", href: "/products" },
    { name: "Solutions", href: "/solutions" },
    { name: "Pricing", href: "/pricing" },
    { name: "Docs", href: "/docs" },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-black/30 backdrop-blur-2xl border-b border-white/10"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center group"
          >
            <span className="text-2xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent group-hover:from-blue-400 group-hover:to-purple-400 transition-all duration-300">
              AhuraSense
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className="px-4 py-2 text-gray-300 hover:text-white rounded-lg hover:bg-white/5 transition-all duration-200 text-sm font-medium"
              >
                {link.name}
              </Link>
            ))}
          </div>

          {/* Desktop Auth Buttons / User Menu */}
          <div className="hidden md:flex items-center space-x-4">
            {isLoading ? (
              <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse"></div>
            ) : user ? (
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-all duration-200 group"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                    {user.email?.charAt(0).toUpperCase()}
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
                </button>

                <AnimatePresence>
                  {dropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute right-0 mt-2 w-56 rounded-xl bg-black/80 backdrop-blur-2xl border border-white/10 shadow-2xl overflow-hidden z-50"
                    >
                      <div className="px-4 py-3 border-b border-white/10">
                        <p className="text-sm font-medium text-white">
                          {user.email}
                        </p>
                      </div>
                      
                      <div className="py-2">
                        <button
                          onClick={() => router.push("/dashboard")}
                          className="cursor-pointer w-full px-4 py-2 text-left text-sm text-gray-300 hover:text-white hover:bg-white/5 flex items-center space-x-3 transition-colors"
                        >
                          <LayoutDashboard className="w-4 h-4" />
                          <span>Dashboard</span>
                        </button>
                        <button
                          onClick={() => router.push("/dashboard/profile")}
                          className="cursor-pointer w-full px-4 py-2 text-left text-sm text-gray-300 hover:text-white hover:bg-white/5 flex items-center space-x-3 transition-colors"
                        >
                          <User className="w-4 h-4" />
                          <span>Profile</span>
                        </button>
                        <button
                          onClick={() => router.push("/dashboard/settings")}
                          className="cursor-pointer w-full px-4 py-2 text-left text-sm text-gray-300 hover:text-white hover:bg-white/5 flex items-center space-x-3 transition-colors"
                        >
                          <Settings className="w-4 h-4" />
                          <span>Settings</span>
                        </button>
                        <button
                          onClick={() => router.push("/dashboard/nav/billing")}
                          className="cursor-pointer w-full px-4 py-2 text-left text-sm text-gray-300 hover:text-white hover:bg-white/5 flex items-center space-x-3 transition-colors"
                        >
                          <CreditCard className="w-4 h-4" />
                          <span>Billing</span>
                        </button>
                      </div>

                      <div className="border-t border-white/10 py-2">
                        <button
                          onClick={handleSignOut}
                          className="w-full px-4 py-2 text-left text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center space-x-3 transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>Sign out</span>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <>
                <Link
                  href="/signin"
                  className="px-4 py-2 text-gray-300 hover:text-white transition-colors text-sm font-medium"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="relative group"
                >
                  <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                  <span className="relative px-6 py-2 bg-black rounded-lg leading-none flex items-center text-white text-sm font-medium ring-1 ring-white/10">
                    Get Started
                  </span>
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            {isOpen ? (
              <X className="w-6 h-6 text-white" />
            ) : (
              <Menu className="w-6 h-6 text-white" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-black/50 backdrop-blur-2xl border-t border-white/10"
          >
            <div className="px-4 py-4 space-y-2">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  className="block px-4 py-2 text-gray-300 hover:text-white rounded-lg hover:bg-white/5 transition-all duration-200 text-sm font-medium"
                  onClick={() => setIsOpen(false)}
                >
                  {link.name}
                </Link>
              ))}
              
              <div className="pt-4 border-t border-white/10">
                {user ? (
                  <>
                    <Link
                      href="/dashboard"
                      className="block px-4 py-2 text-gray-300 hover:text-white rounded-lg hover:bg-white/5 transition-all duration-200 text-sm font-medium"
                      onClick={() => setIsOpen(false)}
                    >
                      Dashboard
                    </Link>
                    <Link
                      href="/dashboard/nav/billing"
                      className="block px-4 py-2 text-gray-300 hover:text-white rounded-lg hover:bg-white/5 transition-all duration-200 text-sm font-medium"
                      onClick={() => setIsOpen(false)}
                    >
                      Billing
                    </Link>
                    <button
                      onClick={() => {
                        handleSignOut();
                        setIsOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-red-400 hover:text-red-300 rounded-lg hover:bg-red-500/10 transition-all duration-200 text-sm font-medium"
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/signin"
                      className="block px-4 py-2 text-gray-300 hover:text-white rounded-lg hover:bg-white/5 transition-all duration-200 text-sm font-medium"
                      onClick={() => setIsOpen(false)}
                    >
                      Sign in
                    </Link>
                    <Link
                      href="/signup"
                      className="block px-4 py-2 text-white bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg text-center transition-all duration-200 text-sm font-medium mt-2"
                      onClick={() => setIsOpen(false)}
                    >
                      Get Started
                    </Link>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Click outside to close dropdown */}
      {dropdownOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setDropdownOpen(false)}
        />
      )}
    </nav>
  );
}
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
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const router = useRouter();
  const supabase = createClient();

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

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{ backgroundColor: 'transparent' }}
    >
      <div className="relative w-full max-w-[1440px] h-20 mx-auto" style={{ borderRadius: '4px' }}>
        <div className="absolute inset-0 flex items-center px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link 
            href="/" 
            className="flex items-center"
            style={{ 
              fontFamily: 'Inter, sans-serif',
              fontSize: '24px',
              lineHeight: '20px',
              fontWeight: 400,
              color: '#FFFFFF'
            }}
          >
            ahura<span style={{ color: '#0095FF' }}>cloud</span>
          </Link>

          <div className="hidden lg:flex items-center ml-auto gap-10 xl:gap-25">
            <div className="flex items-center gap-7">
              <Link
                href="/products"
                className="inline-flex items-center"
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '12.8px',
                  lineHeight: '20px',
                  fontWeight: 400,
                  color: '#FFFFFF'
                }}
              >
                Products
              </Link>
              <Link
                href="/solutions"
                className="inline-flex items-center"
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '12.8px',
                  lineHeight: '20px',
                  fontWeight: 500,
                  color: '#FFFFFF'
                }}
              >
                Solutions
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center"
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '12.8px',
                  lineHeight: '20px',
                  fontWeight: 500,
                  color: '#FFFFFF'
                }}
              >
                Pricing
              </Link>
              <Link
                href="/resources"
                className="inline-flex items-center text-center"
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '12.8px',
                  lineHeight: '20px',
                  fontWeight: 400,
                  color: '#FFFFFF'
                }}
              >
                Resources
              </Link>
              <Link
                href="/docs"
                className="inline-flex items-center"
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '12.8px',
                  lineHeight: '20px',
                  fontWeight: 500,
                  color: '#FFFFFF'
                }}
              >
                Docs
              </Link>
            </div>

            <div className="flex items-center">
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
                          <p className="text-sm font-medium text-white">{user.email}</p>
                        </div>
                        
                        <div className="py-2">
                          <button
                            onClick={() => router.push("/dashboard")}
                            className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:text-white hover:bg-white/5 flex items-center space-x-3 transition-colors"
                          >
                            <LayoutDashboard className="w-4 h-4" />
                            <span>Dashboard</span>
                          </button>
                          <button
                            onClick={() => router.push("/dashboard/profile")}
                            className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:text-white hover:bg-white/5 flex items-center space-x-3 transition-colors"
                          >
                            <User className="w-4 h-4" />
                            <span>Profile</span>
                          </button>
                          <button
                            onClick={() => router.push("/dashboard/settings")}
                            className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:text-white hover:bg-white/5 flex items-center space-x-3 transition-colors"
                          >
                            <Settings className="w-4 h-4" />
                            <span>Settings</span>
                          </button>
                          <button
                            onClick={() => router.push("/dashboard/nav/billing")}
                            className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:text-white hover:bg-white/5 flex items-center space-x-3 transition-colors"
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
                    className="inline-flex items-center text-center hover:opacity-80 transition-opacity"
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontSize: '13.6px',
                      lineHeight: '21px',
                      fontWeight: 500,
                      color: '#FFFFFF',
                      marginRight: '12px'
                    }}
                  >
                    Log in
                  </Link>
                  <Link
                    href="/signup"
                    className="inline-flex items-center text-center justify-center hover:opacity-90 transition-opacity"
                    style={{
                      background: 'rgba(95, 165, 250, 0.94)',
                      border: '1px solid rgba(255, 255, 255, 0.31)',
                      boxShadow: '0px 4px 4px rgba(0, 0, 0, 0.25)',
                      backdropFilter: 'blur(9px)',
                      borderRadius: '3px',
                      padding: '7.47px 16px',
                      fontFamily: 'Inter, sans-serif',
                      fontSize: '13.6px',
                      lineHeight: '21px',
                      fontWeight: 500,
                      color: '#FFFFFF'
                    }}
                  >
                    Sign Up
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="lg:hidden ml-auto p-2 right-6"
          >
            {isOpen ? <X className="w-6 h-6 text-white" /> : <Menu className="w-6 h-6 text-white" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden bg-[#0a0a0f]/95 backdrop-blur-xl border-t border-white/5"
          >
            <div className="px-4 py-4 space-y-2">
              <Link href="/products" className="block px-4 py-2 text-gray-300 hover:text-white text-sm" onClick={() => setIsOpen(false)}>Products</Link>
              <Link href="/solutions" className="block px-4 py-2 text-gray-300 hover:text-white text-sm" onClick={() => setIsOpen(false)}>Solutions</Link>
              <Link href="/pricing" className="block px-4 py-2 text-gray-300 hover:text-white text-sm" onClick={() => setIsOpen(false)}>Pricing</Link>
              <Link href="/resources" className="block px-4 py-2 text-gray-300 hover:text-white text-sm" onClick={() => setIsOpen(false)}>Resources</Link>
              <Link href="/docs" className="block px-4 py-2 text-gray-300 hover:text-white text-sm" onClick={() => setIsOpen(false)}>Docs</Link>
              
              <div className="pt-4 border-t border-white/10">
                {user ? (
                  <>
                    <Link
                      href="/dashboard"
                      className="block px-4 py-2 text-gray-300 hover:text-white rounded-lg hover:bg-white/5 transition-all duration-200 text-sm"
                      onClick={() => setIsOpen(false)}
                    >
                      Dashboard
                    </Link>
                    <Link
                      href="/dashboard/nav/billing"
                      className="block px-4 py-2 text-gray-300 hover:text-white rounded-lg hover:bg-white/5 transition-all duration-200 text-sm"
                      onClick={() => setIsOpen(false)}
                    >
                      Billing
                    </Link>
                    <button
                      onClick={() => {
                        handleSignOut();
                        setIsOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-red-400 hover:text-red-300 rounded-lg hover:bg-red-500/10 transition-all duration-200 text-sm"
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/signin"
                      className="block px-4 py-2 text-gray-300 hover:text-white rounded-lg hover:bg-white/5 transition-all duration-200 text-sm"
                      onClick={() => setIsOpen(false)}
                    >
                      Sign In
                    </Link>
                    <Link
                      href="/signup"
                      className="block px-4 py-2 text-white bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg text-center transition-all duration-200 text-sm mt-2"
                      onClick={() => setIsOpen(false)}
                    >
                      Sign Up
                    </Link>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {dropdownOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setDropdownOpen(false)}
        />
      )}
    </nav>
  );
}

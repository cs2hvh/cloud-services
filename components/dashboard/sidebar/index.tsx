"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  Plus,
  LogOut,
  Circle,
  Server,
  HardDrive,
  Gamepad2,
  Database,
  Box,
  Shield,
  Lock,
  Archive,
  Cpu,
  Code,
  Menu,
  X,
  Settings,
  Users,
  Network,
  Ticket,
  Rocket,
} from "lucide-react";
import { Tables } from "@/lib/supabase/types";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

type AppSidebarProps = {
  user: {
    id: string;
    email: string | null;
    user_metadata: { full_name?: string } | null;
  };
  projects: Tables<"projects">[];
};

export function AppSidebar({ projects, user }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [computeExpanded, setComputeExpanded] = useState(
    pathname.includes("/services/compute")
  );
  const [adminExpanded, setAdminExpanded] = useState(
    pathname.includes("/admin")
  );
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Close mobile sidebar when route changes
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setIsMobileOpen(false);
      }
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Check if user is admin
  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const res = await fetch("/api/admin/proxmox/hosts", {
          cache: "no-store",
        });
        setIsAdmin(res.ok);
      } catch {
        setIsAdmin(false);
      }
    };
    checkAdmin();
  }, []);

  const handleSignOut = async () => {
    await fetch("/api/auth/signout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    router.push("/signin");
  };

  const navigation = [
    {
      name: "Dashboard",
      href: "/dashboard",
      current: pathname === "/dashboard",
    },
    {
      name: "Activity",
      href: "/dashboard/activity",
      current: pathname === "/dashboard/activity",
    },
    {
      name: "Analytics",
      href: "/dashboard/analytics",
      current: pathname === "/dashboard/analytics",
    },
  ];

  const services = [
    {
      name: "Databases",
      href: "/dashboard/services/database",
      current: pathname.includes("/services/database"),
      icon: Database,
    },
    {
      name: "Application Deployment",
      href: "/dashboard/services/apps",
      current: pathname.includes("/services/apps"),
      icon: Code,
    },
    {
      name: "Kubernetes",
      href: "/dashboard/services/kubernetes",
      current: pathname.includes("/services/kubernetes"),
      icon: Box,
    },
    {
      name: "Game Servers",
      href: "/dashboard/services/game",
      current: pathname.includes("/services/game"),
      icon: Gamepad2,
    },
    {
      name: "Network DDoS Protection",
      href: "/dashboard/services/network-ddos",
      current: pathname.includes("/services/network-ddos"),
      icon: Shield,
    },
    {
      name: "Firewall",
      href: "/dashboard/services/firewall",
      current: pathname.includes("/services/firewall"),
      icon: Lock,
    },
    {
      name: "Object Storage",
      href: "/dashboard/services/object-storage",
      current: pathname.includes("/services/object-storage"),
      icon: Archive,
    },
  ];

  const computeServices = [
    {
      name: "Bare Metal Servers",
      href: "/dashboard/services/compute/bare-metal",
      current: pathname.includes("/services/compute/bare-metal"),
      icon: HardDrive,
    },
    {
      name: "Virtual Private Servers",
      href: "/dashboard/services/compute/vps",
      current: pathname.includes("/services/compute/vps"),
      icon: Server,
    },
  ];

  // Mobile sidebar overlay and content
  const sidebarContent = (
    <>
      {/* Logo Header */}
      <div className="h-16 flex items-center justify-between px-4 sm:px-6 border-b border-slate-800/50 bg-slate-900/20">
        <Link href="/dashboard" className="flex items-center">
          <span className="text-xl font-bold text-white">AhuraSense</span>
        </Link>
        {isMobile && (
          <button
            onClick={() => setIsMobileOpen(false)}
            className="p-2 text-white hover:bg-slate-800/50 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 sm:px-4 py-4 sm:py-6 overflow-y-auto custom-scrollbar">
        {/* Primary Nav */}
        <div className="space-y-1.5">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={`
                block px-3 sm:px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200
                ${
                  item.current
                    ? "bg-white text-black shadow-sm"
                    : "text-slate-300 hover:text-white hover:bg-slate-800/50"
                }
              `}
            >
              {item.name}
            </Link>
          ))}
        </div>

        {/* Projects Section */}
        <div className="mt-6 sm:mt-10">
          <div className="flex items-center justify-between mb-3 px-1">
            <button
              onClick={() => setProjectsExpanded(!projectsExpanded)}
              className="flex items-center text-xs font-bold text-white/70 uppercase tracking-widest hover:text-white transition-colors"
            >
              Projects
              <ChevronDown
                className={`ml-1 h-3 w-3 transition-transform ${projectsExpanded ? "" : "-rotate-90"}`}
              />
            </button>
            <Link
              href="/dashboard/projects/new"
              className="text-white/60 hover:text-white transition-colors p-1 hover:bg-slate-800/30 rounded"
              title="New Project"
            >
              <Plus className="h-4 w-4" />
            </Link>
          </div>

          {projectsExpanded && (
            <div className="space-y-1">
              {projects.length > 0 ? (
                <>
                  {projects.slice(0, 5).map((project) => (
                    <Link
                      key={project.id}
                      href={`/dashboard/projects/${project.id}`}
                      className={`
                        flex items-center px-3 sm:px-4 py-2 text-sm rounded-lg transition-all duration-200
                        ${
                          pathname.includes(`/projects/${project.id}`)
                            ? "bg-white text-black font-medium"
                            : "text-white/60 hover:text-white hover:bg-slate-800/30"
                        }
                      `}
                    >
                      <Circle className="w-2 h-2 mr-3 fill-current opacity-60" />
                      <span className="truncate text-sm">{project.name}</span>
                    </Link>
                  ))}
                  {projects.length > 5 && (
                    <Link
                      href="/dashboard/projects"
                      className="block px-3 sm:px-4 py-2 text-sm text-blue-400 hover:text-blue-300 font-medium"
                    >
                      View all →
                    </Link>
                  )}
                </>
              ) : (
                <p className="px-3 sm:px-4 py-2 text-sm text-white/40">
                  No projects yet
                </p>
              )}
            </div>
          )}
        </div>

        {/* Services Section */}
        <div className="mt-6 sm:mt-10">
          <h3 className="px-1 mb-3 text-xs font-bold text-white/70 uppercase tracking-widest">
            Services
          </h3>
          <div className="space-y-1">
            {/* Compute Service with Sub-navigation */}
            <div>
              <button
                onClick={() => setComputeExpanded(!computeExpanded)}
                className={`
                  w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-md transition-all duration-150
                  ${
                    pathname.includes("/services/compute")
                      ? "bg-white text-black"
                      : "text-slate-300 hover:text-white hover:bg-slate-800/50"
                  }
                `}
              >
                <div className="flex items-center">
                  <Cpu className="w-4 h-4 mr-3" />
                  <span className="text-sm">Compute</span>
                </div>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${computeExpanded ? "" : "-rotate-90"}`}
                />
              </button>

              {computeExpanded && (
                <div className="mt-1 ml-3 sm:ml-4 space-y-1">
                  {computeServices.map((service) => {
                    const IconComponent = service.icon;
                    return (
                      <Link
                        key={service.name}
                        href={service.href}
                        className={`
                          flex items-center px-3 py-2 text-sm rounded-md transition-all duration-150
                          ${
                            service.current
                              ? "bg-slate-700 text-white font-medium"
                              : "text-slate-400 hover:text-white hover:bg-slate-800/30"
                          }
                        `}
                      >
                        <IconComponent className="w-4 h-4 mr-2" />
                        <span className="text-sm">{service.name}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Other Services */}
            {services.map((service) => {
              const IconComponent = service.icon;
              return (
                <Link
                  key={service.name}
                  href={service.href}
                  className={`
                    flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-all duration-150
                    ${
                      service.current
                        ? "bg-white text-black"
                        : "text-slate-300 hover:text-white hover:bg-slate-800/50"
                    }
                  `}
                >
                  <IconComponent className="w-4 h-4 mr-3" />
                  <span className="text-sm">{service.name}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Admin Section */}
        {isAdmin && (
          <div className="mt-6 sm:mt-10">
            <h3 className="px-1 mb-3 text-xs font-bold text-white/70 uppercase tracking-widest">
              Admin
            </h3>
            <div className="space-y-1">
              <div>
                <button
                  onClick={() => setAdminExpanded(!adminExpanded)}
                  className={`
                    w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-md transition-all duration-150
                    ${
                      pathname.includes("/dashboard/admin")
                        ? "bg-white text-black"
                        : "text-slate-300 hover:text-white hover:bg-slate-800/50"
                    }
                  `}
                >
                  <div className="flex items-center">
                    <Settings className="w-4 h-4 mr-3" />
                    <span className="text-sm">Administration</span>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${adminExpanded ? "" : "-rotate-90"}`}
                  />
                </button>

                {adminExpanded && (
                  <div className="mt-1 ml-3 sm:ml-4 space-y-1">
                    <Link
                      href="/dashboard/admin/hosts"
                      className={`
                        flex items-center px-3 py-2 text-sm rounded-md transition-all duration-150
                        ${
                          pathname === "/dashboard/admin/hosts"
                            ? "bg-slate-700 text-white font-medium"
                            : "text-slate-400 hover:text-white hover:bg-slate-800/30"
                        }
                      `}
                    >
                      <Network className="w-4 h-4 mr-2" />
                      <span className="text-sm">Proxmox Hosts</span>
                    </Link>
                    <Link
                      href="/dashboard/admin/servers"
                      className={`
                        flex items-center px-3 py-2 text-sm rounded-md transition-all duration-150
                        ${
                          pathname === "/dashboard/admin/servers"
                            ? "bg-slate-700 text-white font-medium"
                            : "text-slate-400 hover:text-white hover:bg-slate-800/30"
                        }
                      `}
                    >
                      <Server className="w-4 h-4 mr-2" />
                      <span className="text-sm">All Servers</span>
                    </Link>
                    <Link
                      href="/dashboard/admin/users"
                      className={`
                        flex items-center px-3 py-2 text-sm rounded-md transition-all duration-150
                        ${
                          pathname === "/dashboard/admin/users"
                            ? "bg-slate-700 text-white font-medium"
                            : "text-slate-400 hover:text-white hover:bg-slate-800/30"
                        }
                      `}
                    >
                      <Users className="w-4 h-4 mr-2" />
                      <span className="text-sm">Users</span>
                    </Link>
                    <Link
                      href="/dashboard/admin/databases"
                      className={`
                        flex items-center px-3 py-2 text-sm rounded-md transition-all duration-150
                        ${
                          pathname === "/dashboard/admin/databases"
                            ? "bg-slate-700 text-white font-medium"
                            : "text-slate-400 hover:text-white hover:bg-slate-800/30"
                        }
                      `}
                    >
                      <Database className="w-4 h-4 mr-2" />
                      <span className="text-sm">Databases</span>
                    </Link>
                    <Link
                      href="/dashboard/admin/object-storage"
                      className={`
    flex items-center px-3 py-2 text-sm rounded-md transition-all duration-150
    ${
      pathname.startsWith("/dashboard/admin/object-storage")
        ? "bg-slate-700 text-white font-medium"
        : "text-slate-400 hover:text-white hover:bg-slate-800/30"
    }
  `}
                    >
                      <Archive className="w-4 h-4 mr-2" />
                      <span className="text-sm">Object Storage</span>
                    </Link>
                    <Link
                      href="/dashboard/admin/network-ddos"
                      className={`
    flex items-center px-3 py-2 text-sm rounded-md transition-all duration-150
    ${
      pathname.startsWith("/dashboard/admin/network-ddos")
        ? "bg-slate-700 text-white font-medium"
        : "text-slate-400 hover:text-white hover:bg-slate-800/30"
    }
  `}
                    >
                      <Shield className="w-4 h-4 mr-2" />
                      <span className="text-sm">Network DDoS</span>
                    </Link>
                    <Link
                      href="/dashboard/admin/kubernetes"
                      className={`
    flex items-center px-3 py-2 text-sm rounded-md transition-all duration-150
    ${
      pathname.startsWith("/dashboard/admin/kubernetes")
        ? "bg-slate-700 text-white font-medium"
        : "text-slate-400 hover:text-white hover:bg-slate-800/30"
    }
  `}
                    >
                      <Box className="w-4 h-4 mr-2" />
                      <span className="text-sm">Kubernetes</span>
                    </Link>
                    <Link
                      href="/dashboard/admin/platform-apps"
                      className={`
    flex items-center px-3 py-2 text-sm rounded-md transition-all duration-150
    ${
      pathname.startsWith("/dashboard/admin/platform-apps")
        ? "bg-slate-700 text-white font-medium"
        : "text-slate-400 hover:text-white hover:bg-slate-800/30"
    }
  `}
                    >
                      <Rocket className="w-4 h-4 mr-2" />
                      <span className="text-sm">Platform-apps</span>
                    </Link>
                    <Link
                      href="/dashboard/admin/coupons"
                      className={`
                        flex items-center px-3 py-2 text-sm rounded-md transition-all duration-150
                        ${
                          pathname === "/dashboard/admin/coupons"
                            ? "bg-slate-700 text-white font-medium"
                            : "text-slate-400 hover:text-white hover:bg-slate-800/30"
                        }
                      `}
                    >
                      <Ticket className="w-4 h-4 mr-2" />
                      <span className="text-sm">Coupons</span>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Support Section */}
        <div className="mt-6 sm:mt-8">
          <h3 className="px-1 mb-3 text-xs font-bold text-white/70 uppercase tracking-widest">
            Support
          </h3>
          <div className="space-y-1">
            <Link
              href="/dashboard/settings"
              className={`
                block px-3 py-2.5 text-sm font-medium rounded-md transition-all duration-150
                ${
                  pathname.includes("/settings")
                    ? "bg-white text-black"
                    : "text-slate-300 hover:text-white hover:bg-slate-800/50"
                }
              `}
            >
              Settings
            </Link>
            <Link
              href="/docs"
              className="block px-3 py-2.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-md transition-all duration-150"
            >
              Documentation
            </Link>
            <Link
              href="/support"
              className="block px-3 py-2.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-md transition-all duration-150"
            >
              Help Center
            </Link>
          </div>
        </div>
      </nav>

      {/* User Section */}
      <div className="border-t border-slate-800/50 p-3 sm:p-4 bg-slate-900/20">
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard/nav/profile"
            className="flex items-center min-w-0 flex-1 hover:bg-slate-800/30 rounded-lg p-1 -ml-1 transition-all duration-150"
            title="View profile"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-gradient-to-br from-slate-700 to-slate-800 rounded-full flex items-center justify-center text-sm font-medium text-white">
              {user?.email?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="ml-2 sm:ml-3 min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">
                {user?.user_metadata?.full_name || user?.email?.split("@")[0]}
              </p>
              <p className="text-xs text-slate-400 truncate hidden sm:block">
                {user?.email}
              </p>
            </div>
          </Link>
          <button
            onClick={handleSignOut}
            className="ml-2 p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded transition-all duration-150"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile menu button */}
      {isMobile && (
        <button
          onClick={() => setIsMobileOpen(true)}
          className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-black border border-slate-800 rounded-lg text-white hover:bg-slate-800/50 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      {/* Mobile overlay */}
      {isMobile && isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
        ${
          isMobile
            ? `fixed inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-in-out ${
                isMobileOpen ? "translate-x-0" : "-translate-x-full"
              }`
            : "relative"
        }
        flex h-screen w-72 flex-col bg-black border-r border-slate-800/50
      `}
      >
        {sidebarContent}
      </div>

      {/* Close sidebar when clicking on content (mobile) */}
      {isMobile && isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30"
          onClick={() => setIsMobileOpen(false)}
        />
      )}
    </>
  );
}

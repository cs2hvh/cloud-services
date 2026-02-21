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
  
  Menu,
  X,
  Settings,
  Users,
  Network,
  Ticket,
  Rocket,
  ShieldCheck,
  Bot,
  Key,
  BookOpen,
  LayoutDashboard,
  Activity,
  BarChart3,
  FileText,
  HelpCircle,
  Cloud,
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
  const [aiAgentsExpanded, setAiAgentsExpanded] = useState(
    pathname.includes("/services/ai-agents")
  );
  const [adminExpanded, setAdminExpanded] = useState(
    pathname.includes("/admin")
  );
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

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
      icon: LayoutDashboard,
    },
    {
      name: "Activity",
      href: "/dashboard/activity",
      current: pathname === "/dashboard/activity",
      icon: Activity,
    },
    {
      name: "Analytics",
      href: "/dashboard/analytics",
      current: pathname === "/dashboard/analytics",
      icon: BarChart3,
    },
  ];

  const services: {
    name: string;
    href?: string;
    current?: boolean;
    icon: React.ElementType;
    expandable?: boolean;
  }[] = [
    {
      name: "Compute",
      icon: Cpu,
      expandable: true,
    },
    {
      name: "Database",
      href: "/dashboard/services/database",
      current: pathname.includes("/services/database"),
      icon: Database,
    },
    {
      name: "Application Deployment",
      href: "/dashboard/services/apps",
      current: pathname.includes("/services/apps"),
      icon: Rocket,
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

  const aiAgentsServices = [
    {
      name: "All Agents",
      href: "/dashboard/services/ai-agents",
      current: pathname === "/dashboard/services/ai-agents",
      icon: Bot,
    },
    {
      name: "Create Agent",
      href: "/dashboard/services/ai-agents/new",
      current: pathname === "/dashboard/services/ai-agents/new",
      icon: Plus,
    },
    {
      name: "Knowledge Bases",
      href: "/dashboard/services/ai-agents/knowledge-bases",
      current: pathname.includes("/ai-agents/knowledge-bases"),
      icon: BookOpen,
    },
    {
      name: "API Keys",
      href: "/dashboard/services/ai-agents/settings",
      current: pathname.includes("/ai-agents/settings"),
      icon: Key,
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

  const NavItem = ({
    href,
    current,
    icon: Icon,
    name,
  }: {
    href: string;
    current: boolean;
    icon: React.ElementType;
    name: string;
  }) => (
    <Link
      href={href}
      className={`
        group flex items-center gap-3 px-3 py-2 text-[13px] transition-all duration-200
        ${
          current
            ? "bg-white/[0.12] text-white font-medium border border-white/[0.12]"
            : "text-white/65 hover:text-white/95 hover:bg-white/[0.06]"
        }
      `}
    >
      <Icon
        className={`w-4 h-4 flex-shrink-0 ${
          current ? "text-white" : "text-white/50 group-hover:text-white/75"
        }`}
      />
      <span className="truncate">{name}</span>
    </Link>
  );

  const SectionLabel = ({
    children,
  }: {
    children: React.ReactNode;
  }) => (
    <h3 className="px-3 mb-1.5 text-[10px] font-bold text-white/50 uppercase tracking-[0.12em]">
      {children}
    </h3>
  );

  const sidebarContent = (
    <>
      {/* Logo Header */}
      <div className="h-14 flex items-center justify-between px-5 flex-shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-8 h-8 glass-icon flex items-center justify-center">
            <Cloud className="w-[18px] h-[18px] text-white/90" />
          </div>
          <span className="text-[15px] font-bold text-white tracking-tight">
            AhuraCloud
          </span>
        </Link>
        {isMobile && (
          <button
            onClick={() => setIsMobileOpen(false)}
            className="p-1.5 text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Scrollable Navigation */}
      <nav className="flex-1 px-3 overflow-y-auto custom-scrollbar space-y-5 pb-4 mt-1">
        {/* Primary Nav */}
        <div className="space-y-0.5">
          {navigation.map((item) => (
            <NavItem
              key={item.name}
              href={item.href}
              current={item.current}
              icon={item.icon}
              name={item.name}
            />
          ))}
        </div>

        {/* Projects Section */}
        <div>
          <div className="flex items-center justify-between mb-1.5 px-1">
            <button
              onClick={() => setProjectsExpanded(!projectsExpanded)}
              className="flex items-center text-[10px] font-bold text-white/50 uppercase tracking-[0.12em] hover:text-white/70 transition-colors"
            >
              Projects
              <ChevronDown
                className={`ml-1 h-2.5 w-2.5 transition-transform duration-200 ${
                  projectsExpanded ? "" : "-rotate-90"
                }`}
              />
            </button>
            <Link
              href="/dashboard/projects/new"
              className="text-white/50 hover:text-white/80 transition-colors p-0.5 hover:bg-white/[0.05]"
              title="New Project"
            >
              <Plus className="h-3.5 w-3.5" />
            </Link>
          </div>

          {projectsExpanded && (
            <div className="space-y-0.5">
              {projects.length > 0 ? (
                <>
                  {projects.slice(0, 5).map((project) => (
                    <Link
                      key={project.id}
                      href={`/dashboard/projects/${project.id}`}
                      className={`
                        flex items-center px-3 py-1.5 text-[13px] transition-all duration-200
                        ${
                          pathname.includes(`/projects/${project.id}`)
                            ? "bg-white/10 text-white font-medium"
                            : "text-white/55 hover:text-white/85 hover:bg-white/[0.05]"
                        }
                      `}
                    >
                      <Circle className="w-1.5 h-1.5 mr-3 fill-current opacity-60" />
                      <span className="truncate">{project.name}</span>
                    </Link>
                  ))}
                  {projects.length > 5 && (
                    <Link
                      href="/dashboard/projects"
                      className="block px-3 py-1.5 text-[12px] text-white/50 hover:text-white/70 font-medium transition-colors"
                    >
                      View all →
                    </Link>
                  )}
                </>
              ) : (
                <p className="px-3 py-1.5 text-[12px] text-white/35">
                  No projects yet
                </p>
              )}
            </div>
          )}
        </div>

        {/* Services Section */}
        <div>
          <SectionLabel>Services</SectionLabel>
          <div className="space-y-0.5">
            {/* Compute expandable */}
            <div>
              <button
                onClick={() => setComputeExpanded(!computeExpanded)}
                className={`
                  w-full group flex items-center justify-between px-3 py-2 text-[13px] transition-all duration-200
                  ${
                    pathname.includes("/services/compute")
                      ? "bg-white/[0.12] text-white font-medium border border-white/[0.12]"
                      : "text-white/65 hover:text-white/95 hover:bg-white/[0.06]"
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  <Cpu
                    className={`w-4 h-4 ${
                      pathname.includes("/services/compute")
                        ? "text-white"
                        : "text-white/50"
                    }`}
                  />
                  <span>Compute</span>
                </div>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-white/50 transition-transform duration-200 ${
                    computeExpanded ? "" : "-rotate-90"
                  }`}
                />
              </button>

              {computeExpanded && (
                <div className="mt-0.5 ml-4 pl-3 border-l border-white/[0.10] space-y-0.5">
                  {computeServices.map((service) => {
                    const IconComponent = service.icon;
                    return (
                      <Link
                        key={service.name}
                        href={service.href}
                        className={`
                          flex items-center gap-2.5 px-2.5 py-1.5 text-[12px] transition-all duration-200
                          ${
                            service.current
                              ? "text-white bg-white/[0.10]"
                              : "text-white/55 hover:text-white/85 hover:bg-white/[0.05]"
                          }
                        `}
                      >
                        <IconComponent className="w-3.5 h-3.5" />
                        <span>{service.name}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Flat services */}
            {services
              .filter((s) => !s.expandable)
              .map((service) => {
                const IconComponent = service.icon;
                return (
                  <NavItem
                    key={service.name}
                    href={service.href!}
                    current={service.current!}
                    icon={IconComponent}
                    name={service.name}
                  />
                );
              })}

            {/* AI Agents expandable */}
            <div>
              <button
                onClick={() => setAiAgentsExpanded(!aiAgentsExpanded)}
                className={`
                  w-full group flex items-center justify-between px-3 py-2 text-[13px] transition-all duration-200
                  ${
                    pathname.includes("/services/ai-agents")
                      ? "bg-white/[0.12] text-white font-medium border border-white/[0.12]"
                      : "text-white/65 hover:text-white/95 hover:bg-white/[0.06]"
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  <Bot
                    className={`w-4 h-4 ${
                      pathname.includes("/services/ai-agents")
                        ? "text-white"
                        : "text-white/50"
                    }`}
                  />
                  <span>AI Agents</span>
                </div>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-white/50 transition-transform duration-200 ${
                    aiAgentsExpanded ? "" : "-rotate-90"
                  }`}
                />
              </button>

              {aiAgentsExpanded && (
                <div className="mt-0.5 ml-4 pl-3 border-l border-white/[0.10] space-y-0.5">
                  {aiAgentsServices.map((service) => {
                    const IconComponent = service.icon;
                    return (
                      <Link
                        key={service.name}
                        href={service.href}
                        className={`
                          flex items-center gap-2.5 px-2.5 py-1.5 text-[12px] transition-all duration-200
                          ${
                            service.current
                              ? "text-white bg-white/[0.10]"
                              : "text-white/55 hover:text-white/85 hover:bg-white/[0.05]"
                          }
                        `}
                      >
                        <IconComponent className="w-3.5 h-3.5" />
                        <span>{service.name}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Admin Section */}
        {isAdmin && (
          <div>
            <SectionLabel>Admin</SectionLabel>
            <div className="space-y-0.5">
              <div>
                <button
                  onClick={() => setAdminExpanded(!adminExpanded)}
                  className={`
                    w-full group flex items-center justify-between px-3 py-2 text-[13px] transition-all duration-200
                    ${
                      pathname.includes("/dashboard/admin")
                        ? "bg-white/10 text-white font-medium"
                        : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    <Settings
                      className={`w-4 h-4 ${
                        pathname.includes("/dashboard/admin")
                          ? "text-white"
                          : "text-white/40"
                      }`}
                    />
                    <span>Administration</span>
                  </div>
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-white/50 transition-transform duration-200 ${
                      adminExpanded ? "" : "-rotate-90"
                    }`}
                  />
                </button>

                {adminExpanded && (
                  <div className="mt-0.5 ml-4 pl-3 border-l border-white/[0.10] space-y-0.5">
                    {[
                      { name: "Proxmox Hosts", href: "/dashboard/admin/hosts", icon: Network },
                      { name: "All Servers", href: "/dashboard/admin/servers", icon: Server },
                      { name: "Users", href: "/dashboard/admin/users", icon: Users },
                      { name: "Databases", href: "/dashboard/admin/databases", icon: Database },
                      { name: "Object Storage", href: "/dashboard/admin/object-storage", icon: Archive },
                      { name: "Network DDoS", href: "/dashboard/admin/network-ddos", icon: Shield },
                      { name: "Kubernetes", href: "/dashboard/admin/kubernetes", icon: Box },
                      { name: "Platform-apps", href: "/dashboard/admin/platform-apps", icon: Rocket },
                      { name: "Coupons", href: "/dashboard/admin/coupons", icon: Ticket },
                      { name: "Audit Logs", href: "/dashboard/admin/audit-logs", icon: ShieldCheck },
                      { name: "AI Agents", href: "/dashboard/admin/ai-agents", icon: Bot },
                    ].map((item) => {
                      const IconComponent = item.icon;
                      const isActive =
                        pathname === item.href ||
                        pathname.startsWith(item.href + "/");
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          className={`
                            flex items-center gap-2.5 px-2.5 py-1.5 text-[12px] transition-all duration-200
                            ${
                              isActive
                                ? "text-white bg-white/[0.10]"
                                : "text-white/55 hover:text-white/85 hover:bg-white/[0.05]"
                            }
                          `}
                        >
                          <IconComponent className="w-3.5 h-3.5" />
                          <span>{item.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Support Section */}
        <div>
          <SectionLabel>Support</SectionLabel>
          <div className="space-y-0.5">
            <NavItem
              href="/dashboard/settings"
              current={pathname.includes("/settings")}
              icon={Settings}
              name="Settings"
            />
            <NavItem
              href="/docs"
              current={false}
              icon={FileText}
              name="Documentation"
            />
            <NavItem
              href="/support"
              current={false}
              icon={HelpCircle}
              name="Help Center"
            />
          </div>
        </div>
      </nav>

      {/* User Footer */}
      <div className="flex-shrink-0 border-t border-white/[0.10] p-3">
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard/nav/profile"
            className="flex items-center min-w-0 flex-1 hover:bg-white/[0.04] p-1.5 -ml-1.5 transition-all duration-200"
            title="View profile"
          >
            <div className="w-8 h-8 bg-white/[0.08] border border-white/[0.10] flex items-center justify-center text-xs font-medium text-white/70">
              {user?.email?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="ml-2.5 min-w-0 flex-1">
              <p className="text-[13px] font-medium text-white/85 truncate">
                {user?.email?.split("@")[0] || "User"}
              </p>
              <p className="text-[11px] text-white/40 truncate hidden sm:block">
                {user?.email}
              </p>
            </div>
          </Link>
          <button
            onClick={handleSignOut}
            className="ml-2 p-2 text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-all duration-200"
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
          className="fixed top-3 left-3 z-50 p-2 glass-btn text-white/70 hover:text-white"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      {/* Mobile overlay */}
      {isMobile && isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 backdrop-blur-md"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
        ${
          isMobile
            ? `fixed inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-out ${
                isMobileOpen ? "translate-x-0" : "-translate-x-full"
              }`
            : "relative"
        }
        flex h-screen w-[260px] flex-col glass-sidebar
      `}
      >
        {sidebarContent}
      </div>
    </>
  );
}

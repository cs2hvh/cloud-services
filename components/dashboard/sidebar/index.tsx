"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Archive,
  BookOpen,
  Bot,
  Box,
  ChevronDown,
  Circle,
  Cloud,
  Cpu,
  Database,
  FileText,
  Gamepad2,
  HardDrive,
  HelpCircle,
  Key,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Network,
  Plus,
  Rocket,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  Ticket,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Tables } from "@/lib/supabase/types";
import { useEffect, useMemo, useState } from "react";

type AppSidebarProps = {
  user: {
    id: string;
    email: string | null;
    user_metadata: { full_name?: string } | null;
  };
  projects: Tables<"projects">[];
};

type NavLinkItem = {
  name: string;
  href: string;
  current: boolean;
  icon: LucideIcon;
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="px-1">
    <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
      {children}
    </h3>
  </div>
);

function SidebarLink({ item, compact = false }: { item: NavLinkItem; compact?: boolean }) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={`group flex items-center gap-3 border transition-colors ${
        compact ? "px-2.5 py-2 text-[12px]" : "px-3 py-2.5 text-[13px]"
      } ${
        item.current
          ? "border-blue-400/25 bg-blue-500/10 text-white"
          : "border-transparent text-white/60 hover:border-white/[0.08] hover:bg-white/[0.05] hover:text-white/88"
      }`}
    >
      <Icon
        className={`shrink-0 ${compact ? "h-3.5 w-3.5" : "h-4 w-4"} ${
          item.current ? "text-blue-200" : "text-white/45 group-hover:text-white/70"
        }`}
      />
      <span className="truncate">{item.name}</span>
    </Link>
  );
}

function ExpandableGroup({
  label,
  icon: Icon,
  expanded,
  active,
  onToggle,
  children,
}: {
  label: string;
  icon: LucideIcon;
  expanded: boolean;
  active: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={`group flex w-full items-center justify-between border px-3 py-2.5 text-[13px] transition-colors ${
          active
            ? "border-blue-400/25 bg-blue-500/10 text-white"
            : "border-transparent text-white/60 hover:border-white/[0.08] hover:bg-white/[0.05] hover:text-white/88"
        }`}
      >
        <div className="flex items-center gap-3">
          <Icon className={`h-4 w-4 shrink-0 ${active ? "text-blue-200" : "text-white/45 group-hover:text-white/70"}`} />
          <span>{label}</span>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 text-white/45 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}
        />
      </button>

      {expanded && (
        <div className="ml-4 mt-1.5 border-l border-white/[0.08] pl-3 space-y-1">
          {children}
        </div>
      )}
    </div>
  );
}

export function AppSidebar({ projects, user }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [computeExpanded, setComputeExpanded] = useState(pathname.includes("/services/compute"));
  const [aiAgentsExpanded, setAiAgentsExpanded] = useState(pathname.includes("/services/ai-agents"));
  const [adminExpanded, setAdminExpanded] = useState(pathname.includes("/admin"));
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (pathname.includes("/services/compute")) {
      setComputeExpanded(true);
    }
    if (pathname.includes("/services/ai-agents")) {
      setAiAgentsExpanded(true);
    }
    if (pathname.includes("/admin")) {
      setAdminExpanded(true);
    }
  }, [pathname]);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
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
        const res = await fetch("/api/admin/proxmox/hosts", { cache: "no-store" });
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

  const primaryNavigation: NavLinkItem[] = [
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
  ];

  const services: Array<NavLinkItem & { expandable?: boolean }> = [
    {
      name: "Compute",
      href: "/dashboard/services/compute",
      current: pathname.includes("/services/compute"),
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

  const computeServices: NavLinkItem[] = [
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

  const aiAgentsServices: NavLinkItem[] = [
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

  const adminLinks: NavLinkItem[] = [
    { name: "Proxmox Hosts", href: "/dashboard/admin/hosts", current: pathname === "/dashboard/admin/hosts" || pathname.startsWith("/dashboard/admin/hosts/"), icon: Network },
    { name: "All Servers", href: "/dashboard/admin/servers", current: pathname === "/dashboard/admin/servers" || pathname.startsWith("/dashboard/admin/servers/"), icon: Server },
    { name: "Users", href: "/dashboard/admin/users", current: pathname === "/dashboard/admin/users" || pathname.startsWith("/dashboard/admin/users/"), icon: Users },
    { name: "Databases", href: "/dashboard/admin/databases", current: pathname === "/dashboard/admin/databases" || pathname.startsWith("/dashboard/admin/databases/"), icon: Database },
    { name: "Object Storage", href: "/dashboard/admin/object-storage", current: pathname === "/dashboard/admin/object-storage" || pathname.startsWith("/dashboard/admin/object-storage/"), icon: Archive },
    { name: "Network DDoS", href: "/dashboard/admin/network-ddos", current: pathname === "/dashboard/admin/network-ddos" || pathname.startsWith("/dashboard/admin/network-ddos/"), icon: Shield },
    { name: "Kubernetes", href: "/dashboard/admin/kubernetes", current: pathname === "/dashboard/admin/kubernetes" || pathname.startsWith("/dashboard/admin/kubernetes/"), icon: Box },
    { name: "Platform Apps", href: "/dashboard/admin/platform-apps", current: pathname === "/dashboard/admin/platform-apps" || pathname.startsWith("/dashboard/admin/platform-apps/"), icon: Rocket },
    { name: "Coupons", href: "/dashboard/admin/coupons", current: pathname === "/dashboard/admin/coupons" || pathname.startsWith("/dashboard/admin/coupons/"), icon: Ticket },
    { name: "Audit Logs", href: "/dashboard/admin/audit-logs", current: pathname === "/dashboard/admin/audit-logs" || pathname.startsWith("/dashboard/admin/audit-logs/"), icon: ShieldCheck },
    { name: "AI Agents", href: "/dashboard/admin/ai-agents", current: pathname === "/dashboard/admin/ai-agents" || pathname.startsWith("/dashboard/admin/ai-agents/"), icon: Bot },
  ];

  const supportLinks: NavLinkItem[] = [
    {
      name: "Settings",
      href: "/dashboard/settings",
      current: pathname.includes("/settings"),
      icon: Settings,
    },
    {
      name: "Documentation",
      href: "/docs",
      current: false,
      icon: FileText,
    },
    {
      name: "Help Center",
      href: "/support",
      current: false,
      icon: HelpCircle,
    },
  ];

  const projectPreview = useMemo(() => projects.slice(0, 5), [projects]);
  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";

  const sidebarContent = (
    <>
      <div className="flex h-16 items-center justify-between border-b border-white/[0.08] px-4">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="glass-icon flex h-9 w-9 items-center justify-center text-blue-200">
            <Cloud className="h-[18px] w-[18px]" />
          </div>
          <div>
            <div className="text-[15px] font-semibold tracking-tight text-white">AhuraCloud</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/32">Control Plane</div>
          </div>
        </Link>

        {isMobile && (
          <button
            type="button"
            onClick={() => setIsMobileOpen(false)}
            className="flex h-9 w-9 items-center justify-center border border-white/[0.08] bg-white/[0.03] text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="custom-scrollbar flex-1 space-y-6 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {primaryNavigation.map((item) => (
            <SidebarLink key={item.name} item={item} />
          ))}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between px-1">
            <button
              type="button"
              onClick={() => setProjectsExpanded((prev) => !prev)}
              className="flex items-center text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35 transition-colors hover:text-white/60"
            >
              Projects
              <ChevronDown className={`ml-1 h-3 w-3 transition-transform duration-200 ${projectsExpanded ? "" : "-rotate-90"}`} />
            </button>
            <Link
              href="/dashboard/projects/new"
              className="flex h-6 w-6 items-center justify-center text-white/45 transition-colors hover:bg-white/[0.05] hover:text-white/75"
              title="New Project"
            >
              <Plus className="h-3.5 w-3.5" />
            </Link>
          </div>

          {projectsExpanded && (
            <div className="space-y-1">
              {projectPreview.length > 0 ? (
                <>
                  {projectPreview.map((project) => {
                    const isActive = pathname.includes(`/projects/${project.id}`);
                    return (
                      <Link
                        key={project.id}
                        href={`/dashboard/projects/${project.id}`}
                        className={`group flex items-center gap-3 border px-3 py-2 text-[12px] transition-colors ${
                          isActive
                            ? "border-blue-400/25 bg-blue-500/10 text-white"
                            : "border-transparent text-white/55 hover:border-white/[0.08] hover:bg-white/[0.05] hover:text-white/82"
                        }`}
                      >
                        <Circle className={`h-1.5 w-1.5 shrink-0 fill-current ${isActive ? "text-blue-200" : "text-white/35 group-hover:text-white/55"}`} />
                        <span className="truncate">{project.name}</span>
                      </Link>
                    );
                  })}
                  {projects.length > 5 && (
                    <Link
                      href="/dashboard/projects"
                      className="block px-3 py-1.5 text-[12px] font-medium text-white/45 transition-colors hover:text-white/72"
                    >
                      View all projects →
                    </Link>
                  )}
                </>
              ) : (
                <div className="px-3 py-2 text-[12px] text-white/35">No projects yet</div>
              )}
            </div>
          )}
        </div>

        <div>
          <SectionLabel>Services</SectionLabel>
          <div className="space-y-1">
            <ExpandableGroup
              label="Compute"
              icon={Cpu}
              expanded={computeExpanded}
              active={pathname.includes("/services/compute")}
              onToggle={() => setComputeExpanded((prev) => !prev)}
            >
              {computeServices.map((item) => (
                <SidebarLink key={item.name} item={item} compact />
              ))}
            </ExpandableGroup>

            {services
              .filter((item) => !item.expandable)
              .map((item) => (
                <SidebarLink key={item.name} item={item} />
              ))}

            <ExpandableGroup
              label="AI Agents"
              icon={Bot}
              expanded={aiAgentsExpanded}
              active={pathname.includes("/services/ai-agents")}
              onToggle={() => setAiAgentsExpanded((prev) => !prev)}
            >
              {aiAgentsServices.map((item) => (
                <SidebarLink key={item.name} item={item} compact />
              ))}
            </ExpandableGroup>
          </div>
        </div>

        {isAdmin && (
          <div>
            <SectionLabel>Administration</SectionLabel>
            <ExpandableGroup
              label="Admin Console"
              icon={Settings}
              expanded={adminExpanded}
              active={pathname.includes("/dashboard/admin")}
              onToggle={() => setAdminExpanded((prev) => !prev)}
            >
              {adminLinks.map((item) => (
                <SidebarLink key={item.name} item={item} compact />
              ))}
            </ExpandableGroup>
          </div>
        )}

        <div>
          <SectionLabel>Support</SectionLabel>
          <div className="space-y-1">
            {supportLinks.map((item) => (
              <SidebarLink key={item.name} item={item} />
            ))}
          </div>
        </div>
      </nav>

      <div className="border-t border-white/[0.08] p-3">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/dashboard/nav/profile"
            className="flex min-w-0 flex-1 items-center gap-3 border border-transparent px-2 py-2 transition-colors hover:border-white/[0.08] hover:bg-white/[0.05]"
            title="View profile"
          >
            <div className="flex h-9 w-9 items-center justify-center border border-white/[0.08] bg-white/[0.05] text-xs font-semibold text-white/75">
              {user?.email?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-white/85">{userName}</p>
              <p className="truncate text-[11px] text-white/38">{user?.email}</p>
            </div>
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex h-9 w-9 items-center justify-center border border-white/[0.08] bg-white/[0.03] text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white"
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
      {isMobile && (
        <button
          type="button"
          onClick={() => setIsMobileOpen(true)}
          className="fixed left-3 top-3 z-50 flex h-10 w-10 items-center justify-center border border-white/[0.08] bg-black/55 text-white/70 backdrop-blur-xl transition-colors hover:bg-black/70 hover:text-white"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      {isMobile && isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <div
        className={`flex h-[100dvh] w-[280px] flex-col glass-sidebar ${
          isMobile
            ? `fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-out ${
                isMobileOpen ? "translate-x-0" : "-translate-x-full"
              }`
            : "relative"
        }`}
      >
        {sidebarContent}
      </div>
    </>
  );
}

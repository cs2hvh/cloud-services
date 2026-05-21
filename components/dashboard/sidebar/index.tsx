"use client";

// AppSidebar — refined dark chrome inspired by Linear / Vercel / Railway.
//
// Design language (matched throughout the dashboard):
//   - 256px wide, pure black surface, very subtle borders (white/5–8)
//   - Active state: 1.5px left accent bar + bg-white/[0.04], no full border
//   - Hover: bg-white/[0.03] only
//   - Icons: 14px (h-3.5 w-3.5), line-weight matches lucide default
//   - Section labels: 10px uppercase, 0.16em tracking, white/35
//   - Status dots: 1.5px circles instead of big chips
//   - Spacing: tight inside items (px-2.5 py-1.5), generous between sections (mb-5)

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
    Activity,
    Archive,
    ArrowRightLeft,
    BadgeDollarSign,
    BookOpen,
    Bot,
    ChevronDown,
    Cpu,
    Database,
    FileText,
    Globe,
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
    ShoppingCart,
    Ticket,
    Users,
    X,
    type LucideIcon,
} from "lucide-react";

import { Tables } from "@/lib/supabase/types";
import { AppDeployIcon, GpuIcon, K8sIcon } from "./custom-icons";

// Cast custom SVG components to LucideIcon shape so they slot
// into the existing NavItem.icon typing without a refactor.
const GpuCloudIcon = GpuIcon as unknown as LucideIcon;
const AppDeployLucide = AppDeployIcon as unknown as LucideIcon;
const KubernetesIcon = K8sIcon as unknown as LucideIcon;

// ─── Types ────────────────────────────────────────────────────

type AppSidebarProps = {
    user: {
        id: string;
        email: string | null;
        user_metadata: { full_name?: string } | null;
    };
    projects: Tables<"projects">[];
};

type NavItem = {
    label: string;
    href: string;
    icon: LucideIcon;
    matchPrefix?: boolean;
};

type NavGroup = {
    label: string;
    icon: LucideIcon;
    href: string;
    children: NavItem[];
};

// ─── Primitives ───────────────────────────────────────────────

function isActive(pathname: string, item: { href: string; matchPrefix?: boolean }) {
    if (item.matchPrefix) return pathname === item.href || pathname.startsWith(item.href + "/");
    return pathname === item.href;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <p className="px-2.5 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
            {children}
        </p>
    );
}

function NavRow({
    item,
    pathname,
    nested = false,
}: {
    item: NavItem;
    pathname: string;
    nested?: boolean;
}) {
    const Icon = item.icon;
    const active = isActive(pathname, item);

    // Nested children render compact: no icon, no filled background. Active
    // state is conveyed by a small brand-blue dot + white text.
    if (nested) {
        return (
            <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`group relative flex items-center gap-2.5 pl-9 pr-2.5 py-1.5 text-[13px] transition-colors ${
                    active
                        ? "text-white"
                        : "text-white/55 hover:text-white/85"
                }`}
            >
                <span
                    aria-hidden
                    className="absolute left-[22px] top-1/2 -translate-y-1/2 h-1 w-1 rounded-full transition-colors"
                    style={{
                        background: active
                            ? "#0095FF"
                            : "rgba(255,255,255,0.18)",
                        boxShadow: active ? "0 0 6px #0095FF" : "none",
                    }}
                />
                <span className="truncate">{item.label}</span>
            </Link>
        );
    }

    return (
        <Link
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`group relative flex items-center gap-2.5 px-2.5 py-1.5 text-[13px] transition-colors ${
                active
                    ? "bg-white/[0.05] text-white"
                    : "text-white/55 hover:bg-white/[0.03] hover:text-white/85"
            }`}
        >
            {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] bg-[#0095FF]" />
            )}
            <Icon
                className={`h-3.5 w-3.5 shrink-0 ${
                    active ? "text-[#0095FF]" : "text-white/45 group-hover:text-white/70"
                }`}
                strokeWidth={1.75}
            />
            <span className="truncate">{item.label}</span>
        </Link>
    );
}

function GroupRow({
    group,
    pathname,
    expanded,
    onToggle,
}: {
    group: NavGroup;
    pathname: string;
    expanded: boolean;
    onToggle: () => void;
}) {
    const Icon = group.icon;
    const active = pathname.startsWith(group.href);
    return (
        <div>
            <button
                type="button"
                onClick={onToggle}
                className={`group relative flex w-full items-center gap-2.5 px-2.5 py-1.5 text-[13px]  transition-colors ${
                    active
                        ? "bg-white/[0.05] text-white"
                        : "text-white/55 hover:bg-white/[0.03] hover:text-white/85"
                }`}
            >
                {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px]  bg-[#0095FF]" />
                )}
                <Icon
                    className={`h-3.5 w-3.5 shrink-0 ${
                        active ? "text-[#0095FF]" : "text-white/45 group-hover:text-white/70"
                    }`}
                    strokeWidth={1.75}
                />
                <span className="truncate flex-1 text-left">{group.label}</span>
                <ChevronDown
                    className={`h-3 w-3 text-white/30 transition-transform duration-200 ${
                        expanded ? "" : "-rotate-90"
                    }`}
                />
            </button>
            <div
                className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                    expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
            >
                <div className="overflow-hidden">
                    <div className="mt-0.5 space-y-0.5">
                        {group.children.map((child) => (
                            <NavRow key={child.href} item={child} pathname={pathname} nested />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Sidebar ──────────────────────────────────────────────────

export function AppSidebar({ projects, user }: AppSidebarProps) {
    const pathname = usePathname();
    const router = useRouter();

    const [projectsExpanded, setProjectsExpanded] = useState(true);
    const [computeExpanded, setComputeExpanded] = useState(pathname.startsWith("/dashboard/services/compute"));
    const [gpuExpanded, setGpuExpanded] = useState(pathname.startsWith("/dashboard/services/gpu"));
    const [aiAgentsExpanded, setAiAgentsExpanded] = useState(pathname.startsWith("/dashboard/services/ai-agents"));
    const [domainsExpanded, setDomainsExpanded] = useState(pathname.startsWith("/dashboard/domains"));
    const [adminExpanded, setAdminExpanded] = useState(pathname.startsWith("/dashboard/admin"));
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => { setIsMobileOpen(false); }, [pathname]);

    useEffect(() => {
        if (pathname.startsWith("/dashboard/services/compute")) setComputeExpanded(true);
        if (pathname.startsWith("/dashboard/services/gpu")) setGpuExpanded(true);
        if (pathname.startsWith("/dashboard/services/ai-agents")) setAiAgentsExpanded(true);
        if (pathname.startsWith("/dashboard/domains")) setDomainsExpanded(true);
        if (pathname.startsWith("/dashboard/admin")) setAdminExpanded(true);
    }, [pathname]);

    useEffect(() => {
        const check = () => {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
            if (!mobile) setIsMobileOpen(false);
        };
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, []);

    useEffect(() => {
        fetch("/api/admin/proxmox/hosts", { cache: "no-store" })
            .then((r) => setIsAdmin(r.ok))
            .catch(() => setIsAdmin(false));
    }, []);

    // ─── Navigation tree (single source of truth) ─────────────
    const primary: NavItem[] = [
        { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
        { label: "Activity", href: "/dashboard/activity", icon: Activity },
    ];

    const computeGroup: NavGroup = {
        label: "Compute",
        icon: Cpu,
        href: "/dashboard/services/compute",
        children: [
            { label: "Virtual Servers", href: "/dashboard/services/compute/vps", icon: Server, matchPrefix: true },
            { label: "Bare Metal", href: "/dashboard/services/compute/bare-metal", icon: HardDrive, matchPrefix: true },
        ],
    };

    const gpuGroup: NavGroup = {
        label: "GPU Cloud",
        icon: GpuCloudIcon,
        href: "/dashboard/services/gpu",
        children: [
            { label: "Overview", href: "/dashboard/services/gpu", icon: LayoutDashboard },
            { label: "Deploy Pod", href: "/dashboard/services/gpu/deploy", icon: Plus, matchPrefix: true },
            { label: "Storage", href: "/dashboard/services/gpu/storage", icon: HardDrive, matchPrefix: true },
            { label: "Clusters", href: "/dashboard/services/gpu/enterprise", icon: Rocket, matchPrefix: true },
        ],
    };

    const domainsGroup: NavGroup = {
        label: "Domains",
        icon: Globe,
        href: "/dashboard/domains",
        children: [
            { label: "My Domains", href: "/dashboard/domains", icon: Globe },
            { label: "Buy", href: "/dashboard/domains/marketplace", icon: ShoppingCart, matchPrefix: true },
            { label: "Transfer", href: "/dashboard/domains/transfer", icon: ArrowRightLeft, matchPrefix: true },
        ],
    };

    const aiAgentsGroup: NavGroup = {
        label: "AI Agents",
        icon: Bot,
        href: "/dashboard/services/ai-agents",
        children: [
            { label: "All Agents", href: "/dashboard/services/ai-agents", icon: Bot },
            { label: "New Agent", href: "/dashboard/services/ai-agents/new", icon: Plus },
            { label: "Knowledge", href: "/dashboard/services/ai-agents/knowledge-bases", icon: BookOpen, matchPrefix: true },
            { label: "API Keys", href: "/dashboard/services/ai-agents/settings", icon: Key, matchPrefix: true },
        ],
    };

    const standaloneServices: NavItem[] = [
        { label: "Database", href: "/dashboard/services/database", icon: Database, matchPrefix: true },
        { label: "Application Deploy", href: "/dashboard/services/apps", icon: AppDeployLucide, matchPrefix: true },
        { label: "Kubernetes", href: "/dashboard/services/kubernetes", icon: KubernetesIcon, matchPrefix: true },
        { label: "Object Storage", href: "/dashboard/services/object-storage", icon: Archive, matchPrefix: true },
        { label: "DDoS Protection", href: "/dashboard/services/network-ddos", icon: Shield, matchPrefix: true },
        { label: "Firewall", href: "/dashboard/services/firewall", icon: Lock, matchPrefix: true },
    ];

    const adminGroup: NavGroup = {
        label: "Admin Console",
        icon: Settings,
        href: "/dashboard/admin",
        children: [
            { label: "Proxmox Hosts", href: "/dashboard/admin/hosts", icon: Network, matchPrefix: true },
            { label: "All Servers", href: "/dashboard/admin/servers", icon: Server, matchPrefix: true },
            { label: "Users", href: "/dashboard/admin/users", icon: Users, matchPrefix: true },
            { label: "Support", href: "/dashboard/admin/support", icon: HelpCircle, matchPrefix: true },
            { label: "Databases", href: "/dashboard/admin/databases", icon: Database, matchPrefix: true },
            { label: "Object Storage", href: "/dashboard/admin/object-storage", icon: Archive, matchPrefix: true },
            { label: "DDoS", href: "/dashboard/admin/network-ddos", icon: Shield, matchPrefix: true },
            { label: "Kubernetes", href: "/dashboard/admin/kubernetes", icon: KubernetesIcon, matchPrefix: true },
            { label: "Cluster Monitor", href: "/dashboard/admin/cluster-monitor", icon: Activity, matchPrefix: true },
            { label: "Platform Apps", href: "/dashboard/admin/platform-apps", icon: Rocket, matchPrefix: true },
            { label: "Plan Pricing", href: "/dashboard/admin/pricing/plans", icon: BadgeDollarSign, matchPrefix: true },
            { label: "Coupons", href: "/dashboard/admin/coupons", icon: Ticket, matchPrefix: true },
            { label: "Audit Logs", href: "/dashboard/admin/audit-logs", icon: ShieldCheck, matchPrefix: true },
            { label: "AI Agents", href: "/dashboard/admin/ai-agents", icon: Bot, matchPrefix: true },
            { label: "Domains", href: "/dashboard/admin/domains", icon: Globe, matchPrefix: true },
        ],
    };

    const support: NavItem[] = [
        { label: "Billing", href: "/dashboard/nav/billing", icon: BadgeDollarSign, matchPrefix: true },
        { label: "Settings", href: "/dashboard/settings", icon: Settings, matchPrefix: true },
        { label: "Help Center", href: "/dashboard/support", icon: HelpCircle, matchPrefix: true },
        { label: "Documentation", href: "/docs", icon: FileText },
    ];

    const projectPreview = useMemo(() => projects.slice(0, 5), [projects]);
    const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";

    // ─── Sidebar content (DRY for mobile + desktop) ───────────
    const content = (
        <>
            {/* Brand block */}
            <div className="flex h-14 items-center justify-between px-4 border-b border-white/[0.06]">
                <Link
                    href="/dashboard"
                    className="text-[20px] font-normal text-white leading-none tracking-tight font-[family-name:var(--font-nunito)]"
                >
                    ahura<span className="text-[#0095FF]">sense</span>
                </Link>
                {isMobile && (
                    <button
                        type="button"
                        onClick={() => setIsMobileOpen(false)}
                        className="h-7 w-7 rounded-md text-white/55 hover:bg-white/[0.05] hover:text-white flex items-center justify-center transition-colors"
                        aria-label="Close sidebar"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* Nav */}
            <nav className="custom-scrollbar flex-1 overflow-y-auto px-2 py-3">
                {/* Primary */}
                <div className="space-y-0.5 mb-5">
                    {primary.map((it) => (
                        <NavRow key={it.href} item={it} pathname={pathname} />
                    ))}
                </div>

                {/* Projects */}
                <div className="mb-5">
                    <div className="flex items-center justify-between mb-1 px-2.5">
                        <button
                            type="button"
                            onClick={() => setProjectsExpanded((p) => !p)}
                            className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35 hover:text-white/60 transition-colors"
                        >
                            Projects
                            <ChevronDown className={`h-2.5 w-2.5 transition-transform ${projectsExpanded ? "" : "-rotate-90"}`} />
                        </button>
                        <Link
                            href="/dashboard/projects/new"
                            className="h-5 w-5 rounded text-white/35 hover:bg-white/[0.05] hover:text-white/75 flex items-center justify-center transition-colors"
                            title="New project"
                        >
                            <Plus className="h-3 w-3" />
                        </Link>
                    </div>
                    {projectsExpanded && (
                        <div className="space-y-0.5">
                            {projectPreview.length > 0 ? (
                                <>
                                    {projectPreview.map((p) => {
                                        const active = pathname.includes(`/projects/${p.id}`);
                                        return (
                                            <Link
                                                key={p.id}
                                                href={`/dashboard/projects/${p.id}`}
                                                className={`group relative flex items-center gap-2.5 pl-2.5 pr-2.5 py-1.5 text-[12.5px]  transition-colors ${
                                                    active
                                                        ? "bg-white/[0.05] text-white"
                                                        : "text-white/55 hover:bg-white/[0.03] hover:text-white/85"
                                                }`}
                                            >
                                                {active && (
                                                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-3 w-[2px]  bg-[#0095FF]" />
                                                )}
                                                <span
                                                    className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                                        active ? "bg-[#0095FF]" : "bg-white/30 group-hover:bg-white/55"
                                                    }`}
                                                />
                                                <span className="truncate">{p.name}</span>
                                            </Link>
                                        );
                                    })}
                                    {projects.length > 5 && (
                                        <Link
                                            href="/dashboard/projects"
                                            className="block pl-2.5 py-1 text-[11.5px] text-white/40 hover:text-white/70 transition-colors"
                                        >
                                            View all {projects.length} →
                                        </Link>
                                    )}
                                </>
                            ) : (
                                <div className="pl-2.5 py-1 text-[11.5px] text-white/30">No projects yet</div>
                            )}
                        </div>
                    )}
                </div>

                {/* Services */}
                <div className="mb-5">
                    <SectionLabel>Services</SectionLabel>
                    <div className="space-y-0.5">
                        <GroupRow group={computeGroup} pathname={pathname} expanded={computeExpanded} onToggle={() => setComputeExpanded((p) => !p)} />
                        <GroupRow group={gpuGroup} pathname={pathname} expanded={gpuExpanded} onToggle={() => setGpuExpanded((p) => !p)} />
                        <GroupRow group={domainsGroup} pathname={pathname} expanded={domainsExpanded} onToggle={() => setDomainsExpanded((p) => !p)} />
                        {standaloneServices.map((it) => (
                            <NavRow key={it.href} item={it} pathname={pathname} />
                        ))}
                        <GroupRow group={aiAgentsGroup} pathname={pathname} expanded={aiAgentsExpanded} onToggle={() => setAiAgentsExpanded((p) => !p)} />
                    </div>
                </div>

                {/* Admin (gated) */}
                {isAdmin && (
                    <div className="mb-5">
                        <SectionLabel>Administration</SectionLabel>
                        <div className="space-y-0.5">
                            <GroupRow group={adminGroup} pathname={pathname} expanded={adminExpanded} onToggle={() => setAdminExpanded((p) => !p)} />
                        </div>
                    </div>
                )}

                {/* Support / Account */}
                <div>
                    <SectionLabel>Account</SectionLabel>
                    <div className="space-y-0.5">
                        {support.map((it) => (
                            <NavRow key={it.href} item={it} pathname={pathname} />
                        ))}
                    </div>
                </div>
            </nav>

            {/* User block */}
            <div className="border-t border-white/[0.06] p-2">
                <div className="flex items-center gap-2">
                    <Link
                        href="/dashboard/nav/profile"
                        className="flex-1 min-w-0 flex items-center gap-2.5  px-2 py-1.5 hover:bg-white/[0.03] transition-colors"
                    >
                        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-white/15 to-white/5 border border-white/10 flex items-center justify-center text-[12px] font-semibold text-white/80 shrink-0">
                            {user?.email?.charAt(0).toUpperCase() ?? "U"}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[12.5px] font-medium text-white/85 leading-tight">{userName}</p>
                            <p className="truncate text-[11px] text-white/35 leading-tight mt-0.5">{user?.email}</p>
                        </div>
                    </Link>
                    <button
                        type="button"
                        onClick={async () => {
                            await fetch("/api/auth/signout", { method: "POST", headers: { "Content-Type": "application/json" } });
                            router.push("/signin");
                        }}
                        className="h-7 w-7  text-white/45 hover:bg-white/[0.05] hover:text-white/85 flex items-center justify-center transition-colors shrink-0"
                        title="Sign out"
                    >
                        <LogOut className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
        </>
    );

    // ─── Mobile toggle + overlay ──────────────────────────────
    return (
        <>
            {isMobile && (
                <button
                    type="button"
                    onClick={() => setIsMobileOpen(true)}
                    className="fixed left-3 top-3 z-50 h-9 w-9 rounded-md border border-white/[0.08] bg-black/65 backdrop-blur-xl text-white/70 hover:text-white flex items-center justify-center transition-colors"
                    aria-label="Open sidebar"
                >
                    <Menu className="h-4 w-4" />
                </button>
            )}
            {isMobile && isMobileOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}
            <aside
                className={`flex flex-col w-[256px] h-[100dvh] bg-[#0a0b0e] border-r border-white/[0.07] ${
                    isMobile
                        ? `fixed inset-y-0 left-0 z-50 transition-transform duration-300 ${
                              isMobileOpen ? "translate-x-0" : "-translate-x-full"
                          }`
                        : "relative"
                }`}
            >
                {content}
            </aside>
        </>
    );
}

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
    Atom,
    Bell,
    ChevronDown,
    FileCode,
    FlaskConical,
    LogOut,
    Menu,
    Plug,
    ScanSearch,
    Search,
    X,
    type LucideIcon,
} from "lucide-react";

import { Tables } from "@/lib/supabase/types";
import {
    ActivityIcon,
    AppDeployIcon,
    BillingIcon,
    BookIcon,
    BotIcon,
    BucketIcon,
    CartIcon,
    ComputeIcon,
    DatabaseIcon,
    DocsIcon,
    GlobeIcon,
    GpuIcon,
    HardDriveIcon,
    HelpIcon,
    K8sIcon,
    KeyIcon,
    NetworkIcon,
    OverviewIcon,
    PlusIcon,
    RocketIcon,
    ServerIcon,
    SettingsIcon,
    ShieldCheckIcon,
    ShieldIcon,
    TicketIcon,
    TransferIcon,
    UsersIcon,
} from "./custom-icons";

// Cast custom SVG components to LucideIcon shape so they slot
// into the existing NavItem.icon typing without a refactor.
const CastIcon = <T,>(c: T) => c as unknown as LucideIcon;

const GpuCloudIcon = CastIcon(GpuIcon);
const AppDeployLucide = CastIcon(AppDeployIcon);
const KubernetesIcon = CastIcon(K8sIcon);
const Overview = CastIcon(OverviewIcon);
const Cpu = CastIcon(ComputeIcon);
const Server = CastIcon(ServerIcon);
const HardDrive = CastIcon(HardDriveIcon);
const Database = CastIcon(DatabaseIcon);
const Archive = CastIcon(BucketIcon);
const Globe = CastIcon(GlobeIcon);
const ShoppingCart = CastIcon(CartIcon);
const ArrowRightLeft = CastIcon(TransferIcon);
const Network = CastIcon(NetworkIcon);
const Shield = CastIcon(ShieldIcon);
const ShieldCheck = CastIcon(ShieldCheckIcon);
const Settings = CastIcon(SettingsIcon);
const Users = CastIcon(UsersIcon);
const HelpCircle = CastIcon(HelpIcon);
const Activity = CastIcon(ActivityIcon);
const BadgeDollarSign = CastIcon(BillingIcon);
const Ticket = CastIcon(TicketIcon);
const Bot = CastIcon(BotIcon);
const FileText = CastIcon(DocsIcon);
const BookOpen = CastIcon(BookIcon);
const Key = CastIcon(KeyIcon);
const Rocket = CastIcon(RocketIcon);
const Plus = CastIcon(PlusIcon);
const LayoutDashboard = Overview;

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

/**
 * Inline section divider inside an expanded group's children list.
 * Renders as a small uppercase label between items so 16-entry groups
 * (Inference) read as 3-4 functional clusters rather than one wall.
 */
type NavSectionHeader = {
    kind: "section";
    label: string;
};

type NavChildEntry = NavItem | NavSectionHeader;

function isSectionHeader(entry: NavChildEntry): entry is NavSectionHeader {
    return (entry as NavSectionHeader).kind === "section";
}

type NavGroup = {
    label: string;
    icon: LucideIcon;
    href: string;
    children: NavChildEntry[];
};

// ─── Primitives ───────────────────────────────────────────────

function isActive(pathname: string, item: { href: string; matchPrefix?: boolean }) {
    if (item.matchPrefix) return pathname === item.href || pathname.startsWith(item.href + "/");
    return pathname === item.href;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="px-2.5 mb-2 flex items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                {children}
            </p>
            <span className="flex-1 h-px bg-gradient-to-r from-white/[0.09] to-transparent" aria-hidden />
        </div>
    );
}

// Stable color picked from id, used for project avatars
const PROJECT_PALETTE = [
    "from-[#0095FF] to-[#0066B3]",
    "from-[#a78bfa] to-[#7c3aed]",
    "from-[#22d3ee] to-[#0891b2]",
    "from-[#4ade80] to-[#16a34a]",
    "from-[#fbbf24] to-[#d97706]",
    "from-[#f472b6] to-[#db2777]",
    "from-[#fb7185] to-[#e11d48]",
];

function projectGradient(id: string): string {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return PROJECT_PALETTE[Math.abs(h) % PROJECT_PALETTE.length];
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
                        : "text-white/60 hover:text-white/90"
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
            className={`group relative flex items-center gap-2.5 px-2.5 py-1.5 text-[13px] rounded-[5px] transition-all duration-150 ${
                active
                    ? "bg-white text-[#0a0b0e] font-medium shadow-sm"
                    : "text-white/65 hover:bg-white/[0.04] hover:text-white"
            }`}
        >
            <Icon
                className={`h-3.5 w-3.5 shrink-0 transition-colors ${
                    active ? "text-[#0a0b0e]" : "text-white/50 group-hover:text-white/85"
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
    badge,
}: {
    group: NavGroup;
    pathname: string;
    expanded: boolean;
    onToggle: () => void;
    badge?: React.ReactNode;
}) {
    const Icon = group.icon;
    const active = pathname.startsWith(group.href);
    return (
        <div>
            <button
                type="button"
                onClick={onToggle}
                className={`group relative flex w-full items-center gap-2.5 px-2.5 py-1.5 text-[13px] rounded-[5px] transition-all duration-150 ${
                    active
                        ? "bg-white text-[#0a0b0e] font-medium shadow-sm"
                        : "text-white/65 hover:bg-white/[0.04] hover:text-white"
                }`}
            >
                <Icon
                    className={`h-3.5 w-3.5 shrink-0 transition-colors ${
                        active ? "text-[#0a0b0e]" : "text-white/50 group-hover:text-white/85"
                    }`}
                    strokeWidth={1.75}
                />
                <span className="truncate flex-1 text-left">{group.label}</span>
                {badge}
                <ChevronDown
                    className={`h-3 w-3 transition-transform duration-200 ${
                        active ? "text-[#0a0b0e]/45" : "text-white/30"
                    } ${expanded ? "" : "-rotate-90"}`}
                />
            </button>
            <div
                className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                    expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
            >
                <div className="overflow-hidden">
                    <div className="mt-0.5 space-y-0.5">
                        {group.children.map((child, idx) =>
                            isSectionHeader(child) ? (
                                <p
                                    key={`section-${idx}-${child.label}`}
                                    className="pl-9 pr-2.5 pt-2.5 pb-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/30"
                                >
                                    {child.label}
                                </p>
                            ) : (
                                <NavRow key={child.href} item={child} pathname={pathname} nested />
                            )
                        )}
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
    const [inferenceExpanded, setInferenceExpanded] = useState(pathname.startsWith("/dashboard/services/inference"));
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
        if (pathname.startsWith("/dashboard/services/inference")) setInferenceExpanded(true);
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

    const inferenceGroup: NavGroup = {
        label: "A.I. Labs",
        icon: Atom,
        href: "/dashboard/services/inference",
        children: [
            // Overview always lives at the very top — it's the "home" of
            // the inference section, not part of any subgroup.
            { label: "Overview", href: "/dashboard/services/inference", icon: LayoutDashboard },

            // ─── Workloads: async / long-running jobs ─────────
            { kind: "section", label: "Workloads" },
            { label: "Fine-Tuning", href: "/dashboard/services/inference/fine-tuning", icon: GpuCloudIcon, matchPrefix: true },
            { label: "Deployments", href: "/dashboard/services/inference/deployments", icon: AppDeployLucide, matchPrefix: true },
            { label: "Batches", href: "/dashboard/services/inference/batches", icon: FileText, matchPrefix: true },
            { label: "Vectors", href: "/dashboard/services/inference/vectors", icon: Database, matchPrefix: true },

            // ─── Build: things you USE to make calls ──────────
            { kind: "section", label: "Build" },
            { label: "Models", href: "/dashboard/services/inference/models", icon: BookOpen, matchPrefix: true },
            { label: "Agents", href: "/dashboard/services/agents", icon: Bot, matchPrefix: true },
            { label: "MCP Servers", href: "/dashboard/services/agents/mcp-servers", icon: Plug },
            { label: "Playground", href: "/dashboard/services/inference/playground", icon: Bot, matchPrefix: true },
            { label: "Prompts", href: "/dashboard/services/inference/prompts", icon: FileCode, matchPrefix: true },
            { label: "Guardrails", href: "/dashboard/services/inference/guardrails", icon: Shield, matchPrefix: true },
            { label: "Presets", href: "/dashboard/services/inference/presets", icon: Rocket, matchPrefix: true },
            { label: "API Keys", href: "/dashboard/services/inference/api-keys", icon: Key, matchPrefix: true },
            { label: "BYOK Keys", href: "/dashboard/services/inference/byok-keys", icon: Key, matchPrefix: true },

            // ─── Manage: observe + configure + org admin ──────
            { kind: "section", label: "Manage" },
            { label: "Evals", href: "/dashboard/services/inference/evals", icon: FlaskConical, matchPrefix: true },
            { label: "Observe", href: "/dashboard/services/inference/observe", icon: ScanSearch, matchPrefix: true },
            { label: "Usage", href: "/dashboard/services/inference/usage", icon: Activity, matchPrefix: true },
            { label: "Notifications", href: "/dashboard/services/inference/notifications", icon: Bell, matchPrefix: true },
            { label: "Audit Log", href: "/dashboard/services/inference/audit", icon: ShieldCheck, matchPrefix: true },
            { label: "Service health", href: "/dashboard/services/inference/diagnostics", icon: Activity, matchPrefix: true },
            { label: "Settings", href: "/dashboard/services/inference/settings", icon: Settings, matchPrefix: true },
        ],
    };

    const standaloneServices: NavItem[] = [
        { label: "Database", href: "/dashboard/services/database", icon: Database, matchPrefix: true },
        { label: "Application Deploy", href: "/dashboard/services/apps", icon: AppDeployLucide, matchPrefix: true },
        { label: "Kubernetes", href: "/dashboard/services/kubernetes", icon: KubernetesIcon, matchPrefix: true },
        { label: "Object Storage", href: "/dashboard/services/object-storage", icon: Archive, matchPrefix: true },
        { label: "DDoS Protection", href: "/dashboard/services/network-ddos", icon: Shield, matchPrefix: true },
        // Firewall hidden for now — re-add when the service ships.
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
            { label: "GPU Stock", href: "/dashboard/admin/gpu", icon: GpuCloudIcon, matchPrefix: true },
            { label: "Coupons", href: "/dashboard/admin/coupons", icon: Ticket, matchPrefix: true },
            { label: "Audit Logs", href: "/dashboard/admin/audit-logs", icon: ShieldCheck, matchPrefix: true },
            { label: "AI Agents", href: "/dashboard/admin/ai-agents", icon: Bot, matchPrefix: true },
            { label: "AI Model Pricing", href: "/dashboard/admin/inference-pricing", icon: BadgeDollarSign, matchPrefix: true },
            { label: "Inference Agents", href: "/dashboard/admin/inference-agents", icon: Bot, matchPrefix: true },
            { label: "Inference Orgs", href: "/dashboard/admin/inference-orgs", icon: Users, matchPrefix: true },
            { label: "Inference Usage", href: "/dashboard/admin/inference-usage", icon: Activity, matchPrefix: true },
            { label: "Inference Audit", href: "/dashboard/admin/inference-audit", icon: ShieldCheck, matchPrefix: true },
            { label: "Domains", href: "/dashboard/admin/domains", icon: Globe, matchPrefix: true },
        ],
    };

    const support: NavItem[] = [
        { label: "Billing", href: "/dashboard/nav/billing", icon: BadgeDollarSign, matchPrefix: true },
        { label: "Settings", href: "/dashboard/settings", icon: Settings, matchPrefix: true },
        { label: "Help Center", href: "/dashboard/support", icon: HelpCircle, matchPrefix: true },
        { label: "API Documentation", href: "/api-docs", icon: FileText },
    ];

    const projectPreview = useMemo(() => projects.slice(0, 5), [projects]);
    const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";

    // ─── Sidebar content (DRY for mobile + desktop) ───────────
    const content = (
        <>
            {/* Brand block */}
            <div className="relative flex h-14 items-center justify-center px-4 border-b border-white/[0.06]">
                <Link
                    href="/dashboard"
                    className="group inline-flex items-center text-[20px] font-semibold text-white leading-none tracking-[-0.025em] font-[family-name:var(--font-nunito)]"
                >
                    <span>ahura</span><span className="bg-gradient-to-r from-[#0095FF] to-[#4db8ff] bg-clip-text text-transparent group-hover:from-[#36b3ff] group-hover:to-[#7cd0ff] transition-all">sense</span>
                </Link>
                {isMobile && (
                    <button
                        type="button"
                        onClick={() => setIsMobileOpen(false)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md text-white/55 hover:bg-white/[0.05] hover:text-white flex items-center justify-center transition-colors"
                        aria-label="Close sidebar"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* Search */}
            <div className="px-3 pt-3 pb-1">
                <div className="relative group">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30 group-focus-within:text-white/55 transition-colors" />
                    <input
                        type="text"
                        placeholder="Search resources"
                        className="w-full h-8 pl-8 pr-12 text-[12.5px] text-white placeholder:text-white/30 bg-white/[0.025] border border-white/[0.06] rounded-[5px] focus:outline-none focus:border-[#0095FF]/40 focus:ring-1 focus:ring-[#0095FF]/25 focus:bg-white/[0.04] transition-colors"
                    />
                    <kbd className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[9.5px] font-medium text-white/40 bg-white/[0.04] border border-white/[0.08] rounded font-[var(--font-geist-mono),ui-monospace,monospace] tabular-nums">
                        ⌘K
                    </kbd>
                </div>
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
                    <div className="flex items-center justify-between mb-2 px-2.5">
                        <button
                            type="button"
                            onClick={() => setProjectsExpanded((p) => !p)}
                            className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35 hover:text-white/60 transition-colors"
                        >
                            Projects
                            <span className="ml-1 text-white/25 tabular-nums">{projects.length}</span>
                            <ChevronDown className={`h-2.5 w-2.5 ml-0.5 transition-transform ${projectsExpanded ? "" : "-rotate-90"}`} />
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
                                        const initial = (p.name || "?").charAt(0).toUpperCase();
                                        return (
                                            <Link
                                                key={p.id}
                                                href={`/dashboard/projects/${p.id}`}
                                                className={`group relative flex items-center gap-2.5 pl-2.5 pr-2.5 py-1.5 text-[12.5px] rounded-[4px] transition-colors ${
                                                    active
                                                        ? "bg-white/[0.05] text-white"
                                                        : "text-white/65 hover:bg-white/[0.03] hover:text-white"
                                                }`}
                                            >
                                                {active && (
                                                    <span
                                                        className="absolute left-0 top-1/2 -translate-y-1/2 h-3 w-[2px] bg-[#0095FF] rounded-r"
                                                        style={{ boxShadow: "0 0 8px rgba(0,149,255,0.65)" }}
                                                    />
                                                )}
                                                <span
                                                    className={`h-5 w-5 shrink-0 inline-flex items-center justify-center text-[9.5px] font-semibold text-white/95 rounded-[4px] bg-gradient-to-br ${projectGradient(p.id)} ${active ? "ring-1 ring-white/15" : ""}`}
                                                    style={{
                                                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
                                                    }}
                                                >
                                                    {initial}
                                                </span>
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
                                <Link
                                    href="/dashboard/projects/new"
                                    className="flex items-center gap-2 mx-2 px-3 py-2 text-[11.5px] text-white/45 hover:text-white border border-dashed border-white/[0.1] hover:border-white/20 rounded-[4px] transition-colors"
                                >
                                    <Plus className="h-3 w-3" />
                                    Create a project
                                </Link>
                            )}
                        </div>
                    )}
                </div>

                {/* Services */}
                <div className="mb-5">
                    <SectionLabel>Services</SectionLabel>
                    <div className="space-y-0.5">
                        <GroupRow group={computeGroup} pathname={pathname} expanded={computeExpanded} onToggle={() => setComputeExpanded((p) => !p)} />
                        <GroupRow
                            group={gpuGroup}
                            pathname={pathname}
                            expanded={gpuExpanded}
                            onToggle={() => setGpuExpanded((p) => !p)}
                        />
                        {/* A.I. Labs brought up — grouped with the other compute/AI verticals */}
                        <GroupRow group={inferenceGroup} pathname={pathname} expanded={inferenceExpanded} onToggle={() => setInferenceExpanded((p) => !p)} />
                        {/* Core managed services: Database, Application Deploy, Kubernetes */}
                        {standaloneServices.slice(0, 3).map((it) => (
                            <NavRow key={it.href} item={it} pathname={pathname} />
                        ))}
                        {/* Domains moved down — below Kubernetes */}
                        <GroupRow group={domainsGroup} pathname={pathname} expanded={domainsExpanded} onToggle={() => setDomainsExpanded((p) => !p)} />
                        {/* Remaining managed services: Object Storage, DDoS Protection */}
                        {standaloneServices.slice(3).map((it) => (
                            <NavRow key={it.href} item={it} pathname={pathname} />
                        ))}
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

            {/* System status pill */}
            <a
                href="https://status.ahuracloud.com"
                target="_blank"
                rel="noopener noreferrer"
                className="mx-2 mb-1 flex items-center gap-2 px-2.5 py-1.5 rounded-[5px] hover:bg-white/[0.03] transition-colors group"
                title="System status"
            >
                <span className="relative inline-flex h-1.5 w-1.5 shrink-0">
                    <span
                        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                        style={{ background: "#4ade80" }}
                    />
                    <span
                        className="relative inline-flex h-1.5 w-1.5 rounded-full"
                        style={{ background: "#4ade80", boxShadow: "0 0 5px #4ade80" }}
                    />
                </span>
                <span className="text-[11px] text-white/55 group-hover:text-white/85 transition-colors flex-1 truncate">
                    All systems operational
                </span>
                <span className="text-[10px] text-white/30 font-[var(--font-geist-mono),ui-monospace,monospace] tabular-nums">
                    99.9%
                </span>
            </a>

            {/* User block */}
            <div className="border-t border-white/[0.06] p-2">
                <div className="flex items-center gap-2">
                    <Link
                        href="/dashboard/nav/profile"
                        className="flex-1 min-w-0 flex items-center gap-2.5 px-2 py-1.5 rounded-[5px] hover:bg-white/[0.03] transition-colors"
                    >
                        <div
                            className="h-8 w-8 rounded-full bg-gradient-to-br from-[#0095FF]/40 to-[#0095FF]/10 border border-white/10 flex items-center justify-center text-[12.5px] font-semibold text-white shrink-0"
                            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)" }}
                        >
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
                        className="h-8 w-8 rounded-[5px] text-white/45 hover:bg-white/[0.05] hover:text-white/85 flex items-center justify-center transition-colors shrink-0"
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
                className={`flex flex-col w-[256px] h-[100dvh] bg-gradient-to-b from-[#0b0c10] to-[#08090b] border-r border-white/[0.07] ${
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

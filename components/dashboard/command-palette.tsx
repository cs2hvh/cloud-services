"use client";

// Command palette (⌘K) — fast keyboard-driven navigation + quick actions across
// the dashboard. Opened from the header search box or ⌘K / Ctrl+K. Filter by
// typing; ↑/↓ to move, ↵ to go, esc to close.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Bot, Boxes, Cpu, CreditCard, Database, Globe, HardDrive, LayoutDashboard,
    LifeBuoy, Plus, Search, Server, Settings, Sparkles, User,
} from "lucide-react";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_DIM = "rgba(0,149,255,0.10)";

type Dest = {
    label: string;
    href: string;
    group: string;
    icon: React.ComponentType<{ className?: string }>;
    keywords?: string;
};

const DESTINATIONS: Dest[] = [
    { label: "Overview", href: "/dashboard", group: "General", icon: LayoutDashboard, keywords: "home dashboard" },
    { label: "Projects", href: "/dashboard/projects", group: "General", icon: Boxes },

    { label: "New Server", href: "/dashboard/services/compute/vps/new", group: "Compute", icon: Plus, keywords: "create vps deploy launch vm" },
    { label: "Virtual Servers", href: "/dashboard/services/compute/vps", group: "Compute", icon: Server, keywords: "vps vm instances" },
    { label: "Custom Images", href: "/dashboard/services/compute/images", group: "Compute", icon: HardDrive, keywords: "image os qcow2 snapshot byo" },
    { label: "Bare Metal", href: "/dashboard/services/compute/bare-metal", group: "Compute", icon: Server },

    { label: "GPU Cloud", href: "/dashboard/services/gpu", group: "GPU", icon: Cpu, keywords: "gpu pods" },
    { label: "Deploy GPU Pod", href: "/dashboard/services/gpu/deploy", group: "GPU", icon: Plus, keywords: "gpu create" },
    { label: "GPU Storage", href: "/dashboard/services/gpu/storage", group: "GPU", icon: HardDrive },
    { label: "GPU Clusters", href: "/dashboard/services/gpu/enterprise", group: "GPU", icon: Boxes },

    { label: "A.I. Labs", href: "/dashboard/services/inference", group: "A.I. Labs", icon: Sparkles, keywords: "inference ai" },
    { label: "Models", href: "/dashboard/services/inference/models", group: "A.I. Labs", icon: Sparkles },
    { label: "Playground", href: "/dashboard/services/inference/playground", group: "A.I. Labs", icon: Sparkles, keywords: "chat test" },
    { label: "Fine-Tuning", href: "/dashboard/services/inference/fine-tuning", group: "A.I. Labs", icon: Sparkles, keywords: "train ft" },
    { label: "Deployments", href: "/dashboard/services/inference/deployments", group: "A.I. Labs", icon: Sparkles, keywords: "serving" },
    { label: "Vectors", href: "/dashboard/services/inference/vectors", group: "A.I. Labs", icon: Database, keywords: "embeddings rag" },
    { label: "Batches", href: "/dashboard/services/inference/batches", group: "A.I. Labs", icon: Sparkles },
    { label: "API Keys", href: "/dashboard/services/inference/api-keys", group: "A.I. Labs", icon: Settings, keywords: "token" },
    { label: "Usage", href: "/dashboard/services/inference/usage", group: "A.I. Labs", icon: Settings, keywords: "billing tokens" },

    { label: "AI Agents", href: "/dashboard/services/ai-agents", group: "AI Agents", icon: Bot },
    { label: "New Agent", href: "/dashboard/services/ai-agents/new", group: "AI Agents", icon: Plus },
    { label: "Knowledge Bases", href: "/dashboard/services/ai-agents/knowledge-bases", group: "AI Agents", icon: Database },

    { label: "Game Servers", href: "/dashboard/services/game", group: "Services", icon: Boxes, keywords: "minecraft rust cs2 fivem gaming" },
    { label: "Deploy Game Server", href: "/dashboard/services/game/deploy", group: "Services", icon: Plus, keywords: "minecraft rust new game" },
    { label: "Database", href: "/dashboard/services/database", group: "Services", icon: Database, keywords: "postgres sql" },
    { label: "Kubernetes", href: "/dashboard/services/kubernetes", group: "Services", icon: Boxes, keywords: "k8s clusters" },
    { label: "Object Storage", href: "/dashboard/services/object-storage", group: "Services", icon: HardDrive, keywords: "s3 buckets" },
    { label: "DDoS Protection", href: "/dashboard/services/network-ddos", group: "Services", icon: Globe },
    { label: "Firewall", href: "/dashboard/services/firewall", group: "Services", icon: Globe },
    { label: "Platform Apps", href: "/dashboard/services/apps", group: "Services", icon: Boxes },

    { label: "Domains", href: "/dashboard/domains", group: "Domains", icon: Globe },
    { label: "Buy a Domain", href: "/dashboard/domains/marketplace", group: "Domains", icon: Plus },
    { label: "Transfer Domain", href: "/dashboard/domains/transfer", group: "Domains", icon: Globe },

    { label: "Billing", href: "/dashboard/nav/billing", group: "Account", icon: CreditCard, keywords: "credits balance invoice payment" },
    { label: "Profile", href: "/dashboard/nav/profile", group: "Account", icon: User },
    { label: "Settings", href: "/dashboard/settings", group: "Account", icon: Settings },
    { label: "Support", href: "/dashboard/support", group: "Account", icon: LifeBuoy, keywords: "help ticket" },
];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return DESTINATIONS;
        return DESTINATIONS.filter((d) =>
            `${d.label} ${d.group} ${d.keywords ?? ""}`.toLowerCase().includes(q)
        );
    }, [query]);

    // Reset state whenever it opens; focus the input.
    useEffect(() => {
        if (open) {
            setQuery("");
            setActive(0);
            // focus after paint
            const t = setTimeout(() => inputRef.current?.focus(), 20);
            return () => clearTimeout(t);
        }
    }, [open]);

    useEffect(() => {
        setActive(0);
    }, [query]);

    // Keep the highlighted row in view.
    useEffect(() => {
        const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
        el?.scrollIntoView({ block: "nearest" });
    }, [active]);

    if (!open) return null;

    const go = (href: string) => {
        onOpenChange(false);
        router.push(href);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(filtered.length - 1, i + 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
        } else if (e.key === "Enter") {
            e.preventDefault();
            const dest = filtered[active];
            if (dest) go(dest.href);
        } else if (e.key === "Escape") {
            e.preventDefault();
            onOpenChange(false);
        }
    };

    let runningIndex = -1;
    let lastGroup = "";

    return (
        <div
            className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]"
            onMouseDown={() => onOpenChange(false)}
        >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
            <div
                className="relative w-full max-w-[560px] border border-white/[0.1] bg-[#111216] rounded-[10px] shadow-[0_24px_70px_-12px_rgba(0,0,0,0.8)] overflow-hidden"
                onMouseDown={(e) => e.stopPropagation()}
            >
                {/* Input */}
                <div className="flex items-center gap-2.5 px-4 h-12 border-b border-white/[0.07]">
                    <Search className="h-4 w-4 text-white/40 shrink-0" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder="Search servers, services, pages…"
                        className="flex-1 bg-transparent text-[13.5px] text-white placeholder:text-white/30 outline-none"
                    />
                    <kbd className={`${MONO} hidden sm:inline-flex items-center h-5 px-1.5 rounded-[3px] border border-white/[0.1] bg-white/[0.04] text-[10px] text-white/40`}>
                        esc
                    </kbd>
                </div>

                {/* Results */}
                <div ref={listRef} className="max-h-[52vh] overflow-y-auto custom-scrollbar py-2">
                    {filtered.length === 0 ? (
                        <div className={`${MONO} px-4 py-10 text-center text-[12px] text-white/40`}>
                            No matches for “{query}”.
                        </div>
                    ) : (
                        filtered.map((d) => {
                            runningIndex += 1;
                            const idx = runningIndex;
                            const showGroup = d.group !== lastGroup;
                            lastGroup = d.group;
                            const isActive = idx === active;
                            const Icon = d.icon;
                            return (
                                <div key={d.href}>
                                    {showGroup && (
                                        <div className={`${MONO} px-4 pt-3 pb-1.5 text-[10px] uppercase tracking-[0.14em] text-white/30`}>
                                            {d.group}
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        data-idx={idx}
                                        onMouseEnter={() => setActive(idx)}
                                        onClick={() => go(d.href)}
                                        className="w-full flex items-center gap-3 px-3 mx-1 h-9 rounded-[6px] text-left transition-colors"
                                        style={{ width: "calc(100% - 8px)", background: isActive ? ACCENT_DIM : "transparent" }}
                                    >
                                        <span
                                            className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded-[5px] border border-white/[0.08]"
                                            style={{ color: isActive ? ACCENT : "rgba(255,255,255,0.6)", background: isActive ? "rgba(0,149,255,0.06)" : "#0d0e11" }}
                                        >
                                            <Icon className="h-3.5 w-3.5" />
                                        </span>
                                        <span className="text-[13px] text-white/90 truncate">{d.label}</span>
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer hints */}
                <div className={`${MONO} flex items-center gap-4 px-4 h-9 border-t border-white/[0.07] text-[10px] text-white/30`}>
                    <span><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
                    <span><Kbd>↵</Kbd> open</span>
                    <span className="ml-auto"><Kbd>esc</Kbd> close</span>
                </div>
            </div>
        </div>
    );
}

function Kbd({ children }: { children: React.ReactNode }) {
    return (
        <kbd className="inline-flex items-center justify-center h-4 min-w-4 px-1 mr-0.5 rounded-[3px] border border-white/[0.1] bg-white/[0.04] text-white/45">
            {children}
        </kbd>
    );
}

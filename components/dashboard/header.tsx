"use client";

// DashboardHeader — slim top bar matched to the new sidebar's
// refined-dark design language. Renders breadcrumbs derived from
// the current pathname plus a search input that pretends to be
// cmd+K (the actual command palette can be wired later).
//
// children slot is where layout slots notifications / billing /
// account icons so the header stays presentational.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Search, BadgeDollarSign, User } from "lucide-react";
import { useMemo } from "react";

type Crumb = { label: string; href: string };

/**
 * Build breadcrumbs from the URL. Skips noisy segments and
 * humanizes the rest (turns "ai-agents" into "AI Agents",
 * "vps" into "VPS", etc.).
 */
function buildCrumbs(pathname: string): Crumb[] {
    const skip = new Set(["dashboard", "nav", "services"]);
    const overrides: Record<string, string> = {
        vps: "VPS",
        gpu: "GPU",
        ddos: "DDoS",
        "ai-agents": "AI Agents",
        ai: "AI",
        api: "API",
        sql: "SQL",
        "object-storage": "Object Storage",
        "network-ddos": "DDoS Protection",
        "bare-metal": "Bare Metal",
    };
    const parts = pathname.split("/").filter(Boolean);
    const crumbs: Crumb[] = [{ label: "Overview", href: "/dashboard" }];
    let href = "";
    for (const part of parts) {
        href += "/" + part;
        if (skip.has(part)) continue;
        const label =
            overrides[part] ??
            part
                .split("-")
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(" ");
        crumbs.push({ label, href });
    }
    return crumbs;
}

export function DashboardHeader({ children }: { children?: React.ReactNode }) {
    const pathname = usePathname();
    const crumbs = useMemo(() => buildCrumbs(pathname), [pathname]);

    return (
        <header className="h-14 flex items-center justify-between gap-3 px-5 border-b border-white/[0.06] bg-[#0a0b0e]">
            {/* Breadcrumbs */}
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] min-w-0">
                {crumbs.map((c, i) => {
                    const last = i === crumbs.length - 1;
                    return (
                        <span key={c.href} className="flex items-center gap-1.5 min-w-0">
                            {i > 0 && <ChevronRight className="h-3 w-3 text-white/25 shrink-0" />}
                            {last ? (
                                <span className="text-white/95 font-medium truncate">{c.label}</span>
                            ) : (
                                <Link
                                    href={c.href}
                                    className="text-white/45 hover:text-white/85 transition-colors truncate"
                                >
                                    {c.label}
                                </Link>
                            )}
                        </span>
                    );
                })}
            </nav>

            {/* Right cluster */}
            <div className="flex items-center gap-1 shrink-0">
                {/* Search (placeholder for ⌘K palette) */}
                <button
                    type="button"
                    className="hidden sm:flex items-center gap-2 h-8 pl-2.5 pr-1.5  border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.12] text-white/45 hover:text-white/70 transition-colors text-[12px]"
                    title="Search"
                >
                    <Search className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">Search</span>
                    <kbd className="hidden md:inline-flex items-center justify-center h-5 px-1.5 rounded-[3px] border border-white/[0.08] bg-white/[0.04] text-[10px] font-mono text-white/45">
                        ⌘K
                    </kbd>
                </button>

                <div className="ml-1 flex items-center">{children}</div>

                <Link
                    href="/dashboard/nav/billing"
                    className="h-8 w-8  text-white/45 hover:bg-white/[0.05] hover:text-white/85 flex items-center justify-center transition-colors"
                    title="Billing"
                >
                    <BadgeDollarSign className="h-4 w-4" />
                </Link>
                <Link
                    href="/dashboard/nav/profile"
                    className="h-8 w-8  text-white/45 hover:bg-white/[0.05] hover:text-white/85 flex items-center justify-center transition-colors"
                    title="Profile"
                >
                    <User className="h-4 w-4" />
                </Link>
            </div>
        </header>
    );
}

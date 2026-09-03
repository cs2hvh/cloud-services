"use client";

// DashboardHeader — slim top bar. Left: a prominent search box that opens the
// ⌘K command palette (keyboard-driven nav + quick actions). Right: notifications
// (passed as children by the layout) and billing.

import Link from "next/link";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { CommandPalette } from "@/components/dashboard/command-palette";

export function DashboardHeader({ children }: { children?: React.ReactNode }) {
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [balance, setBalance] = useState<number | null>(null);

    // Global ⌘K / Ctrl+K to open the palette. Also listens for the
    // "open-command-palette" event so other chrome (sidebar search) can open it.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
                e.preventDefault();
                setPaletteOpen((v) => !v);
            }
        };
        const onOpen = () => setPaletteOpen(true);
        window.addEventListener("keydown", onKey);
        window.addEventListener("open-command-palette", onOpen);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("open-command-palette", onOpen);
        };
    }, []);

    // Live-ish balance for the top bar: load on mount, refresh on focus + 60s.
    useEffect(() => {
        let alive = true;
        const load = async () => {
            try {
                const res = await fetch("/api/billing/balance");
                const data = await res.json().catch(() => ({}));
                if (alive && data?.ok) setBalance(Number(data.balance));
            } catch {
                /* keep last value */
            }
        };
        load();
        const id = setInterval(load, 60_000);
        const onFocus = () => load();
        window.addEventListener("focus", onFocus);
        return () => {
            alive = false;
            clearInterval(id);
            window.removeEventListener("focus", onFocus);
        };
    }, []);

    // Green when healthy, red when low (or depleted).
    const balanceColor =
        balance === null
            ? "rgba(255,255,255,0.7)"
            : balance <= 5
              ? "#f87171"
              : "#4ade80";

    return (
        // pl-14 below md clears the fixed mobile sidebar toggle (left-3, 36px wide)
        // rendered by AppSidebar — without it the toggle overlaps the search box.
        <header className="h-14 flex items-center gap-2 sm:gap-3 pl-14 pr-3 md:pl-5 sm:pr-5 border-b border-white/[0.06] bg-[#0a0b0e]">
            {/* Search box (left, prominent) — opens the command palette */}
            <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="group flex items-center gap-2.5 h-9 w-full min-w-0 max-w-[420px] pl-3 pr-2 rounded-[8px] border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.14] transition-colors"
                title="Search (⌘K)"
            >
                <Search className="h-4 w-4 text-white/40 group-hover:text-white/60 shrink-0 transition-colors" />
                <span className="flex-1 min-w-0 text-left text-[12.5px] text-white/35 group-hover:text-white/55 truncate transition-colors">
                    <span className="sm:hidden">Search…</span>
                    <span className="hidden sm:inline">Search servers, services, pages…</span>
                </span>
                <kbd className="hidden sm:inline-flex items-center justify-center h-5 px-1.5 rounded-[4px] border border-white/[0.08] bg-white/[0.04] text-[10px] font-mono text-white/40">
                    ⌘K
                </kbd>
            </button>

            {/* Right cluster */}
            <div className="ml-auto flex items-center gap-1.5 shrink-0">
                {children}
                <Link
                    href="/dashboard/billing"
                    className="group inline-flex items-center gap-2 h-8 px-2.5 rounded-[7px] border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/[0.16] transition-colors"
                    style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}
                    title="Billing · your balance"
                >
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.6}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4 text-white/75 transition-colors group-hover:text-white"
                    >
                        <path d="M4 8h13.5A2.5 2.5 0 0 1 20 10.5v5A2.5 2.5 0 0 1 17.5 18h-11A2.5 2.5 0 0 1 4 15.5V8Z" />
                        <path d="M4 8a1.5 1.5 0 0 1 1.5-1.5H15" />
                        <path d="M20 12h-2.4a1.6 1.6 0 0 0 0 3.2H20" />
                    </svg>
                    <span
                        className="text-[12.5px] font-semibold tabular-nums"
                        style={{ color: balanceColor }}
                    >
                        {balance === null ? "—" : `$${balance.toFixed(2)}`}
                    </span>
                </Link>
            </div>

            <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        </header>
    );
}

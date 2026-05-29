"use client";

// DashboardHeader — slim top bar. Left: a prominent search box that opens the
// ⌘K command palette (keyboard-driven nav + quick actions). Right: notifications
// (passed as children by the layout), billing, and profile.

import Link from "next/link";
import { useEffect, useState } from "react";
import { Search, BadgeDollarSign, User } from "lucide-react";
import { CommandPalette } from "@/components/dashboard/command-palette";

export function DashboardHeader({ children }: { children?: React.ReactNode }) {
    const [paletteOpen, setPaletteOpen] = useState(false);

    // Global ⌘K / Ctrl+K to open the palette.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
                e.preventDefault();
                setPaletteOpen((v) => !v);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    return (
        <header className="h-14 flex items-center gap-3 px-4 sm:px-5 border-b border-white/[0.06] bg-[#0a0b0e]">
            {/* Search box (left, prominent) — opens the command palette */}
            <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="group flex items-center gap-2.5 h-9 w-full max-w-[420px] pl-3 pr-2 rounded-[8px] border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.14] transition-colors"
                title="Search (⌘K)"
            >
                <Search className="h-4 w-4 text-white/40 group-hover:text-white/60 shrink-0 transition-colors" />
                <span className="flex-1 text-left text-[12.5px] text-white/35 group-hover:text-white/55 truncate transition-colors">
                    Search servers, services, pages…
                </span>
                <kbd className="hidden sm:inline-flex items-center justify-center h-5 px-1.5 rounded-[4px] border border-white/[0.08] bg-white/[0.04] text-[10px] font-mono text-white/40">
                    ⌘K
                </kbd>
            </button>

            {/* Right cluster */}
            <div className="ml-auto flex items-center gap-1 shrink-0">
                {children}
                <Link
                    href="/dashboard/nav/billing"
                    className="h-8 w-8 rounded-[6px] text-white/45 hover:bg-white/[0.05] hover:text-white/85 flex items-center justify-center transition-colors"
                    title="Billing"
                >
                    <BadgeDollarSign className="h-4 w-4" />
                </Link>
                <Link
                    href="/dashboard/nav/profile"
                    className="h-8 w-8 rounded-[6px] text-white/45 hover:bg-white/[0.05] hover:text-white/85 flex items-center justify-center transition-colors"
                    title="Profile"
                >
                    <User className="h-4 w-4" />
                </Link>
            </div>

            <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        </header>
    );
}

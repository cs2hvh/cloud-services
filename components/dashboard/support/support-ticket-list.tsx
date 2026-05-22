"use client";

// Support tickets list — editorial canvas, big Nunito title,
// horizontal stats strip, pill tab nav (Open / Closed), and a clean
// rounded-[6px] table with mono status pills.

import Link from "next/link";
import { useMemo, useState } from "react";
import { MessageSquarePlus, Search } from "lucide-react";

import {
    SUPPORT_STATUS_LABELS,
    SupportTicketStatus,
    getSupportTopicLabels,
} from "@/lib/support/catalog";
import { SupportTicketSummary } from "@/lib/supabase/queries/support_tickets";

// ─── Design tokens ─────────────────────────────────────────────────
const SERIF_STYLE: React.CSSProperties = {
    fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";

interface SupportTicketListProps {
    openTickets: SupportTicketSummary[];
    closedTickets: SupportTicketSummary[];
}

function formatDate(date: string): string {
    return new Date(date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

function formatDateTime(date: string): string {
    return new Date(date).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function statusMeta(status: SupportTicketStatus): {
    color: string;
    pulse?: boolean;
} {
    if (status === "resolved") return { color: "#4ade80" };
    if (status === "closed") return { color: "rgba(255,255,255,0.55)" };
    if (status === "cancelled") return { color: "#f87171" };
    if (status === "permantly_close") return { color: "#dc2626" };
    if (status === "in_progress") return { color: ACCENT, pulse: true };
    if (status === "pending") return { color: "#a78bfa", pulse: true };
    return { color: "#fbbf24" };
}

const TABS = [
    { value: "open" as const, label: "Open" },
    { value: "closed" as const, label: "Closed" },
];

export default function SupportTicketList({
    openTickets,
    closedTickets,
}: SupportTicketListProps) {
    const [activeTab, setActiveTab] = useState<"open" | "closed">("open");
    const [query, setQuery] = useState("");

    const filteredOpen = useMemo(() => {
        if (!query.trim()) return openTickets;
        const q = query.toLowerCase().trim();
        return openTickets.filter(
            (t) =>
                t.ticket_number.toLowerCase().includes(q) ||
                t.subject.toLowerCase().includes(q),
        );
    }, [openTickets, query]);

    const filteredClosed = useMemo(() => {
        if (!query.trim()) return closedTickets;
        const q = query.toLowerCase().trim();
        return closedTickets.filter(
            (t) =>
                t.ticket_number.toLowerCase().includes(q) ||
                t.subject.toLowerCase().includes(q),
        );
    }, [closedTickets, query]);

    const latestActivity = useMemo(() => {
        const all = [...openTickets, ...closedTickets];
        if (all.length === 0) return "No activity yet";
        const latest = all.reduce(
            (acc, t) =>
                !acc ||
                new Date(t.latest_message_at).getTime() >
                    new Date(acc.latest_message_at).getTime()
                    ? t
                    : acc,
            null as SupportTicketSummary | null,
        );
        return latest ? formatDateTime(latest.latest_message_at) : "No activity";
    }, [openTickets, closedTickets]);

    const tickets = activeTab === "open" ? filteredOpen : filteredClosed;

    return (
        <div className="min-w-0">
            {/* Hero */}
            <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between mb-12">
                <div className="max-w-2xl">
                    <h1 className="text-[36px] sm:text-[44px] leading-[1.05] tracking-[-0.025em] text-white font-semibold">
                        Support{" "}
                        <span
                            style={SERIF_STYLE}
                            className="text-white/55 font-normal"
                        >
                            tickets
                        </span>
                        .
                    </h1>
                    <p
                        className={`${MONO} mt-3 max-w-xl text-[11.5px] text-white/45 leading-relaxed`}
                    >
                        Create tickets, monitor status, and review threaded
                        updates for every infrastructure issue.
                    </p>
                </div>
                <Link
                    href="/dashboard/support/create"
                    className={`${MONO} inline-flex h-10 items-center gap-2 px-4 text-[11.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all shrink-0`}
                    style={{
                        background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
                        color: "#ffffff",
                        boxShadow:
                            "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)",
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT_BRIGHT}, ${ACCENT})`;
                        e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
                        e.currentTarget.style.transform = "none";
                    }}
                >
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                    New ticket
                </Link>
            </header>

            {/* Stats strip */}
            <section className="mb-10 border-y border-white/[0.06] grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/[0.06]">
                <StatCell
                    label="Total"
                    value={String(openTickets.length + closedTickets.length)}
                    hint="All-time tickets"
                />
                <StatCell
                    label="Open"
                    value={String(openTickets.length)}
                    hint="Active conversations"
                    accent={ACCENT}
                />
                <StatCell
                    label="Closed"
                    value={String(closedTickets.length)}
                    hint="Resolved or archived"
                    accent="#4ade80"
                />
                <StatCell
                    label="Last activity"
                    value={
                        openTickets.length + closedTickets.length > 0
                            ? "—"
                            : "—"
                    }
                    hint={latestActivity}
                    asHint
                />
            </section>

            {/* Pill tab nav + search */}
            <div className="border-b border-white/[0.06] mb-5">
                <div className="flex items-end justify-between gap-3 flex-wrap -mb-px">
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                        {TABS.map((t) => {
                            const isActive = activeTab === t.value;
                            const count =
                                t.value === "open"
                                    ? openTickets.length
                                    : closedTickets.length;
                            return (
                                <button
                                    key={t.value}
                                    type="button"
                                    onClick={() => setActiveTab(t.value)}
                                    className={`${MONO} relative inline-flex items-center gap-2 px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] transition-colors whitespace-nowrap`}
                                    style={{
                                        color: isActive
                                            ? "#ffffff"
                                            : "rgba(255,255,255,0.45)",
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isActive)
                                            e.currentTarget.style.color =
                                                "rgba(255,255,255,0.75)";
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isActive)
                                            e.currentTarget.style.color =
                                                "rgba(255,255,255,0.45)";
                                    }}
                                >
                                    {t.label}
                                    <span
                                        className="tabular-nums"
                                        style={{
                                            color: isActive
                                                ? ACCENT
                                                : "rgba(255,255,255,0.35)",
                                        }}
                                    >
                                        {count}
                                    </span>
                                    {isActive && (
                                        <span
                                            className="absolute left-2 right-2 bottom-0 h-[2px]"
                                            style={{
                                                background: ACCENT,
                                                boxShadow:
                                                    "0 0 8px rgba(0,149,255,0.5)",
                                            }}
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex w-full sm:w-72 items-center gap-2 border border-white/[0.08] bg-[#0d0e11] px-3 h-9 mb-1 rounded-[5px]">
                        <Search className="h-3.5 w-3.5 text-white/40 shrink-0" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search by # or subject"
                            className={`${MONO} flex-1 bg-transparent text-[12px] text-white placeholder:text-white/30 outline-none`}
                        />
                    </div>
                </div>
            </div>

            {/* Table */}
            {tickets.length === 0 ? (
                <EmptyState query={query} />
            ) : (
                <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
                    {/* Column header */}
                    <div className="hidden md:grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,0.8fr)] gap-4 px-5 py-2.5 border-b border-white/[0.06]">
                        <ColHead>Ticket</ColHead>
                        <ColHead>Subject</ColHead>
                        <ColHead>Updated</ColHead>
                        <ColHead align="right">Status</ColHead>
                    </div>

                    {tickets.map((ticket) => {
                        const labels = getSupportTopicLabels(
                            ticket.topic,
                            ticket.sub_topic,
                            ticket.tertiary_topic,
                        );
                        const status = statusMeta(ticket.status);
                        return (
                            <Link
                                key={ticket.id}
                                href={`/dashboard/support/${ticket.id}`}
                                className="group block border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors"
                            >
                                <div className="grid grid-cols-1 gap-2 px-5 py-3.5 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,0.8fr)] md:items-center md:gap-4">
                                    {/* Ticket # */}
                                    <div className="min-w-0">
                                        <div
                                            className={`${MONO} text-[12.5px] font-semibold text-white truncate`}
                                            style={{ color: ACCENT }}
                                        >
                                            {ticket.ticket_number}
                                        </div>
                                        <div
                                            className={`${MONO} mt-0.5 text-[10px] uppercase tracking-[0.06em] text-white/30 truncate`}
                                        >
                                            {ticket.id.slice(0, 8)}…
                                        </div>
                                    </div>

                                    {/* Subject + topic */}
                                    <div className="min-w-0">
                                        <div className="text-[13px] font-medium text-white truncate">
                                            {ticket.subject}
                                        </div>
                                        <div
                                            className={`${MONO} mt-0.5 text-[10.5px] text-white/40 truncate`}
                                        >
                                            {labels
                                                ? `${labels.topicLabel} · ${labels.subTopicLabel} · ${labels.tertiaryTopicLabel}`
                                                : `${ticket.topic} · ${ticket.sub_topic} · ${ticket.tertiary_topic}`}
                                        </div>
                                    </div>

                                    {/* Updated */}
                                    <div className="min-w-0">
                                        <div
                                            className={`${MONO} text-[11.5px] text-white/75`}
                                        >
                                            {formatDate(
                                                ticket.latest_message_at,
                                            )}
                                        </div>
                                        <div
                                            className={`${MONO} mt-0.5 text-[10px] text-white/35`}
                                        >
                                            created{" "}
                                            {formatDate(ticket.created_at)}
                                        </div>
                                    </div>

                                    {/* Status */}
                                    <div className="md:text-right">
                                        <span
                                            className={`${MONO} inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] font-semibold`}
                                            style={{ color: status.color }}
                                        >
                                            <span
                                                className={`h-1.5 w-1.5 rounded-full ${status.pulse ? "animate-pulse" : ""}`}
                                                style={{
                                                    background: status.color,
                                                    boxShadow:
                                                        status.color ===
                                                        "rgba(255,255,255,0.55)"
                                                            ? "none"
                                                            : `0 0 5px ${status.color}`,
                                                }}
                                            />
                                            {SUPPORT_STATUS_LABELS[ticket.status]}
                                        </span>
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── Subcomponents ────────────────────────────────────────────────

function StatCell({
    label,
    value,
    suffix,
    hint,
    accent,
    asHint,
}: {
    label: string;
    value: string;
    suffix?: string;
    hint: string;
    accent?: string;
    asHint?: boolean;
}) {
    return (
        <div className="px-5 py-5 flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
                <span
                    className="h-1 w-1 rounded-full shrink-0"
                    style={{
                        background: accent ?? "rgba(255,255,255,0.55)",
                        boxShadow: accent ? `0 0 5px ${accent}` : "none",
                    }}
                />
                <span
                    className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45`}
                >
                    {label}
                </span>
            </div>
            {!asHint && (
                <div className="flex items-baseline gap-1">
                    <span
                        style={SERIF_STYLE}
                        className="text-[40px] leading-none font-bold tabular-nums tracking-[-0.035em] text-white"
                    >
                        {value}
                    </span>
                    {suffix && (
                        <span
                            style={SERIF_STYLE}
                            className="text-[16px] text-white/40 font-medium"
                        >
                            {suffix}
                        </span>
                    )}
                </div>
            )}
            <p
                className={`${MONO} text-[10.5px] text-white/45 ${asHint ? "mt-1 text-[13px] text-white font-semibold leading-snug" : ""}`}
            >
                {asHint ? hint : hint}
            </p>
        </div>
    );
}

function ColHead({
    children,
    align = "left",
}: {
    children: React.ReactNode;
    align?: "left" | "right";
}) {
    return (
        <span
            className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/40 ${
                align === "right" ? "text-right" : ""
            }`}
        >
            {children}
        </span>
    );
}

function EmptyState({ query }: { query: string }) {
    return (
        <div className="relative border border-white/[0.06] bg-[#111216] rounded-[6px] px-8 py-14 text-center overflow-hidden">
            <div
                className="pointer-events-none absolute inset-0"
                style={{
                    background:
                        "radial-gradient(circle at 30% 20%, rgba(0,149,255,0.04), transparent 50%)",
                }}
            />
            <div
                className="relative z-10 h-12 w-12 mb-5 mx-auto inline-flex items-center justify-center border border-white/[0.14] bg-[#16181d] rounded-[8px]"
                style={{ color: ACCENT }}
            >
                <MessageSquarePlus className="h-5 w-5" />
            </div>
            <h3 className="relative z-10 text-[18px] font-semibold tracking-[-0.015em] text-white">
                {query ? "No matching tickets" : "No tickets in this view"}
            </h3>
            <p
                className={`${MONO} relative z-10 mt-2 max-w-md mx-auto text-[11.5px] text-white/45 leading-relaxed`}
            >
                {query
                    ? `Nothing matched "${query}". Try a different search term.`
                    : "Create a new support ticket and we'll notify you as soon as updates land."}
            </p>
            {!query && (
                <div className="relative z-10 mt-5">
                    <Link
                        href="/dashboard/support/create"
                        className={`${MONO} inline-flex items-center gap-2 h-10 px-4 text-[11px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all`}
                        style={{
                            background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
                            color: "#ffffff",
                            boxShadow: "0 8px 20px rgba(0,149,255,0.20)",
                        }}
                    >
                        <MessageSquarePlus className="h-3.5 w-3.5" />
                        Create ticket
                    </Link>
                </div>
            )}
        </div>
    );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MessageSquarePlus, Search } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSupportTopicLabels } from "@/lib/support/catalog";
import { SupportTicketSummary } from "@/lib/supabase/queries/support_tickets";

interface SupportTicketListProps {
  openTickets: SupportTicketSummary[];
  resolvedTickets: SupportTicketSummary[];
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusBadge(status: string): string {
  if (status === "resolved") {
    return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  }
  return "bg-amber-500/15 text-amber-300 border-amber-500/30";
}

function TicketRows({ tickets }: { tickets: SupportTicketSummary[] }) {
  if (tickets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-6 py-12 text-center">
        <p className="text-sm text-white/50">No tickets in this category yet.</p>
        <Link
          href="/dashboard/support/create"
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90 transition-colors"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Create Ticket
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      <div className="hidden sm:grid grid-cols-[1.2fr_2.5fr_1fr_0.9fr] bg-white/[0.04] border-b border-white/10 px-4 py-3 text-xs uppercase tracking-wide text-white/45">
        <span>Ticket</span>
        <span>Subject</span>
        <span>Date</span>
        <span>Status</span>
      </div>

      <div className="divide-y divide-white/[0.06]">
        {tickets.map((ticket) => {
          const labels = getSupportTopicLabels(ticket.topic, ticket.sub_topic, ticket.tertiary_topic);

          return (
            <Link
              key={ticket.id}
              href={`/dashboard/support/${ticket.id}`}
              className="block px-4 py-4 hover:bg-white/[0.03] transition-colors"
            >
              <div className="sm:grid sm:grid-cols-[1.2fr_2.5fr_1fr_0.9fr] sm:items-center sm:gap-3">
                <div className="text-sm font-medium text-cyan-200">{ticket.ticket_number}</div>
                <div className="mt-2 sm:mt-0 min-w-0">
                  <div className="truncate text-sm text-white">{ticket.subject}</div>
                  <div className="mt-1 text-xs text-white/45 truncate">
                    {labels
                      ? `${labels.topicLabel} / ${labels.subTopicLabel} / ${labels.tertiaryTopicLabel}`
                      : `${ticket.topic} / ${ticket.sub_topic} / ${ticket.tertiary_topic}`}
                  </div>
                </div>
                <div className="mt-2 sm:mt-0 text-xs text-white/50">{formatDate(ticket.created_at)}</div>
                <div className="mt-2 sm:mt-0">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs capitalize ${statusBadge(ticket.status)}`}
                  >
                    {ticket.status}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function SupportTicketList({
  openTickets,
  resolvedTickets,
}: SupportTicketListProps) {
  const [activeTab, setActiveTab] = useState<"open" | "resolved">("open");
  const [query, setQuery] = useState("");

  const filteredOpen = useMemo(() => {
    if (!query.trim()) return openTickets;
    const q = query.toLowerCase().trim();
    return openTickets.filter(
      (ticket) =>
        ticket.ticket_number.toLowerCase().includes(q) ||
        ticket.subject.toLowerCase().includes(q)
    );
  }, [openTickets, query]);

  const filteredResolved = useMemo(() => {
    if (!query.trim()) return resolvedTickets;
    const q = query.toLowerCase().trim();
    return resolvedTickets.filter(
      (ticket) =>
        ticket.ticket_number.toLowerCase().includes(q) ||
        ticket.subject.toLowerCase().includes(q)
    );
  }, [resolvedTickets, query]);

  return (
    <div className="max-w-[1600px] mx-auto">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Support Tickets</h1>
          <p className="mt-1 text-sm text-white/50">
            Raise and track product or infrastructure issues.
          </p>
        </div>

        <Link
          href="/dashboard/support/create"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-white text-black px-4 py-2 text-sm font-semibold hover:bg-white/90 transition-colors"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Create Ticket
        </Link>
      </div>

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by ticket number or subject"
          className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
        />
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as "open" | "resolved")}
        className="w-full"
      >
        <TabsList className="w-full grid grid-cols-2 bg-transparent p-0 h-auto gap-2 mb-4">
          <TabsTrigger
            value="open"
            className="cursor-pointer rounded-lg border border-white/10 bg-black/30 py-2.5 text-white data-[state=active]:bg-white data-[state=active]:text-black"
          >
            Open ({openTickets.length})
          </TabsTrigger>
          <TabsTrigger
            value="resolved"
            className="cursor-pointer rounded-lg border border-white/10 bg-black/30 py-2.5 text-white data-[state=active]:bg-white data-[state=active]:text-black"
          >
            Resolved ({resolvedTickets.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="mt-0">
          <TicketRows tickets={filteredOpen} />
        </TabsContent>
        <TabsContent value="resolved" className="mt-0">
          <TicketRows tickets={filteredResolved} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

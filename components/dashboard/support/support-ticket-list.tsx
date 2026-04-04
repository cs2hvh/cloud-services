"use client";

import Link from "next/link";
import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { motion } from "motion/react";
import { MessageSquarePlus, Search, Inbox, Clock3, CheckCircle2, Layers3 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SUPPORT_STATUS_LABELS, getSupportTopicLabels, SupportTicketStatus } from "@/lib/support/catalog";
import { SupportTicketSummary } from "@/lib/supabase/queries/support_tickets";

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

function statusBadge(status: SupportTicketStatus): string {
  if (status === "resolved") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  if (status === "closed") return "border-slate-500/20 bg-slate-500/10 text-slate-300";
  if (status === "cancelled") return "border-rose-500/20 bg-rose-500/10 text-rose-300";
  if (status === "in_progress") return "border-blue-500/20 bg-blue-500/10 text-blue-300";
  if (status === "pending") return "border-violet-500/20 bg-violet-500/10 text-violet-300";
  return "border-amber-500/20 bg-amber-500/10 text-amber-300";
}

function StatCard({
  label,
  value,
  meta,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  meta: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">{label}</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p>
          <p className="mt-1 text-sm text-white/45">{meta}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center border border-white/[0.08] bg-white/[0.05]">
          <Icon className="h-5 w-5 text-white/75" />
        </div>
      </div>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">
      {children}
    </th>
  );
}

function Td({ children }: { children: ReactNode }) {
  return <td className="px-6 py-4 align-middle text-sm text-white/75">{children}</td>;
}

function TicketRows({ tickets }: { tickets: SupportTicketSummary[] }) {
  if (tickets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center border border-dashed border-white/[0.12] px-6 py-16 text-center">
        <h3 className="text-base font-semibold text-white">No tickets in this view</h3>
        <p className="mt-2 max-w-md text-sm text-white/45">
          Create a new support ticket and we will notify you as soon as updates are available.
        </p>
        <Link
          href="/dashboard/support/create"
          className="mt-5 inline-flex items-center gap-2 border border-blue-400/25 bg-blue-500/90 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Create ticket
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden border border-white/[0.08] bg-white/[0.02]">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/[0.08]">
          <thead className="bg-white/[0.04]">
            <tr>
              <Th>Ticket</Th>
              <Th>Subject</Th>
              <Th>Created</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {tickets.map((ticket) => {
              const labels = getSupportTopicLabels(ticket.topic, ticket.sub_topic, ticket.tertiary_topic);

              return (
                <tr key={ticket.id} className="transition-colors hover:bg-white/[0.04]">
                  <Td>
                    <Link href={`/dashboard/support/${ticket.id}`} className="font-medium text-blue-200 hover:text-blue-100">
                      {ticket.ticket_number}
                    </Link>
                    <div className="mt-1 text-xs text-white/35">{ticket.id}</div>
                  </Td>
                  <Td>
                    <div className="font-medium text-white">{ticket.subject}</div>
                    <div className="mt-1 text-xs text-white/35">
                      {labels
                        ? `${labels.topicLabel} / ${labels.subTopicLabel} / ${labels.tertiaryTopicLabel}`
                        : `${ticket.topic} / ${ticket.sub_topic} / ${ticket.tertiary_topic}`}
                    </div>
                  </Td>
                  <Td>
                    <div className="text-sm text-white/78">{formatDate(ticket.created_at)}</div>
                    <div className="mt-1 text-xs text-white/35">{formatDateTime(ticket.latest_message_at)}</div>
                  </Td>
                  <Td>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusBadge(ticket.status)}`}>
                      {SUPPORT_STATUS_LABELS[ticket.status]}
                    </span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
      (ticket) =>
        ticket.ticket_number.toLowerCase().includes(q) ||
        ticket.subject.toLowerCase().includes(q)
    );
  }, [openTickets, query]);

  const filteredClosed = useMemo(() => {
    if (!query.trim()) return closedTickets;
    const q = query.toLowerCase().trim();
    return closedTickets.filter(
      (ticket) =>
        ticket.ticket_number.toLowerCase().includes(q) ||
        ticket.subject.toLowerCase().includes(q)
    );
  }, [closedTickets, query]);

  const latestActivity = useMemo(() => {
    const all = [...openTickets, ...closedTickets];
    if (all.length === 0) return "No activity yet";
    const latest = all.reduce((acc, ticket) => {
      if (!acc) return ticket;
      return new Date(ticket.latest_message_at).getTime() > new Date(acc.latest_message_at).getTime()
        ? ticket
        : acc;
    }, null as SupportTicketSummary | null);

    return latest ? formatDateTime(latest.latest_message_at) : "No activity yet";
  }, [openTickets, closedTickets]);

  return (
    <div className="mx-auto max-w-[1600px]">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"
      >
        <div className="max-w-3xl">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/70">
            Support Service
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Track and manage your support conversations.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50 sm:text-[15px]">
            Create tickets, monitor status transitions, and review threaded updates for every infrastructure issue.
          </p>
        </div>

        <Link
          href="/dashboard/support/create"
          className="inline-flex items-center justify-center gap-2 border border-blue-400/25 bg-blue-500/90 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New Ticket
        </Link>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.28 }}
        className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard label="Total Tickets" value={openTickets.length + closedTickets.length} meta="Open and closed requests" icon={Layers3} />
        <StatCard label="Open" value={openTickets.length} meta="Active support conversations" icon={Inbox} />
        <StatCard label="Closed" value={closedTickets.length} meta="Resolved or archived requests" icon={CheckCircle2} />
        <StatCard label="Latest Activity" value={openTickets.length + closedTickets.length > 0 ? "Live" : "Idle"} meta={latestActivity} icon={Clock3} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.28 }}
        className="glass-panel overflow-hidden"
      >
        <div className="border-b border-white/[0.06] px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Ticket Inventory</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                Search and browse your support queue.
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">
                Filter by open and closed views, then jump into any ticket to continue the conversation.
              </p>
            </div>
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by ticket number or subject"
                className="h-11 w-full border border-white/[0.12] bg-white/[0.04] py-2 pl-10 pr-3 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-blue-500/35"
              />
            </div>
          </div>
        </div>

        <div className="px-5 py-5 sm:px-6 sm:py-6">
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as "open" | "closed")}
            className="w-full"
          >
            <TabsList className="mb-4 grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0 md:max-w-[360px]">
              <TabsTrigger
                value="open"
                className="cursor-pointer border border-white/[0.1] bg-white/[0.03] py-2.5 text-white data-[state=active]:border-blue-400/30 data-[state=active]:bg-blue-500/15 data-[state=active]:text-blue-100"
              >
                Open ({openTickets.length})
              </TabsTrigger>
              <TabsTrigger
                value="closed"
                className="cursor-pointer border border-white/[0.1] bg-white/[0.03] py-2.5 text-white data-[state=active]:border-blue-400/30 data-[state=active]:bg-blue-500/15 data-[state=active]:text-blue-100"
              >
                Closed ({closedTickets.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="open" className="mt-0">
              <TicketRows tickets={filteredOpen} />
            </TabsContent>
            <TabsContent value="closed" className="mt-0">
              <TicketRows tickets={filteredClosed} />
            </TabsContent>
          </Tabs>
        </div>
      </motion.div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, Loader2, MessagesSquare, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SUPPORT_STATUS_LABELS, SUPPORT_TOPICS, SupportTicketStatus, getSupportTopicLabels } from "@/lib/support/catalog";
import { AdminSupportTicketSummary } from "@/lib/supabase/queries/support_tickets";

interface AdminSupportTicketsProps {
  initialTickets: AdminSupportTicketSummary[];
  initialPagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusBadgeClass(status: SupportTicketStatus): string {
  if (status === "resolved") return "bg-emerald-950/40 text-emerald-400 border-emerald-900";
  if (status === "closed") return "bg-slate-500/15 text-slate-300 border-slate-500/30";
  if (status === "cancelled") return "bg-rose-500/15 text-rose-300 border-rose-500/30";
  if (status === "in_progress") return "bg-blue-500/15 text-blue-300 border-blue-500/30";
  if (status === "pending") return "bg-violet-500/15 text-violet-300 border-violet-500/30";
  return "bg-amber-950/40 text-amber-400 border-amber-900";
}

export default function AdminSupportTickets({
  initialTickets,
  initialPagination,
}: AdminSupportTicketsProps) {
  const [tickets, setTickets] = useState(initialTickets);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SupportTicketStatus>("all");
  const [topicFilter, setTopicFilter] = useState<"all" | string>("all");
  const [currentPage, setCurrentPage] = useState(initialPagination.page);
  const [pagination, setPagination] = useState(initialPagination);
  const hasInitialized = useRef(false);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(pagination.limit),
        status: statusFilter,
      });

      if (topicFilter !== "all") {
        params.set("topic", topicFilter);
      }
      if (appliedSearch.trim().length > 0) {
        params.set("search", appliedSearch.trim());
      }

      const response = await fetch(`/api/admin/support/tickets?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        data?: AdminSupportTicketSummary[];
        pagination?: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
        };
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to fetch support tickets");
      }

      setTickets(payload.data || []);
      if (payload.pagination) {
        setPagination(payload.pagination);
      }
    } catch (error) {
      console.error("[AdminSupportTickets] fetch failed:", error);
      setTickets([]);
      setPagination((prev) => ({ ...prev, total: 0, totalPages: 0 }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      return;
    }
    void fetchTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, statusFilter, topicFilter, appliedSearch]);

  const handleSearch = () => {
    setCurrentPage(1);
    setAppliedSearch(searchInput.trim());
  };

  return (
    <div className="flex-1 bg-[#0a0a0a] min-h-screen p-4 sm:p-6 lg:p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[1600px] mx-auto"
      >
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-neutral-800 rounded-lg">
              <MessagesSquare className="h-6 w-6 text-neutral-300" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">Support Tickets</h1>
              <p className="text-sm text-neutral-400 mt-0.5">
                {pagination.total} ticket{pagination.total === 1 ? "" : "s"} across all users
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-500" />
              <Input
                placeholder="Search by ticket number, subject, resource, or user ID..."
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleSearch();
                  }
                }}
                className="pl-10 bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-500 focus:border-neutral-700 focus:ring-0"
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={loading}
              className="bg-neutral-800 hover:bg-neutral-700 text-white border-0"
            >
              Search
            </Button>
          </div>

          <Select
            value={statusFilter}
            onValueChange={(value: "all" | SupportTicketStatus) => {
              setCurrentPage(1);
              setStatusFilter(value);
            }}
          >
            <SelectTrigger className="w-[180px] bg-neutral-900 border-neutral-800 text-white focus:ring-0">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-neutral-900 border-neutral-800">
              <SelectItem value="all" className="text-white focus:bg-neutral-800 focus:text-white">
                All Statuses
              </SelectItem>
              <SelectItem value="open" className="text-white focus:bg-neutral-800 focus:text-white">
                Open
              </SelectItem>
              <SelectItem value="in_progress" className="text-white focus:bg-neutral-800 focus:text-white">
                In Progress
              </SelectItem>
              <SelectItem value="pending" className="text-white focus:bg-neutral-800 focus:text-white">
                Pending
              </SelectItem>
              <SelectItem value="resolved" className="text-white focus:bg-neutral-800 focus:text-white">
                Resolved
              </SelectItem>
              <SelectItem value="closed" className="text-white focus:bg-neutral-800 focus:text-white">
                Closed
              </SelectItem>
              <SelectItem value="cancelled" className="text-white focus:bg-neutral-800 focus:text-white">
                Cancelled
              </SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={topicFilter}
            onValueChange={(value) => {
              setCurrentPage(1);
              setTopicFilter(value);
            }}
          >
            <SelectTrigger className="w-[220px] bg-neutral-900 border-neutral-800 text-white focus:ring-0">
              <SelectValue placeholder="Topic" />
            </SelectTrigger>
            <SelectContent className="bg-neutral-900 border-neutral-800">
              <SelectItem value="all" className="text-white focus:bg-neutral-800 focus:text-white">
                All Topics
              </SelectItem>
              {SUPPORT_TOPICS.map((topic) => (
                <SelectItem
                  key={topic.id}
                  value={topic.id}
                  className="text-white focus:bg-neutral-800 focus:text-white"
                >
                  {topic.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-neutral-800/50 border-b border-neutral-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                      Ticket
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                      Topic
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                      Latest Activity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {loading && (
                    <tr>
                      <td colSpan={7} className="px-6 py-8">
                        <div className="flex items-center justify-center text-neutral-400 text-sm">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Loading tickets...
                        </div>
                      </td>
                    </tr>
                  )}

                  {!loading && tickets.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-sm text-neutral-500">
                        No support tickets found for the current filters.
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    tickets.map((ticket) => {
                      const topicLabels = getSupportTopicLabels(
                        ticket.topic,
                        ticket.sub_topic,
                        ticket.tertiary_topic
                      );
                      const ownerName =
                        ticket.owner?.display_name || ticket.owner?.username || ticket.owner?.email || "Unknown user";

                      return (
                        <tr key={ticket.id} className="hover:bg-neutral-800/30 transition-colors">
                          <td className="px-6 py-4">
                            <div className="min-w-0">
                              <div className="font-medium text-white text-sm">{ticket.ticket_number}</div>
                              <div className="text-xs text-neutral-500 truncate mt-0.5">{ticket.subject}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <Avatar className="h-8 w-8 border border-neutral-700">
                                <AvatarImage src={ticket.owner?.avatar || undefined} />
                                <AvatarFallback className="bg-neutral-700 text-neutral-200 text-xs">
                                  {ownerName.charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <div className="text-sm text-neutral-200 truncate">{ownerName}</div>
                                <div className="text-xs text-neutral-500 truncate">
                                  {ticket.owner?.email || ticket.owner_id}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-neutral-300">
                              {topicLabels
                                ? `${topicLabels.topicLabel} / ${topicLabels.subTopicLabel}`
                                : `${ticket.topic} / ${ticket.sub_topic}`}
                            </div>
                            <div className="text-xs text-neutral-500 mt-0.5">
                              {ticket.affected_resource_name || "General issue"}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-neutral-400">{formatDate(ticket.created_at)}</td>
                          <td className="px-6 py-4 text-sm text-neutral-400">
                            {formatDate(ticket.latest_message_at)}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border capitalize ${statusBadgeClass(ticket.status)}`}
                            >
                              {SUPPORT_STATUS_LABELS[ticket.status]}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <Link
                              href={`/dashboard/admin/support/${ticket.id}`}
                              className="inline-flex h-8 items-center px-3 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="px-6 py-4 border-t border-neutral-800 flex items-center justify-between">
                <div className="text-sm text-neutral-400">
                  Page {pagination.page} of {pagination.totalPages}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={pagination.page <= 1 || loading}
                    className="h-8 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed border-0"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setCurrentPage((prev) => Math.min(pagination.totalPages, prev + 1))}
                    disabled={pagination.page >= pagination.totalPages || loading}
                    className="h-8 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed border-0"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

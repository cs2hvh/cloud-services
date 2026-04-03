"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { getSupportTopicLabels, SupportTicketStatus } from "@/lib/support/catalog";
import { AdminSupportTicketDetail, SupportTicketAttachment } from "@/lib/supabase/queries/support_tickets";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

type TicketAttachmentWithUrl = SupportTicketAttachment & { download_url?: string | null };
type AdminTicketDetailWithUrl = Omit<AdminSupportTicketDetail, "attachments"> & {
  attachments: TicketAttachmentWithUrl[];
};

interface AdminSupportTicketDetailProps {
  initialTicket: AdminTicketDetailWithUrl;
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

function statusBadgeClass(status: SupportTicketStatus): string {
  if (status === "resolved") {
    return "bg-emerald-950/40 text-emerald-400 border-emerald-900";
  }
  return "bg-amber-950/40 text-amber-400 border-amber-900";
}

function actorBadge(actor: "user" | "admin" | "system"): string {
  if (actor === "admin") return "bg-blue-950/40 text-blue-300 border-blue-900";
  if (actor === "system") return "bg-neutral-800 text-neutral-300 border-neutral-700";
  return "bg-cyan-950/40 text-cyan-300 border-cyan-900";
}

export default function AdminSupportTicketDetailView({ initialTicket }: AdminSupportTicketDetailProps) {
  const router = useRouter();
  const [ticket, setTicket] = useState(initialTicket);
  const [statusDraft, setStatusDraft] = useState<SupportTicketStatus>(initialTicket.status);
  const [replyText, setReplyText] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);

  const topicLabels = useMemo(
    () => getSupportTopicLabels(ticket.topic, ticket.sub_topic, ticket.tertiary_topic),
    [ticket.topic, ticket.sub_topic, ticket.tertiary_topic]
  );

  const ownerName =
    ticket.owner?.display_name || ticket.owner?.username || ticket.owner?.email || "Unknown user";

  const applyPatch = async (payload: { status?: SupportTicketStatus; reply?: string }) => {
    const response = await fetch(`/api/admin/support/tickets/${ticket.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = (await response.json().catch(() => ({}))) as {
      error?: string;
      data?: AdminTicketDetailWithUrl;
    };
    if (!response.ok || !json.data) {
      throw new Error(json.error || "Failed to update ticket");
    }

    setTicket(json.data);
    setStatusDraft(json.data.status);
  };

  const handleUpdateStatus = async () => {
    if (statusDraft === ticket.status) return;

    setUpdatingStatus(true);
    try {
      await applyPatch({ status: statusDraft });
      toast.success("Ticket status updated");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update ticket status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleSendReply = async () => {
    const reply = replyText.trim();
    if (reply.length < 2) {
      toast.error("Reply must be at least 2 characters");
      return;
    }

    setSendingReply(true);
    try {
      await applyPatch({ reply });
      setReplyText("");
      toast.success("Reply sent");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send reply");
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <div className="flex-1 bg-[#0a0a0a] min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto">
        <div className="mb-6">
          <Link href="/dashboard/admin/support" className="text-xs text-neutral-500 hover:text-neutral-300">
            Back to support tickets
          </Link>
          <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-white">{ticket.ticket_number}</h1>
              <p className="text-sm text-neutral-400 mt-1">{ticket.subject}</p>
            </div>
            <span
              className={`inline-flex w-fit items-center px-2.5 py-1 rounded text-xs font-medium border capitalize ${statusBadgeClass(ticket.status)}`}
            >
              {ticket.status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.75fr)_minmax(280px,1fr)]">
          <div className="space-y-6">
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
              <h2 className="text-sm font-medium text-white mb-4">Issue Details</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-neutral-500 uppercase tracking-wider">Topic Path</p>
                  <p className="mt-1 text-sm text-neutral-200">
                    {topicLabels
                      ? `${topicLabels.topicLabel} / ${topicLabels.subTopicLabel} / ${topicLabels.tertiaryTopicLabel}`
                      : `${ticket.topic} / ${ticket.sub_topic} / ${ticket.tertiary_topic}`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500 uppercase tracking-wider">Affected Resource</p>
                  <p className="mt-1 text-sm text-neutral-200">{ticket.affected_resource_name || "General issue"}</p>
                </div>
              </div>
              <div className="mt-4">
                <p className="text-xs text-neutral-500 uppercase tracking-wider">Description</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-200">{ticket.description}</p>
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
              <h2 className="text-sm font-medium text-white mb-4">
                Conversation ({ticket.messages.length})
              </h2>

              {ticket.messages.length === 0 ? (
                <p className="text-sm text-neutral-500">No conversation messages yet.</p>
              ) : (
                <div className="space-y-3">
                  {ticket.messages.map((message) => (
                    <div key={message.id} className="border border-neutral-800 bg-neutral-900/60 rounded-lg p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span
                          className={`inline-flex items-center rounded px-2 py-1 text-xs capitalize border ${actorBadge(message.actor_type)}`}
                        >
                          {message.actor_type}
                        </span>
                        <span className="text-xs text-neutral-500">{formatDateTime(message.created_at)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-neutral-200">{message.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
              <h2 className="text-sm font-medium text-white mb-3">Reply to User</h2>
              <textarea
                value={replyText}
                onChange={(event) => setReplyText(event.target.value)}
                rows={5}
                placeholder="Write a support reply visible to the user..."
                className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-600"
              />
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  onClick={handleSendReply}
                  disabled={sendingReply}
                  className="bg-neutral-800 hover:bg-neutral-700 text-white border-0"
                >
                  {sendingReply ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send Reply
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
              <h2 className="text-sm font-medium text-white mb-4">Ticket Owner</h2>
              <div className="flex items-start gap-3">
                <Avatar className="h-10 w-10 border border-neutral-700">
                  <AvatarImage src={ticket.owner?.avatar || undefined} />
                  <AvatarFallback className="bg-neutral-700 text-neutral-200 text-sm">
                    {ownerName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{ownerName}</p>
                  <p className="text-xs text-neutral-400 truncate">{ticket.owner?.email || ticket.owner_id}</p>
                  {ticket.owner?.username && (
                    <p className="text-xs text-neutral-500 mt-0.5">@{ticket.owner.username}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
              <h2 className="text-sm font-medium text-white mb-4">Status Control</h2>
              <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-1">
                Update Status
              </label>
              <select
                value={statusDraft}
                onChange={(event) => setStatusDraft(event.target.value as SupportTicketStatus)}
                className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-neutral-600"
              >
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
              </select>
              <Button
                type="button"
                onClick={handleUpdateStatus}
                disabled={updatingStatus || statusDraft === ticket.status}
                className="mt-3 w-full bg-neutral-800 hover:bg-neutral-700 text-white border-0 disabled:opacity-50"
              >
                {updatingStatus ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Apply Status"
                )}
              </Button>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
              <h2 className="text-sm font-medium text-white mb-4">Ticket Metadata</h2>
              <div className="space-y-2 text-sm">
                <p className="text-neutral-300">
                  <span className="text-neutral-500">Created:</span> {formatDateTime(ticket.created_at)}
                </p>
                <p className="text-neutral-300">
                  <span className="text-neutral-500">Updated:</span> {formatDateTime(ticket.updated_at)}
                </p>
                <p className="text-neutral-300">
                  <span className="text-neutral-500">Latest Activity:</span>{" "}
                  {formatDateTime(ticket.latest_message_at)}
                </p>
                {ticket.resolved_at && (
                  <p className="text-neutral-300">
                    <span className="text-neutral-500">Resolved At:</span> {formatDateTime(ticket.resolved_at)}
                  </p>
                )}
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
              <h2 className="text-sm font-medium text-white mb-4">Attachments</h2>
              {ticket.attachments.length === 0 ? (
                <p className="text-sm text-neutral-500">No attachments uploaded.</p>
              ) : (
                <div className="space-y-2">
                  {ticket.attachments.map((attachment) => (
                    <a
                      key={attachment.id}
                      href={attachment.download_url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`block rounded border border-neutral-800 px-3 py-2 text-sm ${
                        attachment.download_url
                          ? "text-neutral-200 hover:bg-neutral-800/60"
                          : "text-neutral-500 pointer-events-none"
                      }`}
                    >
                      <p className="truncate">{attachment.file_name}</p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {(attachment.file_size / 1024).toFixed(1)} KB - {attachment.mime_type}
                      </p>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

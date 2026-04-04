"use client";

import Link from "next/link";
import { useMemo, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, MessageSquare, Paperclip, Pencil, RotateCcw, Save, XCircle, Clock3 } from "lucide-react";
import {
  SUPPORT_STATUS_LABELS,
  SUPPORT_TOPICS,
  SupportResourceOption,
  SupportTicketStatus,
  getSupportTopicLabels,
  isSupportClosedStatus,
  isSupportOpenStatus,
} from "@/lib/support/catalog";
import { plainTextFromRichText, sanitizeSupportRichText } from "@/lib/support/richtext";
import {
  SupportTicketAttachment,
  SupportTicketDetail,
  SupportTicketMessage,
} from "@/lib/supabase/queries/support_tickets";
import SupportRichTextEditor from "./support-rich-text-editor";

type TicketAttachmentWithUrl = SupportTicketAttachment & { download_url?: string | null };

interface SupportTicketDetailProps {
  ticket: Omit<SupportTicketDetail, "attachments"> & { attachments: TicketAttachmentWithUrl[] };
  initialResources: SupportResourceOption[];
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

function actorBadge(actor: "user" | "admin" | "system"): string {
  if (actor === "admin") return "border-blue-500/20 bg-blue-500/10 text-blue-300";
  if (actor === "system") return "border-white/15 bg-white/10 text-white/70";
  return "border-cyan-500/20 bg-cyan-500/10 text-cyan-300";
}

function getMessageIdentity(message: SupportTicketMessage): {
  name: string;
  email: string;
  avatar: string | null;
} {
  if (message.author) {
    return {
      name: message.author.display_name || message.author.username || message.author.email || "User",
      email: message.author.email || "No email",
      avatar: message.author.avatar || null,
    };
  }

  if (message.actor_type === "admin") {
    return { name: "Support Team", email: "support@ahuracloud.com", avatar: null };
  }
  if (message.actor_type === "system") {
    return { name: "System", email: "-", avatar: null };
  }
  return { name: "User", email: "-", avatar: null };
}

function StatCard({
  label,
  value,
  meta,
  icon: Icon,
}: {
  label: string;
  value: string;
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

export default function SupportTicketDetailView({ ticket, initialResources }: SupportTicketDetailProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const [topic, setTopic] = useState(ticket.topic);
  const [subTopic, setSubTopic] = useState(ticket.sub_topic);
  const [tertiaryTopic, setTertiaryTopic] = useState(ticket.tertiary_topic);
  const [subject, setSubject] = useState(ticket.subject);
  const [description, setDescription] = useState(ticket.description);
  const [affectedResourceId, setAffectedResourceId] = useState(ticket.affected_resource_id || "general");
  const [resources, setResources] = useState<SupportResourceOption[]>(initialResources);
  const [resourcesLoading, setResourcesLoading] = useState(false);

  const [attachmentError, setAttachmentError] = useState("");
  const [attachmentUploading, setAttachmentUploading] = useState(false);

  const selectedTopic = useMemo(
    () => SUPPORT_TOPICS.find((entry) => entry.id === topic) || null,
    [topic]
  );
  const selectedSubTopic = useMemo(
    () => selectedTopic?.subTopics.find((entry) => entry.id === subTopic) || null,
    [selectedTopic, subTopic]
  );
  const tertiaryOptions = selectedSubTopic?.tertiaryTopics || [];
  const selectedResource = resources.find((entry) => entry.id === affectedResourceId) || null;
  const topicLabels = getSupportTopicLabels(ticket.topic, ticket.sub_topic, ticket.tertiary_topic);

  const canEdit = isSupportOpenStatus(ticket.status);
  const canReopen = isSupportClosedStatus(ticket.status);
  const canManageAttachments = canEdit;
  const panelClassName = "glass-panel overflow-hidden";

  async function loadResources(nextTopic: string) {
    setResourcesLoading(true);
    setFormError("");
    try {
      const response = await fetch(`/api/support/resources?topic=${encodeURIComponent(nextTopic)}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        data?: SupportResourceOption[];
      };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load resources");
      }
      const nextResources = payload.data || [];
      setResources(nextResources);
      setAffectedResourceId(nextResources[0]?.id || "general");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to load resources");
      setResources([]);
      setAffectedResourceId("general");
    } finally {
      setResourcesLoading(false);
    }
  }

  async function saveChanges() {
    if (subject.trim().length < 4) {
      setFormError("Subject must be at least 4 characters.");
      return;
    }
    if (plainTextFromRichText(description).length < 10) {
      setFormError("Description must be at least 10 characters.");
      return;
    }
    if (!topic || !subTopic || !tertiaryTopic) {
      setFormError("Please complete topic, sub-topic, and tertiary-topic.");
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      const response = await fetch(`/api/support/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          subTopic,
          tertiaryTopic,
          subject: subject.trim(),
          description,
          affectedResourceType: selectedTopic?.resourceType || null,
          affectedResourceId: selectedResource?.id || "general",
          affectedResourceName: selectedResource?.name || "General issue",
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to update ticket");
      }

      setIsEditing(false);
      router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to update ticket");
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setTopic(ticket.topic);
    setSubTopic(ticket.sub_topic);
    setTertiaryTopic(ticket.tertiary_topic);
    setSubject(ticket.subject);
    setDescription(ticket.description);
    setAffectedResourceId(ticket.affected_resource_id || "general");
    setResources(initialResources);
    setFormError("");
    setIsEditing(false);
  }

  async function handleReopenTicket() {
    setActionLoading(true);
    try {
      const response = await fetch(`/api/support/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reopen" }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to reopen ticket");
      }
      router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to reopen ticket");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAddAttachments(files: FileList | null) {
    if (!files || files.length === 0) return;
    setAttachmentUploading(true);
    setAttachmentError("");

    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("attachments", file));
      const response = await fetch(`/api/support/tickets/${ticket.id}`, {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to upload attachments");
      }
      router.refresh();
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "Failed to upload attachments");
    } finally {
      setAttachmentUploading(false);
    }
  }

  async function handleDeleteAttachment(attachmentId: string) {
    setAttachmentError("");
    try {
      const response = await fetch(`/api/support/tickets/${ticket.id}?attachmentId=${encodeURIComponent(attachmentId)}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to delete attachment");
      }
      router.refresh();
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "Failed to delete attachment");
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] text-white">
      <div className={panelClassName}>
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Link
              href="/dashboard/support"
              className="inline-flex items-center text-sm text-white/60 transition-colors hover:text-white"
            >
              <ArrowLeft size={16} className="mr-2" />
              Back to tickets
            </Link>
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/70">Support Ticket</p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">{ticket.ticket_number}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">{ticket.subject}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusBadge(ticket.status)}`}>
              {SUPPORT_STATUS_LABELS[ticket.status]}
            </span>
            {canEdit && !isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center gap-2 border border-white/[0.12] bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/85 transition-colors hover:bg-white/[0.08]"
              >
                <Pencil className="h-4 w-4" />
                Edit Ticket
              </button>
            )}
            {canReopen && (
              <button
                type="button"
                onClick={() => void handleReopenTicket()}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 border border-blue-400/25 bg-blue-500/90 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RotateCcw className="h-4 w-4" />
                {actionLoading ? "Reopening..." : "Reopen"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Created" value={formatDateTime(ticket.created_at)} meta="Ticket opened" icon={Clock3} />
        <StatCard label="Latest Activity" value={formatDateTime(ticket.latest_message_at)} meta="Most recent update" icon={MessageSquare} />
        <StatCard label="Messages" value={String(ticket.messages.length)} meta="Conversation entries" icon={MessageSquare} />
        <StatCard label="Attachments" value={String(ticket.attachments.length)} meta="Uploaded files" icon={Paperclip} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
        <div className="space-y-6">
          <div className={panelClassName}>
            <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
              <h2 className="text-base font-semibold text-white">Issue Details</h2>
            </div>

            <div className="space-y-4 px-5 py-5 sm:px-6 sm:py-6">
              {!isEditing ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Topic path</p>
                      <p className="mt-2 text-sm text-white/90">
                        {topicLabels
                          ? `${topicLabels.topicLabel} / ${topicLabels.subTopicLabel} / ${topicLabels.tertiaryTopicLabel}`
                          : `${ticket.topic} / ${ticket.sub_topic} / ${ticket.tertiary_topic}`}
                      </p>
                    </div>
                    <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Affected resource</p>
                      <p className="mt-2 text-sm text-white/90">{ticket.affected_resource_name || "General issue"}</p>
                    </div>
                  </div>

                  <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Issue description</p>
                    <div
                      className="prose prose-invert mt-3 max-w-none text-sm text-white/90 prose-p:my-1 prose-li:my-0"
                      dangerouslySetInnerHTML={{ __html: sanitizeSupportRichText(ticket.description) }}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs text-white/45">Topic</label>
                    <select
                      value={topic}
                      onChange={(event) => {
                        const nextTopic = event.target.value;
                        setTopic(nextTopic);
                        setSubTopic("");
                        setTertiaryTopic("");
                        void loadResources(nextTopic);
                      }}
                      className="h-11 w-full border border-white/[0.12] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/35"
                    >
                      {SUPPORT_TOPICS.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-white/45">Sub-topic</label>
                    <select
                      value={subTopic}
                      onChange={(event) => {
                        setSubTopic(event.target.value);
                        setTertiaryTopic("");
                      }}
                      className="h-11 w-full border border-white/[0.12] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/35"
                    >
                      <option value="">Select sub-topic</option>
                      {(selectedTopic?.subTopics || []).map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-white/45">Tertiary-topic</label>
                    <select
                      value={tertiaryTopic}
                      onChange={(event) => setTertiaryTopic(event.target.value)}
                      className="h-11 w-full border border-white/[0.12] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/35"
                    >
                      <option value="">Select tertiary-topic</option>
                      {tertiaryOptions.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-white/45">Subject</label>
                    <input
                      value={subject}
                      onChange={(event) => setSubject(event.target.value)}
                      className="h-11 w-full border border-white/[0.12] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/35"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-white/45">Affected resource</label>
                    <select
                      value={affectedResourceId}
                      onChange={(event) => setAffectedResourceId(event.target.value)}
                      className="h-11 w-full border border-white/[0.12] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/35"
                      disabled={resourcesLoading}
                    >
                      {resources.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-white/45">Description</label>
                    <SupportRichTextEditor
                      value={description}
                      onChange={setDescription}
                      minHeightClassName="min-h-[220px]"
                    />
                  </div>
                  {formError && <p className="text-sm text-red-300">{formError}</p>}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={resetForm}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-md border border-white/[0.14] bg-white/[0.03] px-3 py-2 text-sm text-white/82 transition-colors hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <XCircle className="h-4 w-4" />
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveChanges()}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-md border border-blue-400/25 bg-blue-500/90 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      {saving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={panelClassName}>
            <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
              <h2 className="text-base font-semibold text-white">Conversation</h2>
              <p className="mt-1 text-sm text-white/45">{ticket.messages.length} message(s)</p>
            </div>

            <div className="space-y-3 px-5 py-5 sm:px-6 sm:py-6">
              {ticket.messages.length === 0 ? (
                <p className="text-sm text-white/45">No conversation messages yet.</p>
              ) : (
                ticket.messages.map((message) => {
                  const identity = getMessageIdentity(message);
                  return (
                    <div key={message.id} className="border border-white/[0.1] bg-white/[0.03] p-4">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <Avatar className="h-8 w-8 border border-white/15">
                            <AvatarImage src={identity.avatar || undefined} />
                            <AvatarFallback className="bg-white/10 text-xs text-white/80">
                              {identity.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm text-white/90">{identity.name}</p>
                            <p className="truncate text-xs text-white/45">{identity.email}</p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${actorBadge(message.actor_type)}`}>
                            {message.actor_type.toUpperCase()}
                          </span>
                          <p className="mt-1 text-xs text-white/45">{formatDateTime(message.created_at)}</p>
                        </div>
                      </div>
                      <div
                        className="prose prose-invert max-w-none text-sm prose-p:my-1 prose-li:my-0"
                        dangerouslySetInnerHTML={{ __html: sanitizeSupportRichText(message.message) }}
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className={panelClassName}>
            <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
              <h2 className="text-base font-semibold text-white">Ticket metadata</h2>
            </div>
            <div className="space-y-2 px-5 py-5 text-sm text-white/85 sm:px-6 sm:py-6">
              <p><span className="text-white/45">Created:</span> {formatDateTime(ticket.created_at)}</p>
              <p><span className="text-white/45">Updated:</span> {formatDateTime(ticket.updated_at)}</p>
              <p><span className="text-white/45">Latest activity:</span> {formatDateTime(ticket.latest_message_at)}</p>
              {ticket.resolved_at && (
                <p><span className="text-white/45">Resolved:</span> {formatDateTime(ticket.resolved_at)}</p>
              )}
            </div>
          </div>

          <div className={panelClassName}>
            <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
              <h2 className="text-base font-semibold text-white">Attachments</h2>
            </div>
            <div className="px-5 py-5 sm:px-6 sm:py-6">
              {canManageAttachments && (
                <div className="mb-4">
                  <label className="inline-flex cursor-pointer items-center gap-2 border border-white/[0.12] bg-white/[0.04] px-3 py-2 text-sm text-white transition-colors hover:bg-white/[0.08]">
                    <Paperclip className="h-4 w-4" />
                    {attachmentUploading ? "Uploading..." : "Add attachment"}
                    <input
                      type="file"
                      accept=".svg,.png,.jpg,.jpeg,.pdf,.docx,.csv,.xlsx,.txt,.doc"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        void handleAddAttachments(event.target.files);
                        event.currentTarget.value = "";
                      }}
                      disabled={attachmentUploading}
                    />
                  </label>
                </div>
              )}

              {attachmentError && <p className="mb-2 text-xs text-red-300">{attachmentError}</p>}

              {ticket.attachments.length === 0 ? (
                <p className="text-sm text-white/45">No attachments uploaded.</p>
              ) : (
                <div className="space-y-2">
                  {ticket.attachments.map((attachment) => (
                    <div key={attachment.id} className="border border-white/[0.1] bg-white/[0.03] px-3 py-3 text-sm">
                      <a
                        href={attachment.download_url || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={attachment.download_url ? "text-white hover:underline" : "pointer-events-none opacity-60"}
                      >
                        <p className="truncate">{attachment.file_name}</p>
                      </a>
                      <p className="mt-1 text-xs text-white/45">
                        {(attachment.file_size / 1024).toFixed(1)} KB - {attachment.mime_type}
                      </p>
                      {canManageAttachments && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteAttachment(attachment.id)}
                          className="mt-2 border border-red-500/35 bg-red-500/10 px-2 py-1 text-xs text-red-200 transition-colors hover:bg-red-500/15"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {formError && !isEditing && (
        <div className="mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {formError}
        </div>
      )}
    </div>
  );
}

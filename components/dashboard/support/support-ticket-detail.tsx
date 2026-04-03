"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  if (status === "resolved") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  if (status === "closed") return "bg-slate-500/15 text-slate-300 border-slate-500/30";
  if (status === "cancelled") return "bg-rose-500/15 text-rose-300 border-rose-500/30";
  if (status === "in_progress") return "bg-blue-500/15 text-blue-300 border-blue-500/30";
  if (status === "pending") return "bg-violet-500/15 text-violet-300 border-violet-500/30";
  return "bg-amber-500/15 text-amber-300 border-amber-500/30";
}

function actorBadge(actor: "user" | "admin" | "system"): string {
  if (actor === "admin") return "bg-blue-500/15 text-blue-300 border-blue-500/20";
  if (actor === "system") return "bg-white/10 text-white/70 border-white/15";
  return "bg-cyan-500/15 text-cyan-300 border-cyan-500/20";
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
    <div className="max-w-6xl mx-auto text-white">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/dashboard/support" className="text-xs text-white/45 hover:text-white/75">
            Back to support tickets
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{ticket.ticket_number}</h1>
          <p className="mt-1 text-sm text-white/55">{ticket.subject}</p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-xs ${statusBadge(ticket.status)}`}>
            {SUPPORT_STATUS_LABELS[ticket.status]}
          </span>
          {canEdit && !isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="rounded-md border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10"
            >
              Edit ticket
            </button>
          )}
          {canReopen && (
            <button
              type="button"
              onClick={() => void handleReopenTicket()}
              disabled={actionLoading}
              className="rounded-md border border-cyan-400/40 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-60"
            >
              {actionLoading ? "Reopening..." : "Reopen"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.65fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
            {!isEditing ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs uppercase text-white/40">Topic path</p>
                  <p className="mt-1 text-sm">
                    {topicLabels
                      ? `${topicLabels.topicLabel} / ${topicLabels.subTopicLabel} / ${topicLabels.tertiaryTopicLabel}`
                      : `${ticket.topic} / ${ticket.sub_topic} / ${ticket.tertiary_topic}`}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-white/40">Affected resource</p>
                  <p className="mt-1 text-sm">{ticket.affected_resource_name || "General issue"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-white/40">Issue description</p>
                  <div
                    className="mt-1 text-sm text-white/90 prose prose-invert max-w-none prose-p:my-1 prose-li:my-0"
                    dangerouslySetInnerHTML={{ __html: sanitizeSupportRichText(ticket.description) }}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-white/45 mb-1">Topic</label>
                  <select
                    value={topic}
                    onChange={(event) => {
                      const nextTopic = event.target.value;
                      setTopic(nextTopic);
                      setSubTopic("");
                      setTertiaryTopic("");
                      void loadResources(nextTopic);
                    }}
                    className="w-full rounded-md border border-white/10 bg-black/40 px-2.5 py-2 text-sm"
                  >
                    {SUPPORT_TOPICS.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-white/45 mb-1">Sub-topic</label>
                  <select
                    value={subTopic}
                    onChange={(event) => {
                      setSubTopic(event.target.value);
                      setTertiaryTopic("");
                    }}
                    className="w-full rounded-md border border-white/10 bg-black/40 px-2.5 py-2 text-sm"
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
                  <label className="block text-xs text-white/45 mb-1">Tertiary-topic</label>
                  <select
                    value={tertiaryTopic}
                    onChange={(event) => setTertiaryTopic(event.target.value)}
                    className="w-full rounded-md border border-white/10 bg-black/40 px-2.5 py-2 text-sm"
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
                  <label className="block text-xs text-white/45 mb-1">Subject</label>
                  <input
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    className="w-full rounded-md border border-white/10 bg-black/40 px-2.5 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/45 mb-1">Affected resource</label>
                  <select
                    value={affectedResourceId}
                    onChange={(event) => setAffectedResourceId(event.target.value)}
                    className="w-full rounded-md border border-white/10 bg-black/40 px-2.5 py-2 text-sm"
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
                  <label className="block text-xs text-white/45 mb-1">Description</label>
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
                    className="rounded-md border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveChanges()}
                    disabled={saving}
                    className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-60"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
            <h2 className="text-sm font-medium mb-3">Conversation</h2>
            {ticket.messages.length === 0 ? (
              <p className="text-sm text-white/45">No conversation messages yet.</p>
            ) : (
              <div className="space-y-3">
                {ticket.messages.map((message) => {
                  const identity = getMessageIdentity(message);
                  return (
                    <div key={message.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-8 w-8 border border-white/15">
                            <AvatarImage src={identity.avatar || undefined} />
                            <AvatarFallback className="bg-white/10 text-white/80 text-xs">
                              {identity.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm text-white/90">{identity.name}</p>
                            <p className="truncate text-xs text-white/45">{identity.email}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${actorBadge(message.actor_type)}`}>
                            {message.actor_type.toUpperCase()}
                          </span>
                          <p className="mt-1 text-xs text-white/45">{formatDateTime(message.created_at)}</p>
                        </div>
                      </div>
                      <div
                        className="text-sm prose prose-invert max-w-none prose-p:my-1 prose-li:my-0"
                        dangerouslySetInnerHTML={{ __html: sanitizeSupportRichText(message.message) }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
            <h2 className="text-sm font-medium mb-3">Ticket metadata</h2>
            <div className="space-y-2 text-sm">
              <p><span className="text-white/45">Created:</span> {formatDateTime(ticket.created_at)}</p>
              <p><span className="text-white/45">Updated:</span> {formatDateTime(ticket.updated_at)}</p>
              <p><span className="text-white/45">Latest activity:</span> {formatDateTime(ticket.latest_message_at)}</p>
              {ticket.resolved_at && (
                <p><span className="text-white/45">Resolved:</span> {formatDateTime(ticket.resolved_at)}</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
            <h2 className="text-sm font-medium mb-3">Attachments</h2>
            {canManageAttachments && (
              <div className="mb-3">
                <label className="inline-flex cursor-pointer rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15">
                  {attachmentUploading ? "Uploading..." : "Add Attachment"}
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
                  <div
                    key={attachment.id}
                    className="rounded-md border border-white/10 px-3 py-2 text-sm"
                  >
                    <a
                      href={attachment.download_url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={attachment.download_url ? "hover:underline" : "opacity-60 pointer-events-none"}
                    >
                      <p className="truncate">{attachment.file_name}</p>
                    </a>
                    <p className="text-xs text-white/45">
                      {(attachment.file_size / 1024).toFixed(1)} KB - {attachment.mime_type}
                    </p>
                    {canManageAttachments && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteAttachment(attachment.id)}
                        className="mt-2 rounded border border-red-400/30 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
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
  );
}


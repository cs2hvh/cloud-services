"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowLeft,
  ChevronRight,
  MessageSquare,
  Paperclip,
  Pencil,
  RotateCcw,
  Save,
  XCircle,
} from "lucide-react";
import {
  SUPPORT_STATUS_LABELS,
  SUPPORT_TOPICS,
  SupportResourceOption,
  SupportTicketStatus,
  canSupportStatusBeReopened,
  getSupportTopicLabels,
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

// ─── Design tokens ────────────────────────────────────────────────
const SERIF_STYLE: CSSProperties = {
  fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";

const SELECT_OPTION_STYLE: CSSProperties = {
  backgroundColor: "#0d0e11",
  color: "#ffffff",
};

const SELECT_CLASS_NAME =
  "h-10 w-full border border-white/[0.08] bg-[#0d0e11] px-3 text-[13px] text-white rounded-[5px] focus:outline-none focus:border-[#0095FF]/40 focus:ring-1 focus:ring-[#0095FF]/30";

function formatDateTime(date: string): string {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusMeta(status: SupportTicketStatus): { color: string; label: string } {
  const label = SUPPORT_STATUS_LABELS[status];
  if (status === "resolved") return { color: "#4ade80", label };
  if (status === "closed") return { color: "#94a3b8", label };
  if (status === "cancelled") return { color: "#fb7185", label };
  if (status === "permantly_close") return { color: "#f87171", label };
  if (status === "in_progress") return { color: ACCENT, label };
  if (status === "pending") return { color: "#a78bfa", label };
  return { color: "#fbbf24", label };
}

function actorMeta(actor: "user" | "admin" | "system"): { color: string; label: string } {
  if (actor === "admin") return { color: ACCENT, label: "Support" };
  if (actor === "system") return { color: "#94a3b8", label: "System" };
  return { color: "#22d3ee", label: "You" };
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
    return { name: "System", email: "—", avatar: null };
  }
  return { name: "User", email: "—", avatar: null };
}

function StatCell({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  const dotColor = accent ?? "rgba(255,255,255,0.35)";
  return (
    <div className="px-5 py-5 flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: dotColor,
            boxShadow: accent ? `0 0 6px ${dotColor}` : "none",
          }}
        />
        <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/45`}>
          {label}
        </span>
      </div>
      <span
        style={SERIF_STYLE}
        className="text-[24px] sm:text-[28px] leading-[1.05] font-bold tabular-nums tracking-[-0.025em] text-white"
      >
        {value}
      </span>
      {hint && <p className={`${MONO} text-[10.5px] text-white/40 mt-auto`}>{hint}</p>}
    </div>
  );
}

function SectionHead({
  index,
  title,
  accent,
  meta,
}: {
  index: string;
  title: string;
  accent: string;
  meta?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3 flex-wrap">
      <div className="flex items-baseline gap-3">
        <span className={`${MONO} text-[10.5px] tabular-nums text-white/35`}>{index}</span>
        <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-white">
          {title}{" "}
          <span style={SERIF_STYLE} className="text-white/55 font-normal">
            {accent}
          </span>
          <span className="text-white/55 font-normal">.</span>
        </h2>
      </div>
      {meta && (
        <span className={`${MONO} text-[11px] text-white/45 tabular-nums`}>{meta}</span>
      )}
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
  const canReopen = canSupportStatusBeReopened(ticket.status);
  const canManageAttachments = canEdit;
  const status = statusMeta(ticket.status);

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
      {/* ── Hero ─────────────────────────────────────────── */}
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between mb-10">
        <div className="max-w-3xl">
          <Link
            href="/dashboard/support"
            className={`${MONO} inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-white/45 hover:text-white transition-colors mb-5`}
          >
            <ArrowLeft className="h-3 w-3" />
            Back to tickets
          </Link>

          <div className={`${MONO} flex items-center gap-2 text-[10.5px] uppercase tracking-[0.14em] text-white/40 mb-3`}>
            <span>Support</span>
            <ChevronRight className="h-3 w-3 text-white/20" />
            <span className="text-white/65 tabular-nums">{ticket.ticket_number}</span>
          </div>

          <h1
            className="text-[32px] sm:text-[40px] leading-[1.05] tracking-[-0.025em] text-white font-semibold"
          >
            {ticket.subject.split(" ").slice(0, -1).join(" ")}{" "}
            <span style={SERIF_STYLE} className="text-white/55 font-normal">
              {ticket.subject.split(" ").slice(-1)[0]}
            </span>
            <span className="text-white/55 font-normal">.</span>
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`${MONO} inline-flex items-center gap-1.5 h-10 px-3.5 border bg-[#111216] text-[11px] uppercase tracking-[0.14em] rounded-[5px]`}
            style={{ borderColor: `${status.color}33`, color: status.color }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: status.color, boxShadow: `0 0 6px ${status.color}` }}
            />
            {status.label}
          </span>
          {canEdit && !isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className={`${MONO} h-10 inline-flex items-center gap-1.5 px-3.5 border border-white/[0.08] bg-[#111216] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors`}
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
          )}
          {canReopen && (
            <button
              type="button"
              onClick={() => void handleReopenTicket()}
              disabled={actionLoading}
              className={`${MONO} inline-flex h-10 items-center gap-1.5 px-4 text-[11.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all disabled:opacity-50`}
              style={{
                background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
                color: "#ffffff",
                boxShadow: "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT_BRIGHT}, ${ACCENT})`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
              }}
            >
              <RotateCcw className="h-3 w-3" />
              {actionLoading ? "Reopening" : "Reopen"}
            </button>
          )}
        </div>
      </header>

      {/* ── Stats ─────────────────────────────────────────── */}
      <section className="mb-12 border-y border-white/[0.06] grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/[0.06]">
        <StatCell label="Created" value={formatDateTime(ticket.created_at)} hint="Ticket opened" />
        <StatCell label="Latest activity" value={formatDateTime(ticket.latest_message_at)} hint="Most recent update" accent={ACCENT} />
        <StatCell label="Messages" value={String(ticket.messages.length)} hint="Conversation entries" accent="#a78bfa" />
        <StatCell label="Attachments" value={String(ticket.attachments.length)} hint="Uploaded files" />
      </section>

      <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
        <div className="space-y-12">
          {/* ── 01 Issue ─────────────────────────────────── */}
          <section>
            <SectionHead index="01" title="Issue" accent="details" />

            {!isEditing ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-4">
                    <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40 mb-2`}>
                      Topic path
                    </p>
                    <p className="text-[13px] text-white/85 leading-relaxed">
                      {topicLabels
                        ? `${topicLabels.topicLabel} / ${topicLabels.subTopicLabel} / ${topicLabels.tertiaryTopicLabel}`
                        : `${ticket.topic} / ${ticket.sub_topic} / ${ticket.tertiary_topic}`}
                    </p>
                  </div>
                  <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-4">
                    <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40 mb-2`}>
                      Affected resource
                    </p>
                    <p className="text-[13px] text-white/85 leading-relaxed">
                      {ticket.affected_resource_name || "General issue"}
                    </p>
                  </div>
                </div>

                <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5">
                  <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40 mb-3`}>
                    Description
                  </p>
                  <div
                    className="prose prose-invert max-w-none text-[13.5px] text-white/85 prose-p:my-1.5 prose-li:my-0.5 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: sanitizeSupportRichText(ticket.description) }}
                  />
                </div>
              </div>
            ) : (
              <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={`${MONO} mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-white/45`}>
                      Topic
                    </label>
                    <select
                      value={topic}
                      onChange={(event) => {
                        const nextTopic = event.target.value;
                        setTopic(nextTopic);
                        setSubTopic("");
                        setTertiaryTopic("");
                        void loadResources(nextTopic);
                      }}
                      className={SELECT_CLASS_NAME}
                    >
                      {SUPPORT_TOPICS.map((entry) => (
                        <option style={SELECT_OPTION_STYLE} key={entry.id} value={entry.id}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={`${MONO} mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-white/45`}>
                      Sub-topic
                    </label>
                    <select
                      value={subTopic}
                      onChange={(event) => {
                        setSubTopic(event.target.value);
                        setTertiaryTopic("");
                      }}
                      className={SELECT_CLASS_NAME}
                    >
                      <option style={SELECT_OPTION_STYLE} value="">Select sub-topic</option>
                      {(selectedTopic?.subTopics || []).map((entry) => (
                        <option style={SELECT_OPTION_STYLE} key={entry.id} value={entry.id}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={`${MONO} mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-white/45`}>
                      Tertiary
                    </label>
                    <select
                      value={tertiaryTopic}
                      onChange={(event) => setTertiaryTopic(event.target.value)}
                      className={SELECT_CLASS_NAME}
                    >
                      <option style={SELECT_OPTION_STYLE} value="">Select tertiary-topic</option>
                      {tertiaryOptions.map((entry) => (
                        <option style={SELECT_OPTION_STYLE} key={entry.id} value={entry.id}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className={`${MONO} mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-white/45`}>
                    Subject
                  </label>
                  <input
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    className="h-10 w-full border border-white/[0.08] bg-[#0d0e11] px-3 text-[13px] text-white rounded-[5px] focus:outline-none focus:border-[#0095FF]/40 focus:ring-1 focus:ring-[#0095FF]/30"
                  />
                </div>

                <div>
                  <label className={`${MONO} mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-white/45`}>
                    Affected resource
                  </label>
                  <select
                    value={affectedResourceId}
                    onChange={(event) => setAffectedResourceId(event.target.value)}
                    className={SELECT_CLASS_NAME}
                    disabled={resourcesLoading}
                  >
                    {resources.length === 0 && (
                      <option style={SELECT_OPTION_STYLE} value="general">
                        General issue
                      </option>
                    )}
                    {resources.map((entry) => (
                      <option style={SELECT_OPTION_STYLE} key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={`${MONO} mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-white/45`}>
                    Description
                  </label>
                  <SupportRichTextEditor
                    value={description}
                    onChange={setDescription}
                    minHeightClassName="min-h-[220px]"
                  />
                </div>

                {formError && (
                  <p className={`${MONO} text-[11px] text-rose-300`}>{formError}</p>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={resetForm}
                    disabled={saving}
                    className={`${MONO} h-10 inline-flex items-center gap-1.5 px-3.5 border border-white/[0.08] bg-[#0d0e11] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors disabled:opacity-50`}
                  >
                    <XCircle className="h-3 w-3" />
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveChanges()}
                    disabled={saving}
                    className={`${MONO} inline-flex h-10 items-center gap-1.5 px-4 text-[11.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all disabled:opacity-50`}
                    style={{
                      background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
                      color: "#ffffff",
                      boxShadow: "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)",
                    }}
                  >
                    <Save className="h-3 w-3" />
                    {saving ? "Saving" : "Save"}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ── 02 Conversation ─────────────────────────── */}
          <section>
            <SectionHead
              index="02"
              title="The"
              accent="conversation"
              meta={`${ticket.messages.length} ${ticket.messages.length === 1 ? "message" : "messages"}`}
            />

            {ticket.messages.length === 0 ? (
              <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] px-6 py-12 text-center">
                <MessageSquare className="h-5 w-5 text-white/30 mx-auto mb-3" />
                <p className="text-[13px] text-white/55">No conversation messages yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {ticket.messages.map((message) => {
                  const identity = getMessageIdentity(message);
                  const actor = actorMeta(message.actor_type);
                  return (
                    <div
                      key={message.id}
                      className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-4 sm:p-5"
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Avatar className="h-9 w-9 border border-white/10 rounded-[5px]">
                            <AvatarImage src={identity.avatar || undefined} />
                            <AvatarFallback
                              className={`${MONO} bg-[#0d0e11] text-[11px] text-white/75 rounded-[5px]`}
                            >
                              {identity.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium text-white">{identity.name}</p>
                            <p className={`${MONO} truncate text-[10.5px] text-white/40`}>
                              {identity.email}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          <span
                            className={`${MONO} inline-flex items-center gap-1 text-[9.5px] uppercase tracking-[0.12em] font-semibold`}
                            style={{ color: actor.color }}
                          >
                            <span
                              className="h-1 w-1 rounded-full"
                              style={{
                                background: actor.color,
                                boxShadow: `0 0 5px ${actor.color}`,
                              }}
                            />
                            {actor.label}
                          </span>
                          <p className={`${MONO} text-[10.5px] text-white/40 tabular-nums`}>
                            {formatDateTime(message.created_at)}
                          </p>
                        </div>
                      </div>
                      <div
                        className="prose prose-invert max-w-none text-[13.5px] text-white/85 prose-p:my-1.5 prose-li:my-0.5 leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: sanitizeSupportRichText(message.message) }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* ── Right column ────────────────────────────── */}
        <div className="space-y-10">
          {/* ── 03 Metadata ─────────────────────────────── */}
          <section>
            <SectionHead index="03" title="Ticket" accent="metadata" />
            <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] divide-y divide-white/[0.04]">
              <MetaRow label="Created" value={formatDateTime(ticket.created_at)} />
              <MetaRow label="Updated" value={formatDateTime(ticket.updated_at)} />
              <MetaRow label="Latest activity" value={formatDateTime(ticket.latest_message_at)} />
              {ticket.resolved_at && (
                <MetaRow label="Resolved" value={formatDateTime(ticket.resolved_at)} accent="#4ade80" />
              )}
            </div>
          </section>

          {/* ── 04 Attachments ──────────────────────────── */}
          <section>
            <SectionHead
              index="04"
              title="The"
              accent="attachments"
              meta={ticket.attachments.length > 0 ? `${ticket.attachments.length} file${ticket.attachments.length === 1 ? "" : "s"}` : undefined}
            />

            {canManageAttachments && (
              <label
                className={`${MONO} mb-3 inline-flex h-10 cursor-pointer items-center gap-1.5 px-3.5 border border-white/[0.08] bg-[#111216] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors`}
              >
                <Paperclip className="h-3 w-3" />
                {attachmentUploading ? "Uploading" : "Add attachment"}
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
            )}

            {attachmentError && (
              <p className={`${MONO} mb-2 text-[11px] text-rose-300`}>{attachmentError}</p>
            )}

            {ticket.attachments.length === 0 ? (
              <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] px-5 py-8 text-center">
                <Paperclip className="h-4 w-4 text-white/30 mx-auto mb-2" />
                <p className="text-[12.5px] text-white/45">No attachments uploaded.</p>
              </div>
            ) : (
              <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] divide-y divide-white/[0.04]">
                {ticket.attachments.map((attachment) => (
                  <div key={attachment.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="h-8 w-8 shrink-0 inline-flex items-center justify-center border border-white/[0.06] bg-[#0d0e11] rounded-[5px] text-white/45">
                      <Paperclip className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <a
                        href={attachment.download_url || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={
                          attachment.download_url
                            ? "block text-[12.5px] text-white hover:text-[#0095FF] transition-colors truncate"
                            : "block text-[12.5px] text-white/45 pointer-events-none truncate"
                        }
                      >
                        {attachment.file_name}
                      </a>
                      <p className={`${MONO} text-[10px] text-white/40 tabular-nums truncate`}>
                        {(attachment.file_size / 1024).toFixed(1)} KB · {attachment.mime_type}
                      </p>
                    </div>
                    {canManageAttachments && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteAttachment(attachment.id)}
                        className={`${MONO} shrink-0 text-[10px] uppercase tracking-[0.12em] text-rose-300/70 hover:text-rose-300 transition-colors`}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {formError && !isEditing && (
        <div className={`${MONO} mt-6 border border-rose-500/25 bg-rose-500/[0.06] rounded-[5px] px-4 py-3 text-[12px] text-rose-200`}>
          {formError}
        </div>
      )}
    </div>
  );
}

function MetaRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="px-4 py-3 flex items-center justify-between gap-3">
      <span className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/45`}>
        {label}
      </span>
      <span
        className={`${MONO} text-[11.5px] tabular-nums`}
        style={{ color: accent ?? "rgba(255,255,255,0.85)" }}
      >
        {value}
      </span>
    </div>
  );
}

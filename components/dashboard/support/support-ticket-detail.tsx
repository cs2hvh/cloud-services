"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowLeft,
  ChevronRight,
  Lock,
  MessageSquare,
  Paperclip,
  Pencil,
  RotateCcw,
  Save,
  Send,
  XCircle,
} from "lucide-react";
import {
  SUPPORT_STATUS_LABELS,
  SUPPORT_TOPICS,
  SupportResourceOption,
  SupportTicketStatus,
  canSupportStatusBeReopened,
  getSupportTopicLabel,
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

const INPUT_CLASS_NAME =
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

/** Time only. Inside the thread the day is carried by a separator row. */
function formatTime(date: string): string {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Day heading for a separator: "Today", "Yesterday", or a dated label. */
function formatDayLabel(date: string): string {
  const then = new Date(date);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(then)) / 86_400_000);

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return then.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(then.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
  });
}

/** True when two timestamps fall on different calendar days. */
function isNewDay(current: string, previous: string | null): boolean {
  if (!previous) return true;
  return new Date(current).toDateString() !== new Date(previous).toDateString();
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
    return { name: "Support Team", email: "support@ahurasense.com", avatar: null };
  }
  if (message.actor_type === "system") {
    return { name: "System", email: "—", avatar: null };
  }
  return { name: "User", email: "—", avatar: null };
}

// ─── Small building blocks ────────────────────────────────────────
function SectionLabel({ children, meta }: { children: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className={`${MONO} text-[12px] font-semibold uppercase tracking-[0.16em] text-white/70`}>
        {children}
      </h2>
      {meta && <span className={`${MONO} text-[11px] text-white/40 tabular-nums`}>{meta}</span>}
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
        className={`${MONO} text-[11.5px] tabular-nums text-right`}
        style={{ color: accent ?? "rgba(255,255,255,0.85)" }}
      >
        {value}
      </span>
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
  const [subject, setSubject] = useState(ticket.subject);
  const [description, setDescription] = useState(ticket.description);
  const [affectedResourceId, setAffectedResourceId] = useState(ticket.affected_resource_id || "general");
  const [resources, setResources] = useState<SupportResourceOption[]>(initialResources);
  const [resourcesLoading, setResourcesLoading] = useState(false);

  const [attachmentError, setAttachmentError] = useState("");
  const [attachmentUploading, setAttachmentUploading] = useState(false);

  const [replyText, setReplyText] = useState("");
  // Text length, not markup length. An empty editor holds "<p></p>", so any
  // check against the raw string treats a blank reply as ready to send.
  const replyLength = useMemo(() => plainTextFromRichText(replyText).length, [replyText]);
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState("");

  /**
   * Pull in replies the other side has sent.
   *
   * Without this the page was a one-way street: sending a reply calls
   * router.refresh() so you see your OWN message, but nothing fetched when
   * SUPPORT answered. A customer sat on an open ticket saw silence until they
   * thought to reload — on a page whose whole purpose is a conversation.
   *
   * Polling rather than a Realtime channel: tickets move on the order of
   * minutes, and a websocket per open ticket is a lot of standing connection
   * for a reply that is rarely seconds-sensitive. router.refresh() re-runs the
   * server component, which is already how a sent reply appears, so there is
   * one code path for "get the current thread" rather than two.
   *
   * Three things it deliberately does NOT do:
   *  - poll a closed ticket; nothing will arrive, so the request is waste
   *  - poll a hidden tab; a background tab does not need to be current
   *  - refresh while a draft is unsent, in case a reconcile drops the textarea
   *    — losing someone's half-written reply to save them one click is a bad
   *    trade, and they will see the new message the moment they send
   */
  const replyDraftRef = useRef("");
  replyDraftRef.current = replyText;

  const ticketIsOpen = isSupportOpenStatus(ticket.status);

  useEffect(() => {
    if (!ticketIsOpen) return;

    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (replyDraftRef.current.trim().length > 0) return;
      router.refresh();
    }, 20_000);

    return () => clearInterval(interval);
  }, [ticketIsOpen, ticket.id, router]);

  const selectedTopic = useMemo(
    () => SUPPORT_TOPICS.find((entry) => entry.id === topic) || null,
    [topic]
  );
  const selectedResource = resources.find((entry) => entry.id === affectedResourceId) || null;
  // Mirrors the create form: the generic "General <topic> issue" entry alone is
  // not worth a dropdown.
  const hasPickableResources = resources.some((entry) => entry.id !== "general");

  const canEdit = isSupportOpenStatus(ticket.status);
  const canReopen = canSupportStatusBeReopened(ticket.status);
  const canManageAttachments = canEdit;
  const canReply = canEdit;
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
    if (!topic) {
      setFormError("Please select a topic.");
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

  async function sendReply() {
    // Guard on the TEXT length, not the markup: an empty editor still holds
    // "<p></p>", which a raw .length check reads as content and would post as
    // a blank reply. The markup itself is what gets sent.
    if (plainTextFromRichText(replyText).length < 2) {
      setReplyError("Write a little more before sending.");
      return;
    }
    const html = replyText.trim();
    setReplySending(true);
    setReplyError("");
    try {
      const response = await fetch(`/api/support/tickets/${ticket.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: html }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to send message");
      }
      setReplyText("");
      router.refresh();
    } catch (error) {
      setReplyError(error instanceof Error ? error.message : "Failed to send message");
    } finally {
      setReplySending(false);
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

  const topicPath = getSupportTopicLabel(ticket.topic) ?? ticket.topic;

  // Title treatment shared with the list page: last word in brand blue, no trailing period.
  const titleWords = ticket.subject.trim().split(/\s+/);
  const titleLast = titleWords.pop() || ticket.subject;
  const titleLead = titleWords.join(" ");

  return (
    <div className="w-full text-white">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="mb-8">
        <Link
          href="/dashboard/support"
          className={`${MONO} inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-white/45 hover:text-white transition-colors mb-5`}
        >
          <ArrowLeft className="h-3 w-3" />
          Back to tickets
        </Link>

        <div className={`${MONO} flex items-center gap-2 text-[10.5px] uppercase tracking-[0.14em] text-white/40 mb-2.5`}>
          <span>Support</span>
          <ChevronRight className="h-3 w-3 text-white/20" />
          <span className="text-white/65 tabular-nums">{ticket.ticket_number}</span>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-[30px] sm:text-[38px] leading-[1.08] tracking-[-0.025em] text-white font-semibold break-words">
              {titleLead && <>{titleLead} </>}
              <span style={SERIF_STYLE} className="text-[#0095FF] font-normal">
                {titleLast}
              </span>
            </h1>
            <p className={`${MONO} mt-2 text-[11px] text-white/40 truncate`}>{topicPath}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`${MONO} inline-flex items-center gap-1.5 h-9 px-3 border bg-[#111216] text-[11px] uppercase tracking-[0.12em] rounded-[5px]`}
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
                className={`${MONO} h-9 inline-flex items-center gap-1.5 px-3 border border-white/[0.08] bg-[#111216] text-[11px] uppercase tracking-[0.12em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors`}
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
                className={`${MONO} inline-flex h-9 items-center gap-1.5 px-3.5 text-[11px] uppercase tracking-[0.12em] font-semibold rounded-[5px] transition-all disabled:opacity-50`}
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
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* ── Main column ─────────────────────────────────── */}
        <div className="space-y-10 min-w-0">
          {/* Issue */}
          <section>
            <SectionLabel>Issue</SectionLabel>

            {!isEditing ? (
              <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] divide-y divide-white/[0.05]">
                <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.05]">
                  <div className="p-4">
                    <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40 mb-1.5`}>
                      Topic path
                    </p>
                    <p className="text-[13px] text-white/85 leading-relaxed">{topicPath}</p>
                  </div>
                  <div className="p-4">
                    <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40 mb-1.5`}>
                      Affected resource
                    </p>
                    <p className="text-[13px] text-white/85 leading-relaxed">
                      {ticket.affected_resource_name || "General issue"}
                    </p>
                  </div>
                </div>
                <div className="p-5">
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
                <div>
                  <label className={`${MONO} mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-white/45`}>
                    Topic
                  </label>
                  <select
                    value={topic}
                    onChange={(event) => {
                      const nextTopic = event.target.value;
                      setTopic(nextTopic);
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
                    Subject
                  </label>
                  <input
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    className={INPUT_CLASS_NAME}
                  />
                </div>

                {hasPickableResources && (
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
                      {resources.map((entry) => (
                        <option style={SELECT_OPTION_STYLE} key={entry.id} value={entry.id}>
                          {entry.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

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

          {/* Conversation */}
          <section>
            <SectionLabel
              meta={`${ticket.messages.length} ${ticket.messages.length === 1 ? "message" : "messages"}`}
            >
              Conversation
            </SectionLabel>

            {ticket.messages.length === 0 ? (
              <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] px-6 py-10 text-center">
                <MessageSquare className="h-5 w-5 text-white/30 mx-auto mb-3" />
                <p className="text-[13px] text-white/55">No replies yet. Start the conversation below.</p>
              </div>
            ) : (
              /*
                A ticket is a conversation, so it reads as one: the customer's
                messages sit right, support's sit left. Previously every message
                was an identical full-width card with only a coloured left edge
                to tell them apart, which made a back-and-forth look like a
                stack of log entries and forced you to read the name badge to
                know who was speaking.
              */
              <div className="rounded-[6px] border border-white/[0.06] bg-[#0e0f13] px-3 py-2 sm:px-4 sm:py-3">
                {ticket.messages.map((message, index) => {
                  const identity = getMessageIdentity(message);
                  const actor = actorMeta(message.actor_type);
                  const isSystem = message.actor_type === "system";
                  const isOwn = message.actor_type === "user";

                  // Consecutive messages from the same person lose the avatar
                  // and name, so a rapid exchange reads as one turn rather than
                  // repeating the header three times.
                  const previous = index > 0 ? ticket.messages[index - 1] : null;
                  const startsGroup = !previous || previous.actor_type !== message.actor_type;

                  // A ticket can run for days. Carrying the date on a separator
                  // lets every message show just a time, instead of repeating
                  // "Sep 3, 2026" on each line of the same afternoon.
                  const dayBreak = isNewDay(
                    message.created_at,
                    previous?.created_at ?? null
                  );
                  const daySeparator = dayBreak ? (
                    <div className="flex items-center gap-3 px-1 pt-4 pb-1">
                      <span className="h-px flex-1 bg-white/[0.07]" />
                      <span
                        className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/35`}
                      >
                        {formatDayLabel(message.created_at)}
                      </span>
                      <span className="h-px flex-1 bg-white/[0.07]" />
                    </div>
                  ) : null;

                  // System notices are events, not speech — centred, quiet, and
                  // never wearing a speech bubble.
                  if (isSystem) {
                    return (
                      <Fragment key={message.id}>
                        {daySeparator}
                        <div className="flex justify-center py-2.5">
                          <div
                            className={`${MONO} flex max-w-[85%] flex-wrap items-center justify-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-[10.5px] text-white/45`}
                          >
                            <span
                              dangerouslySetInnerHTML={{
                                __html: sanitizeSupportRichText(message.message),
                              }}
                            />
                            <span className="tabular-nums text-white/25">
                              {formatTime(message.created_at)}
                            </span>
                          </div>
                        </div>
                      </Fragment>
                    );
                  }

                  return (
                    <Fragment key={message.id}>
                    {daySeparator}
                    <div
                      className={`flex gap-2.5 ${startsGroup ? "pt-3.5" : "pt-1"} ${
                        isOwn ? "flex-row-reverse" : "flex-row"
                      }`}
                    >
                      {/* Avatar rail. Kept at width even when empty so grouped
                          bubbles stay on the same edge as the first. */}
                      <div className="w-9 shrink-0">
                        {startsGroup && (
                          <Avatar className="h-9 w-9 rounded-[5px] border border-white/10">
                            <AvatarImage src={identity.avatar || undefined} />
                            <AvatarFallback
                              className={`${MONO} rounded-[5px] bg-[#0d0e11] text-[11px] text-white/75`}
                            >
                              {identity.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>

                      <div
                        className={`flex min-w-0 max-w-[80%] flex-col ${
                          isOwn ? "items-end" : "items-start"
                        }`}
                      >
                        {startsGroup && (
                          <div
                            className={`mb-1 flex min-w-0 items-center gap-2 ${
                              isOwn ? "flex-row-reverse" : ""
                            }`}
                          >
                            <span className="truncate text-[12.5px] font-medium text-white">
                              {identity.name}
                            </span>
                            <span
                              className={`${MONO} shrink-0 rounded-[3px] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]`}
                              style={{ color: actor.color, background: `${actor.color}1a` }}
                            >
                              {actor.label}
                            </span>
                          </div>
                        )}

                        <div
                          className={`min-w-0 rounded-[8px] border px-3.5 py-2.5 text-left text-[13.5px] leading-relaxed ${
                            isOwn
                              ? "border-[#22d3ee]/20 bg-[#22d3ee]/[0.07] text-white/90"
                              : "border-white/[0.07] bg-[#15171c] text-white/85"
                          }`}
                        >
                          <div
                            className="prose prose-invert max-w-none break-words prose-p:my-1.5 prose-li:my-0.5"
                            dangerouslySetInnerHTML={{
                              __html: sanitizeSupportRichText(message.message),
                            }}
                          />
                        </div>

                        <span
                          className={`${MONO} mt-1 px-0.5 text-[10px] tabular-nums text-white/30`}
                          title={`${identity.email} · ${formatDateTime(message.created_at)}`}
                        >
                          {formatTime(message.created_at)}
                        </span>
                      </div>
                    </div>
                    </Fragment>
                  );
                })}
              </div>
            )}

            {/* Reply composer */}
            <div className="mt-4">
              {canReply ? (
                /*
                  The same editor the create form uses. A customer who wrote
                  their ticket with formatting, code blocks and links had to
                  follow it up in a bare textarea, so a pasted stack trace came
                  back as one unreadable run of text — in the place where
                  formatting matters most, since replies are where the actual
                  error output goes.

                  Cmd/Ctrl+Enter is bound on the wrapper: the editor owns its
                  own keymap, and this rides above it without fighting it.
                */
                <div
                  className="border border-white/[0.08] bg-[#111216] rounded-[6px] overflow-hidden focus-within:border-[#0095FF]/40 transition-colors"
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                      event.preventDefault();
                      if (!replySending && replyLength >= 2) void sendReply();
                    }
                  }}
                >
                  <SupportRichTextEditor
                    value={replyText}
                    onChange={(next) => {
                      setReplyText(next);
                      if (replyError) setReplyError("");
                    }}
                    placeholder="Write a reply to support…"
                    minHeightClassName="min-h-[120px]"
                  />
                  <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-3.5 py-2.5">
                    <span className={`${MONO} text-[10px] text-white/30`}>
                      {replyError ? (
                        <span className="text-rose-300">{replyError}</span>
                      ) : (
                        <>⌘ / Ctrl + Enter to send</>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => void sendReply()}
                      disabled={replySending || replyLength < 2}
                      className={`${MONO} inline-flex h-9 items-center gap-1.5 px-4 text-[11px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all disabled:opacity-40 disabled:cursor-not-allowed`}
                      style={{
                        background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
                        color: "#ffffff",
                        boxShadow: "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)",
                      }}
                    >
                      <Send className="h-3 w-3" />
                      {replySending ? "Sending" : "Send"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className={`${MONO} flex items-center gap-2 border border-white/[0.06] bg-[#0d0e11] rounded-[6px] px-4 py-3 text-[11px] text-white/45`}>
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                  This ticket is {status.label.toLowerCase()}.
                  {canReopen ? " Reopen it to add a reply." : " Replies are disabled."}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ── Sidebar ─────────────────────────────────────── */}
        <div className="space-y-8">
          {/* Details */}
          <section>
            <SectionLabel>Details</SectionLabel>
            <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] divide-y divide-white/[0.04]">
              <MetaRow label="Status" value={status.label} accent={status.color} />
              <MetaRow label="Created" value={formatDateTime(ticket.created_at)} />
              <MetaRow label="Last activity" value={formatDateTime(ticket.latest_message_at)} />
              <MetaRow label="Messages" value={String(ticket.messages.length)} />
              <MetaRow label="Attachments" value={String(ticket.attachments.length)} />
              {ticket.resolved_at && (
                <MetaRow label="Resolved" value={formatDateTime(ticket.resolved_at)} accent="#4ade80" />
              )}
            </div>
          </section>

          {/* Attachments */}
          <section>
            <SectionLabel
              meta={ticket.attachments.length > 0 ? `${ticket.attachments.length} file${ticket.attachments.length === 1 ? "" : "s"}` : undefined}
            >
              Attachments
            </SectionLabel>

            {canManageAttachments && (
              <label
                className={`${MONO} mb-3 inline-flex h-9 cursor-pointer items-center gap-1.5 px-3.5 border border-white/[0.08] bg-[#111216] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors`}
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
              <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] px-5 py-6 text-center">
                <Paperclip className="h-4 w-4 text-white/30 mx-auto mb-2" />
                <p className="text-[12px] text-white/45">No attachments.</p>
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
                        {(attachment.file_size / 1024).toFixed(1)} KB
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

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getSupportTopicLabels,
  SUPPORT_TOPICS,
  SupportResourceOption,
} from "@/lib/support/catalog";
import {
  SupportTicketAttachment,
  SupportTicketDetail,
} from "@/lib/supabase/queries/support_tickets";

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

function statusBadge(status: string): string {
  if (status === "resolved") {
    return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  }
  return "bg-amber-500/15 text-amber-300 border-amber-500/30";
}

function actorBadge(actor: "user" | "admin" | "system"): string {
  if (actor === "admin") return "bg-blue-500/15 text-blue-300 border-blue-500/20";
  if (actor === "system") return "bg-white/10 text-white/70 border-white/15";
  return "bg-cyan-500/15 text-cyan-300 border-cyan-500/20";
}

export default function SupportTicketDetailView({ ticket, initialResources }: SupportTicketDetailProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [topic, setTopic] = useState(ticket.topic);
  const [subTopic, setSubTopic] = useState(ticket.sub_topic);
  const [tertiaryTopic, setTertiaryTopic] = useState(ticket.tertiary_topic);
  const [subject, setSubject] = useState(ticket.subject);
  const [description, setDescription] = useState(ticket.description);
  const [affectedResourceId, setAffectedResourceId] = useState(ticket.affected_resource_id || "general");
  const [resources, setResources] = useState<SupportResourceOption[]>(initialResources);
  const [resourcesLoading, setResourcesLoading] = useState(false);

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
    if (description.trim().length < 10) {
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
          description: description.trim(),
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

  return (
    <div className="max-w-5xl mx-auto text-white">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/dashboard/support" className="text-xs text-white/45 hover:text-white/75">
            Back to support tickets
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{ticket.ticket_number}</h1>
          <p className="mt-1 text-sm text-white/55">{ticket.subject}</p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-xs capitalize ${statusBadge(ticket.status)}`}>
            {ticket.status}
          </span>
          {ticket.status === "open" && !isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="rounded-md border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10"
            >
              Edit ticket
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
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
                  <p className="mt-1 whitespace-pre-wrap text-sm text-white/90">{ticket.description}</p>
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
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={8}
                    className="w-full rounded-md border border-white/10 bg-black/40 px-2.5 py-2 text-sm"
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
            <h2 className="text-sm font-medium mb-3">
              {ticket.status === "resolved" ? "Conversation history" : "Conversation"}
            </h2>
            {ticket.messages.length === 0 ? (
              <p className="text-sm text-white/45">No conversation messages yet.</p>
            ) : (
              <div className="space-y-3">
                {ticket.messages.map((message) => (
                  <div key={message.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs capitalize ${actorBadge(
                          message.actor_type
                        )}`}
                      >
                        {message.actor_type}
                      </span>
                      <span className="text-xs text-white/45">{formatDateTime(message.created_at)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{message.message}</p>
                  </div>
                ))}
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
            {ticket.attachments.length === 0 ? (
              <p className="text-sm text-white/45">No attachments uploaded.</p>
            ) : (
              <div className="space-y-2">
                {ticket.attachments.map((attachment) => (
                  <a
                    key={attachment.id}
                    href={attachment.download_url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`block rounded-md border border-white/10 px-3 py-2 text-sm ${
                      attachment.download_url ? "hover:bg-white/10" : "opacity-60 pointer-events-none"
                    }`}
                  >
                    <p className="truncate">{attachment.file_name}</p>
                    <p className="text-xs text-white/45">
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
  );
}

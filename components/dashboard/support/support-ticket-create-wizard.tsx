"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ALLOWED_SUPPORT_FILE_EXTENSIONS,
  getFileExtension,
  isAllowedSupportFile,
  SUPPORT_FILE_MAX_SIZE_BYTES,
  SUPPORT_MAX_ATTACHMENTS,
  SUPPORT_TOPICS,
  SupportResourceOption,
} from "@/lib/support/catalog";

const STEP_TITLES = [
  "Select topic",
  "Select sub-topic",
  "Select tertiary-topic",
  "Input subject",
  "Select affected resource",
  "Describe issue",
  "Attach files",
  "Review & submit",
];

function getStepCompletionLabel(step: number): string {
  return `Step ${step} of ${STEP_TITLES.length}`;
}

export default function SupportTicketCreateWizard() {
  const router = useRouter();

  const [currentStep, setCurrentStep] = useState(1);

  const [topic, setTopic] = useState("");
  const [subTopic, setSubTopic] = useState("");
  const [tertiaryTopic, setTertiaryTopic] = useState("");
  const [subject, setSubject] = useState("");
  const [affectedResourceId, setAffectedResourceId] = useState("general");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);

  const [resources, setResources] = useState<SupportResourceOption[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [resourcesError, setResourcesError] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const selectedTopic = useMemo(
    () => SUPPORT_TOPICS.find((item) => item.id === topic) || null,
    [topic]
  );
  const selectedSubTopic = useMemo(
    () => selectedTopic?.subTopics.find((item) => item.id === subTopic) || null,
    [selectedTopic, subTopic]
  );
  const tertiaryOptions = selectedSubTopic?.tertiaryTopics || [];
  const selectedResource = resources.find((resource) => resource.id === affectedResourceId) || null;

  useEffect(() => {
    if (!topic) {
      setResources([]);
      setAffectedResourceId("general");
      return;
    }

    let isActive = true;
    setResourcesLoading(true);
    setResourcesError("");

    void fetch(`/api/support/resources?topic=${encodeURIComponent(topic)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || "Failed to load resources");
        }
        return response.json() as Promise<{ data: SupportResourceOption[] }>;
      })
      .then((payload) => {
        if (!isActive) return;
        setResources(payload.data || []);
        setAffectedResourceId(payload.data?.[0]?.id || "general");
      })
      .catch((error: unknown) => {
        if (!isActive) return;
        const message = error instanceof Error ? error.message : "Failed to load resources";
        setResourcesError(message);
        setResources([]);
        setAffectedResourceId("general");
      })
      .finally(() => {
        if (!isActive) return;
        setResourcesLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [topic]);

  function validateStep(step: number): string | null {
    if (step === 1 && !topic) return "Please choose a topic.";
    if (step === 2 && !subTopic) return "Please choose a sub-topic.";
    if (step === 3 && !tertiaryTopic) return "Please choose a tertiary-topic.";
    if (step === 4 && subject.trim().length < 4) return "Subject must be at least 4 characters.";
    if (step === 5 && !affectedResourceId) return "Please select an affected resource.";
    if (step === 6 && description.trim().length < 10) return "Description must be at least 10 characters.";
    return null;
  }

  function goNext() {
    const validationError = validateStep(currentStep);
    if (validationError) {
      setSubmitError(validationError);
      return;
    }
    setSubmitError("");
    setCurrentStep((previous) => Math.min(previous + 1, STEP_TITLES.length));
  }

  function goBack() {
    setSubmitError("");
    setCurrentStep((previous) => Math.max(previous - 1, 1));
  }

  function processFiles(files: File[]) {
    const errors: string[] = [];
    const accepted: File[] = [];

    for (const file of files) {
      if (!isAllowedSupportFile(file.name, file.type)) {
        errors.push(`${file.name} is unsupported.`);
        continue;
      }
      if (file.size > SUPPORT_FILE_MAX_SIZE_BYTES) {
        errors.push(`${file.name} is larger than 10MB.`);
        continue;
      }
      accepted.push(file);
    }

    if (attachments.length + accepted.length > SUPPORT_MAX_ATTACHMENTS) {
      errors.push(`You can attach up to ${SUPPORT_MAX_ATTACHMENTS} files.`);
    }

    if (errors.length > 0) {
      setSubmitError(errors.join(" "));
    } else {
      setSubmitError("");
    }

    const remainingSlots = Math.max(0, SUPPORT_MAX_ATTACHMENTS - attachments.length);
    setAttachments((previous) => [...previous, ...accepted.slice(0, remainingSlots)]);
  }

  function handleFileInput(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files ? Array.from(event.target.files) : [];
    processFiles(selected);
    event.target.value = "";
  }

  function handleFileDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const dropped = Array.from(event.dataTransfer.files || []);
    processFiles(dropped);
  }

  function removeFile(index: number) {
    setAttachments((previous) => previous.filter((_, currentIndex) => currentIndex !== index));
  }

  async function submitTicket() {
    const validationError = validateStep(6);
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    if (!selectedTopic) {
      setSubmitError("Please select a topic.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    try {
      const formData = new FormData();
      formData.append("topic", topic);
      formData.append("subTopic", subTopic);
      formData.append("tertiaryTopic", tertiaryTopic);
      formData.append("subject", subject.trim());
      formData.append("affectedResourceType", selectedTopic.resourceType);
      formData.append("affectedResourceId", selectedResource?.id || "general");
      formData.append("affectedResourceName", selectedResource?.name || "General issue");
      formData.append("description", description.trim());
      attachments.forEach((file) => formData.append("attachments", file));

      const response = await fetch("/api/support/tickets", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        data?: { id?: string };
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to create support ticket");
      }

      const ticketId = payload.data?.id;
      if (ticketId) {
        router.push(`/dashboard/support/${ticketId}`);
      } else {
        router.push("/dashboard/support");
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to create ticket");
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto text-white">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Create Support Ticket</h1>
        <p className="text-sm text-white/50 mt-1">
          Follow the guided process so we can resolve your issue faster.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/30 p-5">
        <div className="mb-5">
          <div className="flex items-center justify-between text-xs text-white/55 mb-2">
            <span>{getStepCompletionLabel(currentStep)}</span>
            <span>{Math.round((currentStep / STEP_TITLES.length) * 100)}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
              style={{ width: `${(currentStep / STEP_TITLES.length) * 100}%` }}
            />
          </div>
          <h2 className="mt-3 text-lg font-medium">{STEP_TITLES[currentStep - 1]}</h2>
        </div>

        {currentStep === 1 && (
          <div>
            <label className="block text-sm text-white/75 mb-2">Topic</label>
            <select
              value={topic}
              onChange={(event) => {
                setTopic(event.target.value);
                setSubTopic("");
                setTertiaryTopic("");
              }}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
            >
              <option value="">Select a topic</option>
              {SUPPORT_TOPICS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {currentStep === 2 && (
          <div>
            <label className="block text-sm text-white/75 mb-2">Sub-topic</label>
            <select
              value={subTopic}
              onChange={(event) => {
                setSubTopic(event.target.value);
                setTertiaryTopic("");
              }}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
              disabled={!selectedTopic}
            >
              <option value="">Select a sub-topic</option>
              {(selectedTopic?.subTopics || []).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {currentStep === 3 && (
          <div>
            <label className="block text-sm text-white/75 mb-2">Tertiary-topic</label>
            <select
              value={tertiaryTopic}
              onChange={(event) => setTertiaryTopic(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
              disabled={!selectedSubTopic}
            >
              <option value="">Select a tertiary-topic</option>
              {tertiaryOptions.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {currentStep === 4 && (
          <div>
            <label className="block text-sm text-white/75 mb-2">Subject</label>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Example: Kubernetes cluster stuck on ready state"
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm placeholder:text-white/30"
            />
          </div>
        )}

        {currentStep === 5 && (
          <div>
            <label className="block text-sm text-white/75 mb-2">Affected resource</label>
            <select
              value={affectedResourceId}
              onChange={(event) => setAffectedResourceId(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
              disabled={resourcesLoading}
            >
              {resources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name}
                </option>
              ))}
            </select>
            {resourcesLoading && <p className="mt-2 text-xs text-white/45">Loading resources...</p>}
            {resourcesError && <p className="mt-2 text-xs text-red-300">{resourcesError}</p>}
          </div>
        )}

        {currentStep === 6 && (
          <div>
            <label className="block text-sm text-white/75 mb-2">Issue description</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Share exact error, what you tried, and expected behavior."
              rows={8}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm placeholder:text-white/30"
            />
          </div>
        )}

        {currentStep === 7 && (
          <div>
            <div
              onDrop={handleFileDrop}
              onDragOver={(event) => event.preventDefault()}
              className="rounded-lg border border-dashed border-white/20 bg-black/25 p-6 text-center"
            >
              <p className="text-sm">Drop files here or choose manually.</p>
              <p className="mt-1 text-xs text-white/45">
                Allowed: {ALLOWED_SUPPORT_FILE_EXTENSIONS.join(", ")} | Max 10MB per file
              </p>
              <label className="inline-block mt-3 cursor-pointer rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15">
                Choose files
                <input
                  type="file"
                  accept=".svg,.png,.jpg,.jpeg,.pdf,.docx"
                  multiple
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>
            </div>

            <div className="mt-4 space-y-2">
              {attachments.length === 0 ? (
                <p className="text-xs text-white/45">No files attached.</p>
              ) : (
                attachments.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate">{file.name}</p>
                      <p className="text-xs text-white/45">
                        .{getFileExtension(file.name)} - {(file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="ml-3 rounded border border-white/15 px-2 py-1 text-xs hover:bg-white/10"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {currentStep === 8 && (
          <div className="space-y-4">
            <div className="rounded-lg border border-white/10 bg-black/35 p-4 text-sm">
              <p><span className="text-white/55">Topic:</span> {selectedTopic?.label || "-"}</p>
              <p className="mt-1"><span className="text-white/55">Sub-topic:</span> {selectedSubTopic?.label || "-"}</p>
              <p className="mt-1"><span className="text-white/55">Tertiary-topic:</span> {tertiaryOptions.find((item) => item.id === tertiaryTopic)?.label || "-"}</p>
              <p className="mt-1"><span className="text-white/55">Subject:</span> {subject || "-"}</p>
              <p className="mt-1"><span className="text-white/55">Affected resource:</span> {selectedResource?.name || "-"}</p>
              <p className="mt-3 whitespace-pre-wrap"><span className="text-white/55">Description:</span>{"\n"}{description || "-"}</p>
              <p className="mt-3"><span className="text-white/55">Attachments:</span> {attachments.length}</p>
            </div>
          </div>
        )}

        {submitError && <p className="mt-4 text-sm text-red-300">{submitError}</p>}

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={goBack}
            disabled={currentStep === 1 || submitting}
            className="rounded-md border border-white/15 px-4 py-2 text-sm disabled:opacity-50"
          >
            Back
          </button>

          {currentStep < STEP_TITLES.length ? (
            <button
              type="button"
              onClick={goNext}
              disabled={submitting}
              className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submitTicket()}
              disabled={submitting}
              className="rounded-md bg-cyan-400 px-4 py-2 text-sm font-semibold text-black hover:bg-cyan-300 disabled:opacity-60"
            >
              {submitting ? "Submitting..." : "Submit Ticket"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronRight, Paperclip } from "lucide-react";
import {
  ALLOWED_SUPPORT_FILE_EXTENSIONS,
  getFileExtension,
  isAllowedSupportFile,
  SUPPORT_FILE_MAX_SIZE_BYTES,
  SUPPORT_MAX_ATTACHMENTS,
  SUPPORT_TOPICS,
  SupportResourceOption,
} from "@/lib/support/catalog";
import { plainTextFromRichText } from "@/lib/support/richtext";
import SupportRichTextEditor from "./support-rich-text-editor";

const STEP_TITLES = ["Select topic", "Details", "Review & submit"];

const SELECT_OPTION_STYLE: CSSProperties = {
  backgroundColor: "#0b1220",
  color: "#ffffff",
};

const SELECT_CLASS_NAME =
  "h-11 w-full border border-white/[0.12] bg-[#0b1220] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/35";

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

    if (step === 2) {
      if (!subTopic) return "Please choose a sub-topic.";
      if (!tertiaryTopic) return "Please choose a tertiary-topic.";
      if (subject.trim().length < 4) return "Subject must be at least 4 characters.";
      if (!affectedResourceId) return "Please select an affected resource.";
      if (plainTextFromRichText(description).length < 10) {
        return "Description must be at least 10 characters.";
      }
    }

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

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files ? Array.from(event.target.files) : [];
    processFiles(selected);
    event.target.value = "";
  }

  function handleFileDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const dropped = Array.from(event.dataTransfer.files || []);
    processFiles(dropped);
  }

  function removeFile(index: number) {
    setAttachments((previous) => previous.filter((_, currentIndex) => currentIndex !== index));
  }

  async function submitTicket() {
    const validationError = validateStep(2);
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
      formData.append("description", description);
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

  const completionPercentage = (currentStep / STEP_TITLES.length) * 100;
  const panelClassName = "glass-panel overflow-hidden";

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
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/70">
              Support Intake
            </p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
              Create a support ticket with clear routing and context.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">
              Follow this guided flow so our team receives complete issue details, correct service mapping, and optional attachments on first submission.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:min-w-[240px]">
            <div className="border border-white/[0.08] bg-white/[0.04] px-3 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Progress</div>
              <div className="mt-1.5 text-lg font-semibold text-white">{getStepCompletionLabel(currentStep)}</div>
            </div>
            <div className="border border-white/[0.08] bg-white/[0.04] px-3 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Topic</div>
              <div className="mt-1.5 line-clamp-1 text-lg font-semibold text-white">{selectedTopic?.label || "-"}</div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/[0.06] px-5 py-4 sm:px-6">
          <div className="mb-3 h-1.5 w-full overflow-hidden bg-white/[0.05]">
            <div
              className="h-full bg-gradient-to-r from-blue-400/85 to-white transition-all duration-300"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {STEP_TITLES.map((title, index) => {
              const stepNumber = index + 1;
              const isActive = currentStep === stepNumber;
              const isCompleted = currentStep > stepNumber;

              return (
                <button
                  key={title}
                  type="button"
                  onClick={() => {
                    if (stepNumber < currentStep) {
                      setCurrentStep(stepNumber);
                      setSubmitError("");
                    }
                  }}
                  className={`border px-3 py-3 text-left transition-colors ${
                    isActive
                      ? "border-blue-400/30 bg-blue-500/10"
                      : isCompleted
                        ? "border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.06]"
                        : "border-white/[0.06] bg-transparent"
                  } ${stepNumber < currentStep ? "cursor-pointer" : "cursor-default"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-white/32">0{stepNumber}</span>
                    {isCompleted && (
                      <span className="inline-flex h-5 w-5 items-center justify-center border border-blue-400/25 bg-blue-500/15 text-blue-100">
                        <Check size={12} />
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm font-semibold text-white">{title}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_360px]">
        <div className={panelClassName}>
          <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
            <h2 className="text-base font-semibold text-white">{STEP_TITLES[currentStep - 1]}</h2>
            <p className="mt-1 text-sm text-white/45">Fill this step to continue to the next one.</p>
          </div>

          <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
            {currentStep === 1 && (
              <div>
                <label className="mb-2 block text-sm text-white/75">Topic</label>
                <select
                  value={topic}
                  onChange={(event) => {
                    setTopic(event.target.value);
                    setSubTopic("");
                    setTertiaryTopic("");
                  }}
                  className={SELECT_CLASS_NAME}
                >
                  <option style={SELECT_OPTION_STYLE} value="">Select a topic</option>
                  {SUPPORT_TOPICS.map((entry) => (
                    <option style={SELECT_OPTION_STYLE} key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-5">
                <div className="grid gap-4 xl:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm text-white/75">Sub-topic</label>
                    <select
                      value={subTopic}
                      onChange={(event) => {
                        setSubTopic(event.target.value);
                        setTertiaryTopic("");
                      }}
                      className={SELECT_CLASS_NAME}
                      disabled={!selectedTopic}
                    >
                      <option style={SELECT_OPTION_STYLE} value="">Select a sub-topic</option>
                      {(selectedTopic?.subTopics || []).map((entry) => (
                        <option style={SELECT_OPTION_STYLE} key={entry.id} value={entry.id}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-white/75">Tertiary-topic</label>
                    <select
                      value={tertiaryTopic}
                      onChange={(event) => setTertiaryTopic(event.target.value)}
                      className={SELECT_CLASS_NAME}
                      disabled={!selectedSubTopic}
                    >
                      <option style={SELECT_OPTION_STYLE} value="">Select a tertiary-topic</option>
                      {tertiaryOptions.map((entry) => (
                        <option style={SELECT_OPTION_STYLE} key={entry.id} value={entry.id}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-white/75">Subject</label>
                  <input
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder="Example: Kubernetes cluster stuck on ready state"
                    className="h-11 w-full border border-white/[0.12] bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/35"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-white/75">Affected resource</label>
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
                    {resources.map((resource) => (
                      <option style={SELECT_OPTION_STYLE} key={resource.id} value={resource.id}>
                        {resource.name}
                      </option>
                    ))}
                  </select>
                  {resourcesLoading && <p className="mt-2 text-xs text-white/45">Loading resources...</p>}
                  {resourcesError && <p className="mt-2 text-xs text-red-300">{resourcesError}</p>}
                </div>

                <div>
                  <label className="mb-2 block text-sm text-white/75">Issue description</label>
                  <SupportRichTextEditor
                    value={description}
                    onChange={setDescription}
                    placeholder="Share exact error, what you tried, and expected behavior."
                    minHeightClassName="min-h-[240px]"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-white/75">Attachments (optional)</label>
                  <div
                    onDrop={handleFileDrop}
                    onDragOver={(event) => event.preventDefault()}
                    className="border border-dashed border-white/[0.2] bg-white/[0.03] p-8 text-center"
                  >
                    <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center border border-white/[0.12] bg-white/[0.04]">
                      <Paperclip className="h-5 w-5 text-white/70" />
                    </div>
                    <p className="text-sm">Drop files here or choose manually.</p>
                    <p className="mt-1 text-xs text-white/45">
                      Allowed: {ALLOWED_SUPPORT_FILE_EXTENSIONS.join(", ")} | Max 10MB per file
                    </p>
                    <label className="mt-4 inline-flex cursor-pointer items-center gap-2 border border-white/[0.12] bg-white/[0.04] px-3 py-2 text-sm text-white transition-colors hover:bg-white/[0.08]">
                      Choose files
                      <input
                        type="file"
                        accept=".svg,.png,.jpg,.jpeg,.pdf,.docx,.csv,.xlsx,.txt,.doc"
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
                          className="flex items-center justify-between border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-white">{file.name}</p>
                            <p className="text-xs text-white/45">
                              .{getFileExtension(file.name)} - {(file.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFile(index)}
                            className="ml-3 border border-white/[0.15] bg-white/[0.02] px-2 py-1 text-xs text-white/90 transition-colors hover:bg-white/[0.07]"
                          >
                            Remove
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Topic</div>
                    <div className="mt-2 text-sm font-medium text-white">{selectedTopic?.label || "-"}</div>
                  </div>
                  <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Sub-topic</div>
                    <div className="mt-2 text-sm font-medium text-white">{selectedSubTopic?.label || "-"}</div>
                  </div>
                  <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Tertiary-topic</div>
                    <div className="mt-2 text-sm font-medium text-white">
                      {tertiaryOptions.find((item) => item.id === tertiaryTopic)?.label || "-"}
                    </div>
                  </div>
                  <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Subject</div>
                    <div className="mt-2 text-sm font-medium text-white">{subject || "-"}</div>
                  </div>
                  <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Affected resource</div>
                    <div className="mt-2 text-sm font-medium text-white">{selectedResource?.name || "-"}</div>
                  </div>
                  <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Attachments</div>
                    <div className="mt-2 text-sm font-medium text-white">{attachments.length}</div>
                  </div>
                </div>

                <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Description</div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/80">{plainTextFromRichText(description) || "-"}</p>
                </div>
              </div>
            )}

            {submitError && <p className="text-sm text-red-300">{submitError}</p>}
          </div>

          <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-4 sm:px-6">
            <button
              type="button"
              onClick={goBack}
              disabled={currentStep === 1 || submitting}
              className="cursor-pointer rounded-md border border-white/[0.14] bg-white/[0.03] px-4 py-2 text-sm text-white/82 transition-colors hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Back
            </button>

            {currentStep < STEP_TITLES.length ? (
              <button
                type="button"
                onClick={goNext}
                disabled={submitting}
                className="cursor-pointer rounded-md border border-blue-400/25 bg-blue-500/90 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next <ChevronRight size={16} className="ml-1 inline" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void submitTicket()}
                disabled={submitting}
                className="cursor-pointer rounded-md border border-blue-400/25 bg-blue-500/90 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit Ticket"}
              </button>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className={panelClassName + " xl:sticky xl:top-8"}>
            <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
              <h3 className="text-base font-semibold text-white">Submission Summary</h3>
            </div>
            <div className="space-y-3 px-5 py-5 sm:px-6 sm:py-6">
              <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Current step</div>
                <div className="mt-2 text-sm font-medium text-white">{STEP_TITLES[currentStep - 1]}</div>
              </div>
              <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Progress</div>
                <div className="mt-2 text-sm font-medium text-white">{Math.round(completionPercentage)}%</div>
              </div>
              <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Ticket subject</div>
                <div className="mt-2 line-clamp-2 text-sm font-medium text-white">{subject || "Not set"}</div>
              </div>
              <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Description length</div>
                <div className="mt-2 text-sm font-medium text-white">{plainTextFromRichText(description).length} chars</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

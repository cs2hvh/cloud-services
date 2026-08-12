"use client";

// Support ticket create — single-column editorial form (no summary
// sidebar). Numbered sections, styled dropdowns (shadcn Select),
// rich-text description editor, file drop zone, and a sticky bottom
// submit bar.

import Link from "next/link";
import {
    useEffect,
    useMemo,
    useState,
    type ChangeEvent,
    type DragEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
    AlertCircle,
    ArrowRight,
    ChevronLeft,
    Loader2,
    Paperclip,
    X,
} from "lucide-react";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    SUPPORT_FILE_MAX_SIZE_BYTES,
    SUPPORT_MAX_ATTACHMENTS,
    SUPPORT_TOPICS,
    SupportResourceOption,
    isAllowedSupportFile,
} from "@/lib/support/catalog";
import { plainTextFromRichText } from "@/lib/support/richtext";
import SupportRichTextEditor from "./support-rich-text-editor";

// ─── Design tokens ─────────────────────────────────────────────────
const SERIF_STYLE: React.CSSProperties = {
    fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";

export default function SupportTicketCreateWizard() {
    const router = useRouter();

    const [topic, setTopic] = useState("");
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
        [topic],
    );
    const selectedResource =
        resources.find((r) => r.id === affectedResourceId) || null;
    // The API always prepends a generic "General <topic> issue" entry. With
    // nothing else to pick from, the dropdown is a dead control — hide it and
    // let the ticket fall back to that generic resource.
    const hasPickableResources = resources.some((r) => r.id !== "general");

    useEffect(() => {
        if (!topic) {
            setResources([]);
            setAffectedResourceId("general");
            return;
        }
        let alive = true;
        setResourcesLoading(true);
        setResourcesError("");
        void fetch(
            `/api/support/resources?topic=${encodeURIComponent(topic)}`,
            { cache: "no-store" },
        )
            .then(async (res) => {
                if (!res.ok) {
                    const payload = (await res.json().catch(() => ({}))) as {
                        error?: string;
                    };
                    throw new Error(
                        payload.error || "Failed to load resources",
                    );
                }
                return res.json() as Promise<{ data: SupportResourceOption[] }>;
            })
            .then((payload) => {
                if (!alive) return;
                setResources(payload.data || []);
                setAffectedResourceId(payload.data?.[0]?.id || "general");
            })
            .catch((err: unknown) => {
                if (!alive) return;
                setResourcesError(
                    err instanceof Error
                        ? err.message
                        : "Failed to load resources",
                );
                setResources([]);
                setAffectedResourceId("general");
            })
            .finally(() => {
                if (!alive) return;
                setResourcesLoading(false);
            });
        return () => {
            alive = false;
        };
    }, [topic]);

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
            errors.push(
                `You can attach up to ${SUPPORT_MAX_ATTACHMENTS} files.`,
            );
        }
        if (errors.length > 0) setSubmitError(errors.join(" "));
        else setSubmitError("");
        const remaining = Math.max(
            0,
            SUPPORT_MAX_ATTACHMENTS - attachments.length,
        );
        setAttachments((prev) => [...prev, ...accepted.slice(0, remaining)]);
    }

    function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
        const selected = e.target.files ? Array.from(e.target.files) : [];
        processFiles(selected);
        e.target.value = "";
    }
    function handleFileDrop(e: DragEvent<HTMLDivElement>) {
        e.preventDefault();
        processFiles(Array.from(e.dataTransfer.files || []));
    }
    function removeFile(index: number) {
        setAttachments((prev) => prev.filter((_, i) => i !== index));
    }

    // Validation
    const topicOk = !!topic;
    const subjectOk = subject.trim().length >= 4;
    const resourceOk = !!affectedResourceId;
    const descriptionOk = plainTextFromRichText(description).length >= 10;
    const canSubmit =
        topicOk && subjectOk && resourceOk && descriptionOk && !submitting;

    async function submitTicket() {
        if (!canSubmit) {
            setSubmitError("Please complete all required fields.");
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
            formData.append("subject", subject.trim());
            formData.append(
                "affectedResourceType",
                selectedTopic.resourceType,
            );
            formData.append(
                "affectedResourceId",
                selectedResource?.id || "general",
            );
            formData.append(
                "affectedResourceName",
                selectedResource?.name || "General issue",
            );
            formData.append("description", description);
            attachments.forEach((f) => formData.append("attachments", f));

            const res = await fetch("/api/support/tickets", {
                method: "POST",
                body: formData,
            });
            const payload = (await res.json().catch(() => ({}))) as {
                error?: string;
                data?: { id?: string };
            };
            if (!res.ok)
                throw new Error(
                    payload.error || "Failed to create support ticket",
                );
            const ticketId = payload.data?.id;
            router.push(
                ticketId
                    ? `/dashboard/support/${ticketId}`
                    : "/dashboard/support",
            );
        } catch (err) {
            setSubmitError(
                err instanceof Error ? err.message : "Failed to create ticket",
            );
            setSubmitting(false);
        }
    }

    return (
        <div className="min-w-0 max-w-[920px]">
            {/* Back link */}
            <div className="mb-6">
                <Link
                    href="/dashboard/support"
                    className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/40 hover:text-white/75 transition-colors`}
                >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Back to tickets
                </Link>
            </div>

            {/* Hero */}
            <h1 className="text-[34px] sm:text-[40px] leading-[1.05] tracking-[-0.025em] text-white font-semibold mb-10">
                Open a{" "}
                <span style={SERIF_STYLE} className="text-white/55 font-normal">
                    support ticket
                </span>
                .
            </h1>

            {/* Topic */}
            <Section num="01" title="Topic">
                <StyledSelect
                    value={topic}
                    onChange={setTopic}
                    placeholder="What is this about?"
                    options={SUPPORT_TOPICS.map((t) => ({
                        value: t.id,
                        label: t.label,
                    }))}
                />
            </Section>

            {/* Subject + resource */}
            <Section num="02" title="Subject">
                <div className="space-y-3">
                    <Input
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="Subject"
                    />
                    {hasPickableResources && (
                        <StyledSelect
                            value={affectedResourceId}
                            onChange={setAffectedResourceId}
                            disabled={resourcesLoading}
                            placeholder="Affected resource"
                            options={resources.map((r) => ({
                                value: r.id,
                                label: r.name,
                            }))}
                        />
                    )}
                    {resourcesError && (
                        <p
                            className={`${MONO} inline-flex items-center gap-1 text-[10.5px] text-red-400`}
                        >
                            <AlertCircle className="h-3 w-3" />
                            {resourcesError}
                        </p>
                    )}
                </div>
            </Section>

            {/* Description (rich editor) */}
            <Section num="03" title="Description">
                <div className="rounded-[6px] overflow-hidden border border-white/[0.08] bg-[#0d0e11] focus-within:border-white/15 focus-within:shadow-[0_0_0_3px_rgba(0,149,255,0.09)] transition-all">
                    <SupportRichTextEditor
                        value={description}
                        onChange={setDescription}
                        placeholder="Paste the error, steps to reproduce, expected behavior."
                        minHeightClassName="min-h-[260px]"
                    />
                </div>
            </Section>

            {/* Attachments */}
            <Section num="04" title="Attachments">
                <div
                    onDrop={handleFileDrop}
                    onDragOver={(e) => e.preventDefault()}
                    className="relative border border-dashed border-white/[0.14] bg-[#111216] rounded-[6px] py-6 px-5 flex items-center justify-between gap-4 hover:border-white/[0.20] hover:bg-[#13151a] transition-colors"
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <span
                            className="h-9 w-9 shrink-0 inline-flex items-center justify-center border border-white/[0.14] bg-[#16181d] rounded-[6px]"
                            style={{ color: ACCENT }}
                        >
                            <Paperclip className="h-4 w-4" />
                        </span>
                        <p className={`${MONO} text-[10.5px] text-white/45`}>
                            Drop files or browse · max 10 MB · up to{" "}
                            {SUPPORT_MAX_ATTACHMENTS}
                        </p>
                    </div>
                    <label
                        className={`${MONO} inline-flex h-9 items-center gap-1.5 px-3.5 text-[10.5px] uppercase tracking-[0.14em] font-semibold border border-white/[0.08] bg-[#0d0e11] text-white/85 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors cursor-pointer shrink-0`}
                    >
                        Browse
                        <input
                            type="file"
                            accept=".svg,.png,.jpg,.jpeg,.pdf,.docx,.csv,.xlsx,.txt,.doc"
                            multiple
                            onChange={handleFileInput}
                            className="hidden"
                        />
                    </label>
                </div>

                {attachments.length > 0 && (
                    <div className="mt-3 border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
                        {attachments.map((file, idx) => (
                            <div
                                key={`${file.name}-${idx}`}
                                className="flex items-center justify-between gap-3 px-4 py-2 border-b border-white/[0.04] last:border-b-0"
                            >
                                <div className="min-w-0 flex items-center gap-3">
                                    <span
                                        className="h-6 w-6 shrink-0 inline-flex items-center justify-center border border-white/[0.08] bg-[#0d0e11] rounded-[4px]"
                                        style={{ color: ACCENT }}
                                    >
                                        <Paperclip className="h-3 w-3" />
                                    </span>
                                    <span
                                        className={`${MONO} text-[12px] text-white/85 truncate`}
                                    >
                                        {file.name}
                                    </span>
                                    <span
                                        className={`${MONO} text-[10px] text-white/35 shrink-0`}
                                    >
                                        {(file.size / 1024).toFixed(1)} KB
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeFile(idx)}
                                    className="h-6 w-6 inline-flex items-center justify-center border border-white/[0.08] bg-[#0d0e11] text-white/55 hover:text-red-300 hover:bg-red-500/[0.08] hover:border-red-500/25 rounded-[4px] transition-colors"
                                    title="Remove"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            {/* Submit bar */}
            <div className="border-t border-white/[0.06] pt-6 mt-2 flex flex-col gap-3">
                {submitError && (
                    <div
                        className={`${MONO} flex items-start gap-2 px-3.5 py-2.5 border border-red-500/25 bg-red-500/[0.06] rounded-[5px] text-[11px] text-red-300`}
                    >
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        {submitError}
                    </div>
                )}
                <div className="flex items-center justify-end gap-2">
                    <Link
                        href="/dashboard/support"
                        className={`${MONO} inline-flex h-11 items-center px-4 text-[11.5px] uppercase tracking-[0.14em] text-white/65 hover:text-white border border-white/[0.08] hover:bg-white/[0.04] rounded-[5px] transition-colors`}
                    >
                        Cancel
                    </Link>
                    <button
                        type="button"
                        disabled={!canSubmit}
                        onClick={submitTicket}
                        className={`${MONO} inline-flex h-11 items-center justify-center gap-2 px-5 text-[11.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all`}
                        style={{
                            background: canSubmit
                                ? `linear-gradient(135deg, ${ACCENT}, #0066B3)`
                                : "#1a1d24",
                            color: canSubmit
                                ? "#ffffff"
                                : "rgba(255,255,255,0.35)",
                            boxShadow: canSubmit
                                ? "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)"
                                : "none",
                            cursor: canSubmit ? "pointer" : "not-allowed",
                        }}
                        onMouseEnter={(e) => {
                            if (!canSubmit) return;
                            e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT_BRIGHT}, ${ACCENT})`;
                            e.currentTarget.style.transform = "translateY(-1px)";
                        }}
                        onMouseLeave={(e) => {
                            if (!canSubmit) return;
                            e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
                            e.currentTarget.style.transform = "none";
                        }}
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Submitting
                            </>
                        ) : (
                            <>
                                Submit
                                <ArrowRight className="h-3.5 w-3.5" />
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Subcomponents ────────────────────────────────────────────────

function Section({
    num,
    title,
    children,
}: {
    num: string;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section className="border-t border-white/[0.06] py-6 first:border-t-0 first:pt-0">
            <header className="mb-4 flex items-center gap-3">
                <span
                    className={`${MONO} text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30`}
                >
                    {num}
                </span>
                <h2 className="text-[15px] font-semibold tracking-[-0.005em] text-white">
                    {title}
                </h2>
            </header>
            {children}
        </section>
    );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            {...props}
            className={`w-full h-11 bg-[#0d0e11] border border-white/[0.08] text-white text-[12.5px] px-3 rounded-[6px] outline-none placeholder:text-white/25 hover:border-white/15 focus:border-[${ACCENT}] focus:shadow-[0_0_0_3px_rgba(0,149,255,0.09)] transition-all ${props.className ?? ""}`}
        />
    );
}

function StyledSelect({
    value,
    onChange,
    options,
    disabled,
    placeholder,
}: {
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
    disabled?: boolean;
    placeholder?: string;
}) {
    return (
        <Select
            value={value || undefined}
            onValueChange={onChange}
            disabled={disabled || options.length === 0}
        >
            <SelectTrigger
                className={`${MONO} h-11 w-full bg-[#0d0e11] border-white/[0.08] text-white text-[12px] rounded-[6px] hover:border-white/15 focus:border-[${ACCENT}] focus:shadow-[0_0_0_3px_rgba(0,149,255,0.09)] transition-all data-[placeholder]:text-white/30 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent className="border-white/[0.1] bg-[#111216] text-white rounded-[6px]">
                {options.map((o) => (
                    <SelectItem
                        key={o.value}
                        value={o.value}
                        className={`${MONO} text-[12px] text-white/85 hover:bg-white/[0.04] focus:bg-white/[0.04] focus:text-white cursor-pointer`}
                    >
                        {o.label}
                    </SelectItem>
                ))}
                {options.length === 0 && (
                    <div
                        className={`${MONO} text-[11px] text-white/45 px-3 py-3 text-center`}
                    >
                        Pick the previous option first
                    </div>
                )}
            </SelectContent>
        </Select>
    );
}

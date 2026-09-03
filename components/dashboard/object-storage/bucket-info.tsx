"use client";

// Bucket Overview tab — editorial sections (Connection · Configuration
// · Examples · Danger zone). Replaces the old glass-panel stack with
// section-based layout and mono code rows for endpoint + access keys.

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Eye, EyeOff, Key, Loader2, Trash2 } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ObjectSpaceBucket } from "@/lib/supabase/types";
import { copyToClipboard as safeCopyToClipboard } from "@/lib/utils/safe-clipboard";
import { getErrorMessage } from "@/config/functions";
import Documentation from "./api-docs";

// ─── Design tokens ─────────────────────────────────────────────────
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

interface SingleBucketProps {
    bucket: ObjectSpaceBucket;
}

const SingleBucket = ({ bucket }: SingleBucketProps) => {
    const router = useRouter();
    const [copiedItem, setCopiedItem] = useState<string | null>(null);
    const [showSecretKey, setShowSecretKey] = useState(false);
    const [showKeyId, setShowKeyId] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [bucketData, setBucketData] = useState<ObjectSpaceBucket>(bucket);
    const [isLoadingStats, setIsLoadingStats] = useState(true);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setIsLoadingStats(true);
                const res = await axios.post(
                    "/api/services/object-storage/buckets/read",
                    { bucket_id: bucket.id },
                );
                if (!alive) return;
                if (res?.data?.success && res?.data?.data) {
                    setBucketData(res?.data?.data);
                }
            } catch (err) {
                console.error("Error fetching bucket stats:", err);
            } finally {
                if (alive) setIsLoadingStats(false);
            }
        })();
        return () => {
            alive = false;
        };
    }, [bucket.id]);

    const copyToClipboard = (text: string, label: string) => {
        if (!text) return;
        void safeCopyToClipboard(text);
        setCopiedItem(label);
        toast.success(`${label} copied`);
        setTimeout(() => setCopiedItem(null), 1800);
    };

    const handleDeleteConfirm = async () => {
        setIsDeleting(true);
        try {
            const toastId = toast.loading("Deleting bucket…");
            await axios.post("/api/services/object-storage/buckets/delete", {
                bucket_id: bucket.id,
            });
            toast.success("Bucket deleted", { id: toastId });
            router.push("/dashboard/services/object-storage");
            router.refresh();
        } catch (err) {
            toast.error(getErrorMessage(err, "Failed to delete bucket"));
        } finally {
            setIsDeleting(false);
            setDeleteDialogOpen(false);
        }
    };

    return (
        <div className="min-w-0">
            {/* 01 Connection */}
            <Section
                num="01"
                title="Connection"
                desc="S3-compatible endpoint and access credentials for this bucket."
            >
                <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
                    <CodeRow
                        label="Endpoint"
                        hint="S3-compatible URL"
                        value={bucketData.endpoint || ""}
                        loading={isLoadingStats}
                        copied={copiedItem === "Endpoint"}
                        onCopy={() =>
                            copyToClipboard(bucketData.endpoint || "", "Endpoint")
                        }
                    />
                    <CodeRow
                        label="Access key ID"
                        hint="Public identifier"
                        value={bucketData.key_id || ""}
                        masked={!showKeyId}
                        copied={copiedItem === "Access key ID"}
                        onCopy={() =>
                            copyToClipboard(bucketData.key_id || "", "Access key ID")
                        }
                        onToggleReveal={() => setShowKeyId((v) => !v)}
                        revealed={showKeyId}
                    />
                    <CodeRow
                        label="Secret access key"
                        hint="Secret · keep private"
                        value={bucketData.secret_key || ""}
                        masked={!showSecretKey}
                        copied={copiedItem === "Secret access key"}
                        onCopy={() =>
                            copyToClipboard(
                                bucketData.secret_key || "",
                                "Secret access key",
                            )
                        }
                        onToggleReveal={() => setShowSecretKey((v) => !v)}
                        revealed={showSecretKey}
                    />
                </div>

                <div
                    className={`${MONO} mt-3 flex items-start gap-2 px-3.5 py-2.5 border border-amber-400/25 bg-amber-400/[0.06] rounded-[5px] text-[11px] text-amber-200/85`}
                >
                    <Key className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                        Keep credentials secure. Never expose them in
                        client-side code or commit to version control.
                    </span>
                </div>
            </Section>

            {/* 02 Configuration */}
            <Section
                num="02"
                title="Configuration"
                desc="Current bucket settings. Edit in the Settings tab."
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-1 max-w-[720px]">
                    <DetailRow label="Bucket name" value={bucketData.name} mono />
                    <DetailRow
                        label="Region"
                        value={bucketData.region || "—"}
                    />
                    <DetailRow
                        label="Status"
                        value={bucketData.status || "active"}
                        color={
                            bucketData.status === "active"
                                ? "#4ade80"
                                : "#fbbf24"
                        }
                    />
                    <DetailRow
                        label="Access"
                        value={
                            bucketData.acl === "public-read"
                                ? "Public read"
                                : "Private"
                        }
                    />
                    <DetailRow
                        label="CORS"
                        value={bucketData.cors_enabled ? "Enabled" : "Disabled"}
                        color={
                            bucketData.cors_enabled
                                ? "#4ade80"
                                : "rgba(255,255,255,0.45)"
                        }
                    />
                    <DetailRow
                        label="Versioning"
                        value={
                            bucketData.versioning_enabled
                                ? "Enabled"
                                : "Disabled"
                        }
                        color={
                            bucketData.versioning_enabled
                                ? "#a78bfa"
                                : "rgba(255,255,255,0.45)"
                        }
                    />
                    <DetailRow label="Type" value="S3-Compatible" />
                    <DetailRow
                        label="Objects"
                        value={(bucketData.object_count || 0).toLocaleString()}
                        mono
                    />
                </div>
            </Section>

            {/* 03 Examples */}
            <Section
                num="03"
                title="API examples"
                desc="Quick-start snippets to connect from your code."
            >
                <Documentation />
            </Section>

            {/* 04 Danger zone */}
            <Section
                num="04"
                title="Danger zone"
                desc="Destructive operations. These cannot be undone."
                tone="danger"
            >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border border-red-500/15 bg-red-500/[0.04] rounded-[6px] px-5 py-4">
                    <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-white">
                            Delete bucket
                        </div>
                        <p
                            className={`${MONO} mt-1 text-[11px] text-white/45 leading-snug`}
                        >
                            Permanently delete this bucket and every object in
                            it. Final.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setDeleteDialogOpen(true)}
                        className={`${MONO} inline-flex h-10 items-center gap-2 px-4 text-[11px] uppercase tracking-[0.14em] font-semibold border border-red-500/25 bg-red-500/[0.06] text-red-300 hover:text-red-200 hover:bg-red-500/[0.14] rounded-[5px] transition-colors shrink-0`}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete bucket
                    </button>
                </div>
            </Section>

            {/* Delete dialog */}
            <AlertDialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete bucket?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the bucket &quot;
                            {bucketData.name}&quot; and all files inside it.
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            disabled={isDeleting}
                            className="cursor-pointer bg-red-500 hover:bg-red-600"
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Deleting…
                                </>
                            ) : (
                                "Delete bucket"
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default SingleBucket;

// ─── Subcomponents ────────────────────────────────────────────────

function Section({
    num,
    title,
    desc,
    tone,
    children,
}: {
    num: string;
    title: string;
    desc: string;
    tone?: "danger";
    children: React.ReactNode;
}) {
    const numColor = tone === "danger" ? "#f87171" : "rgba(255,255,255,0.3)";
    return (
        <section className="border-t border-white/[0.06] py-8 first:border-t-0 first:pt-0">
            <header className="mb-5 flex items-start gap-4">
                <span
                    className={`${MONO} text-[11px] font-semibold uppercase tracking-[0.14em] mt-0.5`}
                    style={{ color: numColor }}
                >
                    {num}
                </span>
                <div>
                    <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-white">
                        {title}
                    </h2>
                    <p
                        className={`${MONO} mt-1 text-[11px] text-white/45 leading-snug max-w-[640px]`}
                    >
                        {desc}
                    </p>
                </div>
            </header>
            {children}
        </section>
    );
}

function CodeRow({
    label,
    hint,
    value,
    loading,
    masked,
    revealed,
    copied,
    onCopy,
    onToggleReveal,
}: {
    label: string;
    hint: string;
    value: string;
    loading?: boolean;
    masked?: boolean;
    revealed?: boolean;
    copied: boolean;
    onCopy: () => void;
    onToggleReveal?: () => void;
}) {
    const displayValue = loading
        ? ""
        : !value
          ? "—"
          : masked
            ? "•".repeat(Math.max(value.length, 18))
            : value;

    return (
        <div className="grid grid-cols-[140px_minmax(0,1fr)_auto] gap-4 items-center px-5 py-3 border-b border-white/[0.04] last:border-b-0">
            <div className="min-w-0">
                <div className="text-[12.5px] font-semibold text-white">
                    {label}
                </div>
                <p className={`${MONO} text-[10px] text-white/40 mt-0.5`}>
                    {hint}
                </p>
            </div>
            <div className="min-w-0 flex items-center">
                {loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40" />
                ) : (
                    <code
                        className={`${MONO} text-[11.5px] text-white/80 truncate w-full px-3 py-2 bg-[#08090b] border border-white/[0.06] rounded-[4px]`}
                    >
                        {displayValue}
                    </code>
                )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
                {onToggleReveal && (
                    <button
                        type="button"
                        onClick={onToggleReveal}
                        className="h-7 w-7 inline-flex items-center justify-center border border-white/[0.08] bg-[#0d0e11] text-white/55 hover:text-white hover:bg-white/[0.04] rounded-[4px] transition-colors"
                        title={revealed ? "Hide" : "Reveal"}
                    >
                        {revealed ? (
                            <EyeOff className="h-3 w-3" />
                        ) : (
                            <Eye className="h-3 w-3" />
                        )}
                    </button>
                )}
                <button
                    type="button"
                    onClick={onCopy}
                    disabled={!value || loading}
                    className="h-7 w-7 inline-flex items-center justify-center border rounded-[4px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={
                        copied
                            ? {
                                  color: "#4ade80",
                                  borderColor: "rgba(74,222,128,0.3)",
                                  background: "rgba(74,222,128,0.08)",
                              }
                            : {
                                  color: "rgba(255,255,255,0.55)",
                                  borderColor: "rgba(255,255,255,0.08)",
                                  background: "#0d0e11",
                              }
                    }
                    title="Copy"
                >
                    {copied ? (
                        <Check className="h-3 w-3" />
                    ) : (
                        <Copy className="h-3 w-3" />
                    )}
                </button>
            </div>
        </div>
    );
}

function DetailRow({
    label,
    value,
    mono,
    color,
}: {
    label: string;
    value: string;
    mono?: boolean;
    color?: string;
}) {
    return (
        <div className="flex items-center justify-between gap-3 py-2.5 border-b border-white/[0.04]">
            <span
                className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-medium text-white/40`}
            >
                {label}
            </span>
            <span
                className={`${mono ? MONO : ""} text-[12.5px] font-medium capitalize truncate max-w-[240px]`}
                style={{ color: color ?? "rgba(255,255,255,0.9)" }}
                title={value}
            >
                {value}
            </span>
        </div>
    );
}


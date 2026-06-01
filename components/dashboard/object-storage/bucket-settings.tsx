"use client";

// Bucket Settings tab — editorial sections matching the Overview tab.
// Each row: small icon tile + label/description on the left, current
// value + inline edit controls on the right. Drops the heavy
// glass-panel cards in favor of a tight list inside one rounded
// surface.

import { useState } from "react";
import { Check, Edit2, Loader2, X } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ObjectSpaceBucket } from "@/lib/supabase/types";
import { useProjects } from "@/app/dashboard/provider";

// ─── Design tokens ─────────────────────────────────────────────────
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";

interface BucketSettingsProps {
    bucket: ObjectSpaceBucket;
}

const BucketSettings = ({ bucket }: BucketSettingsProps) => {
    const { projects } = useProjects();
    const [isLoading, setIsLoading] = useState<{ [key: string]: boolean }>({});
    const [editMode, setEditMode] = useState<{ [key: string]: boolean }>({});

    const [settings, setSettings] = useState({
        acl: bucket.acl || "private",
        corsEnabled: bucket.cors_enabled || false,
        versioningEnabled: bucket.versioning_enabled || false,
        projectId: bucket.project_id || null,
    });

    const handleSave = async (setting: string) => {
        setIsLoading((prev) => ({ ...prev, [setting]: true }));
        try {
            let endpoint = "";
            const payload: Record<string, unknown> = { bucket_id: bucket.id };
            switch (setting) {
                case "acl":
                    endpoint =
                        "/api/services/object-storage/buckets/settings/update-acl";
                    payload.acl = settings.acl;
                    break;
                case "cors":
                    endpoint =
                        "/api/services/object-storage/buckets/settings/update-cors";
                    payload.enabled = settings.corsEnabled;
                    break;
                case "versioning":
                    endpoint =
                        "/api/services/object-storage/buckets/settings/update-versioning";
                    payload.enabled = settings.versioningEnabled;
                    break;
                case "project":
                    endpoint =
                        "/api/services/object-storage/buckets/settings/update-project";
                    payload.project_id = settings.projectId;
                    break;
                default:
                    throw new Error("Unknown setting");
            }
            const res = await axios.post(endpoint, payload);
            if (res?.data?.success) {
                toast.success(
                    `${setting.charAt(0).toUpperCase() + setting.slice(1)} updated`,
                );
                setEditMode((prev) => ({ ...prev, [setting]: false }));
            } else {
                throw new Error(res?.data?.error || "Update failed");
            }
        } catch (err: unknown) {
            console.error("Error updating setting:", err);
            const msg = err instanceof Error ? err.message : "Unknown error";
            toast.error(msg || `Failed to update ${setting}`);
        } finally {
            setIsLoading((prev) => ({ ...prev, [setting]: false }));
        }
    };

    const handleCancel = (setting: string) => {
        setEditMode((prev) => ({ ...prev, [setting]: false }));
        switch (setting) {
            case "acl":
                setSettings((prev) => ({ ...prev, acl: bucket.acl || "private" }));
                break;
            case "cors":
                setSettings((prev) => ({
                    ...prev,
                    corsEnabled: bucket.cors_enabled || false,
                }));
                break;
            case "versioning":
                setSettings((prev) => ({
                    ...prev,
                    versioningEnabled: bucket.versioning_enabled || false,
                }));
                break;
            case "project":
                setSettings((prev) => ({
                    ...prev,
                    projectId: bucket.project_id || null,
                }));
                break;
        }
    };

    const startEdit = (setting: string) =>
        setEditMode((prev) => ({ ...prev, [setting]: true }));

    const getProjectName = (projectId: string | null) => {
        if (!projectId) return "No project assigned";
        const project = projects.find((p) => p.id === projectId);
        return project?.name || "Unknown project";
    };

    return (
        <div className="min-w-0">
            <Section
                num="01"
                title="Access & policies"
                desc="Default ACL, CORS, and per-object versioning. Changes apply to the live bucket."
            >
                <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
                    <SettingRow
                        title="Access control (ACL)"
                        desc={
                            settings.acl === "private"
                                ? "Only signed requests can read or write objects."
                                : "Anonymous GET allowed on every object."
                        }
                        editing={!!editMode.acl}
                        loading={!!isLoading.acl}
                        onEdit={() => startEdit("acl")}
                        onSave={() => handleSave("acl")}
                        onCancel={() => handleCancel("acl")}
                        value={
                            <ValuePill
                                color={
                                    settings.acl === "private"
                                        ? "#4ade80"
                                        : "#fbbf24"
                                }
                                label={
                                    settings.acl === "private"
                                        ? "Private"
                                        : "Public read"
                                }
                            />
                        }
                        editor={
                            <Select
                                value={settings.acl}
                                onValueChange={(v: "private" | "public-read") =>
                                    setSettings((p) => ({ ...p, acl: v }))
                                }
                            >
                                <SelectTrigger
                                    className={`${MONO} h-9 w-[160px] bg-[#0d0e11] border-white/[0.08] text-white text-[11.5px] rounded-[5px]`}
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="border-white/[0.1] bg-[#111216] text-white">
                                    <SelectItem value="private">Private</SelectItem>
                                    <SelectItem value="public-read">
                                        Public read
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        }
                    />

                    <SettingRow
                        title="CORS"
                        desc="Allow cross-origin requests from browsers."
                        editing={!!editMode.cors}
                        loading={!!isLoading.cors}
                        onEdit={() => startEdit("cors")}
                        onSave={() => handleSave("cors")}
                        onCancel={() => handleCancel("cors")}
                        value={
                            <ValuePill
                                color={
                                    settings.corsEnabled
                                        ? "#4ade80"
                                        : "rgba(255,255,255,0.45)"
                                }
                                label={
                                    settings.corsEnabled ? "Enabled" : "Disabled"
                                }
                            />
                        }
                        editor={
                            <Switch
                                on={settings.corsEnabled}
                                onChange={(v) =>
                                    setSettings((p) => ({
                                        ...p,
                                        corsEnabled: v,
                                    }))
                                }
                            />
                        }
                    />

                    <SettingRow
                        title="Object versioning"
                        desc="Keep historical versions. Soft-delete protection."
                        editing={!!editMode.versioning}
                        loading={!!isLoading.versioning}
                        onEdit={() => startEdit("versioning")}
                        onSave={() => handleSave("versioning")}
                        onCancel={() => handleCancel("versioning")}
                        value={
                            <ValuePill
                                color={
                                    settings.versioningEnabled
                                        ? "#a78bfa"
                                        : "rgba(255,255,255,0.45)"
                                }
                                label={
                                    settings.versioningEnabled
                                        ? "Enabled"
                                        : "Disabled"
                                }
                            />
                        }
                        editor={
                            <Switch
                                on={settings.versioningEnabled}
                                onChange={(v) =>
                                    setSettings((p) => ({
                                        ...p,
                                        versioningEnabled: v,
                                    }))
                                }
                            />
                        }
                    />
                </div>
            </Section>

            <Section
                num="02"
                title="Organization"
                desc="Resource group for IAM, billing, and quotas."
            >
                <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
                    <SettingRow
                        title="Project assignment"
                        desc="Group this bucket under a project for billing and access."
                        editing={!!editMode.project}
                        loading={!!isLoading.project}
                        onEdit={() => startEdit("project")}
                        onSave={() => handleSave("project")}
                        onCancel={() => handleCancel("project")}
                        value={
                            <span
                                className={`${MONO} text-[12px] text-white/80 truncate max-w-[220px]`}
                                title={getProjectName(settings.projectId)}
                            >
                                {getProjectName(settings.projectId)}
                            </span>
                        }
                        editor={
                            <Select
                                value={settings.projectId || "none"}
                                onValueChange={(v) =>
                                    setSettings((p) => ({
                                        ...p,
                                        projectId: v === "none" ? null : v,
                                    }))
                                }
                            >
                                <SelectTrigger
                                    className={`${MONO} h-9 w-[220px] bg-[#0d0e11] border-white/[0.08] text-white text-[11.5px] rounded-[5px]`}
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="border-white/[0.1] bg-[#111216] text-white">
                                    <SelectItem value="none">No project</SelectItem>
                                    {projects.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>
                                            {p.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        }
                    />
                </div>
            </Section>
        </div>
    );
};

export default BucketSettings;

// ─── Subcomponents ────────────────────────────────────────────────

function Section({
    num,
    title,
    desc,
    children,
}: {
    num: string;
    title: string;
    desc: string;
    children: React.ReactNode;
}) {
    return (
        <section className="border-t border-white/[0.06] py-8 first:border-t-0 first:pt-0">
            <header className="mb-5 flex items-start gap-4">
                <span
                    className={`${MONO} text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30 mt-0.5`}
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

function SettingRow({
    title,
    desc,
    editing,
    loading,
    onEdit,
    onSave,
    onCancel,
    value,
    editor,
}: {
    title: string;
    desc: string;
    editing: boolean;
    loading: boolean;
    onEdit: () => void;
    onSave: () => void;
    onCancel: () => void;
    value: React.ReactNode;
    editor: React.ReactNode;
}) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-4 items-center px-5 py-4 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors">
            <div className="min-w-0">
                <div className="text-[13px] font-semibold tracking-[-0.005em] text-white">
                    {title}
                </div>
                <p
                    className={`${MONO} mt-1 text-[11px] text-white/45 leading-snug`}
                >
                    {desc}
                </p>
            </div>

            <div className="flex items-center gap-2 shrink-0 justify-end">
                {editing ? editor : value}
                {editing ? (
                    <div className="flex items-center gap-1">
                        <IconBtn onClick={onCancel} disabled={loading} title="Cancel">
                            <X className="h-3 w-3" />
                        </IconBtn>
                        <IconBtn
                            onClick={onSave}
                            disabled={loading}
                            tone="success"
                            title="Save"
                        >
                            {loading ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <Check className="h-3 w-3" />
                            )}
                        </IconBtn>
                    </div>
                ) : (
                    <IconBtn onClick={onEdit} title="Edit">
                        <Edit2 className="h-3 w-3" />
                    </IconBtn>
                )}
            </div>
        </div>
    );
}

function ValuePill({ color, label }: { color: string; label: string }) {
    return (
        <span
            className={`${MONO} inline-flex items-center gap-1.5 px-2 py-0.5 text-[10.5px] uppercase tracking-[0.12em] font-semibold border rounded-[4px]`}
            style={{
                color,
                borderColor:
                    color === "rgba(255,255,255,0.45)"
                        ? "rgba(255,255,255,0.08)"
                        : `${color}40`,
                background:
                    color === "rgba(255,255,255,0.45)"
                        ? "#0d0e11"
                        : `${color}10`,
            }}
        >
            <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                    background: color,
                    boxShadow:
                        color === "rgba(255,255,255,0.45)"
                            ? "none"
                            : `0 0 5px ${color}`,
                }}
            />
            {label}
        </span>
    );
}

function Switch({
    on,
    onChange,
}: {
    on: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <button
            type="button"
            onClick={() => onChange(!on)}
            role="switch"
            aria-checked={on}
            className="relative inline-flex w-9 h-5 items-center border rounded-full transition-colors p-0.5"
            style={{
                background: on ? ACCENT : "#0d0e11",
                borderColor: on
                    ? "rgba(0,149,255,0.4)"
                    : "rgba(255,255,255,0.08)",
            }}
        >
            <span
                className="h-3.5 w-3.5 bg-white rounded-full transition-transform"
                style={{
                    transform: on ? "translateX(16px)" : "translateX(0)",
                }}
            />
        </button>
    );
}

function IconBtn({
    onClick,
    disabled,
    title,
    tone,
    children,
}: {
    onClick: () => void;
    disabled?: boolean;
    title: string;
    tone?: "success";
    children: React.ReactNode;
}) {
    const styles =
        tone === "success"
            ? {
                  color: "#4ade80",
                  borderColor: "rgba(74,222,128,0.3)",
                  background: "rgba(74,222,128,0.08)",
              }
            : {
                  color: "rgba(255,255,255,0.65)",
                  borderColor: "rgba(255,255,255,0.08)",
                  background: "#0d0e11",
              };
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            className="inline-flex h-7 w-7 items-center justify-center border rounded-[4px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-125"
            style={styles}
        >
            {children}
        </button>
    );
}

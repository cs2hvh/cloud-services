"use client";

// Bucket detail page — mirrors the VPS [id] page pattern. Aurora
// canvas, mono back link, identity row with bucket avatar +
// status indicator + meta line + actions, 4-card stats row, then
// button-based pill tab nav with brand-blue glowing underline.

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
    ArrowLeft,
    Copy,
    Eye,
    FileText,
    GitBranch,
    Globe2,
    HardDrive,
    Key,
    Lock,
    MapPin,
    Settings2,
    Unlock,
} from "lucide-react";
import { toast } from "sonner";

import SingleBucket from "@/components/dashboard/object-storage/bucket-info";
import BucketSettings from "@/components/dashboard/object-storage/bucket-settings";
import { ObjectSpaceBucket, Tables } from "@/lib/supabase/types";
import { copyToClipboard } from "@/lib/utils/safe-clipboard";

// ─── Design tokens ─────────────────────────────────────────────────
const SERIF_STYLE: React.CSSProperties = {
    fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";

interface BucketTabsProps {
    bucket: ObjectSpaceBucket;
    locations: Tables<"locations">[];
}

function formatSize(bytes: number | null | undefined) {
    const v = bytes || 0;
    if (v === 0) return { value: "0", unit: "B" };
    if (v < 1024) return { value: String(v), unit: "B" };
    if (v < 1024 * 1024) return { value: (v / 1024).toFixed(1), unit: "KB" };
    if (v < 1024 * 1024 * 1024)
        return { value: (v / (1024 * 1024)).toFixed(1), unit: "MB" };
    return { value: (v / (1024 * 1024 * 1024)).toFixed(2), unit: "GB" };
}

function statusMeta(status: string | null): {
    dot: string;
    label: string;
    pulse?: boolean;
} {
    const v = (status || "active").toLowerCase();
    if (v === "active") return { dot: "#4ade80", label: "Active", pulse: true };
    if (v === "creating")
        return { dot: "#fbbf24", label: "Creating", pulse: true };
    if (v === "deleting") return { dot: "#f87171", label: "Deleting" };
    if (v === "error" || v === "failed")
        return { dot: "#f87171", label: "Error" };
    return { dot: "#52525b", label: v.charAt(0).toUpperCase() + v.slice(1) };
}

async function copy(text: string, label: string) {
    if (!text) return;
    try {
        await copyToClipboard(text);
        toast.success(`${label} copied`);
    } catch {
        toast.error(`Failed to copy ${label}`);
    }
}

const TABS = [
    { value: "info", label: "Overview", icon: HardDrive },
    { value: "settings", label: "Settings", icon: Settings2 },
] as const;

const BucketTabs = ({ bucket, locations }: BucketTabsProps) => {
    const [activeTab, setActiveTab] = useState<string>("info");
    const locationData = locations.find((l) => l.short === bucket.region);
    const city = locationData?.city || bucket.region || "Unknown";
    const status = statusMeta(bucket.status);
    const isPublic = bucket.acl === "public-read";
    const size = formatSize(bucket.size_bytes);

    return (
        <div className="relative min-h-full bg-[#08090b] text-white">
            {/* Background layer */}
            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                <div
                    className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]"
                    style={{
                        background:
                            "radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)",
                    }}
                />
                <div
                    className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]"
                    style={{
                        background:
                            "radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)",
                    }}
                />
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage:
                            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)",
                        backgroundSize: "28px 28px",
                    }}
                />
            </div>

            <div className="relative z-10 px-6 py-7 sm:px-10 sm:py-9">
                {/* Back link */}
                <Link
                    href="/dashboard/services/object-storage"
                    className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/40 hover:text-white/75 transition-colors mb-5`}
                >
                    <ArrowLeft className="h-3 w-3" />
                    All buckets
                </Link>

                {/* Identity row */}
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between mb-5 pb-6 border-b border-white/[0.06]">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                        {/* Bucket avatar with status indicator */}
                        <div className="relative shrink-0">
                            <div
                                className="h-14 w-14 rounded-[8px] border flex items-center justify-center"
                                style={{
                                    background:
                                        "linear-gradient(135deg, #16181d, #1a1c23)",
                                    borderColor: "rgba(255,255,255,0.09)",
                                    color: ACCENT,
                                }}
                            >
                                <HardDrive className="h-7 w-7" />
                            </div>
                            <span
                                className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ${status.pulse ? "animate-pulse" : ""}`}
                                style={{
                                    background: status.dot,
                                    border: "3px solid #08090b",
                                    boxShadow: `0 0 8px ${status.dot}`,
                                }}
                            />
                        </div>

                        {/* Name + meta */}
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3 flex-wrap mb-2">
                                <h1
                                    className={`${MONO} text-[24px] sm:text-[28px] leading-none tracking-[-0.02em] text-white font-semibold truncate`}
                                >
                                    {bucket.name}
                                </h1>
                                <span
                                    className={`${MONO} inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9.5px] uppercase tracking-[0.12em] font-semibold`}
                                    style={{
                                        background: `${status.dot}15`,
                                        color: status.dot,
                                        border: `1px solid ${status.dot}38`,
                                    }}
                                >
                                    <span
                                        className={`h-1.5 w-1.5 rounded-full ${status.pulse ? "animate-pulse" : ""}`}
                                        style={{
                                            background: status.dot,
                                            boxShadow: `0 0 6px ${status.dot}`,
                                        }}
                                    />
                                    {status.label}
                                </span>
                            </div>

                            <div
                                className={`${MONO} flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[11px] text-white/45`}
                            >
                                <span className="inline-flex items-center gap-1.5 text-white/65">
                                    <FileText className="h-3 w-3 opacity-70" />
                                    S3-compatible
                                </span>
                                {locationData?.country_code && (
                                    <>
                                        <span className="text-white/15">·</span>
                                        <span className="inline-flex items-center gap-1.5">
                                            <Image
                                                src={`https://flagcdn.com/${locationData.country_code.toLowerCase()}.svg`}
                                                alt=""
                                                width={12}
                                                height={9}
                                                className="rounded-[1px]"
                                                unoptimized
                                            />
                                            {city}
                                            <span className="text-white/35">
                                                ({bucket.region})
                                            </span>
                                        </span>
                                    </>
                                )}
                                {!locationData?.country_code && bucket.region && (
                                    <>
                                        <span className="text-white/15">·</span>
                                        <span className="inline-flex items-center gap-1.5">
                                            <MapPin className="h-3 w-3 opacity-70" />
                                            {bucket.region}
                                        </span>
                                    </>
                                )}
                                <span className="text-white/15">·</span>
                                <span
                                    className="inline-flex items-center gap-1.5"
                                    style={{ color: isPublic ? "#fbbf24" : "#4ade80" }}
                                >
                                    {isPublic ? (
                                        <Unlock className="h-3 w-3 opacity-70" />
                                    ) : (
                                        <Lock className="h-3 w-3 opacity-70" />
                                    )}
                                    {isPublic ? "Public read" : "Private"}
                                </span>
                                {bucket.endpoint && (
                                    <>
                                        <span className="text-white/15">·</span>
                                        <span className="inline-flex items-center gap-1.5 text-white/55">
                                            <Globe2 className="h-3 w-3 opacity-70" />
                                            <span className="truncate max-w-[200px]">
                                                {bucket.endpoint.replace(
                                                    /^https?:\/\//,
                                                    "",
                                                )}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    copy(
                                                        bucket.endpoint || "",
                                                        "Endpoint",
                                                    )
                                                }
                                                className="text-white/25 hover:text-[#0095FF] transition-colors"
                                                title="Copy endpoint"
                                            >
                                                <Copy className="h-3 w-3" />
                                            </button>
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Quick actions */}
                    <div className="flex items-center gap-2 shrink-0">
                        {bucket.endpoint && (
                            <ActionBtn
                                icon={<Copy className="h-3.5 w-3.5" />}
                                label="Endpoint"
                                onClick={() =>
                                    copy(bucket.endpoint || "", "Endpoint")
                                }
                            />
                        )}
                        {bucket.acl === "public-read" && (
                            <ActionBtn
                                icon={<Eye className="h-3.5 w-3.5" />}
                                label="Browse"
                                onClick={() =>
                                    bucket.endpoint &&
                                    window.open(bucket.endpoint, "_blank")
                                }
                            />
                        )}
                        <ActionBtn
                            icon={<Settings2 className="h-3.5 w-3.5" />}
                            label="Settings"
                            onClick={() => setActiveTab("settings")}
                            primary
                        />
                    </div>
                </div>

                {/* Stats row — 4 cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-6">
                    <StatCard
                        label="Storage"
                        value={size.value}
                        unit={size.unit}
                        sub={{ left: "Total used", right: "live" }}
                        bar={Math.min(
                            ((bucket.size_bytes || 0) / (10 * 1024 * 1024 * 1024)) *
                                100,
                            100,
                        )}
                    />
                    <StatCard
                        label="Objects"
                        value={(bucket.object_count || 0).toLocaleString()}
                        sub={{ left: "Files stored" }}
                        spark={pseudoSpark(bucket.object_count || 1)}
                    />
                    <StatCard
                        label="Access"
                        value={isPublic ? "Public" : "Private"}
                        sub={{
                            left: isPublic ? "Anonymous GET" : "Signed only",
                        }}
                        chip={
                            isPublic
                                ? { color: "#fbbf24", label: "READ" }
                                : { color: "#4ade80", label: "LOCKED" }
                        }
                    />
                    <StatCard
                        label="Features"
                        value=""
                        sub={{ left: "Bucket policies" }}
                        chips={(
                            [
                                bucket.versioning_enabled
                                    ? {
                                          color: "#a78bfa",
                                          label: "Versioning",
                                          icon: (
                                              <GitBranch className="h-2.5 w-2.5" />
                                          ),
                                      }
                                    : null,
                                bucket.cors_enabled
                                    ? {
                                          color: ACCENT,
                                          label: "CORS",
                                          icon: (
                                              <Globe2 className="h-2.5 w-2.5" />
                                          ),
                                      }
                                    : null,
                                bucket.key_id
                                    ? {
                                          color: "#fbbf24",
                                          label: "Keys",
                                          icon: <Key className="h-2.5 w-2.5" />,
                                      }
                                    : null,
                            ] as Array<StatChip | null>
                        ).filter((c): c is StatChip => c !== null)}
                    />
                </div>

                {/* Pill tab nav */}
                <div className="border-b border-white/[0.06] mb-5">
                    <div className="flex items-center gap-1 -mb-px overflow-x-auto no-scrollbar">
                        {TABS.map((tab) => {
                            const isActive = activeTab === tab.value;
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.value}
                                    type="button"
                                    onClick={() => setActiveTab(tab.value)}
                                    className={`${MONO} relative inline-flex items-center gap-2 px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] transition-colors whitespace-nowrap`}
                                    style={{
                                        color: isActive
                                            ? "#ffffff"
                                            : "rgba(255,255,255,0.45)",
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isActive)
                                            e.currentTarget.style.color =
                                                "rgba(255,255,255,0.75)";
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isActive)
                                            e.currentTarget.style.color =
                                                "rgba(255,255,255,0.45)";
                                    }}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                    {tab.label}
                                    {isActive && (
                                        <span
                                            className="absolute left-2 right-2 bottom-0 h-[2px]"
                                            style={{
                                                background: ACCENT,
                                                boxShadow:
                                                    "0 0 8px rgba(0,149,255,0.5)",
                                            }}
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Tab content */}
                {activeTab === "info" && <SingleBucket bucket={bucket} />}
                {activeTab === "settings" && <BucketSettings bucket={bucket} />}
            </div>
        </div>
    );
};

export default BucketTabs;

// ─── Subcomponents ────────────────────────────────────────────────

function ActionBtn({
    icon,
    label,
    onClick,
    primary,
}: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    primary?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`${MONO} inline-flex h-9 items-center gap-2 px-3.5 text-[11px] uppercase tracking-[0.14em] font-semibold border rounded-[5px] transition-colors`}
            style={
                primary
                    ? {
                          color: ACCENT,
                          borderColor: "rgba(0,149,255,0.35)",
                          background: "rgba(0,149,255,0.08)",
                      }
                    : {
                          color: "rgba(255,255,255,0.65)",
                          borderColor: "rgba(255,255,255,0.08)",
                          background: "#111216",
                      }
            }
            onMouseEnter={(e) => {
                if (primary) {
                    e.currentTarget.style.borderColor =
                        "rgba(0,149,255,0.5)";
                    e.currentTarget.style.background =
                        "rgba(0,149,255,0.12)";
                } else {
                    e.currentTarget.style.borderColor =
                        "rgba(255,255,255,0.14)";
                    e.currentTarget.style.color = "#ffffff";
                    e.currentTarget.style.background = "#16181d";
                }
            }}
            onMouseLeave={(e) => {
                if (primary) {
                    e.currentTarget.style.borderColor =
                        "rgba(0,149,255,0.35)";
                    e.currentTarget.style.background =
                        "rgba(0,149,255,0.08)";
                } else {
                    e.currentTarget.style.borderColor =
                        "rgba(255,255,255,0.08)";
                    e.currentTarget.style.color = "rgba(255,255,255,0.65)";
                    e.currentTarget.style.background = "#111216";
                }
            }}
        >
            {icon}
            {label}
        </button>
    );
}

interface StatChip {
    color: string;
    label: string;
    icon?: React.ReactNode;
}

function StatCard({
    label,
    value,
    unit,
    sub,
    bar,
    spark,
    chip,
    chips,
}: {
    label: string;
    value: string;
    unit?: string;
    sub: { left: string; right?: string };
    bar?: number;
    spark?: number[];
    chip?: StatChip;
    chips?: StatChip[];
}) {
    return (
        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] px-4 py-3.5 flex flex-col gap-2.5 min-h-[110px]">
            <div className="flex items-center justify-between">
                <span
                    className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45`}
                >
                    {label}
                </span>
                {sub.right === "live" && (
                    <span
                        className={`${MONO} inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.12em] font-semibold text-emerald-300/85`}
                    >
                        <span
                            className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse"
                            style={{ boxShadow: "0 0 5px #4ade80" }}
                        />
                        Live
                    </span>
                )}
            </div>

            {value && (
                <div className="flex items-baseline gap-1">
                    <span
                        style={SERIF_STYLE}
                        className="text-[28px] leading-none font-bold tracking-[-0.02em] tabular-nums text-white"
                    >
                        {value}
                    </span>
                    {unit && (
                        <span
                            className={`${MONO} text-[11px] text-white/45 font-medium`}
                        >
                            {unit}
                        </span>
                    )}
                </div>
            )}

            {chip && (
                <span
                    className={`${MONO} inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] font-semibold border rounded-[4px] w-fit`}
                    style={{
                        color: chip.color,
                        borderColor: `${chip.color}40`,
                        background: `${chip.color}10`,
                    }}
                >
                    <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                            background: chip.color,
                            boxShadow: `0 0 5px ${chip.color}`,
                        }}
                    />
                    {chip.label}
                </span>
            )}

            {chips && chips.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {chips.map((c) => (
                        <span
                            key={c.label}
                            className={`${MONO} inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] font-semibold border rounded-[3px]`}
                            style={{
                                color: c.color,
                                borderColor: `${c.color}40`,
                                background: `${c.color}10`,
                            }}
                        >
                            {c.icon}
                            {c.label}
                        </span>
                    ))}
                </div>
            )}

            {chips && chips.length === 0 && (
                <span
                    className={`${MONO} text-[10.5px] text-white/35 italic`}
                >
                    No policies active
                </span>
            )}

            {/* Inline viz */}
            {bar !== undefined && (
                <div className="h-1 w-full bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                        className="h-full transition-all duration-500"
                        style={{
                            width: `${Math.max(2, bar)}%`,
                            background: ACCENT,
                            boxShadow: `0 0 5px ${ACCENT}`,
                        }}
                    />
                </div>
            )}

            {spark && spark.length > 0 && (
                <div className="flex items-end gap-0.5 h-5">
                    {spark.map((h, i) => (
                        <div
                            key={i}
                            className="flex-1 rounded-sm"
                            style={{
                                height: `${Math.max(8, h)}%`,
                                background: `rgba(0,149,255,${0.25 + (i / spark.length) * 0.45})`,
                            }}
                        />
                    ))}
                </div>
            )}

            <div
                className={`${MONO} mt-auto flex items-center justify-between text-[10px] text-white/40`}
            >
                <span>{sub.left}</span>
                {sub.right && sub.right !== "live" && (
                    <span className="text-white/55 tabular-nums">
                        {sub.right}
                    </span>
                )}
            </div>
        </div>
    );
}

function pseudoSpark(seed: number, length = 15): number[] {
    const out: number[] = [];
    let s = (seed || 1) * 1000;
    for (let i = 0; i < length; i++) {
        s = (s * 9301 + 49297) % 233280;
        const r = s / 233280;
        out.push(15 + Math.floor(r * 70));
    }
    return out;
}

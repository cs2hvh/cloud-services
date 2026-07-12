"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";
import { toast } from "sonner";

import {
    ArrowLeft,
    CheckCircle,
    Clock,
    Cpu,
    Gauge,
    Layers,
    Loader2,
    Network,
    Send,
    Server,
    ShieldCheck,
    Sparkles,
    TrendingDown,
    Users,
    type LucideIcon,
} from "lucide-react";

// ─── Design tokens ────────────────────────────────────────────────
const SERIF_STYLE: CSSProperties = {
    fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";

const TEXTAREA_CLASS =
    "block w-full resize-y border border-white/[0.08] bg-[#0d0e11] px-3 py-2.5 text-[13px] text-white placeholder:text-white/30 rounded-[5px] focus:outline-none focus:border-[#0095FF]/40 focus:ring-1 focus:ring-[#0095FF]/30 transition-colors";
const SELECT_CLASS =
    "block w-full appearance-none border border-white/[0.08] bg-[#0d0e11] px-3 py-2.5 text-[13px] text-white rounded-[5px] focus:outline-none focus:border-[#0095FF]/40 focus:ring-1 focus:ring-[#0095FF]/30 transition-colors";

const GPU_CHOICES = ["H100 SXM", "H100 PCIe", "H100 NVL", "H200", "B200", "B300", "Mixed / not sure"];

type PlanType = {
    value: string;
    label: string;
    description: string;
    icon: LucideIcon;
};

const PLAN_TYPES: PlanType[] = [
    {
        value: "reserved",
        label: "Reserved capacity",
        description: "Lock in dedicated GPUs for 1 month or longer at discounted rates.",
        icon: Server,
    },
    {
        value: "cluster",
        label: "Multi-node cluster",
        description: "Distributed training across NVLink and InfiniBand fabrics.",
        icon: Layers,
    },
    {
        value: "savings-plan",
        label: "Savings plan",
        description: "Commit for 6 months or longer and save up to 60% vs on-demand.",
        icon: TrendingDown,
    },
    {
        value: "other",
        label: "Something else",
        description: "Custom GPU, region, networking, or compliance requirements.",
        icon: Sparkles,
    },
];

const SCALE_PRESETS = [8, 16, 32, 64, 128, 256, 512];

type Term = { value: string; label: string; hint?: string };
const TERMS: Term[] = [
    { value: "1-month", label: "1 month" },
    { value: "3-months", label: "3 months", hint: "~20% off" },
    { value: "6-months", label: "6 months", hint: "~40% off" },
    { value: "1-year", label: "1 year", hint: "up to 60% off" },
];

const REGIONS = [
    "No preference",
    "North America",
    "Europe",
    "Asia-Pacific",
    "Other / specify in notes",
];

// Credibility band — capability claims only (no certifications asserted).
const TRUST: { icon: LucideIcon; stat: string; label: string }[] = [
    { icon: Gauge, stat: "Up to 99.99%", label: "Custom uptime SLA" },
    { icon: Network, stat: "NVLink + InfiniBand", label: "Non-blocking fabric" },
    { icon: ShieldCheck, stat: "Single-tenant", label: "Dedicated, never spot" },
    { icon: Clock, stat: "< 1 business day", label: "Solutions response" },
];

// What an enterprise engagement includes — shown in the rail.
const INCLUDES: { icon: LucideIcon; text: string }[] = [
    { icon: Server, text: "Dedicated, reserved single-tenant GPUs" },
    { icon: Network, text: "NVLink + InfiniBand multi-node fabric" },
    { icon: TrendingDown, text: "Committed-use discounts up to 60%" },
    { icon: ShieldCheck, text: "Custom SLA, security & compliance review" },
    { icon: Users, text: "Named solutions engineer" },
    { icon: Cpu, text: "Priority 24/7 infrastructure support" },
];

export default function EnterpriseInquiryForm() {
    const router = useRouter();
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [planType, setPlanType] = useState("reserved");
    const [gpus, setGpus] = useState<string[]>(["H100 SXM"]);
    const [gpuCount, setGpuCount] = useState(16);
    const [duration, setDuration] = useState("1-month");
    const [region, setRegion] = useState("No preference");
    const [workload, setWorkload] = useState("");
    const [extra, setExtra] = useState("");

    function toggleGpu(g: string) {
        setGpus((prev) =>
            prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
        );
    }

    async function onSubmit() {
        if (gpus.length === 0) {
            toast.error("Pick at least one GPU type");
            return;
        }
        if (workload.trim().length < 10) {
            toast.error("Please describe your workload (10+ chars)");
            return;
        }
        setSubmitting(true);
        try {
            const res = await fetch("/api/services/gpu/enterprise-inquiries", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    planType,
                    gpus,
                    gpuCount,
                    duration,
                    workload: workload.trim(),
                    region: region === "No preference" ? null : region,
                    extra: extra.trim() || null,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.ok) {
                throw new Error(json.error || "Submission failed");
            }
            setSubmitted(true);
            toast.success("Inquiry sent — our team will reach out shortly");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Submission failed");
        } finally {
            setSubmitting(false);
        }
    }

    if (submitted) {
        return (
            <div className="mx-auto max-w-[1100px]">
                <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] px-6 py-16 text-center">
                    <div className="mb-5 flex h-14 w-14 items-center justify-center border border-emerald-500/25 bg-emerald-500/[0.08] rounded-[8px] mx-auto">
                        <CheckCircle className="h-7 w-7 text-emerald-400" />
                    </div>
                    <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-white">
                        Inquiry{" "}
                        <span style={SERIF_STYLE} className="text-white/55 font-normal">
                            received
                        </span>
                        <span className="text-white/55 font-normal">.</span>
                    </h2>
                    <p className={`${MONO} mt-3 max-w-md text-[11.5px] text-white/45 leading-relaxed mx-auto`}>
                        A solutions engineer will reach out within one business day to scope
                        your deployment. You can track the conversation under Support →
                        Tickets.
                    </p>
                    <div className="mt-7 flex flex-wrap justify-center gap-2">
                        <button
                            type="button"
                            onClick={() => router.push("/dashboard/support")}
                            className={`${MONO} h-10 inline-flex items-center gap-1.5 px-3.5 border border-white/[0.08] bg-[#0d0e11] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors`}
                        >
                            View tickets
                        </button>
                        <button
                            type="button"
                            onClick={() => router.push("/dashboard/services/gpu")}
                            className={`${MONO} inline-flex h-10 items-center gap-1.5 px-4 text-[11.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all`}
                            style={{
                                background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
                                color: "#ffffff",
                                boxShadow: "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)",
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#ffffff';
                                e.currentTarget.style.color = '#000000';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
                                e.currentTarget.style.color = '#ffffff';
                                e.currentTarget.style.transform = 'none';
                            }}
                        >
                            Back to GPU Cloud
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const selectedPlan = PLAN_TYPES.find((p) => p.value === planType);
    const selectedTerm = TERMS.find((t) => t.value === duration);

    return (
        <div className="mx-auto max-w-[1280px] text-white">
            {/* ── Hero ─────────────────────────────────────────── */}
            <header className="mb-8">
                <Link
                    href="/dashboard/services/gpu"
                    className={`${MONO} inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-white/45 hover:text-white transition-colors mb-5`}
                >
                    <ArrowLeft className="h-3 w-3" />
                    Back to GPU Cloud
                </Link>

                <div className={`${MONO} mb-3 flex items-center gap-3 text-[10.5px] uppercase tracking-[0.14em] text-white/55`}>
                    <span className="h-px w-4" style={{ background: ACCENT }} />
                    GPU Cloud · Enterprise
                </div>

                <h1 className="text-[36px] sm:text-[44px] leading-[1.05] tracking-[-0.025em] text-white font-semibold max-w-3xl">
                    Scale GPUs on{" "}
                    <span style={SERIF_STYLE} className="text-[#0095FF] font-normal">
                        enterprise terms
                    </span>
                </h1>
                <p className={`${MONO} mt-3 max-w-2xl text-[12px] text-white/50 leading-relaxed`}>
                    Dedicated reserved capacity, multi-node training clusters, and long-term
                    savings plans — architected with our solutions team and backed by a
                    custom SLA. Tell us what you&apos;re running and we&apos;ll design the
                    deployment. Self-serve pods stay on the main page.
                </p>
            </header>

            {/* ── Credibility band ─────────────────────────────── */}
            <div className="mb-9 grid grid-cols-2 lg:grid-cols-4 border border-white/[0.06] bg-[#0d0e11] rounded-[8px] overflow-hidden">
                {TRUST.map((t, i) => {
                    const Icon = t.icon;
                    return (
                        <div
                            key={t.label}
                            className={`flex items-center gap-3 px-4 py-4 ${
                                i % 2 === 0 ? "border-r border-white/[0.06]" : ""
                            } ${i < 2 ? "border-b border-white/[0.06] lg:border-b-0" : ""} ${
                                i === 2 ? "lg:border-r lg:border-white/[0.06]" : ""
                            }`}
                        >
                            <div
                                className="h-8 w-8 shrink-0 inline-flex items-center justify-center border rounded-[6px]"
                                style={{
                                    borderColor: `${ACCENT}22`,
                                    background: "rgba(0,149,255,0.06)",
                                    color: ACCENT_BRIGHT,
                                }}
                            >
                                <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[13px] font-semibold tracking-[-0.01em] text-white truncate">
                                    {t.stat}
                                </p>
                                <p className={`${MONO} text-[10px] uppercase tracking-[0.1em] text-white/40 truncate`}>
                                    {t.label}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Two-column: form on the left, sticky summary on the right. */}
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
                <div className="space-y-10 min-w-0">
                {/* ── 01 Plan ─────────────────────────────────────── */}
                <section>
                    <SectionHead
                        index="01"
                        title="Plan"
                        accent="type"
                        meta={selectedPlan?.label}
                    />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {PLAN_TYPES.map((p) => {
                            const selected = planType === p.value;
                            const Icon = p.icon;
                            return (
                                <button
                                    key={p.value}
                                    type="button"
                                    onClick={() => setPlanType(p.value)}
                                    className="group relative border rounded-[6px] p-4 text-left transition-all overflow-hidden"
                                    style={
                                        selected
                                            ? {
                                                  borderColor: `${ACCENT}55`,
                                                  background: `linear-gradient(135deg, #111216 0%, rgba(0,149,255,0.06) 100%)`,
                                                  boxShadow: `0 0 0 1px ${ACCENT}33, 0 6px 18px rgba(0,149,255,0.08)`,
                                              }
                                            : {
                                                  borderColor: "rgba(255,255,255,0.06)",
                                                  background: "#111216",
                                              }
                                    }
                                    onMouseEnter={(e) => {
                                        if (selected) return;
                                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)";
                                        e.currentTarget.style.background = "#16181d";
                                    }}
                                    onMouseLeave={(e) => {
                                        if (selected) return;
                                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                                        e.currentTarget.style.background = "#111216";
                                    }}
                                >
                                    {selected && (
                                        <span
                                            className="absolute left-0 top-0 bottom-0 w-[2px]"
                                            style={{
                                                background: ACCENT,
                                                boxShadow: `0 0 8px ${ACCENT}`,
                                            }}
                                        />
                                    )}

                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <div
                                            className="h-9 w-9 inline-flex items-center justify-center border rounded-[6px] transition-colors"
                                            style={{
                                                borderColor: selected
                                                    ? `${ACCENT}33`
                                                    : "rgba(255,255,255,0.08)",
                                                background: selected
                                                    ? "rgba(0,149,255,0.08)"
                                                    : "#0d0e11",
                                                color: selected ? ACCENT_BRIGHT : "rgba(255,255,255,0.55)",
                                            }}
                                        >
                                            <Icon className="h-4 w-4" />
                                        </div>
                                        <span
                                            className="h-4 w-4 inline-flex items-center justify-center rounded-full border transition-all"
                                            style={{
                                                borderColor: selected
                                                    ? ACCENT
                                                    : "rgba(255,255,255,0.18)",
                                                background: selected ? ACCENT : "transparent",
                                            }}
                                        >
                                            {selected && (
                                                <CheckCircle className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                                            )}
                                        </span>
                                    </div>

                                    <p
                                        style={SERIF_STYLE}
                                        className="text-[16px] leading-[1.15] tracking-[-0.015em] text-white font-semibold mb-1.5"
                                    >
                                        {p.label}
                                    </p>
                                    <p className={`${MONO} text-[10.5px] text-white/45 leading-relaxed`}>
                                        {p.description}
                                    </p>
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* ── 02 GPUs ─────────────────────────────────────── */}
                <section>
                    <SectionHead
                        index="02"
                        title="GPU"
                        accent="types"
                        meta={`${gpus.length} selected`}
                    />
                    <div className="flex flex-wrap gap-2">
                        {GPU_CHOICES.map((g) => {
                            const selected = gpus.includes(g);
                            return (
                                <button
                                    key={g}
                                    type="button"
                                    onClick={() => toggleGpu(g)}
                                    className={`${MONO} inline-flex items-center gap-1.5 border px-3.5 py-2 text-[12px] uppercase tracking-[0.08em] font-semibold rounded-[20px] transition-all ${
                                        selected
                                            ? "text-white"
                                            : "border-white/[0.08] bg-[#111216] text-white/65 hover:bg-[#16181d] hover:border-white/[0.14]"
                                    }`}
                                    style={
                                        selected
                                            ? {
                                                  borderColor: ACCENT,
                                                  background: `rgba(0,149,255,0.08)`,
                                                  boxShadow: `0 0 0 1px ${ACCENT}33`,
                                              }
                                            : undefined
                                    }
                                >
                                    {selected && (
                                        <span
                                            className="h-1.5 w-1.5 rounded-full"
                                            style={{ background: ACCENT, boxShadow: `0 0 5px ${ACCENT}` }}
                                        />
                                    )}
                                    {g}
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* ── 03 Scale & commitment ───────────────────────── */}
                <section>
                    <SectionHead
                        index="03"
                        title="Scale &"
                        accent="commitment"
                        meta={`${gpuCount} GPUs · ${selectedTerm?.label ?? "—"}`}
                    />
                    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5 space-y-5">
                        {/* GPU count */}
                        <div>
                            <FieldLabel hint="approximate is fine">GPU count</FieldLabel>
                            <div className="flex flex-wrap items-center gap-2">
                                {SCALE_PRESETS.map((n) => {
                                    const active = gpuCount === n;
                                    return (
                                        <button
                                            key={n}
                                            type="button"
                                            onClick={() => setGpuCount(n)}
                                            className={`${MONO} min-w-[48px] border px-3 py-2 text-[12px] tabular-nums font-semibold rounded-[5px] transition-all ${
                                                active
                                                    ? "text-white"
                                                    : "border-white/[0.08] bg-[#0d0e11] text-white/60 hover:bg-[#16181d] hover:border-white/[0.14]"
                                            }`}
                                            style={
                                                active
                                                    ? {
                                                          borderColor: ACCENT,
                                                          background: "rgba(0,149,255,0.08)",
                                                          boxShadow: `0 0 0 1px ${ACCENT}33`,
                                                      }
                                                    : undefined
                                            }
                                        >
                                            {n}
                                        </button>
                                    );
                                })}
                                <div className="flex items-center gap-2 ml-1">
                                    <input
                                        type="number"
                                        min={1}
                                        max={4096}
                                        value={gpuCount}
                                        onChange={(e) => {
                                            const v = parseInt(e.target.value, 10);
                                            setGpuCount(
                                                Number.isFinite(v)
                                                    ? Math.max(1, Math.min(4096, v))
                                                    : 1
                                            );
                                        }}
                                        className={`${MONO} w-[88px] border border-white/[0.08] bg-[#0d0e11] px-3 py-2 text-[12px] tabular-nums text-white rounded-[5px] focus:outline-none focus:border-[#0095FF]/40 focus:ring-1 focus:ring-[#0095FF]/30 transition-colors`}
                                    />
                                    <span className={`${MONO} text-[10px] uppercase tracking-[0.1em] text-white/35`}>
                                        exact
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Commitment term */}
                        <div>
                            <FieldLabel hint="longer = larger discount">Commitment term</FieldLabel>
                            <div className="flex flex-wrap gap-2">
                                {TERMS.map((t) => {
                                    const active = duration === t.value;
                                    return (
                                        <button
                                            key={t.value}
                                            type="button"
                                            onClick={() => setDuration(t.value)}
                                            className={`group/term border px-3.5 py-2 text-left rounded-[5px] transition-all ${
                                                active
                                                    ? ""
                                                    : "border-white/[0.08] bg-[#0d0e11] hover:bg-[#16181d] hover:border-white/[0.14]"
                                            }`}
                                            style={
                                                active
                                                    ? {
                                                          borderColor: ACCENT,
                                                          background: "rgba(0,149,255,0.08)",
                                                          boxShadow: `0 0 0 1px ${ACCENT}33`,
                                                      }
                                                    : undefined
                                            }
                                        >
                                            <span
                                                className={`${MONO} block text-[12px] font-semibold ${
                                                    active ? "text-white" : "text-white/65"
                                                }`}
                                            >
                                                {t.label}
                                            </span>
                                            {t.hint && (
                                                <span
                                                    className={`${MONO} block text-[9.5px] uppercase tracking-[0.08em] mt-0.5`}
                                                    style={{ color: active ? ACCENT_BRIGHT : "rgba(255,255,255,0.35)" }}
                                                >
                                                    {t.hint}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Region */}
                        <div className="max-w-[280px]">
                            <FieldLabel hint="optional">Region preference</FieldLabel>
                            <select
                                value={region}
                                onChange={(e) => setRegion(e.target.value)}
                                className={SELECT_CLASS}
                            >
                                {REGIONS.map((r) => (
                                    <option key={r} value={r} className="bg-[#0d0e11]">
                                        {r}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </section>

                {/* ── 04 Workload ─────────────────────────────────── */}
                <section>
                    <SectionHead index="04" title="Workload &" accent="context" />
                    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5 space-y-5">
                        <FieldWrap label="Workload description">
                            <textarea
                                value={workload}
                                onChange={(e) => setWorkload(e.target.value)}
                                placeholder="e.g. Pre-training a 70B model on 4×8 H100 nodes with FSDP; need NVLink/IB; data on S3-compatible storage."
                                rows={5}
                                className={TEXTAREA_CLASS}
                            />
                        </FieldWrap>

                        <FieldWrap label="Anything else? (optional)">
                            <textarea
                                value={extra}
                                onChange={(e) => setExtra(e.target.value)}
                                placeholder="Compliance, networking, storage, special timelines, etc."
                                rows={3}
                                className={TEXTAREA_CLASS}
                            />
                        </FieldWrap>
                    </div>
                </section>

                {/* ── Submit ───────────────────────────────────── */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-white/[0.06]">
                    <p className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] text-white/40 flex items-center gap-1.5`}>
                        <span
                            className="h-1 w-1 rounded-full"
                            style={{ background: "#4ade80", boxShadow: "0 0 5px #4ade80" }}
                        />
                        A solutions engineer replies within 1 business day
                    </p>
                    <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => router.push("/dashboard/services/gpu")}
                        className={`${MONO} h-10 inline-flex items-center gap-1.5 px-3.5 border border-white/[0.08] bg-[#111216] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors`}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onSubmit}
                        disabled={submitting}
                        className={`${MONO} inline-flex h-10 items-center gap-1.5 px-4 text-[11.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all disabled:opacity-50`}
                        style={{
                            background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
                            color: "#ffffff",
                            boxShadow: "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)",
                        }}
                        onMouseEnter={(e) => {
                            if (submitting) return;
                            e.currentTarget.style.background = '#ffffff';
                            e.currentTarget.style.color = '#000000';
                            e.currentTarget.style.transform = 'translateY(-2px)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
                            e.currentTarget.style.color = '#ffffff';
                            e.currentTarget.style.transform = 'none';
                        }}
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Sending
                            </>
                        ) : (
                            <>
                                <Send className="h-3 w-3" />
                                Send inquiry
                            </>
                        )}
                    </button>
                    </div>
                </div>
                </div>

                {/* ── Sticky summary ─────────────────────────── */}
                <aside className="lg:sticky lg:top-6 space-y-3">
                    <div className="border border-white/[0.06] bg-[#0d0e11] rounded-[8px] p-5">
                        <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40 mb-3`}>
                            Your request
                        </p>
                        <div className="flex flex-col">
                            <DetailRow label="Plan" value={selectedPlan?.label ?? "—"} />
                            <DetailRow label="GPUs" value={gpus.length ? gpus.join(", ") : "—"} />
                            <DetailRow label="Scale" value={`${gpuCount} GPUs`} />
                            <DetailRow label="Term" value={selectedTerm?.label ?? "—"} />
                            <DetailRow label="Region" value={region} />
                        </div>
                    </div>
                    <div className="border border-white/[0.06] bg-[#111216] rounded-[8px] p-5">
                        <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40 mb-3`}>
                            Enterprise includes
                        </p>
                        <ul className="space-y-2.5">
                            {INCLUDES.map((b) => {
                                const Icon = b.icon;
                                return (
                                    <li key={b.text} className="flex items-start gap-2.5 text-[12px] text-white/70 leading-snug">
                                        <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: ACCENT }} />
                                        {b.text}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                    <div className="border border-white/[0.06] bg-[#0d0e11] rounded-[8px] p-5">
                        <div className="flex items-center gap-2.5 mb-2">
                            <Users className="h-4 w-4" style={{ color: ACCENT_BRIGHT }} />
                            <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/50`}>
                                White-glove onboarding
                            </p>
                        </div>
                        <p className={`${MONO} text-[11px] text-white/45 leading-relaxed`}>
                            You&apos;re paired with a named solutions engineer who scopes the
                            cluster, validates the fabric, and stays on through go-live.
                        </p>
                    </div>
                </aside>
            </div>
        </div>
    );
}

// ─── Subcomponents ─────────────────────────────────────────────────

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
                <span className={`${MONO} text-[10.5px] tabular-nums`} style={{ color: ACCENT }}>{index}</span>
                <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-white">
                    {title}{" "}
                    <span style={{ ...SERIF_STYLE, color: ACCENT }} className="font-normal">
                        {accent}
                    </span>
                </h2>
            </div>
            {meta && (
                <span className={`${MONO} text-[11px] text-white/45 tabular-nums`}>{meta}</span>
            )}
        </div>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3 border-b border-dashed border-white/[0.06] py-2 last:border-b-0">
            <span className={`${MONO} shrink-0 text-[10px] uppercase tracking-[0.08em] text-white/40`}>
                {label}
            </span>
            <span className="text-right text-[12px] text-white/90 truncate">{value}</span>
        </div>
    );
}

function FieldWrap({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className={`${MONO} mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-white/45`}>
                {label}
            </label>
            {children}
        </div>
    );
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
    return (
        <div className="mb-2 flex items-baseline justify-between gap-2">
            <label className={`${MONO} block text-[10px] uppercase tracking-[0.14em] text-white/45`}>
                {children}
            </label>
            {hint && (
                <span className={`${MONO} text-[9.5px] lowercase tracking-[0.04em] text-white/30`}>
                    {hint}
                </span>
            )}
        </div>
    );
}

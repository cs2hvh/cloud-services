"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";
import { toast } from "sonner";

import {
    ArrowLeft,
    CheckCircle,
    ChevronRight,
    Layers,
    Loader2,
    Send,
    Server,
    Sparkles,
    TrendingDown,
    type LucideIcon,
} from "lucide-react";

// ─── Design tokens ────────────────────────────────────────────────
const SERIF_STYLE: CSSProperties = {
    fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";

const INPUT_CLASS =
    "h-10 w-full border border-white/[0.08] bg-[#0d0e11] px-3 text-[13px] text-white placeholder:text-white/30 rounded-[5px] focus:outline-none focus:border-[#0095FF]/40 focus:ring-1 focus:ring-[#0095FF]/30 transition-colors";

const TEXTAREA_CLASS =
    "block w-full resize-y border border-white/[0.08] bg-[#0d0e11] px-3 py-2.5 text-[13px] text-white placeholder:text-white/30 rounded-[5px] focus:outline-none focus:border-[#0095FF]/40 focus:ring-1 focus:ring-[#0095FF]/30 transition-colors";

const SELECT_CLASS =
    "h-10 w-full border border-white/[0.08] bg-[#0d0e11] px-3 text-[13px] text-white rounded-[5px] focus:outline-none focus:border-[#0095FF]/40 focus:ring-1 focus:ring-[#0095FF]/30 transition-colors appearance-none";

const SELECT_OPTION_STYLE: CSSProperties = {
    backgroundColor: "#0d0e11",
    color: "#ffffff",
};

const GPU_CHOICES = ["H100 SXM", "H100 PCIe", "H100 NVL", "H200", "B200", "Mixed / not sure"];
const DURATIONS = [
    { value: "1-week", label: "1 week" },
    { value: "1-month", label: "1 month" },
    { value: "3-months", label: "3 months" },
    { value: "6-months", label: "6 months" },
    { value: "1-year", label: "1 year+" },
];
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

const HERO_BULLETS = [
    "Discounted long-term rates",
    "Dedicated capacity, no spot",
    "Custom SLA & compliance",
    "Reply within 1 business day",
];

export default function EnterpriseInquiryForm() {
    const router = useRouter();
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [planType, setPlanType] = useState("reserved");
    const [gpus, setGpus] = useState<string[]>(["H100 SXM"]);
    const [gpuCount, setGpuCount] = useState(16);
    const [duration, setDuration] = useState("1-month");
    const [workload, setWorkload] = useState("");
    const [region, setRegion] = useState("");
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
                    region: region.trim() || null,
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
                        Our team will reach out within one business day. You can track the
                        conversation under Support → Tickets.
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
                                e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT_BRIGHT}, ${ACCENT})`;
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
                            }}
                        >
                            Back to GPU Cloud
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-[1280px] text-white">
            {/* ── Hero ─────────────────────────────────────────── */}
            <header className="mb-9">
                <Link
                    href="/dashboard/services/gpu"
                    className={`${MONO} inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-white/45 hover:text-white transition-colors mb-5`}
                >
                    <ArrowLeft className="h-3 w-3" />
                    Back to GPU Cloud
                </Link>

                <div className={`${MONO} flex items-center gap-2 text-[10.5px] uppercase tracking-[0.14em] text-white/40 mb-3`}>
                    <span>GPU Cloud</span>
                    <ChevronRight className="h-3 w-3 text-white/20" />
                    <span className="text-white/65">Reserved & Clusters</span>
                </div>

                <h1 className="text-[36px] sm:text-[44px] leading-[1.05] tracking-[-0.025em] text-white font-semibold max-w-3xl">
                    Talk to our{" "}
                    <span style={SERIF_STYLE} className="text-[#0095FF] font-normal">
                        sales team
                    </span>
                </h1>
                <p className={`${MONO} mt-3 max-w-2xl text-[11.5px] text-white/45 leading-relaxed`}>
                    For reserved capacity, multi-node training clusters, or long-term
                    savings plans — our team works with you directly. Self-serve pods stay
                    on the main page.
                </p>
            </header>

            {/* Two-column: form on the left, sticky summary on the right. */}
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
                {/* ── 01 Plan ─────────────────────────────────────── */}
                <div className="space-y-10 min-w-0">
                <section>
                    <SectionHead
                        index="01"
                        title="Plan"
                        accent="type"
                        meta={PLAN_TYPES.find((p) => p.value === planType)?.label}
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

                {/* ── 03 Sizing ───────────────────────────────────── */}
                <section>
                    <SectionHead index="03" title="Sizing &" accent="region" />
                    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5 grid gap-4 sm:grid-cols-3">
                        <FieldWrap label="Target GPU count">
                            <input
                                type="number"
                                min={1}
                                max={4096}
                                value={gpuCount}
                                onChange={(e) =>
                                    setGpuCount(
                                        Math.max(
                                            1,
                                            Math.min(4096, parseInt(e.target.value || "1", 10))
                                        )
                                    )
                                }
                                className={INPUT_CLASS}
                            />
                        </FieldWrap>
                        <FieldWrap label="Duration">
                            <select
                                value={duration}
                                onChange={(e) => setDuration(e.target.value)}
                                className={SELECT_CLASS}
                            >
                                {DURATIONS.map((d) => (
                                    <option style={SELECT_OPTION_STYLE} key={d.value} value={d.value}>
                                        {d.label}
                                    </option>
                                ))}
                            </select>
                        </FieldWrap>
                        <FieldWrap label="Region preference">
                            <input
                                type="text"
                                value={region}
                                onChange={(e) => setRegion(e.target.value)}
                                placeholder="e.g. US-East, EU, no preference"
                                className={INPUT_CLASS}
                            />
                        </FieldWrap>
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
                        We typically respond within 1 business day
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
                            e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT_BRIGHT}, ${ACCENT})`;
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
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
                            <DetailRow label="Plan" value={PLAN_TYPES.find((p) => p.value === planType)?.label ?? "—"} />
                            <DetailRow label="GPUs" value={gpus.length ? gpus.join(", ") : "—"} />
                            <DetailRow label="Count" value={`${gpuCount}×`} />
                            <DetailRow label="Duration" value={DURATIONS.find((d) => d.value === duration)?.label ?? "—"} />
                            {region.trim() && <DetailRow label="Region" value={region.trim()} />}
                        </div>
                    </div>
                    <div className="border border-white/[0.06] bg-[#111216] rounded-[8px] p-5">
                        <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40 mb-3`}>
                            Enterprise includes
                        </p>
                        <ul className="space-y-2.5">
                            {HERO_BULLETS.map((b) => (
                                <li key={b} className="flex items-start gap-2.5 text-[12px] text-white/70 leading-snug">
                                    <CheckCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: ACCENT }} />
                                    {b}
                                </li>
                            ))}
                        </ul>
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

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { CheckCircle, Loader2, Send, Sparkles } from "lucide-react";

const inputClassName =
    "border-white/[0.14] bg-white/[0.05] text-white placeholder:text-white/30 focus-visible:ring-0 focus-visible:border-white/25";

const GPU_CHOICES = ["H100 SXM", "H100 PCIe", "H100 NVL", "H200", "B200", "Mixed / not sure"];
const DURATIONS = [
    { value: "1-week", label: "1 week" },
    { value: "1-month", label: "1 month" },
    { value: "3-months", label: "3 months" },
    { value: "6-months", label: "6 months" },
    { value: "1-year", label: "1 year+" },
];
const PLAN_TYPES = [
    { value: "reserved", label: "Reserved capacity" },
    { value: "cluster", label: "Multi-node cluster" },
    { value: "savings-plan", label: "Long-term savings plan" },
    { value: "other", label: "Something else" },
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
    const [budget, setBudget] = useState("");
    const [region, setRegion] = useState("");
    const [contactPref, setContactPref] = useState("email");
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
                    budget: budget.trim() || null,
                    region: region.trim() || null,
                    contactPref,
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
            <div className="glass-panel overflow-hidden">
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                    <div className="mb-5 flex h-14 w-14 items-center justify-center border border-emerald-500/30 bg-emerald-500/10">
                        <CheckCircle className="h-7 w-7 text-emerald-400" />
                    </div>
                    <h2 className="text-xl font-semibold text-white">Inquiry received</h2>
                    <p className="mt-2 max-w-md text-sm leading-6 text-white/45">
                        Our team will reach out within one business day. You can track the
                        conversation under <strong>Support → Tickets</strong>.
                    </p>
                    <div className="mt-6 flex flex-wrap justify-center gap-3">
                        <Button
                            onClick={() => router.push("/dashboard/services/gpu")}
                            className="rounded-none border border-fuchsia-400/25 bg-fuchsia-500/90 text-slate-950 hover:bg-fuchsia-400"
                        >
                            Back to GPU Cloud
                        </Button>
                        <Button
                            onClick={() => router.push("/dashboard/support")}
                            variant="outline"
                            className="rounded-none border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                        >
                            View tickets
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 text-white">
            {/* Header */}
            <div className="glass-panel overflow-hidden">
                <div className="flex flex-col gap-3 px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-3xl">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fuchsia-300/70">
                            Reserved & Clusters
                        </p>
                        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                            Talk to our sales team
                        </h1>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">
                            For reserved capacity, multi-node training clusters, or long-term
                            savings plans, our team works with you directly. Self-serve pods
                            stay on the main page.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {[
                                "Reserved 1mo+",
                                "Multi-node InfiniBand",
                                "Custom SLA",
                                "Volume pricing",
                            ].map((tag) => (
                                <span
                                    key={tag}
                                    className="inline-flex items-center border border-white/[0.1] bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/42"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="glass-icon flex h-24 w-24 shrink-0 items-center justify-center text-fuchsia-200">
                        <Sparkles className="h-12 w-12" />
                    </div>
                </div>
            </div>

            {/* Form */}
            <div className="glass-panel overflow-hidden">
                <div className="border-b border-white/[0.06] px-6 py-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">
                        Inquiry details
                    </p>
                    <h2 className="mt-1 text-base font-semibold text-white">
                        Tell us what you need
                    </h2>
                </div>
                <div className="space-y-6 px-6 py-6">
                    <div>
                        <Label className="mb-3 block text-sm font-medium text-white/78">
                            What kind of plan are you looking for?
                        </Label>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {PLAN_TYPES.map((p) => (
                                <button
                                    key={p.value}
                                    type="button"
                                    onClick={() => setPlanType(p.value)}
                                    className={`border px-3 py-3 text-left text-sm transition-colors ${
                                        planType === p.value
                                            ? "border-fuchsia-400/30 bg-fuchsia-500/10 text-white"
                                            : "border-white/[0.08] bg-white/[0.04] text-white/80 hover:bg-white/[0.06]"
                                    }`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <Label className="mb-3 block text-sm font-medium text-white/78">
                            GPU types of interest
                        </Label>
                        <div className="flex flex-wrap gap-2">
                            {GPU_CHOICES.map((g) => {
                                const selected = gpus.includes(g);
                                return (
                                    <button
                                        key={g}
                                        type="button"
                                        onClick={() => toggleGpu(g)}
                                        className={`border px-3 py-1.5 text-sm transition-colors ${
                                            selected
                                                ? "border-fuchsia-400/30 bg-fuchsia-500/10 text-white"
                                                : "border-white/[0.08] bg-white/[0.04] text-white/70 hover:bg-white/[0.06]"
                                        }`}
                                    >
                                        {g}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                        <div>
                            <Label className="mb-2 block text-sm font-medium text-white/78">
                                Target GPU count
                            </Label>
                            <Input
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
                                className={inputClassName}
                            />
                        </div>
                        <div>
                            <Label className="mb-2 block text-sm font-medium text-white/78">
                                Duration
                            </Label>
                            <Select value={duration} onValueChange={setDuration}>
                                <SelectTrigger className={inputClassName}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="border-white/[0.12] bg-[#0a0a0c] text-white">
                                    {DURATIONS.map((d) => (
                                        <SelectItem key={d.value} value={d.value}>
                                            {d.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="mb-2 block text-sm font-medium text-white/78">
                                Region preference
                            </Label>
                            <Input
                                value={region}
                                onChange={(e) => setRegion(e.target.value)}
                                placeholder="e.g. US-East, EU, no preference"
                                className={inputClassName}
                            />
                        </div>
                    </div>

                    <div>
                        <Label className="mb-2 block text-sm font-medium text-white/78">
                            Workload description
                        </Label>
                        <textarea
                            value={workload}
                            onChange={(e) => setWorkload(e.target.value)}
                            placeholder="e.g. Pre-training a 70B model on 4×8 H100 nodes with FSDP; need NVLink/IB; data on S3-compatible storage."
                            rows={5}
                            className={`block w-full resize-y border px-3 py-2 text-sm ${inputClassName}`}
                        />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <Label className="mb-2 block text-sm font-medium text-white/78">
                                Budget range (optional)
                            </Label>
                            <Input
                                value={budget}
                                onChange={(e) => setBudget(e.target.value)}
                                placeholder="e.g. $50–100k/mo"
                                className={inputClassName}
                            />
                        </div>
                        <div>
                            <Label className="mb-2 block text-sm font-medium text-white/78">
                                Contact preference
                            </Label>
                            <Select value={contactPref} onValueChange={setContactPref}>
                                <SelectTrigger className={inputClassName}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="border-white/[0.12] bg-[#0a0a0c] text-white">
                                    <SelectItem value="email">Email</SelectItem>
                                    <SelectItem value="call">Phone / video call</SelectItem>
                                    <SelectItem value="slack">Shared Slack channel</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div>
                        <Label className="mb-2 block text-sm font-medium text-white/78">
                            Anything else? (optional)
                        </Label>
                        <textarea
                            value={extra}
                            onChange={(e) => setExtra(e.target.value)}
                            placeholder="Compliance, networking, storage, special timelines, etc."
                            rows={3}
                            className={`block w-full resize-y border px-3 py-2 text-sm ${inputClassName}`}
                        />
                    </div>

                    <div className="flex items-center justify-end gap-3 border-t border-white/[0.06] pt-5">
                        <Button
                            variant="outline"
                            onClick={() => router.push("/dashboard/services/gpu")}
                            className="rounded-none border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={onSubmit}
                            disabled={submitting}
                            className="rounded-none border border-fuchsia-400/25 bg-fuchsia-500/90 text-slate-950 hover:bg-fuchsia-400 disabled:opacity-50"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Sending…
                                </>
                            ) : (
                                <>
                                    <Send className="mr-2 h-4 w-4" />
                                    Send inquiry
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

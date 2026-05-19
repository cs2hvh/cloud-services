"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
import {
    AlertTriangle,
    ChevronDown,
    ChevronRight,
    Image as ImageIcon,
    Key as KeyIcon,
    Loader2,
    Sparkles,
    Zap,
} from "lucide-react";
import { generateIdempotencyKey } from "@/lib/idempotency";

import type { InventoryRowClient, StockStatus } from "./types";

// Curated templates. Each maps to a docker image our entrypoint contract
// understands (PUBLIC_KEY / ROOT_PASSWORD env injection, sshd on 22).
// IMPORTANT: only `image` is passed to RunPod; the local id stays in our DB
// for analytics only — RunPod's POST /v1/pods rejects unknown templateIds.
const TEMPLATES: Array<{
    id: string;
    name: string;
    image: string;
    description: string;
}> = [
    {
        id: "ubuntu-22-base",
        name: "Ubuntu 22.04 — base",
        image: "samatva-gpu/ubuntu-22.04-base:latest",
        description: "Minimal Ubuntu with SSH. Build your own stack.",
    },
    {
        id: "pytorch-cuda-12",
        name: "PyTorch + CUDA 12.1",
        image: "samatva-gpu/pytorch-cuda-12:latest",
        description: "PyTorch 2.x, CUDA 12.1, Python 3.11, common ML packages.",
    },
    {
        id: "vllm",
        name: "vLLM inference",
        image: "samatva-gpu/vllm:latest",
        description: "vLLM with OpenAI-compatible HTTP API on port 8000.",
    },
    {
        id: "comfyui",
        name: "ComfyUI",
        image: "samatva-gpu/comfyui:latest",
        description: "ComfyUI for image generation; web UI on port 8188.",
    },
    {
        id: "custom",
        name: "Custom image",
        image: "",
        description: "Any public Docker image URL.",
    },
];

interface VolumeOption {
    id: number;
    runpodVolumeId: string | null;
    name: string;
    sizeGb: number;
    dataCenterId: string;
    status: "creating" | "available" | "attached" | "error" | "deleted";
}

const inputClassName =
    "border-white/[0.14] bg-white/[0.05] text-white placeholder:text-white/30 focus-visible:ring-0 focus-visible:border-white/25";
const panelClassName = "glass-panel overflow-hidden";

function Section({
    eyebrow,
    title,
    description,
    children,
}: {
    eyebrow: string;
    title: string;
    description?: string;
    children: React.ReactNode;
}) {
    return (
        <div className={panelClassName}>
            <div className="border-b border-white/[0.06] px-6 py-4 sm:px-7">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fuchsia-300/70">
                    {eyebrow}
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">
                    {title}
                </h2>
                {description && (
                    <p className="mt-1 text-xs text-white/45">{description}</p>
                )}
            </div>
            <div className="px-6 py-5 sm:px-7">{children}</div>
        </div>
    );
}

function stockBadge(status: StockStatus | undefined) {
    if (!status || status === "none")
        return {
            pill: "border-white/[0.06] bg-white/[0.02] text-white/35",
            label: "Out of stock",
        };
    if (status === "high")
        return {
            pill: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
            label: "In stock",
        };
    if (status === "medium")
        return {
            pill: "border-amber-500/20 bg-amber-500/10 text-amber-300",
            label: "Limited",
        };
    return {
        pill: "border-orange-500/20 bg-orange-500/10 text-orange-300",
        label: "Very limited",
    };
}

export default function DeployWizard({
    inventory,
}: {
    inventory: InventoryRowClient[];
}) {
    const router = useRouter();
    const search = useSearchParams();

    // ── Inventory filtered to Secure cloud (Community is hidden from UI) ───
    const secureInventory = useMemo(
        () => inventory.filter((r) => r.cloudType === "SECURE"),
        [inventory]
    );

    // ── State ───────────────────────────────────────────────────────────────
    const initialGpu = search.get("gpu") || "";
    const [name, setName] = useState("");
    const [gpuCatalogId, setGpuCatalogId] = useState(initialGpu);
    const [gpuCount, setGpuCount] = useState(1);
    const [interruptible, setInterruptible] = useState(false);

    const [templateId, setTemplateId] = useState<string>("pytorch-cuda-12");
    const [customImage, setCustomImage] = useState("");

    const [containerDiskGb, setContainerDiskGb] = useState(50);
    const [volumeGb, setVolumeGb] = useState(0);

    const [networkVolumeId, setNetworkVolumeId] = useState<string>("");
    const [volumeOptions, setVolumeOptions] = useState<VolumeOption[]>([]);
    const [volumesLoading, setVolumesLoading] = useState(false);

    const [portsRaw, setPortsRaw] = useState("22/tcp, 8888/http");
    const [envRaw, setEnvRaw] = useState("");
    const [publicKey, setPublicKey] = useState("");
    const [rootPassword, setRootPassword] = useState("");

    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // ── Load attachable volumes once ────────────────────────────────────────
    useEffect(() => {
        let alive = true;
        setVolumesLoading(true);
        fetch("/api/services/gpu/volumes", { cache: "no-store" })
            .then((r) => r.json())
            .then((json) => {
                if (!alive) return;
                if (json?.ok && Array.isArray(json.volumes)) {
                    setVolumeOptions(
                        (json.volumes as VolumeOption[]).filter(
                            (v) => v.status === "available"
                        )
                    );
                }
            })
            .catch(() => {})
            .finally(() => alive && setVolumesLoading(false));
        return () => {
            alive = false;
        };
    }, []);

    // ── Derived ─────────────────────────────────────────────────────────────
    const grouped = useMemo(() => {
        return secureInventory.map((r) => ({
            gpuCatalogId: r.gpuCatalogId,
            displayName: r.displayName,
            memoryGb: r.memoryGb,
            row: r,
        }));
    }, [secureInventory]);

    const selectedRow = useMemo(
        () => secureInventory.find((r) => r.gpuCatalogId === gpuCatalogId),
        [secureInventory, gpuCatalogId]
    );

    const availableCounts = useMemo(() => {
        if (!selectedRow) return [];
        if (selectedRow.availableCounts.length > 0)
            return [...selectedRow.availableCounts].sort((a, b) => a - b);
        return selectedRow.stockStatus === "none" ? [] : [1];
    }, [selectedRow]);

    // Snap gpuCount to a valid value whenever availability changes.
    useEffect(() => {
        if (availableCounts.length === 0) return;
        if (!availableCounts.includes(gpuCount)) setGpuCount(availableCounts[0]);
    }, [availableCounts, gpuCount]);

    const selectedTemplate = TEMPLATES.find((t) => t.id === templateId);
    const effectiveImage =
        templateId === "custom"
            ? customImage.trim()
            : selectedTemplate?.image || "";

    const selectedVolume = volumeOptions.find(
        (v) => String(v.id) === networkVolumeId
    );

    const observedRate = interruptible
        ? selectedRow?.spotPerHr
        : selectedRow?.onDemandPerHr;
    const estimatedHourly =
        observedRate !== null && observedRate !== undefined
            ? Math.round(observedRate * 1.25 * gpuCount * 10000) / 10000
            : null;

    // ── Validation ──────────────────────────────────────────────────────────
    const issues: string[] = [];
    if (!name.trim()) issues.push("Pod name");
    else if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,62}[a-zA-Z0-9])?$/.test(name.trim()))
        issues.push("Valid pod name (alphanumeric + hyphens)");
    if (!gpuCatalogId) issues.push("GPU type");
    if (!selectedRow || selectedRow.stockStatus === "none")
        issues.push("GPU stock");
    if (!effectiveImage) issues.push("Container image");
    if (containerDiskGb < 10 || containerDiskGb > 2000)
        issues.push("Disk between 10–2000 GB");
    if (publicKey.trim().length === 0 && rootPassword.length < 12)
        issues.push("SSH key or 12+ character root password");

    const canSubmit = issues.length === 0 && !isLoading;

    // ── Helpers ─────────────────────────────────────────────────────────────
    function parsePorts(raw: string): string[] {
        return raw
            .split(/[,\n]/)
            .map((s) => s.trim())
            .filter((s) => /^\d{2,5}\/(tcp|http)$/.test(s));
    }
    function parseEnv(raw: string): Record<string, string> {
        const out: Record<string, string> = {};
        for (const line of raw.split(/\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;
            const eq = trimmed.indexOf("=");
            if (eq <= 0) continue;
            const k = trimmed.slice(0, eq).trim();
            const v = trimmed.slice(eq + 1).trim();
            if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) out[k] = v;
        }
        return out;
    }

    async function onSubmit() {
        if (!canSubmit) {
            toast.error("Please complete all required fields");
            return;
        }
        setIsLoading(true);
        try {
            const payload = {
                name: name.trim(),
                gpuCatalogId,
                gpuCount,
                cloudType: "SECURE",
                interruptible,
                imageName: effectiveImage,
                templateId: templateId !== "custom" ? templateId : undefined,
                containerDiskGb,
                volumeGb,
                networkVolumeId: selectedVolume?.runpodVolumeId || undefined,
                dataCenterIds: selectedVolume
                    ? [selectedVolume.dataCenterId]
                    : undefined,
                ports: parsePorts(portsRaw),
                env: parseEnv(envRaw),
                publicKey: publicKey.trim() || undefined,
                rootPassword: rootPassword || undefined,
            };

            const res = await fetch("/api/services/gpu/pods", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Idempotency-Key": generateIdempotencyKey("gpu"),
                },
                body: JSON.stringify(payload),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.ok) {
                throw new Error(json.error || "Deployment failed");
            }
            toast.success("Pod deployed");
            router.push(`/dashboard/services/gpu/${json.pod?.podId}`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Deployment failed");
        } finally {
            setIsLoading(false);
        }
    }

    const stockBadgeStyle = stockBadge(selectedRow?.stockStatus);

    return (
        <div className="space-y-6 text-white">
            {/* Header */}
            <div className={panelClassName}>
                <div className="flex flex-col gap-3 px-5 py-4 sm:px-6 sm:py-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-3xl">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fuchsia-300/70">
                            Deploy GPU Pod
                        </p>
                        <h1 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                            Configure and deploy
                        </h1>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">
                            Everything is on one page. The deploy button stays disabled until
                            required fields are complete.
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                {/* ── Main form (single scrolling column) ──────────────── */}
                <div className="space-y-6">
                    {/* GPU + count + mode */}
                    <Section eyebrow="Compute" title="GPU type">
                        <div className="space-y-5">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {grouped.map((g) => {
                                    const isSelected = gpuCatalogId === g.gpuCatalogId;
                                    const status = g.row.stockStatus;
                                    const outOfStock = status === "none";
                                    return (
                                        <button
                                            key={g.gpuCatalogId}
                                            type="button"
                                            onClick={() =>
                                                !outOfStock && setGpuCatalogId(g.gpuCatalogId)
                                            }
                                            disabled={outOfStock}
                                            className={`border p-4 text-left transition-colors ${
                                                isSelected
                                                    ? "border-fuchsia-400/30 bg-fuchsia-500/10"
                                                    : outOfStock
                                                      ? "cursor-not-allowed border-white/[0.04] bg-white/[0.02] opacity-50"
                                                      : "border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.06]"
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <Sparkles className="h-4 w-4 text-fuchsia-300" />
                                                        <span className="text-sm font-semibold text-white">
                                                            {g.displayName}
                                                        </span>
                                                    </div>
                                                    <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-white/35">
                                                        {g.memoryGb} GB VRAM
                                                    </p>
                                                </div>
                                                <span
                                                    className={`inline-flex items-center border px-1.5 py-0.5 text-[10px] ${
                                                        stockBadge(status).pill
                                                    }`}
                                                >
                                                    {stockBadge(status).label}
                                                </span>
                                            </div>
                                            {g.row.onDemandPerHr !== null && (
                                                <p className="mt-3 font-mono text-xs text-white/60">
                                                    ${g.row.onDemandPerHr.toFixed(2)}
                                                    <span className="text-white/35">
                                                        /GPU/hr
                                                    </span>
                                                </p>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Count + mode side by side */}
                            <div className="grid gap-5 sm:grid-cols-2">
                                <div>
                                    <Label className="mb-2 block text-sm font-medium text-white/78">
                                        GPU count
                                    </Label>
                                    <div className="flex flex-wrap gap-2">
                                        {[1, 2, 4, 8].map((n) => {
                                            const enabled = availableCounts.includes(n);
                                            const selected = gpuCount === n;
                                            return (
                                                <button
                                                    key={n}
                                                    type="button"
                                                    onClick={() => enabled && setGpuCount(n)}
                                                    disabled={!enabled}
                                                    className={`flex h-10 min-w-[60px] items-center justify-center border px-3 font-mono text-sm font-semibold tabular-nums transition-colors ${
                                                        selected && enabled
                                                            ? "border-fuchsia-400/30 bg-fuchsia-500/10 text-white"
                                                            : enabled
                                                              ? "border-white/[0.12] bg-white/[0.04] text-white/80 hover:bg-white/[0.08]"
                                                              : "cursor-not-allowed border-white/[0.06] bg-white/[0.02] text-white/25 line-through"
                                                    }`}
                                                >
                                                    {n}×
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {availableCounts.length > 0 ? (
                                        <p className="mt-2 text-xs text-white/40">
                                            Available:{" "}
                                            <span className="font-mono text-white/70">
                                                {availableCounts.join(", ")}
                                            </span>
                                        </p>
                                    ) : (
                                        <p className="mt-2 text-xs text-white/40">
                                            Select a GPU above to see counts.
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <Label className="mb-2 block text-sm font-medium text-white/78">
                                        Pricing mode
                                    </Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            {
                                                value: false,
                                                title: "On-demand",
                                                rate: selectedRow?.onDemandPerHr,
                                                subtitle: "Guaranteed",
                                            },
                                            {
                                                value: true,
                                                title: "Spot",
                                                rate: selectedRow?.spotPerHr,
                                                subtitle: "Interruptible",
                                            },
                                        ].map((opt) => {
                                            const isSelected = interruptible === opt.value;
                                            const available =
                                                opt.rate !== null && opt.rate !== undefined;
                                            return (
                                                <button
                                                    key={String(opt.value)}
                                                    type="button"
                                                    onClick={() =>
                                                        available && setInterruptible(opt.value)
                                                    }
                                                    disabled={!available}
                                                    className={`border p-3 text-left transition-colors ${
                                                        isSelected
                                                            ? "border-fuchsia-400/30 bg-fuchsia-500/10"
                                                            : available
                                                              ? "border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.06]"
                                                              : "cursor-not-allowed border-white/[0.04] bg-white/[0.02] opacity-50"
                                                    }`}
                                                >
                                                    <p className="text-sm font-semibold text-white">
                                                        {opt.title}
                                                    </p>
                                                    <p className="text-[10px] text-white/45">
                                                        {opt.subtitle}
                                                    </p>
                                                    <p className="mt-2 font-mono text-sm font-semibold text-white tabular-nums">
                                                        {available
                                                            ? `$${opt.rate?.toFixed(2)}`
                                                            : "—"}
                                                        <span className="text-[10px] font-normal text-white/40">
                                                            /GPU/hr
                                                        </span>
                                                    </p>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Section>

                    {/* Name + image */}
                    <Section eyebrow="Setup" title="Pod identity & image">
                        <div className="space-y-5">
                            <div>
                                <Label className="mb-2 block text-sm font-medium text-white/78">
                                    Pod name
                                </Label>
                                <Input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="my-training-job"
                                    className={inputClassName}
                                />
                                <p className="mt-1.5 text-xs text-white/40">
                                    1–64 chars, alphanumeric + hyphens.
                                </p>
                            </div>

                            <div>
                                <Label className="mb-2 block text-sm font-medium text-white/78">
                                    Container image
                                </Label>
                                <div className="space-y-2">
                                    {TEMPLATES.map((t) => {
                                        const isSelected = templateId === t.id;
                                        return (
                                            <button
                                                key={t.id}
                                                type="button"
                                                onClick={() => setTemplateId(t.id)}
                                                className={`flex w-full items-start gap-3 border p-3 text-left transition-colors ${
                                                    isSelected
                                                        ? "border-fuchsia-400/30 bg-fuchsia-500/10"
                                                        : "border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.06]"
                                                }`}
                                            >
                                                <ImageIcon
                                                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                                                        isSelected
                                                            ? "text-fuchsia-300"
                                                            : "text-white/40"
                                                    }`}
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-semibold text-white">
                                                        {t.name}
                                                    </p>
                                                    <p className="mt-0.5 text-[12px] text-white/45">
                                                        {t.description}
                                                    </p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                                {templateId === "custom" && (
                                    <div className="mt-3">
                                        <Input
                                            value={customImage}
                                            onChange={(e) => setCustomImage(e.target.value)}
                                            placeholder="docker.io/myorg/myimage:tag"
                                            className={inputClassName}
                                        />
                                        <p className="mt-1.5 text-xs text-white/40">
                                            Any public registry. Private registries coming soon.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </Section>

                    {/* Storage */}
                    <Section
                        eyebrow="Storage"
                        title="Disk & persistence"
                        description="Container disk is wiped on restart. Pod volume survives restarts but not destroy. Network volumes persist forever."
                    >
                        <div className="space-y-5">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <Label className="mb-2 block text-sm font-medium text-white/78">
                                        Container disk (GB)
                                    </Label>
                                    <Input
                                        type="number"
                                        min={10}
                                        max={2000}
                                        value={containerDiskGb}
                                        onChange={(e) =>
                                            setContainerDiskGb(
                                                Math.max(
                                                    10,
                                                    Math.min(
                                                        2000,
                                                        parseInt(e.target.value || "50", 10)
                                                    )
                                                )
                                            )
                                        }
                                        className={inputClassName}
                                    />
                                    <p className="mt-1.5 text-xs text-white/40">
                                        Ephemeral. 10–2000 GB.
                                    </p>
                                </div>
                                <div>
                                    <Label className="mb-2 block text-sm font-medium text-white/78">
                                        Pod volume (GB)
                                    </Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={2000}
                                        value={volumeGb}
                                        onChange={(e) =>
                                            setVolumeGb(
                                                Math.max(
                                                    0,
                                                    Math.min(
                                                        2000,
                                                        parseInt(e.target.value || "0", 10)
                                                    )
                                                )
                                            )
                                        }
                                        className={inputClassName}
                                    />
                                    <p className="mt-1.5 text-xs text-white/40">
                                        Persists restarts, lost on destroy.
                                    </p>
                                </div>
                            </div>

                            <div>
                                <Label className="mb-2 block text-sm font-medium text-white/78">
                                    Network volume (optional — persistent)
                                </Label>
                                <Select
                                    value={networkVolumeId || "none"}
                                    onValueChange={(v) =>
                                        setNetworkVolumeId(v === "none" ? "" : v)
                                    }
                                >
                                    <SelectTrigger className={inputClassName}>
                                        <SelectValue
                                            placeholder={
                                                volumesLoading
                                                    ? "Loading…"
                                                    : "None — don't attach a network volume"
                                            }
                                        />
                                    </SelectTrigger>
                                    <SelectContent className="border-white/[0.12] bg-[#0a0a0c] text-white">
                                        <SelectItem value="none">
                                            None — don&apos;t attach a network volume
                                        </SelectItem>
                                        {volumeOptions.map((v) => (
                                            <SelectItem
                                                key={v.id}
                                                value={String(v.id)}
                                                disabled={!v.runpodVolumeId}
                                            >
                                                {v.name} · {v.sizeGb} GB · {v.dataCenterId}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="mt-1.5 text-xs text-white/40">
                                    {selectedVolume ? (
                                        <span className="inline-flex items-center gap-1.5 text-amber-300/80">
                                            <AlertTriangle className="h-3 w-3" />
                                            Pod will be deployed in{" "}
                                            <span className="font-mono">
                                                {selectedVolume.dataCenterId}
                                            </span>{" "}
                                            (the volume&apos;s datacenter).
                                        </span>
                                    ) : (
                                        <>
                                            Manage volumes on the{" "}
                                            <Link
                                                href="/dashboard/services/gpu/storage"
                                                className="text-fuchsia-300 underline hover:text-fuchsia-200"
                                            >
                                                Storage page
                                            </Link>
                                            . Mounted at <code>/workspace</code>.
                                        </>
                                    )}
                                </p>
                            </div>
                        </div>
                    </Section>

                    {/* SSH */}
                    <Section
                        eyebrow="Access"
                        title="SSH access"
                        description="Public key recommended. Root password is a fallback (must be 12+ chars if no key)."
                    >
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                            <div className="space-y-4">
                                <div>
                                    <Label className="mb-2 flex items-center gap-2 text-sm font-medium text-white/78">
                                        <KeyIcon className="h-3.5 w-3.5" />
                                        Public SSH key
                                    </Label>
                                    <textarea
                                        value={publicKey}
                                        onChange={(e) => setPublicKey(e.target.value)}
                                        placeholder="ssh-ed25519 AAAA... your-comment"
                                        rows={3}
                                        className={`block w-full resize-y border px-3 py-2 font-mono text-sm ${inputClassName}`}
                                    />
                                </div>
                                <div>
                                    <Label className="mb-2 block text-sm font-medium text-white/78">
                                        Root password (optional)
                                    </Label>
                                    <Input
                                        type="password"
                                        value={rootPassword}
                                        onChange={(e) => setRootPassword(e.target.value)}
                                        placeholder="At least 12 characters if no SSH key"
                                        className={inputClassName}
                                    />
                                </div>
                            </div>
                            <div className="border border-white/[0.08] bg-white/[0.04] p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                                    Requirements
                                </p>
                                <ul className="mt-3 space-y-1.5 text-[13px] text-white/55">
                                    <li
                                        className={
                                            publicKey.trim().length > 0
                                                ? "text-emerald-300/80"
                                                : ""
                                        }
                                    >
                                        {publicKey.trim().length > 0 ? "✓" : "·"} SSH public key
                                    </li>
                                    <li className="text-white/30">— OR —</li>
                                    <li
                                        className={
                                            rootPassword.length >= 12
                                                ? "text-emerald-300/80"
                                                : ""
                                        }
                                    >
                                        {rootPassword.length >= 12 ? "✓" : "·"} 12+ char root
                                        password
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </Section>

                    {/* Advanced (collapsed) */}
                    <div className={panelClassName}>
                        <button
                            type="button"
                            onClick={() => setAdvancedOpen((v) => !v)}
                            className="flex w-full items-center justify-between border-b border-white/[0.06] px-6 py-4 transition-colors hover:bg-white/[0.02]"
                        >
                            <div className="text-left">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fuchsia-300/70">
                                    Optional
                                </p>
                                <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">
                                    Advanced — ports & environment
                                </h2>
                            </div>
                            {advancedOpen ? (
                                <ChevronDown className="h-4 w-4 text-white/60" />
                            ) : (
                                <ChevronRight className="h-4 w-4 text-white/60" />
                            )}
                        </button>
                        {advancedOpen && (
                            <div className="space-y-5 px-6 py-5 sm:px-7">
                                <div>
                                    <Label className="mb-2 block text-sm font-medium text-white/78">
                                        Exposed ports
                                    </Label>
                                    <Input
                                        value={portsRaw}
                                        onChange={(e) => setPortsRaw(e.target.value)}
                                        placeholder="22/tcp, 8888/http"
                                        className={inputClassName}
                                    />
                                    <p className="mt-1.5 text-xs text-white/40">
                                        Comma-separated. Format: <code>port/tcp</code> or{" "}
                                        <code>port/http</code>.
                                    </p>
                                </div>
                                <div>
                                    <Label className="mb-2 block text-sm font-medium text-white/78">
                                        Environment variables
                                    </Label>
                                    <textarea
                                        value={envRaw}
                                        onChange={(e) => setEnvRaw(e.target.value)}
                                        placeholder={"HF_TOKEN=your-token\nMODEL=meta-llama/Llama-3-8B"}
                                        rows={4}
                                        className={`block w-full resize-y border px-3 py-2 font-mono text-sm ${inputClassName}`}
                                    />
                                    <p className="mt-1.5 text-xs text-white/40">
                                        One <code>KEY=value</code> per line. Encrypted at rest.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Sticky summary sidebar ───────────────────────────────── */}
                <div className="space-y-6">
                    <div className={`${panelClassName} lg:sticky lg:top-8`}>
                        <div className="border-b border-white/[0.06] px-6 py-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">
                                Summary
                            </p>
                            <h3 className="mt-1 text-lg font-semibold text-white">
                                Your pod
                            </h3>
                        </div>
                        <div className="px-6 py-5">
                            <p className="font-mono text-3xl font-semibold text-white tabular-nums">
                                {estimatedHourly !== null
                                    ? `$${estimatedHourly.toFixed(2)}`
                                    : "—"}
                                <span className="ml-1 text-xs font-normal text-white/40">
                                    /hr
                                </span>
                            </p>
                            <p className="mt-1 text-[11px] text-white/40">
                                Estimate. Final rate frozen at deploy time.
                            </p>

                            <div className="mt-5 space-y-1.5 text-sm">
                                <SummaryRow
                                    label="Name"
                                    value={name.trim() || "—"}
                                    mono
                                />
                                <SummaryRow
                                    label="GPU"
                                    value={
                                        selectedRow
                                            ? `${gpuCount}× ${selectedRow.displayName}`
                                            : "—"
                                    }
                                />
                                <SummaryRow
                                    label="Mode"
                                    value={interruptible ? "Spot" : "On-demand"}
                                />
                                <SummaryRow
                                    label="Image"
                                    value={effectiveImage || "—"}
                                    mono
                                    truncate
                                />
                                <SummaryRow
                                    label="Disk"
                                    value={`${containerDiskGb} GB${
                                        volumeGb > 0 ? ` + ${volumeGb} GB pod vol.` : ""
                                    }`}
                                />
                                {selectedVolume && (
                                    <SummaryRow
                                        label="Net volume"
                                        value={`${selectedVolume.name} · ${selectedVolume.dataCenterId}`}
                                        mono
                                        truncate
                                    />
                                )}
                                {selectedRow && (
                                    <SummaryRow
                                        label="Stock"
                                        value={stockBadgeStyle.label}
                                    />
                                )}
                            </div>

                            {issues.length > 0 && (
                                <div className="mt-5 border border-amber-500/20 bg-amber-500/[0.06] p-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300/80">
                                        Missing
                                    </p>
                                    <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] text-amber-200/70">
                                        {issues.map((i) => (
                                            <li key={i}>{i}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <Button
                                type="button"
                                onClick={onSubmit}
                                disabled={!canSubmit}
                                className="mt-5 w-full rounded-none border border-fuchsia-400/25 bg-fuchsia-500/90 text-slate-950 hover:bg-fuchsia-400 disabled:opacity-40"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Deploying…
                                    </>
                                ) : (
                                    <>
                                        <Zap className="mr-2 h-4 w-4" />
                                        Deploy pod
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function SummaryRow({
    label,
    value,
    mono,
    truncate,
}: {
    label: string;
    value: string;
    mono?: boolean;
    truncate?: boolean;
}) {
    return (
        <div className="flex items-start justify-between gap-3">
            <span className="shrink-0 text-white/42">{label}</span>
            <span
                className={`text-right ${mono ? "font-mono" : ""} ${
                    truncate ? "max-w-[60%] truncate" : ""
                } text-white/82`}
            >
                {value}
            </span>
        </div>
    );
}

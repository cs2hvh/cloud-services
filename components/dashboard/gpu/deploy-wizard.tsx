"use client";

// GPU deploy page. Editorial dark surface with Instrument Serif headings,
// dotted grid background, brand-blue accent on selections + CTAs. Layout is
// a single scrolling main column on the left and a sticky 380px summary on
// the right (the rest of the dashboard layout owns the sidebar + breadcrumb
// header). Brand blue #0095FF stays the primary accent.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

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
    Loader2,
} from "lucide-react";
import { generateIdempotencyKey } from "@/lib/idempotency";
import { storagePerHour } from "@/lib/services/runpod/helpers";

import { NvidiaLogo } from "@/components/branding/nvidia-logo";
import type { InventoryRowClient, StockStatus } from "./types";

// ─── Design tokens (scoped to the deploy page) ─────────────────────────

// Display font applied via inline style so Tailwind's arbitrary-value
// parser can't mangle the comma-separated fallback chain.
const SERIF_STYLE: React.CSSProperties = {
    fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";
const ACCENT_DIM = "rgba(0,149,255,0.12)";
const BORDER_ACCENT = "rgba(0,149,255,0.4)";

// ─── Container image templates ─────────────────────────────────────────

// Catalog templates are fetched live from /api/services/gpu/templates
// (admin-managed, company-owned images). The "custom" option is appended
// client-side so users can still bring any public image.

type WizardTemplate = {
    id: string;
    name: string;
    image: string;
    description: string;
    ports?: string[];
    defaultContainerDiskGb?: number;
};

interface ApiTemplate {
    id: string;
    name: string;
    imageName: string;
    description: string | null;
    ports?: string[];
    defaultContainerDiskGb?: number;
}

const CUSTOM_TEMPLATE: WizardTemplate = {
    id: "custom",
    name: "Custom image",
    image: "",
    description: "Any public Docker image URL.",
};

interface VolumeOption {
    id: number;
    runpodVolumeId: string | null;
    name: string;
    sizeGb: number;
    dataCenterId: string;
    status: "creating" | "available" | "attached" | "error" | "deleted";
}

// ─── Stock metadata + tier inference ───────────────────────────────────

function stockMeta(status: StockStatus | undefined): {
    dotClass: string;
    label: string;
    color: string;
} {
    if (!status || status === "none")
        return { dotClass: "bg-[#52525b]", label: "Out of stock", color: "#52525b" };
    if (status === "high")
        return { dotClass: "bg-[#4ade80]", label: "Available", color: "#4ade80" };
    if (status === "medium")
        return { dotClass: "bg-[#fbbf24]", label: "Limited", color: "#fbbf24" };
    return { dotClass: "bg-[#fb923c]", label: "Very limited", color: "#fb923c" };
}

function tierLabel(name: string): string {
    const n = name.toLowerCase();
    if (/(h100|h200|b100|b200|b300|gb200|a100|mi300|mi325)/.test(n)) return "FLAGSHIP";
    if (/(rtx pro|rtx 6000|a6000|a40|a4500|a5000|a4000)/.test(n)) return "WORKSTATION";
    if (/(l4|l40|t4)/.test(n)) return "INFERENCE";
    if (/(rtx|geforce)/.test(n)) return "CONSUMER";
    return "GPU";
}

function archLabel(name: string): string {
    const n = name.toLowerCase();
    if (/(b100|b200|b300|gb200|rtx 50|rtx pro 6000|rtx pro 4500)/.test(n)) return "Blackwell";
    if (/(h100|h200|gh200)/.test(n)) return "Hopper";
    if (/(a100|a40|a6000|a5000|a4000|rtx 30|rtx a)/.test(n)) return "Ampere";
    if (/(l4|l40|rtx 40|rtx 6000 ada|rtx pro 4000|ada)/.test(n)) return "Ada Lovelace";
    if (/(mi300|mi325)/.test(n)) return "CDNA 3";
    if (/(v100)/.test(n)) return "Volta";
    if (/(t4)/.test(n)) return "Turing";
    return "NVIDIA";
}

function vendorLabel(name: string): string {
    return /^amd|mi\d{3}/i.test(name) ? "AMD" : "NVIDIA";
}

// ─── Component ─────────────────────────────────────────────────────────

export default function DeployWizard({
    inventory,
}: {
    inventory: InventoryRowClient[];
}) {
    const router = useRouter();
    const search = useSearchParams();

    const secureInventory = useMemo(
        () => inventory.filter((r) => r.cloudType === "SECURE"),
        [inventory]
    );

    // ── Form state ────────────────────────────────────────────────────
    const initialGpu = search.get("gpu") || "";
    const [name, setName] = useState("");
    const [gpuCatalogId, setGpuCatalogId] = useState(initialGpu);
    const [gpuCount, setGpuCount] = useState(1);
    const [interruptible, setInterruptible] = useState(false);

    const [templates, setTemplates] = useState<WizardTemplate[]>([CUSTOM_TEMPLATE]);
    const [templateId, setTemplateId] = useState<string>("");
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
    const [attempted, setAttempted] = useState(false);

    const [stockFilter, setStockFilter] = useState<"all" | "available" | "limited" | "very-limited" | "out">("all");
    const [query, setQuery] = useState("");
    const [showAllOOS, setShowAllOOS] = useState(false);
    const [sortMode, setSortMode] = useState<"price-desc" | "price-asc" | "vram-desc" | "vram-asc" | "name">("price-desc");

    // ── Load attachable volumes once ──────────────────────────────────
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

    // ── Load image templates once ─────────────────────────────────────
    useEffect(() => {
        let alive = true;
        fetch("/api/services/gpu/templates", { cache: "no-store" })
            .then((r) => r.json())
            .then((json) => {
                if (!alive) return;
                const rows: WizardTemplate[] =
                    json?.ok && Array.isArray(json.templates)
                        ? (json.templates as ApiTemplate[]).map((t) => ({
                              id: t.id,
                              name: t.name,
                              image: t.imageName,
                              description: t.description ?? "",
                              ports: t.ports,
                              defaultContainerDiskGb: t.defaultContainerDiskGb,
                          }))
                        : [];
                setTemplates([...rows, CUSTOM_TEMPLATE]);
                setTemplateId((cur) => cur || rows[0]?.id || "custom");
            })
            .catch(() => {
                if (!alive) return;
                setTemplates([CUSTOM_TEMPLATE]);
                setTemplateId((cur) => cur || "custom");
            });
        return () => {
            alive = false;
        };
    }, []);

    // ── Derived ───────────────────────────────────────────────────────
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

    useEffect(() => {
        if (availableCounts.length === 0) return;
        if (!availableCounts.includes(gpuCount)) setGpuCount(availableCounts[0]);
    }, [availableCounts, gpuCount]);

    const selectedTemplate = templates.find((t) => t.id === templateId);
    const effectiveImage =
        templateId === "custom"
            ? customImage.trim()
            : selectedTemplate?.image || "";

    // Selecting a catalog template seeds its recommended ports + disk.
    useEffect(() => {
        if (!selectedTemplate || selectedTemplate.id === "custom") return;
        if (selectedTemplate.ports && selectedTemplate.ports.length > 0) {
            setPortsRaw(selectedTemplate.ports.join(", "));
        }
        if (selectedTemplate.defaultContainerDiskGb) {
            setContainerDiskGb(selectedTemplate.defaultContainerDiskGb);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [templateId]);

    const selectedVolume = volumeOptions.find(
        (v) => String(v.id) === networkVolumeId
    );

    const observedRate = interruptible
        ? selectedRow?.spotPerHr
        : selectedRow?.onDemandPerHr;
    // GPU compute (observed × default markup × count) + local-disk storage.
    // Mirrors the billed rate in pod-lifecycle-operations so the quote matches.
    const gpuHourly =
        observedRate !== null && observedRate !== undefined
            ? Math.round(observedRate * 1.25 * gpuCount * 10000) / 10000
            : null;
    const storageHourly = storagePerHour({ containerDiskGb, volumeGb });
    const estimatedHourly =
        gpuHourly !== null
            ? Math.round((gpuHourly + storageHourly) * 10000) / 10000
            : null;

    const dailyCost = estimatedHourly !== null ? estimatedHourly * 24 : null;
    const monthlyCost = estimatedHourly !== null ? estimatedHourly * 24 * 30 : null;

    // ── Step completion (informational stepper) ───────────────────────
    const hasGpu = !!selectedRow && selectedRow.stockStatus !== "none";
    const hasImage = effectiveImage.length > 0;
    const hasStorage = containerDiskGb >= 10;
    const hasAuth = publicKey.trim().length > 0 || rootPassword.length >= 12;
    const hasName = name.trim().length > 0;

    // ── Validation ────────────────────────────────────────────────────
    const issues: string[] = [];
    if (!hasName) issues.push("Pod name");
    else if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,62}[a-zA-Z0-9])?$/.test(name.trim()))
        issues.push("Valid pod name (alphanumeric + hyphens)");
    if (!gpuCatalogId) issues.push("GPU type");
    if (!hasGpu) issues.push("GPU stock");
    if (!hasImage) issues.push("Container image");
    if (containerDiskGb < 10 || containerDiskGb > 2000)
        issues.push("Disk between 10–2000 GB");
    if (!hasAuth) issues.push("SSH key or 12+ character root password");

    const canSubmit = issues.length === 0 && !isLoading;

    // ── Per-field errors (revealed after a Launch attempt) ─────────────
    const nameError =
        attempted && !hasName
            ? "Pod name is required"
            : attempted &&
                name.trim().length > 0 &&
                !/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,62}[a-zA-Z0-9])?$/.test(name.trim())
              ? "1–64 characters · letters, numbers, hyphens"
              : null;
    const gpuError = attempted && (!gpuCatalogId || !hasGpu) ? "Select an in-stock GPU above" : null;
    const imageError =
        attempted && !hasImage
            ? templateId === "custom"
                ? "Enter a container image URL"
                : "Select a container image"
            : null;
    const diskError =
        attempted && (containerDiskGb < 10 || containerDiskGb > 2000)
            ? "Container disk must be 10–2000 GB"
            : null;
    const authError = attempted && !hasAuth ? "Add an SSH key or a root password (12+ characters)" : null;

    // Launch click: if anything's missing, reveal inline errors + jump to the
    // first one instead of silently doing nothing.
    function handleLaunch() {
        if (issues.length > 0) {
            setAttempted(true);
            toast.error("Please complete the highlighted fields");
            requestAnimationFrame(() => {
                document
                    .querySelector('[data-deploy-error="true"]')
                    ?.scrollIntoView({ behavior: "smooth", block: "center" });
            });
            return;
        }
        onSubmit();
    }

    // ── Filter + sort GPU cards ───────────────────────────────────────
    const filteredCards = useMemo(() => {
        const q = query.trim().toLowerCase();
        const all = secureInventory
            .map((r) => ({
                row: r,
                stock: r.stockStatus,
                arch: archLabel(r.displayName),
                tier: tierLabel(r.displayName),
                vendor: vendorLabel(r.displayName),
            }));
        const matchStock = (s: StockStatus): boolean => {
            switch (stockFilter) {
                case "all": return true;
                case "available": return s === "high";
                case "limited": return s === "medium";
                case "very-limited": return s === "low";
                case "out": return s === "none";
            }
        };
        return all
            .filter((c) => matchStock(c.stock))
            .filter((c) => {
                if (!q) return true;
                return [c.row.displayName, c.arch, c.vendor, `${c.row.memoryGb}gb`]
                    .some((s) => s.toLowerCase().includes(q));
            })
            .sort((a, b) => {
                // Out-of-stock always last, regardless of user sort.
                const stockOrder: Record<StockStatus, number> = { high: 0, medium: 0, low: 0, none: 1 };
                if (stockOrder[a.stock] !== stockOrder[b.stock])
                    return stockOrder[a.stock] - stockOrder[b.stock];

                switch (sortMode) {
                    case "price-desc": {
                        // Unpriced rows sink to the bottom.
                        const ap = a.row.onDemandPerHr ?? -Infinity;
                        const bp = b.row.onDemandPerHr ?? -Infinity;
                        if (ap !== bp) return bp - ap;
                        break;
                    }
                    case "price-asc": {
                        const ap = a.row.onDemandPerHr ?? Infinity;
                        const bp = b.row.onDemandPerHr ?? Infinity;
                        if (ap !== bp) return ap - bp;
                        break;
                    }
                    case "vram-desc":
                        if (a.row.memoryGb !== b.row.memoryGb) return b.row.memoryGb - a.row.memoryGb;
                        break;
                    case "vram-asc":
                        if (a.row.memoryGb !== b.row.memoryGb) return a.row.memoryGb - b.row.memoryGb;
                        break;
                    case "name":
                        // handled by tie-breaker below
                        break;
                }
                return a.row.displayName.localeCompare(b.row.displayName);
            });
    }, [secureInventory, stockFilter, query, sortMode]);

    const counts = useMemo(() => {
        const c = { all: 0, available: 0, limited: 0, vlimited: 0, out: 0 };
        for (const r of secureInventory) {
            c.all++;
            if (r.stockStatus === "high") c.available++;
            else if (r.stockStatus === "medium") c.limited++;
            else if (r.stockStatus === "low") c.vlimited++;
            else c.out++;
        }
        return c;
    }, [secureInventory]);

    // ── Helpers ───────────────────────────────────────────────────────
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

    // ── Render ────────────────────────────────────────────────────────
    return (
        <div className="relative min-h-full">
            {/* Dotted grid background overlay */}
            <div
                className="pointer-events-none absolute inset-0 z-0"
                style={{
                    backgroundImage:
                        "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)",
                    backgroundSize: "28px 28px",
                }}
            />
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]">
                {/* ── Main column ────────────────────────────────────── */}
                <div className="px-6 py-7 sm:px-10 sm:py-9 max-w-[1280px]">
                    {/* Page title */}
                    <h1 className="text-[56px] sm:text-[64px] leading-[0.95] tracking-[-0.025em] text-white font-semibold">
                        Launch{" "}
                        <span style={SERIF_STYLE} className="text-[#0095FF] font-normal">
                            GPU
                        </span>
                    </h1>

                    {/* Stepper */}
                    <div className="mt-8 mb-7 grid grid-cols-2 sm:grid-cols-4 border-y border-white/[0.07] py-4">
                        <StepCell
                            num="01"
                            slot="GPU"
                            label="Select hardware"
                            hint={selectedRow ? `${selectedRow.displayName} · ${selectedRow.memoryGb} GB` : "Pick a card"}
                            complete={hasGpu}
                            active={!hasGpu}
                            divider
                        />
                        <StepCell
                            num="02"
                            slot="Image"
                            label="Container template"
                            hint={selectedTemplate?.id === "custom" ? (customImage.trim() || "Custom image") : (selectedTemplate?.id ?? "—")}
                            complete={hasImage}
                            active={hasGpu && !hasImage}
                            divider
                        />
                        <StepCell
                            num="03"
                            slot="Storage"
                            label="Disk & volumes"
                            hint={`${containerDiskGb} GB ephemeral${volumeGb > 0 ? ` + ${volumeGb} GB` : ""}${selectedVolume ? " + net vol" : ""}`}
                            complete={hasStorage}
                            active={hasGpu && hasImage && !hasStorage}
                            divider
                        />
                        <StepCell
                            num="04"
                            slot="Access"
                            label="SSH & secrets"
                            hint={hasAuth ? (publicKey.trim() ? "SSH key set" : "Root pwd set") : "— not set"}
                            complete={hasAuth}
                            active={hasGpu && hasImage && hasStorage && !hasAuth}
                        />
                    </div>

                    {/* ── 01 · GPU ──────────────────────────────────── */}
                    <SectionTitle index="01" title="Select hardware" count={`${filteredCards.length} of ${counts.all}`} />

                    {/* Filter bar */}
                    <div className="mb-3.5 flex items-center gap-1 border border-white/[0.06] bg-[#111216] p-1.5">
                        <FilterChip active={stockFilter === "all"} onClick={() => setStockFilter("all")} count={counts.all}>All</FilterChip>
                        <FilterChip active={stockFilter === "available"} onClick={() => setStockFilter("available")} count={counts.available} dot="#4ade80">Available</FilterChip>
                        <FilterChip active={stockFilter === "limited"} onClick={() => setStockFilter("limited")} count={counts.limited} dot="#fbbf24">Limited</FilterChip>
                        <FilterChip active={stockFilter === "very-limited"} onClick={() => setStockFilter("very-limited")} count={counts.vlimited} dot="#fb923c">Very limited</FilterChip>
                        <FilterChip active={stockFilter === "out"} onClick={() => setStockFilter("out")} count={counts.out} dot="#52525b">Out of stock</FilterChip>
                        <div className="mx-2 h-[18px] w-px bg-white/[0.06]" />
                        <div className="flex flex-1 items-center gap-2 px-2">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/35 shrink-0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Filter by model, architecture, or VRAM…"
                                className="flex-1 bg-transparent text-[12.5px] text-white placeholder:text-white/30 outline-none py-1.5"
                            />
                        </div>
                        <SortControl mode={sortMode} setMode={setSortMode} />
                    </div>

                    {/* GPU grid — in-stock first, OOS collapsed behind a + toggle */}
                    {(() => {
                        if (filteredCards.length === 0) {
                            return (
                                <div className="border border-white/[0.06] bg-[#111216] px-6 py-14 text-center">
                                    <p className="text-[14px] font-semibold text-white">No GPUs match this filter</p>
                                    <p className="mt-1 text-[12px] text-white/45">Try a different stock filter or clear your search.</p>
                                </div>
                            );
                        }

                        const inStock = filteredCards.filter((c) => c.stock !== "none");
                        const outOfStock = filteredCards.filter((c) => c.stock === "none");
                        // When the user explicitly filters to "out", show them all.
                        const collapseOOS = stockFilter !== "out" && !showAllOOS;

                        return (
                            <>
                                {inStock.length > 0 && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5">
                                        {inStock.map((c) => (
                                            <GpuCard
                                                key={c.row.gpuCatalogId}
                                                row={c.row}
                                                selected={gpuCatalogId === c.row.gpuCatalogId}
                                                onSelect={() => setGpuCatalogId(c.row.gpuCatalogId)}
                                            />
                                        ))}
                                    </div>
                                )}

                                {outOfStock.length > 0 && (
                                    <>
                                        {!collapseOOS && (
                                            <div className={`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5 ${inStock.length > 0 ? "mt-2.5" : ""}`}>
                                                {outOfStock.map((c) => (
                                                    <GpuCard
                                                        key={c.row.gpuCatalogId}
                                                        row={c.row}
                                                        selected={false}
                                                        onSelect={() => {}}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                        {stockFilter !== "out" && (
                                            <button
                                                type="button"
                                                onClick={() => setShowAllOOS((v) => !v)}
                                                className={`${MONO} mt-3 inline-flex w-full items-center justify-center gap-2 border border-white/[0.06] bg-[#111216] px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] text-white/55 hover:bg-white/[0.03] hover:text-white/85 transition-colors`}
                                            >
                                                <span className="inline-flex h-3.5 w-3.5 items-center justify-center border border-white/[0.15] text-[11px] leading-none text-white/65">
                                                    {showAllOOS ? "−" : "+"}
                                                </span>
                                                {showAllOOS ? "Hide" : "Show"} {outOfStock.length} unavailable
                                            </button>
                                        )}
                                    </>
                                )}

                                {inStock.length === 0 && outOfStock.length === 0 && (
                                    <div className="border border-white/[0.06] bg-[#111216] px-6 py-14 text-center">
                                        <p className="text-[14px] font-semibold text-white">Nothing matches</p>
                                    </div>
                                )}
                            </>
                        );
                    })()}

                    {gpuError && <ErrorMsg>{gpuError}</ErrorMsg>}

                    {/* Count + mode */}
                    {selectedRow && (
                        <div className="mt-8 grid gap-5 sm:grid-cols-2">
                            <div>
                                <Label className={`${MONO} mb-2 block text-[10.5px] uppercase tracking-[0.14em] text-white/45`}>
                                    GPU count
                                </Label>
                                <div className="flex flex-wrap gap-2">
                                    {availableCounts.length > 0 ? (
                                        availableCounts.map((n) => {
                                            const selected = gpuCount === n;
                                            return (
                                                <button
                                                    key={n}
                                                    type="button"
                                                    onClick={() => setGpuCount(n)}
                                                    className={`${MONO} flex h-10 min-w-[60px] items-center justify-center border px-3 text-[13px] font-semibold tabular-nums transition-all`}
                                                    style={
                                                        selected
                                                            ? {
                                                                  borderColor: BORDER_ACCENT,
                                                                  background: ACCENT_DIM,
                                                                  color: "#ffffff",
                                                                  boxShadow: `0 0 0 1px ${BORDER_ACCENT}`,
                                                              }
                                                            : {
                                                                  borderColor: "rgba(255,255,255,0.08)",
                                                                  background: "#111216",
                                                                  color: "rgba(255,255,255,0.78)",
                                                              }
                                                    }
                                                >
                                                    {n}×
                                                </button>
                                            );
                                        })
                                    ) : (
                                        <p className="text-[12px] text-white/40">Out of stock.</p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <Label className={`${MONO} mb-2 block text-[10.5px] uppercase tracking-[0.14em] text-white/45`}>
                                    Pricing mode
                                </Label>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { value: false, title: "On-demand", rate: selectedRow.onDemandPerHr, subtitle: "Guaranteed" },
                                        { value: true, title: "Spot", rate: selectedRow.spotPerHr, subtitle: "Interruptible" },
                                    ].map((opt) => {
                                        const isSelected = interruptible === opt.value;
                                        const available = opt.rate !== null && opt.rate !== undefined;
                                        return (
                                            <button
                                                key={String(opt.value)}
                                                type="button"
                                                onClick={() => available && setInterruptible(opt.value)}
                                                disabled={!available}
                                                className="border p-3 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                style={
                                                    isSelected
                                                        ? {
                                                              borderColor: BORDER_ACCENT,
                                                              background: ACCENT_DIM,
                                                              boxShadow: `0 0 0 1px ${BORDER_ACCENT}`,
                                                          }
                                                        : {
                                                              borderColor: "rgba(255,255,255,0.06)",
                                                              background: "#111216",
                                                          }
                                                }
                                            >
                                                <p className="text-[13px] font-semibold text-white">{opt.title}</p>
                                                <p className="text-[10.5px] text-white/45">{opt.subtitle}</p>
                                                <p className={`${MONO} mt-2 text-[13px] font-semibold text-white tabular-nums`}>
                                                    {available ? `$${opt.rate?.toFixed(2)}` : "—"}
                                                    <span className="ml-0.5 text-[10px] font-normal text-white/40">/GPU·hr</span>
                                                </p>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── 02 · Identity & image ──────────────────────── */}
                    <SectionTitle index="02" title="Identity & image" />
                    <div className="border border-white/[0.06] bg-[#111216] p-5 space-y-5">
                        <div>
                            <Label className={`${MONO} mb-2 block text-[10.5px] uppercase tracking-[0.14em] text-white/45`}>
                                Name
                            </Label>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="my-training-job"
                                className="h-10 border-white/[0.08] bg-[#0d0e11] text-[13px] text-white placeholder:text-white/30 focus-visible:ring-0 focus-visible:border-white/25"
                            />
                            <p className="mt-1.5 text-[11.5px] text-white/40">
                                1–64 chars · alphanumeric + hyphens.
                            </p>
                            {nameError && <ErrorMsg>{nameError}</ErrorMsg>}
                        </div>

                        <div>
                            <Label className={`${MONO} mb-2 block text-[10.5px] uppercase tracking-[0.14em] text-white/45`}>
                                Container image
                            </Label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {templates.map((t) => {
                                    const isSelected = templateId === t.id;
                                    const initial = t.id === "custom" ? "+" : t.name.charAt(0).toUpperCase();
                                    return (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => setTemplateId(t.id)}
                                            className="flex items-start gap-3 border p-3 text-left transition-all"
                                            style={
                                                isSelected
                                                    ? {
                                                          borderColor: BORDER_ACCENT,
                                                          background: ACCENT_DIM,
                                                          boxShadow: `0 0 0 1px ${BORDER_ACCENT}`,
                                                      }
                                                    : {
                                                          borderColor: "rgba(255,255,255,0.06)",
                                                          background: "#0d0e11",
                                                      }
                                            }
                                        >
                                            <span
                                                className={`${MONO} mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border text-[14px] font-semibold`}
                                                style={
                                                    isSelected
                                                        ? { borderColor: BORDER_ACCENT, color: "#ffffff", background: "rgba(0,149,255,0.18)" }
                                                        : { borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.65)", background: "rgba(255,255,255,0.02)" }
                                                }
                                            >
                                                {initial}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[13px] font-semibold text-white truncate">{t.name}</p>
                                                <p className="mt-0.5 text-[11.5px] leading-[1.45] text-white/45 line-clamp-2">{t.description}</p>
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
                                        className="h-10 border-white/[0.08] bg-[#0d0e11] text-[13px] text-white placeholder:text-white/30 focus-visible:ring-0 focus-visible:border-white/25"
                                    />
                                    <p className="mt-1.5 text-[11.5px] text-white/40">
                                        Any public registry. Private registries coming soon.
                                    </p>
                                </div>
                            )}
                            {imageError && <ErrorMsg>{imageError}</ErrorMsg>}
                        </div>
                    </div>

                    {/* ── 03 · Storage ──────────────────────────────── */}
                    <SectionTitle index="03" title="Storage" />
                    <div className="border border-white/[0.06] bg-[#111216] p-5 space-y-5">
                        <div className="grid gap-2.5 sm:grid-cols-2">
                            <DiskField
                                label="Container disk"
                                hint="Wiped on restart"
                                value={containerDiskGb}
                                min={10}
                                max={2000}
                                onChange={(n) => setContainerDiskGb(Math.max(10, Math.min(2000, n)))}
                            />
                            <DiskField
                                label="Pod volume"
                                hint="Survives restart, lost on destroy"
                                value={volumeGb}
                                min={0}
                                max={2000}
                                onChange={(n) => setVolumeGb(Math.max(0, Math.min(2000, n)))}
                            />
                        </div>

                        {diskError && <ErrorMsg>{diskError}</ErrorMsg>}

                        <div className="flex items-center justify-between border-t border-white/[0.06] pt-3.5">
                            <span className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/45`}>
                                Total local storage
                            </span>
                            <span className={`${MONO} text-[13px] text-white tabular-nums`}>
                                {containerDiskGb + volumeGb} GB
                            </span>
                        </div>

                        <div className="border-t border-white/[0.06] pt-4">
                            <div className="flex items-center justify-between mb-2">
                                <Label className={`${MONO} block text-[10.5px] uppercase tracking-[0.14em] text-white/45`}>
                                    Network volume
                                </Label>
                                <span className={`${MONO} text-[10px] uppercase tracking-[0.1em] text-white/35`}>
                                    Optional · persistent
                                </span>
                            </div>
                            <Select value={networkVolumeId || "none"} onValueChange={(v) => setNetworkVolumeId(v === "none" ? "" : v)}>
                                <SelectTrigger className="h-10 border-white/[0.08] bg-[#0d0e11] text-[13px] text-white focus-visible:ring-0 focus-visible:border-white/25">
                                    <SelectValue placeholder={volumesLoading ? "Loading…" : "None — don't attach a network volume"} />
                                </SelectTrigger>
                                <SelectContent className="border-white/[0.1] bg-[#111216] text-white">
                                    <SelectItem value="none">None — don&apos;t attach a network volume</SelectItem>
                                    {volumeOptions.map((v) => (
                                        <SelectItem key={v.id} value={String(v.id)} disabled={!v.runpodVolumeId}>
                                            {v.name} · {v.sizeGb} GB · {v.dataCenterId}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="mt-2 text-[11.5px] text-white/40">
                                {selectedVolume ? (
                                    <span className="inline-flex items-center gap-1.5 text-amber-300/80">
                                        <AlertTriangle className="h-3 w-3" />
                                        Pod pinned to <span className={MONO}>{selectedVolume.dataCenterId}</span> · mounted at <code className={MONO}>/workspace</code>
                                    </span>
                                ) : (
                                    <>
                                        Mounted at <code className={MONO}>/workspace</code> · manage on the{" "}
                                        <Link href="/dashboard/services/gpu/storage" className="underline" style={{ color: ACCENT }}>
                                            Storage page
                                        </Link>
                                        .
                                    </>
                                )}
                            </p>
                        </div>
                    </div>

                    {/* ── 04 · Access ──────────────────────────────── */}
                    <SectionTitle index="04" title="Access" />
                    <div className="border border-white/[0.06] bg-[#111216] p-5 space-y-4">
                        {/* Auth status strip */}
                        <div className="flex items-center gap-3 border border-white/[0.06] bg-[#0d0e11] px-3.5 py-2.5">
                            <AuthDot ok={publicKey.trim().length > 0} />
                            <span className={`text-[12px] ${publicKey.trim().length > 0 ? "text-white" : "text-white/45"}`}>
                                SSH key
                            </span>
                            <span className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-white/30 mx-1`}>or</span>
                            <AuthDot ok={rootPassword.length >= 12} />
                            <span className={`text-[12px] ${rootPassword.length >= 12 ? "text-white" : "text-white/45"}`}>
                                Root password
                                <span className={`${MONO} ml-1 text-[10px] text-white/35`}>(12+)</span>
                            </span>
                            <span
                                className={`${MONO} ml-auto text-[10px] uppercase tracking-[0.14em]`}
                                style={{ color: hasAuth ? "#4ade80" : "rgba(255,255,255,0.35)" }}
                            >
                                {hasAuth ? "Ready" : "Required"}
                            </span>
                        </div>

                        {authError && <ErrorMsg>{authError}</ErrorMsg>}

                        <div>
                            <Label className={`${MONO} mb-2 block text-[10.5px] uppercase tracking-[0.14em] text-white/45`}>
                                Public SSH key
                            </Label>
                            <textarea
                                value={publicKey}
                                onChange={(e) => setPublicKey(e.target.value)}
                                placeholder="ssh-ed25519 AAAA... your-comment"
                                rows={3}
                                className={`${MONO} block w-full resize-y border border-white/[0.08] bg-[#0d0e11] px-3 py-2 text-[12px] text-white placeholder:text-white/30 outline-none focus:border-white/25`}
                            />
                        </div>

                        <div>
                            <Label className={`${MONO} mb-2 block text-[10.5px] uppercase tracking-[0.14em] text-white/45`}>
                                Root password
                            </Label>
                            <Input
                                type="password"
                                value={rootPassword}
                                onChange={(e) => setRootPassword(e.target.value)}
                                placeholder="At least 12 characters if no SSH key"
                                className="h-10 border-white/[0.08] bg-[#0d0e11] text-[13px] text-white placeholder:text-white/30 focus-visible:ring-0 focus-visible:border-white/25"
                            />
                        </div>
                    </div>

                    {/* ── Advanced ─────────────────────────────────── */}
                    <div className="mt-6 border border-white/[0.06] bg-[#111216] overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setAdvancedOpen((v) => !v)}
                            className="flex w-full items-center justify-between border-b border-white/[0.06] px-5 py-4 hover:bg-white/[0.02]"
                        >
                            <div className="text-left">
                                <p className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/45`}>Optional</p>
                                <h2 className="mt-1 text-[15px] font-semibold tracking-tight text-white">Advanced — ports & environment</h2>
                            </div>
                            {advancedOpen ? <ChevronDown className="h-4 w-4 text-white/60" /> : <ChevronRight className="h-4 w-4 text-white/60" />}
                        </button>
                        {advancedOpen && (
                            <div className="space-y-5 px-5 py-5">
                                <div>
                                    <Label className={`${MONO} mb-2 block text-[10.5px] uppercase tracking-[0.14em] text-white/45`}>
                                        Exposed ports
                                    </Label>
                                    <Input
                                        value={portsRaw}
                                        onChange={(e) => setPortsRaw(e.target.value)}
                                        placeholder="22/tcp, 8888/http"
                                        className="h-10 border-white/[0.08] bg-[#0d0e11] text-[13px] text-white placeholder:text-white/30 focus-visible:ring-0 focus-visible:border-white/25"
                                    />
                                    <p className="mt-1.5 text-[11.5px] text-white/40">
                                        Comma-separated. Format: <code className={MONO}>port/tcp</code> or <code className={MONO}>port/http</code>.
                                    </p>
                                </div>
                                <div>
                                    <Label className={`${MONO} mb-2 block text-[10.5px] uppercase tracking-[0.14em] text-white/45`}>
                                        Environment variables
                                    </Label>
                                    <textarea
                                        value={envRaw}
                                        onChange={(e) => setEnvRaw(e.target.value)}
                                        placeholder={"HF_TOKEN=your-token\nMODEL=meta-llama/Llama-3-8B"}
                                        rows={4}
                                        className={`${MONO} block w-full resize-y border border-white/[0.08] bg-[#0d0e11] px-3 py-2 text-[12px] text-white placeholder:text-white/30 outline-none focus:border-white/25`}
                                    />
                                    <p className="mt-1.5 text-[11.5px] text-white/40">
                                        One <code className={MONO}>KEY=value</code> per line. Encrypted at rest.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Right summary panel ─────────────────────────────── */}
                <aside className="border-l border-white/[0.06] bg-[#0d0e11] px-7 py-7 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
                    <h2 className="text-[30px] leading-[1.05] tracking-[-0.02em] font-semibold">
                        Your{" "}
                        <span style={SERIF_STYLE} className="text-white/55 font-normal">
                            GPU
                        </span>
                    </h2>

                    {/* Big price */}
                    <div className="mt-6 pb-5 border-b border-white/[0.06]">
                        <div className="flex items-baseline">
                            <span style={SERIF_STYLE} className="text-[30px] text-white/55 mr-0.5 font-medium">$</span>
                            <span style={SERIF_STYLE} className="text-[68px] leading-[0.95] tracking-[-0.035em] text-white font-bold tabular-nums">
                                {estimatedHourly !== null ? estimatedHourly.toFixed(2) : "—"}
                            </span>
                            <span className={`${MONO} ml-2 text-[12px] text-white/45`}>/hr</span>
                        </div>

                        <div className="mt-3.5 pt-3.5 border-t border-dashed border-white/[0.06] grid grid-cols-2 gap-0">
                            <div className="pr-3 border-r border-dashed border-white/[0.06]">
                                <p className={`${MONO} text-[9.5px] uppercase tracking-[0.1em] text-white/35`}>~Daily</p>
                                <p className={`${MONO} mt-1 text-[12.5px] text-white tabular-nums`}>
                                    {dailyCost !== null ? `$${dailyCost.toFixed(2)}` : "—"}
                                </p>
                            </div>
                            <div className="pl-3">
                                <p className={`${MONO} text-[9.5px] uppercase tracking-[0.1em] text-white/35`}>~Monthly</p>
                                <p className={`${MONO} mt-1 text-[12.5px] text-white tabular-nums`}>
                                    {monthlyCost !== null ? `$${monthlyCost.toFixed(2)}` : "—"}
                                </p>
                            </div>
                        </div>

                        {/* Compute vs storage split — so adjusting disk changes the price */}
                        {estimatedHourly !== null && (
                            <div className={`${MONO} mt-3 flex items-center justify-between text-[10.5px] text-white/40 tabular-nums`}>
                                <span>Compute ${gpuHourly?.toFixed(3)}/hr</span>
                                <span>
                                    Storage ${storageHourly.toFixed(3)}/hr
                                    <span className="text-white/25"> · {containerDiskGb + volumeGb} GB</span>
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Detail rows */}
                    <div className="mt-5 flex flex-col">
                        <DetailRow label="Name" value={name.trim() || "—"} mono />
                        <DetailRow
                            label="GPU"
                            value={selectedRow ? `${gpuCount}× ${selectedRow.displayName}` : "—"}
                        />
                        <DetailRow label="Mode" value={interruptible ? "Spot" : "On-demand"} />
                        <DetailRow label="Image" value={effectiveImage || "—"} mono truncate />
                        <DetailRow
                            label="Disk"
                            value={`${containerDiskGb} GB${volumeGb > 0 ? ` + ${volumeGb} GB vol` : ""}`}
                        />
                        {selectedVolume && (
                            <DetailRow
                                label="Net vol"
                                value={`${selectedVolume.name} · ${selectedVolume.dataCenterId}`}
                                mono
                                truncate
                            />
                        )}
                        {selectedRow && (
                            <DetailRow
                                label="Stock"
                                value={stockMeta(selectedRow.stockStatus).label}
                            />
                        )}
                    </div>

                    {/* Deploy button */}
                    <button
                        type="button"
                        onClick={handleLaunch}
                        disabled={isLoading}
                        className="mt-5 flex w-full items-center justify-center gap-2 px-5 py-3.5 text-[13.5px] font-semibold transition-all disabled:cursor-not-allowed disabled:bg-[#111216] disabled:text-white/30"
                        style={
                            !isLoading
                                ? {
                                      background: ACCENT,
                                      color: "#001930",
                                      boxShadow: "0 8px 20px rgba(0,149,255,0.18)",
                                  }
                                : {}
                        }
                        onMouseEnter={(e) => !isLoading && (e.currentTarget.style.background = ACCENT_BRIGHT)}
                        onMouseLeave={(e) => !isLoading && (e.currentTarget.style.background = ACCENT)}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Deploying…
                            </>
                        ) : (
                            <>
                                Launch
                                <span aria-hidden>→</span>
                            </>
                        )}
                    </button>

                    <Link
                        href="/dashboard/services/gpu"
                        className="mt-3 block text-center text-[12px] text-white/35 hover:text-white/65"
                    >
                        Cancel
                    </Link>
                </aside>
            </div>
        </div>
    );
}

// ─── Subcomponents ─────────────────────────────────────────────────────

function SectionTitle({
    index,
    title,
    subtitle,
    count,
}: {
    index: string;
    title: string;
    subtitle?: string;
    count?: string;
}) {
    return (
        <div className="mt-10 mb-3">
            <div className="flex items-center gap-3">
                <span className={`${MONO} text-[10.5px] uppercase tracking-[0.16em] text-white/35`}>
                    {index} /
                </span>
                <h2 style={SERIF_STYLE} className="text-[22px] leading-tight tracking-[-0.015em] text-white font-semibold">
                    {title}
                </h2>
                {count && (
                    <span className={`${MONO} ml-auto text-[10.5px] uppercase tracking-[0.14em] text-white/40`}>
                        {count}
                    </span>
                )}
            </div>
            {subtitle && (
                <p className="mt-1.5 max-w-2xl text-[12.5px] text-white/45">{subtitle}</p>
            )}
        </div>
    );
}

function StepCell({
    num,
    slot,
    label,
    hint,
    active,
    complete,
    divider,
}: {
    num: string;
    slot: string;
    label: string;
    hint: string;
    active?: boolean;
    complete?: boolean;
    divider?: boolean;
}) {
    return (
        <div
            className={`flex flex-col gap-1 px-4 first:pl-0 ${divider ? "sm:border-r sm:border-white/[0.06]" : ""}`}
        >
            <div className={`${MONO} flex items-center gap-1.5 text-[10.5px] tracking-[0.05em]`}>
                <span
                    style={{
                        color: complete ? "#4ade80" : active ? ACCENT : "rgba(255,255,255,0.35)",
                    }}
                >
                    {complete ? "✓" : num} / {slot}
                </span>
            </div>
            <div
                className="text-[13px]"
                style={{ color: complete || active ? "#ffffff" : "rgba(255,255,255,0.55)", fontWeight: active || complete ? 500 : 450 }}
            >
                {label}
            </div>
            <div className={`${MONO} text-[10.5px] text-white/35 truncate`}>
                {hint}
            </div>
        </div>
    );
}

function FilterChip({
    active,
    onClick,
    count,
    children,
    dot,
}: {
    active?: boolean;
    onClick: () => void;
    count: number;
    children: React.ReactNode;
    dot?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="inline-flex items-center gap-2 px-2.5 py-1.5 text-[12px] transition-colors"
            style={
                active
                    ? { background: "#ededee", color: "#08090b", fontWeight: 500 }
                    : { color: "rgba(255,255,255,0.65)" }
            }
            onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
            }}
            onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = "transparent";
            }}
        >
            {dot && (
                <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: dot }}
                />
            )}
            <span>{children}</span>
            <span
                className={MONO}
                style={{
                    fontSize: "10.5px",
                    color: active ? "rgba(8,9,11,0.55)" : "rgba(255,255,255,0.35)",
                }}
            >
                {count}
            </span>
        </button>
    );
}

function GpuCard({
    row,
    selected,
    onSelect,
}: {
    row: InventoryRowClient;
    selected: boolean;
    onSelect: () => void;
}) {
    const stock = stockMeta(row.stockStatus);
    const isOut = row.stockStatus === "none";
    const tier = tierLabel(row.displayName);
    const arch = archLabel(row.displayName);
    const vendor = vendorLabel(row.displayName);
    const max =
        row.availableCounts.length > 0
            ? Math.max(...row.availableCounts)
            : isOut
              ? 0
              : 1;

    return (
        <button
            type="button"
            onClick={onSelect}
            disabled={isOut}
            className="group relative flex min-h-[158px] flex-col overflow-hidden border p-4 text-left transition-all"
            style={
                selected
                    ? {
                          background: "#1a1d23",
                          borderColor: ACCENT,
                          boxShadow: `0 0 0 1px ${ACCENT}, 0 8px 32px rgba(0,149,255,0.07)`,
                      }
                    : isOut
                      ? { background: "#111216", borderColor: "rgba(255,255,255,0.06)", opacity: 0.4, cursor: "not-allowed" }
                      : { background: "#111216", borderColor: "rgba(255,255,255,0.06)" }
            }
            onMouseEnter={(e) => {
                if (selected || isOut) return;
                e.currentTarget.style.background = "#16181d";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
                if (selected || isOut) return;
                e.currentTarget.style.background = "#111216";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                e.currentTarget.style.transform = "none";
            }}
        >
            {selected && (
                <span
                    className="absolute left-0 right-0 top-0 h-px"
                    style={{
                        background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`,
                    }}
                />
            )}

            {/* Top — name + arch + vram pill */}
            <div className="mb-1 flex items-start justify-between gap-2.5">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <NvidiaLogo width={18} height={13} className="shrink-0 opacity-95" />
                        <h3 className="text-[14.5px] font-medium tracking-[-0.015em] text-white">
                            {row.displayName}
                        </h3>
                    </div>
                    <div className={`${MONO} mt-0.5 flex items-center gap-1.5 text-[10.5px] text-white/35`}>
                        <span className="text-white/55">{vendor}</span>
                        <span className="opacity-40">·</span>
                        <span>{arch}</span>
                    </div>
                </div>
                <span
                    className={`${MONO} shrink-0 border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 text-[10.5px] font-medium text-white/65`}
                >
                    {row.memoryGb} GB
                </span>
            </div>

            {/* Mid — price + sparkline */}
            <div className="mt-3 mb-3 flex items-baseline justify-between">
                <div style={SERIF_STYLE} className="flex items-baseline gap-0.5 text-[28px] leading-none tracking-[-0.025em] text-white font-bold tabular-nums">
                    <span className="text-[16px] text-white/55 font-medium">$</span>
                    {row.onDemandPerHr !== null ? row.onDemandPerHr.toFixed(2) : "—"}
                    <span className={`${MONO} ml-1 text-[9.5px] tracking-[0.02em] text-white/35 font-normal`}>
                        /GPU·hr
                    </span>
                </div>
                <Sparkline color={stock.color} />
            </div>

            {/* Bottom — stock dot + tier + max */}
            <div className="mt-auto flex items-center justify-between gap-2 border-t border-dashed border-white/[0.06] pt-3">
                <div className={`${MONO} flex items-center gap-2 text-[11px] text-white/65`}>
                    <span className="relative">
                        <span className={`block h-1.5 w-1.5 rounded-full ${stock.dotClass}`} />
                        {!isOut && (
                            <span
                                className="pointer-events-none absolute -inset-[3.5px] rounded-full border opacity-30"
                                style={{ borderColor: stock.color, animation: "deploy-pulse 2.4s infinite" }}
                            />
                        )}
                    </span>
                    {stock.label}
                </div>
                <div className={`${MONO} flex items-center gap-2 text-[9.5px] uppercase tracking-[0.08em] text-white/35`}>
                    {!isOut && max > 0 && (
                        <span className="text-white/55">
                            up to {max}×
                        </span>
                    )}
                    <span>{tier}</span>
                </div>
            </div>

            {/* Pulse keyframes scoped via inline style tag */}
            <style>{`
                @keyframes deploy-pulse {
                    0%, 100% { opacity: 0.35; transform: scale(1); }
                    50% { opacity: 0; transform: scale(1.6); }
                }
            `}</style>
        </button>
    );
}

function Sparkline({ color }: { color: string }) {
    // Deterministic-ish pseudo-random sparkline so the grid doesn't shimmer
    // on every re-render. Purely decorative — RunPod doesn't expose price
    // history on the inventory endpoint.
    const points = [16, 12, 14, 9, 11, 7, 9, 12, 8];
    const path = points
        .map((p, i) => `${(i * 60) / (points.length - 1)},${p}`)
        .join(" ");
    return (
        <svg width="60" height="22" viewBox="0 0 60 22" className="opacity-70 shrink-0">
            <polyline fill="none" stroke={color} strokeWidth="1.2" points={path} />
        </svg>
    );
}

function DetailRow({
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
        <div className="flex items-center justify-between gap-3 border-b border-dashed border-white/[0.06] py-2.5 last:border-b-0">
            <span className={`${MONO} shrink-0 text-[10.5px] uppercase tracking-[0.04em] text-white/45`}>
                {label}
            </span>
            <span
                className={`text-right text-[12px] text-white ${mono ? MONO : ""} ${
                    truncate ? "max-w-[62%] truncate" : ""
                }`}
            >
                {value}
            </span>
        </div>
    );
}

function DiskField({
    label,
    hint,
    value,
    min,
    max,
    onChange,
}: {
    label: string;
    hint: string;
    value: number;
    min: number;
    max: number;
    onChange: (n: number) => void;
}) {
    const pct = Math.min(100, Math.max(0, ((value - min) / Math.max(1, max - min)) * 100));
    return (
        <div className="border border-white/[0.06] bg-[#0d0e11] p-3.5">
            <div className="flex items-baseline justify-between gap-2 mb-2">
                <span className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/55`}>
                    {label}
                </span>
                <div className="flex items-baseline gap-1">
                    <span style={SERIF_STYLE} className="text-[22px] leading-none text-white font-bold tabular-nums">
                        {value}
                    </span>
                    <span className={`${MONO} text-[10.5px] text-white/40`}>GB</span>
                </div>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={10}
                value={value}
                onChange={(e) => onChange(parseInt(e.target.value, 10))}
                className="block w-full appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-[3px] [&::-webkit-slider-runnable-track]:bg-white/[0.08] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-[12px] [&::-webkit-slider-thumb]:w-[12px] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:-mt-[4.5px] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white [&::-moz-range-track]:h-[3px] [&::-moz-range-track]:bg-white/[0.08] [&::-moz-range-thumb]:h-[12px] [&::-moz-range-thumb]:w-[12px] [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0"
                style={{
                    background: `linear-gradient(to right, ${ACCENT} 0%, ${ACCENT} ${pct}%, rgba(255,255,255,0.08) ${pct}%, rgba(255,255,255,0.08) 100%)`,
                    height: "3px",
                }}
            />
            <div className="mt-2 flex items-center justify-between">
                <span className={`${MONO} text-[10px] text-white/35`}>{hint}</span>
                <span className={`${MONO} text-[10px] text-white/30 tabular-nums`}>
                    {min} – {max} GB
                </span>
            </div>
        </div>
    );
}

type SortMode = "price-desc" | "price-asc" | "vram-desc" | "vram-asc" | "name";

function SortControl({
    mode,
    setMode,
}: {
    mode: SortMode;
    setMode: (m: SortMode) => void;
}) {
    const options: Array<{ value: SortMode; label: string }> = [
        { value: "price-desc", label: "Price ↓" },
        { value: "price-asc",  label: "Price ↑" },
        { value: "vram-desc",  label: "VRAM ↓" },
        { value: "vram-asc",   label: "VRAM ↑" },
        { value: "name",       label: "Name A–Z" },
    ];
    const current = options.find((o) => o.value === mode) ?? options[0];

    return (
        <div className="relative">
            <select
                value={mode}
                onChange={(e) => setMode(e.target.value as SortMode)}
                className={`${MONO} appearance-none cursor-pointer border border-white/[0.06] bg-[#0d0e11] pl-7 pr-7 py-1.5 text-[11px] uppercase tracking-[0.12em] text-white/70 hover:text-white outline-none focus:border-white/20`}
                aria-label="Sort"
            >
                {options.map((o) => (
                    <option key={o.value} value={o.value} className="bg-[#111216] text-white">
                        {o.label}
                    </option>
                ))}
            </select>
            <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-white/40"
                aria-hidden
            >
                <path d="M3 6h18M6 12h12M10 18h4" />
            </svg>
            <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-white/40"
                aria-hidden
            >
                <polyline points="6 9 12 15 18 9" />
            </svg>
            {/* Hidden label only used to size the select with the current option visible */}
            <span className="sr-only">{current.label}</span>
        </div>
    );
}

function ErrorMsg({ children }: { children: React.ReactNode }) {
    return (
        <p
            data-deploy-error="true"
            className={`${MONO} mt-2 flex items-center gap-1.5 text-[11.5px] text-red-400`}
        >
            <AlertTriangle className="h-3 w-3 shrink-0" />
            {children}
        </p>
    );
}

function AuthDot({ ok }: { ok: boolean }) {
    return (
        <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{
                background: ok ? "#4ade80" : "rgba(255,255,255,0.15)",
                boxShadow: ok ? "0 0 8px rgba(74,222,128,0.5)" : "none",
            }}
        />
    );
}


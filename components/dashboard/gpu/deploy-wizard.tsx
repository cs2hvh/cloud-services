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
    Check,
    ChevronDown,
    ChevronRight,
    Loader2,
} from "lucide-react";
import { generateIdempotencyKey } from "@/lib/idempotency";
import { GPU_MARKUP_PCT, storagePerHour } from "@/lib/services/runpod/helpers";

import { SoftwareIcon } from "./software-icons";
import type { InventoryRowClient, StockStatus } from "./types";

// ─── Design tokens (scoped to the deploy page) ─────────────────────────

// Display font applied via inline style so Tailwind's arbitrary-value
// parser can't mangle the comma-separated fallback chain.
const SERIF_STYLE: React.CSSProperties = {
    fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_DIM = "rgba(0,149,255,0.12)";
const BORDER_ACCENT = "rgba(0,149,255,0.4)";

// Vendor colours, brightened for a dark background.
//
// These were NVIDIA's #76B900 and AMD's #ED4C3A — the brand values, taken
// from brand sheets that assume a white page. On #0f1115 that green is a dark
// olive: it reads as dim rather than as a colour, and it is the model name,
// the single most-read string in a 48-row list. Raising the lightness keeps
// each vendor recognisable while making the name legible at 13px, which is
// the job it actually has here.
const NVIDIA_GREEN = "#9BE016";
const AMD_RED = "#FF6B5A";

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
    /** Catalog hints. `password_auth: "unsupported"` marks an image whose
     *  entrypoint ignores ROOT_PASSWORD, so a password alone locks you out. */
    envHints?: Record<string, string> | null;
};

interface ApiTemplate {
    id: string;
    name: string;
    imageName: string;
    description: string | null;
    ports?: string[];
    defaultContainerDiskGb?: number;
    envHints?: Record<string, string> | null;
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

    // Ada-suffixed cards are tested FIRST. "RTX 5000 Ada" is Ada Lovelace, but
    // a loose /rtx 50/ test claims it for Blackwell — which it did until this
    // was rewritten, putting a 2022 workstation card in the newest tier.
    if (/\bada\b/.test(n)) return "Ada Lovelace";

    if (/(b100|b200|b300|gb200)/.test(n)) return "Blackwell";
    // RTX PRO 4000/4500/5000/6000 are Blackwell. Matched on "pro <n>" rather
    // than "rtx pro <n>" because the MIG slices arrive named "PRO 6000 MIG
    // 24GB", with no RTX prefix — those previously fell through to the
    // "NVIDIA" catch-all and showed no architecture at all.
    if (/\bpro\s?(4000|4500|5000|6000)\b/.test(n)) return "Blackwell";
    // Consumer Blackwell is 5060–5090. Bounded so it cannot swallow the
    // "5000"-numbered workstation cards of earlier generations.
    if (/rtx\s?50[6-9]0/.test(n)) return "Blackwell";

    if (/(h100|h200|gh200)/.test(n)) return "Hopper";
    if (/(mi300|mi325)/.test(n)) return "CDNA 3";
    if (/(a100|a40|a6000|a5000|a4500|a4000|a2000|rtx 30)/.test(n)) return "Ampere";
    if (/(l40|rtx 40)/.test(n)) return "Ada Lovelace";
    if (/\bl4\b/.test(n)) return "Ada Lovelace";   // after l40, or it steals it
    if (/v100/.test(n)) return "Volta";
    if (/\bt4\b/.test(n)) return "Turing";
    return "NVIDIA";
}

/**
 * Which generation bucket a card belongs to.
 *
 * The catalogue is 48 GPUs deep and spans seven architectures, which is the
 * root of the "these cards are confusing" problem: a B300 and a 2019 Tesla
 * V100 sat side by side, distinguished only by a small architecture caption
 * most buyers do not read as a date.
 *
 * Three buckets rather than seven, because the question a buyer is actually
 * asking is "is this current, or am I looking at old stock?" — not "which
 * microarchitecture is this". MI300X sits with Hopper: it is AMD's 2023
 * flagship and a contemporary of the H100, so grouping it by release era is
 * more honest than by vendor.
 */
const GEN_LATEST = 0, GEN_PREVIOUS = 1, GEN_EARLIER = 2;

const GENERATIONS = [
    {
        label: "Latest generation",
        blurb: "Blackwell — newest silicon, highest throughput per GPU",
    },
    {
        label: "Previous generation",
        blurb: "Hopper and MI300X — proven, and usually better value per hour",
    },
    {
        label: "Earlier generations",
        blurb: "Ada, Ampere and older — lowest cost for light or bursty work",
    },
] as const;

function generationIndex(name: string): 0 | 1 | 2 {
    switch (archLabel(name)) {
        case "Blackwell":
            return GEN_LATEST;
        case "Hopper":
        case "CDNA 3":
            return GEN_PREVIOUS;
        default:
            return GEN_EARLIER;
    }
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
    // Spot/interruptible capacity is not sold. The column still exists on
    // gpu_pods and gpu_pricing, and pod creation still takes the flag, so this
    // is a product decision expressed at the UI rather than a schema change.
    const interruptible = false;

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
                              envHints: t.envHints ?? null,
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
        // Drop any password typed against a previous template that supported
        // one. The field is hidden for key-only images, so without this a
        // stale value would still be encrypted and shipped as ROOT_PASSWORD to
        // an image that ignores it — invisible in the UI, and misreported as
        // "Root pwd set" in the summary.
        if (selectedTemplate.envHints?.password_auth !== "supported") {
            setRootPassword("");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [templateId]);

    const selectedVolume = volumeOptions.find(
        (v) => String(v.id) === networkVolumeId
    );

    const observedRate = selectedRow?.onDemandPerHr;
    // GPU compute (observed × markup × count) + local-disk storage. Mirrors
    // the billed rate in pod-lifecycle-operations so the quote matches.
    const gpuHourly =
        observedRate !== null && observedRate !== undefined
            ? Math.round(observedRate * GPU_MARKUP_PCT * gpuCount * 10000) / 10000
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
    // Does the SELECTED image actually honour a root password?
    //
    // ROOT_PASSWORD is our own convention, implemented in the entrypoint of
    // our ghcr.io images (infra/runpod/os-images/_shared/start.sh runs chpasswd
    // and enables PasswordAuthentication). Third-party images — the provider's
    // official ones, or anything a user types under "custom" — ignore the
    // variable entirely and ship with password login disabled.
    //
    // Treating a password as sufficient for those produced the worst possible
    // outcome: the deploy SUCCEEDS, the pod starts billing, and the customer
    // discovers at `ssh` time that they have no way in. Fail-safe: anything
    // not explicitly marked "supported" requires a key.
    const passwordAuthSupported =
        selectedTemplate?.envHints?.password_auth === "supported";
    const hasAuth =
        publicKey.trim().length > 0 ||
        (passwordAuthSupported && rootPassword.length >= 12);
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
    if (!hasAuth)
        issues.push(
            passwordAuthSupported
                ? "SSH key or 12+ character root password"
                : "SSH public key (this image has no password login)"
        );

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
    const authError =
        attempted && !hasAuth
            ? passwordAuthSupported
                ? "Add an SSH key or a root password (12+ characters)"
                : "This image only supports key-based SSH — add a public key"
            : null;

    // Launch click: if anything's missing, reveal inline errors + jump to the
    // first one instead of silently doing nothing.
    function handleLaunch() {
        if (issues.length > 0) {
            setAttempted(true);
            toast.error("Complete the  fields");
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
                <div className="px-6 py-5 sm:px-10 sm:py-6 max-w-[1280px]">
                    {/* Page title.
                        Was 64px with 8/7 spacing around a four-cell stepper,
                        which pushed the first GPU below the fold on a laptop —
                        on a page whose entire job is choosing from that list.
                        The title is orientation, not content; it gets the room
                        orientation needs and no more. */}
                    <h1 className="text-[30px] sm:text-[34px] leading-[1.05] tracking-[-0.02em] text-white font-semibold">
                        Launch{" "}
                        <span style={SERIF_STYLE} className="text-[#0095FF] font-normal">
                            GPU
                        </span>
                    </h1>

                    {/* Stepper */}
                    <div className="mt-4 mb-5 grid grid-cols-2 sm:grid-cols-4 border-y border-white/[0.07] py-3">
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
                                {/*
                                  Grouped by generation rather than one flat
                                  grid. A newest-silicon B300 and a 2019 V100
                                  previously sat adjacent with nothing but a
                                  small architecture caption between them.

                                  Headings are only rendered for groups that
                                  actually have cards, so a narrow stock filter
                                  or search does not leave empty section
                                  titles behind. When a filter collapses the
                                  result to a single group the heading still
                                  shows — it is the thing telling you WHICH
                                  generation survived the filter.
                                */}
                                {inStock.length > 0 &&
                                    GENERATIONS
                                        .map((gen, genIdx) => ({
                                            gen,
                                            genIdx,
                                            cards: inStock.filter(
                                                (c) => generationIndex(c.row.displayName) === genIdx
                                            ),
                                        }))
                                        // Drop empties BEFORE indexing, so spacing keys off
                                        // position among rendered groups rather than position
                                        // in GENERATIONS — otherwise a filter that removes the
                                        // first group leaves a stray gap above the second.
                                        .filter((g) => g.cards.length > 0)
                                        .map(({ gen, genIdx, cards }, renderedIdx) => {
                                        return (
                                            <div key={gen.label} className={renderedIdx > 0 ? "mt-7" : ""}>
                                                <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-white/[0.06] pb-2">
                                                    <div className="flex items-baseline gap-2.5">
                                                        <h3
                                                            className="text-[13px] font-semibold tracking-[-0.01em] text-white"
                                                        >
                                                            {gen.label}
                                                        </h3>
                                                        {genIdx === GEN_LATEST && (
                                                            <span
                                                                className={`${MONO} border px-1.5 py-px text-[9.5px] uppercase tracking-[0.12em]`}
                                                                style={{ borderColor: ACCENT, color: ACCENT }}
                                                            >
                                                                New
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className={`${MONO} shrink-0 text-[10.5px] text-white/35`}>
                                                        {cards.length}
                                                    </span>
                                                </div>
                                                <p className="mb-3 text-[11.5px] leading-relaxed text-white/40">
                                                    {gen.blurb}
                                                </p>
                                                <GpuListHead />
                                                <div className="border border-white/[0.06] bg-[#0f1115]">
                                                    {cards.map((c) => (
                                                        <GpuRow
                                                            key={c.row.gpuCatalogId}
                                                            row={c.row}
                                                            selected={gpuCatalogId === c.row.gpuCatalogId}
                                                            onSelect={() => setGpuCatalogId(c.row.gpuCatalogId)}
                                                            gpuCount={gpuCount}
                                                            onCount={setGpuCount}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}

                                {outOfStock.length > 0 && (
                                    <>
                                        {!collapseOOS && (
                                            <div className={`border border-white/[0.06] bg-[#0f1115] ${inStock.length > 0 ? "mt-4" : ""}`}>
                                                {outOfStock.map((c) => (
                                                    <GpuRow
                                                        key={c.row.gpuCatalogId}
                                                        row={c.row}
                                                        selected={false}
                                                        onSelect={() => {}}
                                                        gpuCount={gpuCount}
                                                        onCount={setGpuCount}
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
                                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center">
                                                <SoftwareIcon name={t.name} image={t.image} size={26} />
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
                            {/* The "or root password" alternative is hidden, not
                                disabled, when the image cannot honour it — offering
                                a choice that does not exist is what let people
                                deploy pods they could not log into. */}
                            {passwordAuthSupported && (
                                <>
                                    <span className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-white/30 mx-1`}>or</span>
                                    <AuthDot ok={rootPassword.length >= 12} />
                                    <span className={`text-[12px] ${rootPassword.length >= 12 ? "text-white" : "text-white/45"}`}>
                                        Root password
                                        <span className={`${MONO} ml-1 text-[10px] text-white/35`}>(12+)</span>
                                    </span>
                                </>
                            )}
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

                        {passwordAuthSupported && (
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
                        )}
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
                {/*
                  Summary as a CARD, matching the VM deploy panel.

                  This was a bare full-height column with a 68px price sitting
                  on the page background — a different shape from every other
                  deploy surface in the product, so the two pages did not read
                  as the same wizard. Same card, same header, same status pill,
                  same row rhythm, same gradient button as
                  components/dashboard/compute/vps/linode.tsx.
                */}
                <aside className="px-6 py-6 sm:px-7 lg:sticky lg:top-6 self-start">
                    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
                        <header className="flex items-start justify-between gap-2 border-b border-white/[0.06] px-5 py-4">
                            <div>
                                <p className={`${MONO} mb-1 text-[10px] uppercase tracking-[0.14em] text-white/40`}>
                                    Configuration
                                </p>
                                <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-white">
                                    Your pod
                                </h3>
                            </div>
                            <span
                                className={`${MONO} inline-flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.14em] font-semibold`}
                                style={{ color: canSubmit ? "#4ade80" : ACCENT }}
                            >
                                <span
                                    className="h-1.5 w-1.5 rounded-full"
                                    style={{
                                        background: canSubmit ? "#4ade80" : ACCENT,
                                        boxShadow: `0 0 6px ${canSubmit ? "#4ade80" : ACCENT}`,
                                    }}
                                />
                                {canSubmit ? "Ready" : "Pending"}
                            </span>
                        </header>

                        {/* Detail rows */}
                        <div className="px-5 py-3">
                            <DetailRow label="Name" value={name.trim() || "—"} mono />
                            <DetailRow
                                label="GPU"
                                value={selectedRow ? `${gpuCount}× ${selectedRow.displayName}` : "—"}
                            />
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

                        {/* Price */}
                        <div className="border-t border-white/[0.06] px-5 py-4">
                            <div className="mb-1 flex items-baseline justify-between">
                                <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40`}>
                                    Estimated
                                </span>
                                {/* Daily as well as monthly: a GPU is rented for
                                    an afternoon far more often than for a month,
                                    so the day figure is the one being decided
                                    against. */}
                                {dailyCost !== null && monthlyCost !== null && (
                                    <span className={`${MONO} text-[10.5px] tabular-nums text-white/45`}>
                                        ${dailyCost.toFixed(2)} / day · ${monthlyCost.toFixed(0)} / mo
                                    </span>
                                )}
                            </div>
                            <div className="flex items-baseline gap-1">
                                {estimatedHourly === null ? (
                                    <span style={SERIF_STYLE} className="text-[28px] font-bold leading-none text-white/35">
                                        —
                                    </span>
                                ) : (
                                    <>
                                        <span style={SERIF_STYLE} className="text-[18px] font-medium leading-none text-white/50">
                                            $
                                        </span>
                                        <span
                                            style={SERIF_STYLE}
                                            className="text-[38px] font-bold leading-none tracking-[-0.03em] tabular-nums text-white"
                                        >
                                            {estimatedHourly.toFixed(2)}
                                        </span>
                                        <span className={`${MONO} ml-1 text-[11px] text-white/40`}>/ hr</span>
                                    </>
                                )}
                            </div>

                            {/* Compute vs storage, so changing disk visibly changes the price. */}
                            {estimatedHourly !== null && (
                                <p className={`${MONO} mt-2 text-[10px] tabular-nums text-white/35`}>
                                    Compute ${gpuHourly?.toFixed(3)}/hr · Storage $
                                    {storageHourly.toFixed(3)}/hr ({containerDiskGb + volumeGb} GB)
                                </p>
                            )}

                            <button
                                type="button"
                                onClick={handleLaunch}
                                disabled={isLoading}
                                className={`${MONO} mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[5px] text-[11.5px] font-semibold uppercase tracking-[0.14em] transition-all disabled:cursor-not-allowed`}
                                style={{
                                    background: !isLoading
                                        ? `linear-gradient(135deg, ${ACCENT}, #0066B3)`
                                        : "#1a1d24",
                                    color: !isLoading ? "#ffffff" : "rgba(255,255,255,0.35)",
                                    boxShadow: !isLoading
                                        ? "0 8px 20px rgba(0,149,255,0.18), inset 0 1px 0 rgba(255,255,255,0.15)"
                                        : "none",
                                }}
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
                                className={`${MONO} mt-3 block text-center text-[10.5px] uppercase tracking-[0.12em] text-white/35 hover:text-white/65`}
                            >
                                Cancel
                            </Link>
                        </div>
                    </div>
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

/**
 * One GPU as a LIST ROW, not a card.
 *
 * The catalogue is 48 GPUs. As cards four across that is twelve rows of
 * boxes, and comparing two of them means comparing two paragraphs in
 * different places on screen. The thing a buyer actually does here is scan one
 * number down a column — price, or VRAM — and a card grid makes that the one
 * thing you cannot do.
 *
 * So: fixed columns, aligned values, one line per GPU. The specs are the same
 * ones the card carried; they are just in the same place on every row now.
 */
const GPU_GRID =
    "grid-cols-[18px_minmax(0,1fr)_88px_70px_108px_84px] gap-3";

function GpuListHead() {
    return (
        <div
            className={`${MONO} hidden md:grid ${GPU_GRID} items-center px-3 pb-1.5 text-[9.5px] uppercase tracking-[0.14em] text-white/30`}
        >
            <span />
            <span>Model</span>
            <span>Arch</span>
            <span>VRAM</span>
            <span>Capacity</span>
            <span className="text-right">$ / GPU-hr</span>
        </div>
    );
}

function GpuRow({
    row,
    selected,
    onSelect,
    gpuCount,
    onCount,
}: {
    row: InventoryRowClient;
    selected: boolean;
    onSelect: () => void;
    gpuCount: number;
    onCount: (n: number) => void;
}) {
    const stock = stockMeta(row.stockStatus);
    const isOut = row.stockStatus === "none";
    const tier = tierLabel(row.displayName);
    const arch = archLabel(row.displayName);
    const vendor = vendorLabel(row.displayName);
    const counts =
        row.availableCounts.length > 0
            ? [...row.availableCounts].sort((a, b) => a - b)
            : [];
    const max = counts.length > 0 ? Math.max(...counts) : isOut ? 0 : 1;

    // Capacity as three segments. A bar reads at a glance in a way the words
    // alone do not when the same four phrases repeat down 40-odd rows — but the
    // words stay, because "two of three segments" is not a unit anybody thinks
    // in.
    const filled = isOut ? 0 : row.stockStatus === "high" ? 3 : row.stockStatus === "low" ? 1 : 2;

    return (
        <div
            className={`border-b border-white/[0.04] last:border-b-0 ${
                selected ? "bg-[#15181f]" : ""
            }`}
            style={selected ? { boxShadow: `inset 2px 0 0 ${ACCENT}` } : undefined}
        >
            <button
                type="button"
                onClick={onSelect}
                disabled={isOut}
                className={`group grid w-full ${GPU_GRID} items-center px-3 py-2.5 text-left transition-colors ${
                    isOut
                        ? "cursor-not-allowed opacity-40"
                        : selected
                          ? ""
                          : "hover:bg-white/[0.025]"
                }`}
            >
                {/* Selection box */}
                <span
                    className="flex h-3.5 w-3.5 items-center justify-center border transition-colors"
                    style={{
                        borderColor: selected ? ACCENT : "rgba(255,255,255,0.18)",
                        background: selected ? ACCENT : "transparent",
                    }}
                >
                    {selected && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                </span>

                {/* Model — name, tier, vendor, max count */}
                <span className="min-w-0">
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span
                            className="truncate text-[13px] font-semibold tracking-[-0.01em]"
                            style={{ color: vendor === "AMD" ? AMD_RED : NVIDIA_GREEN }}
                        >
                            {row.displayName}
                        </span>
                        <span
                            className={`${MONO} shrink-0 text-[9px] uppercase tracking-[0.12em] text-white/30`}
                        >
                            {tier}
                        </span>
                    </span>
                    <span className={`${MONO} mt-0.5 flex items-center gap-1.5 text-[10px] text-white/35`}>
                        <span>{vendor.toLowerCase()}</span>
                        {!isOut && max > 0 && (
                            <>
                                <span className="opacity-40">·</span>
                                <span>up to {max}×</span>
                            </>
                        )}
                    </span>
                </span>

                {/* Arch */}
                <span className={`${MONO} truncate text-[11px] text-white/60`}>{arch}</span>

                {/* VRAM */}
                <span className={`${MONO} text-[11.5px] tabular-nums text-white/75`}>
                    {row.memoryGb} GB
                </span>

                {/* Capacity */}
                <span className="flex items-center gap-2">
                    <span className="flex shrink-0 gap-[2px]" aria-hidden>
                        {[0, 1, 2].map((i) => (
                            <span
                                key={i}
                                className="block h-[3px] w-[7px]"
                                style={{
                                    background: i < filled ? stock.color : "rgba(255,255,255,0.12)",
                                }}
                            />
                        ))}
                    </span>
                    <span className={`${MONO} truncate text-[10px] leading-tight text-white/45`}>
                        {stock.label}
                    </span>
                </span>

                {/* Price */}
                <span
                    className={`${MONO} text-right text-[13px] font-semibold tabular-nums ${
                        isOut ? "text-white/30" : "text-white"
                    }`}
                >
                    {row.onDemandPerHr !== null
                        ? (row.onDemandPerHr * GPU_MARKUP_PCT).toFixed(2)
                        : "—"}
                </span>
            </button>

            {/*
              How many of this card — inside the row that names it.

              This was a separate "GPU count" block below the whole list, so
              picking 8× meant choosing a card, scrolling past forty others, and
              setting a number next to nothing. The count only means anything in
              the context of the GPU it counts, and the per-row maximum differs:
              8× is offered for an H100 and not for a B200. Here the options ARE
              that row's availableCounts, so an impossible choice cannot be
              presented in the first place.
            */}
            {selected && !isOut && counts.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 px-3 pb-3 pl-[42px]">
                    <span className={`${MONO} text-[9.5px] uppercase tracking-[0.14em] text-white/40`}>
                        How many
                    </span>
                    {counts.map((n) => {
                        const on = gpuCount === n;
                        return (
                            <button
                                key={n}
                                type="button"
                                onClick={() => onCount(n)}
                                className={`${MONO} flex h-7 min-w-[42px] items-center justify-center border px-2 text-[11.5px] font-semibold tabular-nums transition-colors`}
                                style={
                                    on
                                        ? { borderColor: BORDER_ACCENT, background: ACCENT_DIM, color: "#fff" }
                                        : { borderColor: "rgba(255,255,255,0.08)", background: "#111216", color: "rgba(255,255,255,0.7)" }
                                }
                            >
                                {n}×
                            </button>
                        );
                    })}
                    {row.onDemandPerHr !== null && gpuCount > 1 && (
                        <span className={`${MONO} ml-1 text-[10.5px] tabular-nums text-white/45`}>
                            = ${(row.onDemandPerHr * GPU_MARKUP_PCT * gpuCount).toFixed(2)}/hr
                        </span>
                    )}
                </div>
            )}
        </div>
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
    const [raw, setRaw] = useState(String(value));
    useEffect(() => {
        setRaw(String(value));
    }, [value]);
    const commit = (s: string) => {
        const n = parseInt(s, 10);
        const clamped = Number.isNaN(n) ? min : Math.min(max, Math.max(min, n));
        onChange(clamped);
        setRaw(String(clamped));
    };
    return (
        <div className="border border-white/[0.06] bg-[#0d0e11] p-3.5">
            <div className="flex items-baseline justify-between gap-2 mb-2">
                <span className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/55`}>
                    {label}
                </span>
                <div className="flex items-baseline gap-1">
                    <input
                        type="number"
                        min={min}
                        max={max}
                        step={10}
                        value={raw}
                        onChange={(e) => {
                            setRaw(e.target.value);
                            const n = parseInt(e.target.value, 10);
                            if (!Number.isNaN(n) && n >= min && n <= max) onChange(n);
                        }}
                        onBlur={(e) => commit(e.target.value)}
                        style={SERIF_STYLE}
                        className="w-[58px] bg-transparent text-right text-[22px] leading-none text-white font-bold tabular-nums outline-none focus:text-[#0095FF] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
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


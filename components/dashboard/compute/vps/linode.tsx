"use client";

// Linode instance create — editorial single-page form, sibling of the dormant
// Proxmox form (simple.tsx). Numbered sections on the left with live status
// pills, sticky right summary, big Nunito monthly price, gradient brand-blue
// Deploy CTA.
//
// Cloud-Manager parity: Region → OS → Plan (class tabs, per-region prices +
// out-of-stock states) → Details (label) → Security (SSH keys / root pass /
// disk encryption) → Add-ons (backups). Prices arrive from /options with
// markup already applied; the plan table re-prices when the region changes.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    ArrowRight,
    Check,
    ChevronLeft,
    Eye,
    EyeOff,
    KeyRound,
    Loader2,
    Plus,
    X,
} from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { RegionFlag } from "@/components/ui/region-flag";
import { OsImg } from "./os-icons";
import type { LinodeComputeOptions, LinodePlanWire } from "@/lib/services/compute/providers/linode/options";

// ─── Design tokens (shared with simple.tsx) ──────────────────────
const SERIF_STYLE: React.CSSProperties = {
    fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";

const LABEL_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,62}[a-zA-Z0-9]$/;

const PASSWORD_PATTERNS = {
    hasUpperCase: /[A-Z]/,
    hasLowerCase: /[a-z]/,
    hasNumbers: /[0-9]/,
    hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
} as const;
const PASSWORD_MIN_LENGTH = 11; // Linode policy: 11-128 chars

// ─── Plan class tabs ─────────────────────────────────────────────
const CLASS_TABS: Array<{ id: string; label: string; classes: string[]; blurb: string }> = [
    {
        id: "shared",
        label: "Shared CPU",
        classes: ["nanode", "standard"],
        blurb: "Balanced instances on shared cores — the right default for most workloads.",
    },
    {
        id: "dedicated",
        label: "Dedicated CPU",
        classes: ["dedicated"],
        blurb: "Full-duty workloads needing consistent, dedicated physical cores.",
    },
    {
        id: "highmem",
        label: "High Memory",
        classes: ["highmem"],
        blurb: "RAM-heavy instances for in-memory databases and caches.",
    },
    {
        id: "premium",
        label: "Premium CPU",
        classes: ["premium"],
        blurb: "Latest-generation AMD EPYC™ hardware with guaranteed baseline performance.",
    },
];

// Continent grouping for the region dropdown.
const REGION_GROUPS: Array<{ label: string; countries: Set<string> }> = [
    { label: "Americas", countries: new Set(["us", "ca", "br", "mx", "cl", "co", "ar"]) },
    { label: "Europe", countries: new Set(["gb", "uk", "de", "fr", "nl", "se", "es", "it", "pl", "ie", "ch"]) },
    { label: "Asia-Pacific", countries: new Set(["in", "jp", "sg", "au", "id", "hk", "tw", "kr", "my", "nz", "th", "ph"]) },
    { label: "Africa & Middle East", countries: new Set(["za", "ae", "il", "sa", "ng", "ke", "eg"]) },
];

function regionGroupLabel(country: string): string {
    const c = country.toLowerCase();
    for (const g of REGION_GROUPS) if (g.countries.has(c)) return g.label;
    return "Other regions";
}

function planPriceFor(plan: LinodePlanWire, regionId: string) {
    return (regionId && plan.regionOverrides[regionId]) || plan.price;
}

function formatTransfer(gb: number): string {
    if (gb >= 1000) return `${(gb / 1000).toFixed(gb % 1000 === 0 ? 0 : 1)} TB`;
    return `${gb} GB`;
}

function formatNetOut(mbps: number): string {
    if (mbps >= 1000) return `${mbps / 1000} Gbps`;
    return `${mbps} Mbps`;
}

function ramGBLabel(memoryMB: number): string {
    return memoryMB % 1024 === 0 ? `${memoryMB / 1024} GB` : `${(memoryMB / 1024).toFixed(1)} GB`;
}

interface SshKeyEntry {
    id: string;
    label: string;
    fingerprint: string;
}

const LinodeCreate = ({ options }: { options: LinodeComputeOptions }) => {
    // ─── State ──────────────────────────────────────────────────
    const [selectedRegion, setSelectedRegion] = useState("");
    const [selectedImage, setSelectedImage] = useState("");
    const [showOlderImages, setShowOlderImages] = useState(false);
    const [classTab, setClassTab] = useState("shared");
    const [selectedTypeId, setSelectedTypeId] = useState("");
    const [label, setLabel] = useState("");
    const [sshKeys, setSshKeys] = useState<SshKeyEntry[]>(options.sshKeys);
    const [selectedKeyIds, setSelectedKeyIds] = useState<string[]>([]);
    const [keyDialogOpen, setKeyDialogOpen] = useState(false);
    const [rootPass, setRootPass] = useState("");
    const [rootPassConfirm, setRootPassConfirm] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [diskEncryption, setDiskEncryption] = useState(true);
    const [backupsEnabled, setBackupsEnabled] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Stable per-mount idempotency key — retries of the same click can't
    // double-provision.
    const [idempotencyKey] = useState(() =>
        typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    const router = useRouter();

    const regions = options.regions;
    const availability = options.availability;

    // ─── Derived ────────────────────────────────────────────────
    const groupedRegions = useMemo(() => {
        const groups = new Map<string, typeof regions>();
        for (const r of regions) {
            const g = regionGroupLabel(r.country);
            if (!groups.has(g)) groups.set(g, []);
            groups.get(g)!.push(r);
        }
        const order = ["Americas", "Europe", "Asia-Pacific", "Africa & Middle East", "Other regions"];
        return order
            .filter((g) => groups.has(g))
            .map((g) => ({ label: g, regions: groups.get(g)! }));
    }, [regions]);

    const selectedRegionInfo = regions.find((r) => r.id === selectedRegion) ?? null;
    const regionSupportsEncryption = selectedRegionInfo?.diskEncryption ?? false;

    const visibleImages = useMemo(() => {
        const fresh = options.images.filter((i) => !i.deprecated);
        return showOlderImages ? options.images : fresh;
    }, [options.images, showOlderImages]);

    const selectedImageInfo = options.images.find((i) => i.id === selectedImage) ?? null;

    const tabPlans = useMemo(() => {
        const tab = CLASS_TABS.find((t) => t.id === classTab) ?? CLASS_TABS[0];
        const inClass = options.plans.filter((p) => tab.classes.includes(p.class));
        if (!selectedRegion) {
            return inClass.sort((a, b) => a.vcpus - b.vcpus || a.memoryMB - b.memoryMB);
        }
        // Linode-parity: type ids repeat the same size across hardware
        // generations (g6/g7/g8 "Dedicated 4GB"). When a generation simply
        // isn't offered in the selected region, HIDE it if an equivalent-size
        // plan is purchasable — an "Out of stock" chip is reserved for sizes
        // with no available generation at all (a genuine sell-out signal).
        const regionAvail = availability[selectedRegion] ?? {};
        const availableSizes = new Set(
            inClass
                .filter((p) => regionAvail[p.id] !== false)
                .map((p) => `${p.class}:${p.vcpus}:${p.memoryMB}`)
        );
        return inClass
            .filter(
                (p) =>
                    regionAvail[p.id] !== false ||
                    !availableSizes.has(`${p.class}:${p.vcpus}:${p.memoryMB}`)
            )
            .sort((a, b) => a.vcpus - b.vcpus || a.memoryMB - b.memoryMB);
    }, [options.plans, classTab, selectedRegion, availability]);

    const selectedPlan = options.plans.find((p) => p.id === selectedTypeId) ?? null;
    const selectedPlanPrice = selectedPlan ? planPriceFor(selectedPlan, selectedRegion) : null;

    const anyOutOfStock = useMemo(() => {
        if (!selectedRegion) return false;
        return tabPlans.some((p) => availability[selectedRegion]?.[p.id] === false);
    }, [tabPlans, selectedRegion, availability]);

    // ─── Defaults ───────────────────────────────────────────────
    useEffect(() => {
        if (regions.length > 0 && !selectedRegion) setSelectedRegion(regions[0].id);
    }, [regions, selectedRegion]);

    useEffect(() => {
        if (visibleImages.length > 0 && !visibleImages.find((i) => i.id === selectedImage)) {
            const ubuntu = visibleImages.find((i) => /ubuntu/i.test(i.label) && /lts/i.test(i.label));
            setSelectedImage((ubuntu ?? visibleImages[0]).id);
        }
    }, [visibleImages, selectedImage]);

    // Deselect a plan that went out of stock for the chosen region.
    useEffect(() => {
        if (
            selectedTypeId &&
            selectedRegion &&
            availability[selectedRegion]?.[selectedTypeId] === false
        ) {
            setSelectedTypeId("");
        }
    }, [selectedRegion, selectedTypeId, availability]);

    // ─── Validation ─────────────────────────────────────────────
    const labelValid = LABEL_RE.test(label.trim());
    const passwordChecks = {
        length: rootPass.length >= PASSWORD_MIN_LENGTH && rootPass.length <= 128,
        upper: PASSWORD_PATTERNS.hasUpperCase.test(rootPass),
        lower: PASSWORD_PATTERNS.hasLowerCase.test(rootPass),
        number: PASSWORD_PATTERNS.hasNumbers.test(rootPass),
        special: PASSWORD_PATTERNS.hasSpecialChar.test(rootPass),
    };
    const classCount = [
        passwordChecks.upper,
        passwordChecks.lower,
        passwordChecks.number,
        passwordChecks.special,
    ].filter(Boolean).length;
    const passwordValid =
        passwordChecks.length && classCount >= 3 && rootPass === rootPassConfirm;
    const formValid =
        !!selectedRegion &&
        !!selectedImage &&
        !!selectedPlan &&
        labelValid &&
        passwordValid &&
        options.deployEnabled;

    // ─── Submit ─────────────────────────────────────────────────
    const onDeploy = async () => {
        if (!formValid) {
            toast.error("Complete every section before deploying");
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const supabase = createClient();
            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData?.session?.access_token;

            const payload = {
                provider: "linode",
                region: selectedRegion,
                type: selectedPlan!.id,
                image: selectedImage,
                label: label.trim(),
                root_pass: rootPass,
                ssh_key_ids: selectedKeyIds,
                backups_enabled: backupsEnabled,
                disk_encryption: regionSupportsEncryption ? diskEncryption : false,
            };

            const res = await fetch("/api/services/compute/vms/create", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Idempotency-Key": idempotencyKey,
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok || !json.ok) {
                throw new Error(json.error || "Something went wrong while creating your server.");
            }
            toast.success(`Deploying "${label.trim()}"…`);
            router.push("/dashboard/services/compute/vps");
            return;
        } catch (err) {
            const raw = err instanceof Error ? err.message : "";
            const friendly = raw && raw.length < 220 && !raw.includes("fetch") && !raw.includes("ECONNREFUSED");
            const msg = friendly ? raw : "Something went wrong while creating your server.";
            setError(msg);
            toast.error(msg);
        } finally {
            setIsLoading(false);
        }
    };

    // ─── Pricing totals ─────────────────────────────────────────
    const backupsHourly = backupsEnabled ? selectedPlanPrice?.backupsHourlyUSD ?? 0 : 0;
    const backupsMonthly = backupsEnabled ? selectedPlanPrice?.backupsMonthlyUSD ?? 0 : 0;
    const totalHourly = (selectedPlanPrice?.hourlyUSD ?? 0) + backupsHourly;
    const totalMonthly = (selectedPlanPrice?.monthlyUSD ?? 0) + backupsMonthly;

    // ─── Section status pills ───────────────────────────────────
    const regionStatus = selectedRegion ? "done" : "idle";
    const imageStatus = selectedImage ? "done" : "idle";
    const planStatus = selectedPlan ? "done" : selectedRegion ? "active" : "idle";
    const detailsStatus = labelValid ? "done" : label ? "active" : "idle";
    const securityStatus = passwordValid ? "done" : rootPass ? "active" : "idle";

    return (
        <div className="relative min-h-full bg-[#08090b] text-white">
            {/* Background layer */}
            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                <div
                    className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]"
                    style={{ background: "radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)" }}
                />
                <div
                    className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]"
                    style={{ background: "radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)" }}
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

            <div className="relative z-10 px-6 py-7 sm:px-10 sm:py-9 max-w-[1760px] mx-auto">
                {/* Back link */}
                <div className="mb-6">
                    <Link
                        href="/dashboard/services/compute/vps"
                        className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/40 hover:text-white/75 transition-colors`}
                    >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Back to servers
                    </Link>
                </div>

                {/* Hero */}
                <h1 className="text-[34px] sm:text-[40px] leading-[1.05] tracking-[-0.025em] text-white font-semibold mb-2">
                    Launch{" "}
                    <span style={SERIF_STYLE} className="text-[#0095FF] font-normal">
                        server
                    </span>
                </h1>
                <p className={`${MONO} max-w-xl text-[11.5px] text-white/45 leading-relaxed mb-10`}>
                    Pick a region, an image, and a plan — we provision compute,
                    networking, and storage in under a minute. Per-second billing.
                </p>

                {!options.deployEnabled && (
                    <div className="mb-8 border border-amber-500/25 bg-amber-500/[0.06] rounded-[6px] px-4 py-3 text-[12.5px] text-amber-300">
                        New server deployments are temporarily unavailable. Existing
                        servers are unaffected — please check back shortly.
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-10 items-start">
                    {/* ─── LEFT: Sections ──────────────────────── */}
                    <div className="min-w-0">
                        {/* 01 Region */}
                        <Section
                            num="01"
                            title="Region"
                            desc="Where your server physically lives. Pick the region closest to your users — plans and pricing can vary per region."
                            status={regionStatus}
                            statusLabel={selectedRegionInfo?.label ?? "Choose region"}
                        >
                            <div className="max-w-[440px]">
                                <FieldLabel>Region</FieldLabel>
                                <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                                    <SelectTrigger className="h-11 w-full border-white/[0.1] bg-[#111216] text-white data-[placeholder]:text-white/40">
                                        <SelectValue placeholder="Select a region" />
                                    </SelectTrigger>
                                    <SelectContent className="border-white/[0.1] bg-[#111216] text-white">
                                        {groupedRegions.map((group) => (
                                            <SelectGroup key={group.label}>
                                                <SelectLabel
                                                    className={`${MONO} text-[9.5px] uppercase tracking-[0.14em] text-white/35`}
                                                >
                                                    {group.label}
                                                </SelectLabel>
                                                {group.regions.map((r) => (
                                                    <SelectItem key={r.id} value={r.id}>
                                                        <span className="flex items-center gap-2.5">
                                                            <RegionFlag region={r.country} name={r.label} size={16} />
                                                            {r.label}
                                                            <span className={`${MONO} text-[10px] text-white/35`}>
                                                                {r.id}
                                                            </span>
                                                        </span>
                                                    </SelectItem>
                                                ))}
                                            </SelectGroup>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </Section>

                        {/* 02 Operating system */}
                        <Section
                            num="02"
                            title="Operating system"
                            desc="Clean distribution images, maintained upstream. Custom images are coming to Linode-backed servers soon."
                            status={imageStatus}
                            statusLabel={selectedImageInfo?.label ?? "Choose image"}
                        >
                            <div className="max-w-[440px]">
                                <FieldLabel>Distribution</FieldLabel>
                                <Select value={selectedImage} onValueChange={setSelectedImage}>
                                    <SelectTrigger className="h-11 w-full border-white/[0.1] bg-[#111216] text-white data-[placeholder]:text-white/40">
                                        <SelectValue placeholder="Select an image" />
                                    </SelectTrigger>
                                    <SelectContent className="border-white/[0.1] bg-[#111216] text-white">
                                        {visibleImages.map((img) => (
                                            <SelectItem key={img.id} value={img.id}>
                                                <span className="flex items-center gap-2.5">
                                                    <OsImg name={img.label} size={18} />
                                                    {img.label}
                                                    {img.deprecated && (
                                                        <span className={`${MONO} text-[9px] uppercase tracking-[0.1em] text-amber-400/80`}>
                                                            deprecated
                                                        </span>
                                                    )}
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <button
                                    type="button"
                                    onClick={() => setShowOlderImages((v) => !v)}
                                    className={`${MONO} mt-2 text-[10.5px] uppercase tracking-[0.12em] text-white/40 hover:text-white/70 transition-colors`}
                                >
                                    {showOlderImages ? "Hide older images" : "Show older images"}
                                </button>
                            </div>
                        </Section>

                        {/* 03 Plan */}
                        <Section
                            num="03"
                            title="Plan"
                            desc={CLASS_TABS.find((t) => t.id === classTab)?.blurb ?? ""}
                            status={planStatus}
                            statusLabel={selectedPlan ? selectedPlan.label : "Choose plan"}
                        >
                            {/* Class tabs */}
                            <div className="flex flex-wrap items-center gap-1.5 mb-4">
                                {CLASS_TABS.map((tab) => {
                                    const hasPlans = options.plans.some((p) => tab.classes.includes(p.class));
                                    if (!hasPlans) return null;
                                    const active = classTab === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() => setClassTab(tab.id)}
                                            className={`${MONO} px-3.5 h-8 text-[10.5px] uppercase tracking-[0.12em] font-semibold rounded-[4px] transition-colors border ${
                                                active
                                                    ? "text-white border-transparent"
                                                    : "text-white/45 border-white/[0.08] hover:text-white/75 hover:border-white/[0.16]"
                                            }`}
                                            style={active ? { background: ACCENT } : { background: "#111216" }}
                                        >
                                            {tab.label}
                                        </button>
                                    );
                                })}
                            </div>

                            {anyOutOfStock && (
                                <div className="mb-3 border border-amber-500/25 bg-amber-500/[0.05] rounded-[5px] px-3.5 py-2.5 text-[11.5px] text-amber-300/90">
                                    Some plans have limited availability in{" "}
                                    {selectedRegionInfo?.label ?? "this region"} right now.
                                </div>
                            )}

                            {/* Plan table */}
                            <div className="border border-white/[0.07] rounded-[6px] overflow-x-auto bg-[#0d0e12]">
                                <table className="w-full min-w-[760px] border-collapse">
                                    <thead>
                                        <tr className="border-b border-white/[0.07]">
                                            <ColHead className="pl-4 text-left">Plan</ColHead>
                                            <ColHead>Monthly</ColHead>
                                            <ColHead>Hourly</ColHead>
                                            <ColHead>RAM</ColHead>
                                            <ColHead>CPUs</ColHead>
                                            <ColHead>Storage</ColHead>
                                            <ColHead>Transfer</ColHead>
                                            <ColHead className="pr-4">Network Out</ColHead>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tabPlans.length === 0 && (
                                            <tr>
                                                <td colSpan={8} className={`${MONO} px-4 py-6 text-center text-[11px] text-white/35`}>
                                                    No plans in this class yet — run a catalog sync from the admin panel.
                                                </td>
                                            </tr>
                                        )}
                                        {tabPlans.map((plan) => {
                                            const price = planPriceFor(plan, selectedRegion);
                                            const inStock =
                                                !selectedRegion ||
                                                availability[selectedRegion]?.[plan.id] !== false;
                                            const selected = selectedTypeId === plan.id;
                                            return (
                                                <tr
                                                    key={plan.id}
                                                    onClick={() => inStock && setSelectedTypeId(plan.id)}
                                                    className={`border-b border-white/[0.05] last:border-b-0 transition-colors ${
                                                        inStock
                                                            ? "cursor-pointer hover:bg-[#14161b]"
                                                            : "opacity-40 cursor-not-allowed"
                                                    }`}
                                                    style={selected ? { background: "#14161b", boxShadow: `inset 2px 0 0 ${ACCENT}` } : undefined}
                                                >
                                                    <td className="pl-4 py-3">
                                                        <span className="flex items-center gap-2.5">
                                                            <span
                                                                className="h-3.5 w-3.5 rounded-full border shrink-0 inline-flex items-center justify-center"
                                                                style={{
                                                                    borderColor: selected ? ACCENT : "rgba(255,255,255,0.25)",
                                                                    background: selected ? ACCENT : "transparent",
                                                                }}
                                                            >
                                                                {selected && <Check className="h-2.5 w-2.5 text-white" />}
                                                            </span>
                                                            <span className="text-[12.5px] font-medium text-white whitespace-nowrap">
                                                                {plan.label}
                                                            </span>
                                                            {!inStock && (
                                                                <span className={`${MONO} text-[9px] uppercase tracking-[0.1em] text-amber-400/90 border border-amber-400/25 rounded-[3px] px-1.5 py-0.5 whitespace-nowrap`}>
                                                                    Out of stock
                                                                </span>
                                                            )}
                                                        </span>
                                                    </td>
                                                    <Cell mono strong>{`$${price.monthlyUSD.toFixed(2)}`}</Cell>
                                                    <Cell mono>{`$${price.hourlyUSD.toFixed(3)}`}</Cell>
                                                    <Cell mono>{ramGBLabel(plan.memoryMB)}</Cell>
                                                    <Cell mono>{String(plan.vcpus)}</Cell>
                                                    <Cell mono>{`${plan.diskGB} GB`}</Cell>
                                                    <Cell mono>{formatTransfer(plan.transferGB)}</Cell>
                                                    <Cell mono className="pr-4">{formatNetOut(plan.networkOutMbps)}</Cell>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </Section>

                        {/* 04 Details */}
                        <Section
                            num="04"
                            title="Details"
                            desc="A label to identify this server across the dashboard and API."
                            status={detailsStatus}
                            statusLabel={labelValid ? label : "Name your server"}
                        >
                            <div className="max-w-[440px]">
                                <FieldLabel hint="3-64 chars · letters, numbers, . _ -">Label</FieldLabel>
                                <Input
                                    value={label}
                                    onChange={(e) => setLabel(e.target.value)}
                                    placeholder={
                                        selectedImageInfo
                                            ? `${(selectedImageInfo.vendor || "server").toLowerCase()}-${selectedRegion || "region"}`
                                            : "my-server"
                                    }
                                    className="h-11 border-white/[0.1] bg-[#111216] text-white placeholder:text-white/30"
                                />
                                {label && !labelValid && (
                                    <p className="mt-1.5 text-[11px] text-red-400/90">
                                        Must be 3-64 characters of letters, numbers, dots, dashes or
                                        underscores — starting and ending with a letter or number.
                                    </p>
                                )}
                            </div>
                        </Section>

                        {/* 05 Security */}
                        <Section
                            num="05"
                            title="Security"
                            desc="Add SSH keys for key-based login and set the root password. Keys added here are saved to your account for future deploys."
                            status={securityStatus}
                            statusLabel={passwordValid ? "Configured" : "Set credentials"}
                        >
                            {/* SSH keys */}
                            <div className="mb-6">
                                <FieldLabel hint={`${selectedKeyIds.length} selected`}>SSH keys</FieldLabel>
                                {sshKeys.length === 0 ? (
                                    <div className="border border-dashed border-white/[0.12] rounded-[6px] px-4 py-5 text-center">
                                        <KeyRound className="h-4 w-4 text-white/30 mx-auto mb-2" />
                                        <p className={`${MONO} text-[11px] text-white/40 mb-3`}>
                                            No SSH keys on your account yet.
                                        </p>
                                        <AddKeyButton onClick={() => setKeyDialogOpen(true)} />
                                    </div>
                                ) : (
                                    <div className="border border-white/[0.07] rounded-[6px] overflow-hidden bg-[#0d0e12]">
                                        {sshKeys.map((k) => {
                                            const checked = selectedKeyIds.includes(k.id);
                                            return (
                                                <button
                                                    key={k.id}
                                                    type="button"
                                                    onClick={() =>
                                                        setSelectedKeyIds((prev) =>
                                                            checked ? prev.filter((id) => id !== k.id) : [...prev, k.id]
                                                        )
                                                    }
                                                    className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] last:border-b-0 hover:bg-[#14161b] transition-colors text-left"
                                                >
                                                    <span
                                                        className="h-4 w-4 rounded-[3px] border shrink-0 inline-flex items-center justify-center"
                                                        style={{
                                                            borderColor: checked ? ACCENT : "rgba(255,255,255,0.25)",
                                                            background: checked ? ACCENT : "transparent",
                                                        }}
                                                    >
                                                        {checked && <Check className="h-3 w-3 text-white" />}
                                                    </span>
                                                    <span className="text-[12.5px] font-medium text-white truncate">{k.label}</span>
                                                    <span className={`${MONO} text-[10px] text-white/35 truncate ml-auto`}>
                                                        {k.fingerprint}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                        <div className="px-4 py-2.5 bg-[#0a0b0e]">
                                            <AddKeyButton onClick={() => setKeyDialogOpen(true)} />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Root password */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-[640px]">
                                <div>
                                    <FieldLabel>Root password</FieldLabel>
                                    <div className="relative">
                                        <Input
                                            type={showPassword ? "text" : "password"}
                                            value={rootPass}
                                            onChange={(e) => setRootPass(e.target.value)}
                                            placeholder="••••••••••••"
                                            className="h-11 border-white/[0.1] bg-[#111216] text-white pr-10 placeholder:text-white/30"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword((v) => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/70 transition-colors"
                                            aria-label={showPassword ? "Hide password" : "Show password"}
                                        >
                                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <FieldLabel>Confirm password</FieldLabel>
                                    <Input
                                        type={showPassword ? "text" : "password"}
                                        value={rootPassConfirm}
                                        onChange={(e) => setRootPassConfirm(e.target.value)}
                                        placeholder="••••••••••••"
                                        className="h-11 border-white/[0.1] bg-[#111216] text-white placeholder:text-white/30"
                                    />
                                </div>
                            </div>
                            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-6 max-w-[640px]">
                                <ReqCheck ok={passwordChecks.length}>{PASSWORD_MIN_LENGTH}+ characters</ReqCheck>
                                <ReqCheck ok={passwordChecks.upper}>Uppercase letter</ReqCheck>
                                <ReqCheck ok={passwordChecks.lower}>Lowercase letter</ReqCheck>
                                <ReqCheck ok={passwordChecks.number}>Number</ReqCheck>
                                <ReqCheck ok={passwordChecks.special}>Special character</ReqCheck>
                                <ReqCheck ok={rootPass.length > 0 && rootPass === rootPassConfirm}>
                                    Passwords match
                                </ReqCheck>
                            </div>

                            {/* Disk encryption */}
                            <div className="mt-6 max-w-[640px]">
                                <ToggleRow
                                    checked={regionSupportsEncryption ? diskEncryption : false}
                                    disabled={!regionSupportsEncryption}
                                    onChange={setDiskEncryption}
                                    title="Disk encryption"
                                    subtitle={
                                        regionSupportsEncryption
                                            ? "Encrypt this server's disks at rest. Managed automatically — no performance tuning needed."
                                            : "Not available in the selected region yet."
                                    }
                                />
                            </div>
                        </Section>

                        {/* 06 Add-ons */}
                        <Section
                            num="06"
                            title="Add-ons"
                            desc="Optional extras billed alongside your server."
                            status={backupsEnabled ? "done" : "idle"}
                            statusLabel={backupsEnabled ? "Backups on" : "Optional"}
                        >
                            <div className="max-w-[640px]">
                                <ToggleRow
                                    checked={backupsEnabled}
                                    disabled={!selectedPlan || selectedPlanPrice?.backupsHourlyUSD == null}
                                    onChange={setBackupsEnabled}
                                    title="Backups"
                                    subtitle={
                                        !selectedPlan
                                            ? "Select a plan to see backup pricing."
                                            : selectedPlanPrice?.backupsHourlyUSD == null
                                                ? "Backups are not offered for this plan."
                                                : `Automatic daily, weekly and biweekly backups + manual snapshots — $${selectedPlanPrice.backupsMonthlyUSD?.toFixed(2)}/mo ($${selectedPlanPrice.backupsHourlyUSD.toFixed(3)}/hr).`
                                    }
                                />
                                <div className="mt-3 flex items-center justify-between border border-white/[0.06] bg-[#0d0e12] rounded-[5px] px-4 py-3 opacity-60">
                                    <div>
                                        <p className="text-[12.5px] font-medium text-white/70">Cloud firewall</p>
                                        <p className={`${MONO} text-[10.5px] text-white/35 mt-0.5`}>
                                            Managed edge firewall rules — coming soon.
                                        </p>
                                    </div>
                                    <span className={`${MONO} text-[9px] uppercase tracking-[0.12em] text-white/35 border border-white/[0.12] rounded-[3px] px-1.5 py-0.5`}>
                                        Soon
                                    </span>
                                </div>
                            </div>
                        </Section>
                    </div>

                    {/* ─── RIGHT: Sticky summary ───────────────── */}
                    <aside className="lg:sticky lg:top-6 self-start">
                        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
                            <header className="border-b border-white/[0.06] px-5 py-4 flex items-start justify-between gap-2">
                                <div>
                                    <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40 mb-1`}>
                                        Configuration
                                    </p>
                                    <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-white">
                                        Your server
                                    </h3>
                                </div>
                                <span
                                    className={`${MONO} inline-flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.14em] font-semibold`}
                                    style={{ color: formValid ? "#4ade80" : ACCENT }}
                                >
                                    <span
                                        className="h-1.5 w-1.5 rounded-full"
                                        style={{
                                            background: formValid ? "#4ade80" : ACCENT,
                                            boxShadow: `0 0 6px ${formValid ? "#4ade80" : ACCENT}`,
                                        }}
                                    />
                                    {formValid ? "Ready" : "Pending"}
                                </span>
                            </header>

                            {/* Summary rows */}
                            <div className="px-5 py-3">
                                <SumRow k="Label" v={label || "—"} empty={!label} mono />
                                <SumRowFlag
                                    k="Region"
                                    country={selectedRegionInfo?.country ?? ""}
                                    regionName={selectedRegionInfo?.label ?? "—"}
                                />
                                <SumRow
                                    k="Image"
                                    v={selectedImageInfo?.label ?? "—"}
                                    empty={!selectedImageInfo}
                                />
                                <SumRow k="Plan" v={selectedPlan?.label ?? "—"} empty={!selectedPlan} />
                                {selectedPlan && (
                                    <>
                                        <SumRow k="vCPU" v={String(selectedPlan.vcpus)} mono />
                                        <SumRow k="Memory" v={ramGBLabel(selectedPlan.memoryMB)} mono />
                                        <SumRow k="Storage" v={`${selectedPlan.diskGB} GB SSD`} mono />
                                        <SumRow k="Transfer" v={formatTransfer(selectedPlan.transferGB)} mono />
                                    </>
                                )}
                                <SumRow
                                    k="Auth"
                                    v={
                                        selectedKeyIds.length > 0
                                            ? `Root pass + ${selectedKeyIds.length} SSH key${selectedKeyIds.length > 1 ? "s" : ""}`
                                            : "Root password"
                                    }
                                />
                                {regionSupportsEncryption && diskEncryption && <SumRow k="Disk" v="Encrypted" />}
                                {backupsEnabled && <SumRow k="Backups" v="Enabled" />}
                            </div>

                            {/* Connection preview */}
                            {labelValid && (
                                <div className="mx-5 mb-4 px-3 py-2.5 border border-white/[0.06] bg-[#08090b] rounded-[5px]">
                                    <div className={`${MONO} flex items-center justify-between mb-1.5 text-[9.5px] uppercase tracking-[0.14em] font-semibold text-white/35`}>
                                        Connection preview
                                    </div>
                                    <code className={`${MONO} text-[10.5px] break-all leading-snug text-white/55`}>
                                        <span style={{ color: ACCENT }}>ssh </span>
                                        <span className="text-emerald-400">root</span>@
                                        <span className="text-white/85">{label.trim()}</span>
                                    </code>
                                </div>
                            )}

                            {/* Cost block */}
                            <div className="px-5 py-4 bg-[#08090b] border-t border-white/[0.06]">
                                <div className="flex items-baseline justify-between mb-2">
                                    <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/40`}>
                                        Monthly cost
                                    </span>
                                    {selectedPlanPrice && (
                                        <span className={`${MONO} text-[10.5px] text-white/45`}>
                                            ${totalHourly.toFixed(3)} / hr
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-baseline gap-1">
                                    {!selectedPlanPrice ? (
                                        <span style={SERIF_STYLE} className="text-[28px] font-bold text-white/35 leading-none">
                                            —
                                        </span>
                                    ) : (
                                        <>
                                            <span style={SERIF_STYLE} className="text-[18px] text-white/50 font-medium leading-none">
                                                $
                                            </span>
                                            <span
                                                style={SERIF_STYLE}
                                                className="text-[38px] font-bold tracking-[-0.03em] tabular-nums text-white leading-none"
                                            >
                                                {totalMonthly.toFixed(totalMonthly % 1 === 0 ? 0 : 2)}
                                            </span>
                                            <span className={`${MONO} text-[11px] text-white/40 ml-1`}>/ mo</span>
                                        </>
                                    )}
                                </div>
                                {backupsEnabled && selectedPlanPrice?.backupsMonthlyUSD != null && (
                                    <p className={`${MONO} text-[10px] text-white/35 mt-1.5`}>
                                        Includes backups ${selectedPlanPrice.backupsMonthlyUSD.toFixed(2)}/mo
                                    </p>
                                )}

                                <button
                                    type="button"
                                    disabled={!formValid || isLoading}
                                    onClick={onDeploy}
                                    className={`${MONO} mt-4 w-full inline-flex items-center justify-center gap-2 h-11 text-[11.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all`}
                                    style={{
                                        background:
                                            formValid && !isLoading
                                                ? `linear-gradient(135deg, ${ACCENT}, #0066B3)`
                                                : "#1a1d24",
                                        color: formValid && !isLoading ? "#ffffff" : "rgba(255,255,255,0.35)",
                                        boxShadow:
                                            formValid && !isLoading
                                                ? "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)"
                                                : "none",
                                        cursor: formValid && !isLoading ? "pointer" : "not-allowed",
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!formValid || isLoading) return;
                                        e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT_BRIGHT}, ${ACCENT})`;
                                        e.currentTarget.style.transform = "translateY(-1px)";
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!formValid || isLoading) return;
                                        e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
                                        e.currentTarget.style.transform = "none";
                                    }}
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            Deploying
                                        </>
                                    ) : (
                                        <>
                                            Deploy server
                                            <ArrowRight className="h-3.5 w-3.5" />
                                        </>
                                    )}
                                </button>
                                <p className={`${MONO} text-center text-[10px] text-white/35 mt-2`}>
                                    Per-second billing · cancel anytime
                                </p>
                            </div>
                        </div>

                        {error && (
                            <div className="mt-3 border border-red-500/25 bg-red-500/[0.06] rounded-[6px] p-3 text-[12px] text-red-300">
                                {error}
                            </div>
                        )}
                    </aside>
                </div>
            </div>

            {/* Add-SSH-key dialog */}
            {keyDialogOpen && (
                <AddSshKeyDialog
                    onClose={() => setKeyDialogOpen(false)}
                    onAdded={(key) => {
                        setSshKeys((prev) => [key, ...prev]);
                        setSelectedKeyIds((prev) => [...prev, key.id]);
                        setKeyDialogOpen(false);
                    }}
                />
            )}
        </div>
    );
};

export default LinodeCreate;

// ─── Subcomponents ────────────────────────────────────────────────

type SectionStatus = "done" | "active" | "idle";

function Section({
    num,
    title,
    desc,
    status,
    statusLabel,
    children,
}: {
    num: string;
    title: string;
    desc: string;
    status: SectionStatus;
    statusLabel: string;
    children: React.ReactNode;
}) {
    const tone =
        status === "done"
            ? { dot: "#4ade80", text: "#4ade80" }
            : status === "active"
              ? { dot: ACCENT, text: ACCENT }
              : { dot: "rgba(255,255,255,0.25)", text: "rgba(255,255,255,0.35)" };

    return (
        <section className="border-t border-white/[0.06] py-8 first:border-t-0 first:pt-0">
            <header className="mb-5 flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                    <span className={`${MONO} text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30 mt-0.5`}>
                        {num}
                    </span>
                    <div>
                        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-white">{title}</h2>
                        <p className={`${MONO} mt-1 text-[11px] text-white/45 leading-snug max-w-[520px]`}>
                            {desc}
                        </p>
                    </div>
                </div>
                <span
                    className={`${MONO} inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] font-semibold shrink-0 mt-1 truncate max-w-[200px]`}
                    style={{ color: tone.text }}
                    title={statusLabel}
                >
                    <span
                        className="h-1.5 w-1.5 rounded-full shrink-0"
                        style={{
                            background: tone.dot,
                            boxShadow: status !== "idle" ? `0 0 6px ${tone.dot}` : "none",
                        }}
                    />
                    <span className="truncate">{statusLabel}</span>
                </span>
            </header>
            {children}
        </section>
    );
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
    return (
        <label className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium text-white/85">{children}</span>
            {hint && <span className={`${MONO} text-[10px] text-white/35`}>{hint}</span>}
        </label>
    );
}

function ReqCheck({ ok, children }: { ok: boolean; children: React.ReactNode }) {
    return (
        <div className={`${MONO} flex items-center gap-2 text-[11px] py-0.5 ${ok ? "text-emerald-300/85" : "text-white/40"}`}>
            <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{
                    background: ok ? "#4ade80" : "rgba(255,255,255,0.15)",
                    boxShadow: ok ? "0 0 5px rgba(74,222,128,0.6)" : "none",
                }}
            />
            {children}
        </div>
    );
}

function ColHead({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return (
        <th className={`${MONO} px-3 py-2.5 text-[9.5px] uppercase tracking-[0.13em] font-semibold text-white/40 text-center whitespace-nowrap ${className}`}>
            {children}
        </th>
    );
}

function Cell({
    children,
    mono,
    strong,
    className = "",
}: {
    children: React.ReactNode;
    mono?: boolean;
    strong?: boolean;
    className?: string;
}) {
    return (
        <td
            className={`${mono ? MONO : ""} px-3 py-3 text-center whitespace-nowrap ${
                strong ? "text-[12px] font-semibold text-white" : "text-[11.5px] text-white/60"
            } ${className}`}
        >
            {children}
        </td>
    );
}

function SumRow({ k, v, empty, mono }: { k: string; v: string; empty?: boolean; mono?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-3 py-2 border-b border-white/[0.04] last:border-b-0">
            <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-medium text-white/40`}>{k}</span>
            <span
                className={`${mono ? MONO : ""} text-[12px] font-medium truncate max-w-[200px] ${empty ? "text-white/25" : "text-white/90"}`}
                title={v}
            >
                {v}
            </span>
        </div>
    );
}

function SumRowFlag({ k, country, regionName }: { k: string; country: string; regionName: string }) {
    const empty = !country;
    return (
        <div className="flex items-center justify-between gap-3 py-2 border-b border-white/[0.04] last:border-b-0">
            <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-medium text-white/40`}>{k}</span>
            <span className="flex items-center gap-2 text-right max-w-[200px] min-w-0">
                {!empty && <RegionFlag region={country} name={regionName} size={14} />}
                <span className={`text-[12px] font-medium truncate ${empty ? "text-white/25" : "text-white/90"}`}>
                    {empty ? "—" : regionName}
                </span>
            </span>
        </div>
    );
}

function ToggleRow({
    checked,
    disabled,
    onChange,
    title,
    subtitle,
}: {
    checked: boolean;
    disabled?: boolean;
    onChange: (v: boolean) => void;
    title: string;
    subtitle: string;
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`w-full flex items-start gap-3 border border-white/[0.07] bg-[#0d0e12] rounded-[5px] px-4 py-3 text-left transition-colors ${
                disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-[#14161b] cursor-pointer"
            }`}
        >
            <span
                className="mt-0.5 h-4 w-4 rounded-[3px] border shrink-0 inline-flex items-center justify-center"
                style={{
                    borderColor: checked && !disabled ? ACCENT : "rgba(255,255,255,0.25)",
                    background: checked && !disabled ? ACCENT : "transparent",
                }}
            >
                {checked && !disabled && <Check className="h-3 w-3 text-white" />}
            </span>
            <span className="min-w-0">
                <span className="block text-[12.5px] font-medium text-white">{title}</span>
                <span className={`${MONO} block text-[10.5px] text-white/40 mt-0.5 leading-snug`}>{subtitle}</span>
            </span>
        </button>
    );
}

function AddKeyButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] font-semibold transition-colors`}
            style={{ color: ACCENT_BRIGHT }}
        >
            <Plus className="h-3.5 w-3.5" />
            Add an SSH key
        </button>
    );
}

function AddSshKeyDialog({
    onClose,
    onAdded,
}: {
    onClose: () => void;
    onAdded: (key: SshKeyEntry) => void;
}) {
    const [label, setLabel] = useState("");
    const [publicKey, setPublicKey] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        if (!label.trim() || !publicKey.trim()) {
            setError("Both a label and the public key are required.");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const res = await fetch("/api/user/ssh-keys", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label: label.trim(), public_key: publicKey }),
            });
            const json = await res.json();
            if (!res.ok || !json.ok) throw new Error(json.error || "Failed to save SSH key");
            toast.success(`SSH key "${label.trim()}" added`);
            onAdded({
                id: String(json.data.id),
                label: String(json.data.label),
                fingerprint: String(json.data.fingerprint_sha256),
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save SSH key");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Add SSH key"
        >
            <div className="absolute inset-0 bg-black/70" onClick={onClose} />
            <div className="relative w-full max-w-[520px] border border-white/[0.1] bg-[#111216] rounded-[8px] p-5">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h3 className="text-[15px] font-semibold text-white">Add an SSH key</h3>
                        <p className={`${MONO} text-[10.5px] text-white/40 mt-1`}>
                            Saved to your account · reusable on every deploy
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-white/40 hover:text-white/80 transition-colors"
                        aria-label="Close"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <FieldLabel>Label</FieldLabel>
                <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="work-laptop"
                    maxLength={64}
                    className="h-10 border-white/[0.1] bg-[#0d0e12] text-white mb-4 placeholder:text-white/30"
                />

                <FieldLabel hint="starts with ssh-ed25519 / ssh-rsa …">Public key</FieldLabel>
                <textarea
                    value={publicKey}
                    onChange={(e) => setPublicKey(e.target.value)}
                    placeholder="ssh-ed25519 AAAA… you@machine"
                    rows={4}
                    className={`${MONO} w-full border border-white/[0.1] bg-[#0d0e12] rounded-[5px] px-3 py-2.5 text-[11.5px] text-white placeholder:text-white/30 outline-none focus:border-white/[0.25] resize-none`}
                />

                {error && <p className="mt-2 text-[11.5px] text-red-400/90">{error}</p>}

                <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className={`${MONO} h-9 px-4 text-[10.5px] uppercase tracking-[0.12em] font-semibold text-white/50 hover:text-white/80 transition-colors`}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={saving}
                        onClick={submit}
                        className={`${MONO} h-9 px-4 inline-flex items-center gap-2 text-[10.5px] uppercase tracking-[0.12em] font-semibold rounded-[4px] text-white transition-colors`}
                        style={{ background: ACCENT }}
                    >
                        {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                        Save key
                    </button>
                </div>
            </div>
        </div>
    );
}

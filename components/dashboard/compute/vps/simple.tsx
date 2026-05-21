"use client";

// VPS create — editorial single-page form matching the database/new
// pattern. Numbered sections on the left with live status pills, sticky
// right summary with SSH/RDP connection preview, big Nunito monthly
// price, and gradient brand-blue Deploy CTA. Wiring unchanged.

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
    ArrowRight,
    Check,
    ChevronLeft,
    Loader2,
    MapPin,
} from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import DeploymentProgress from "./deployment-progress";

// ─── Design tokens ───────────────────────────────────────────────
const SERIF_STYLE: React.CSSProperties = {
    fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";
const ACCENT_DIM = "rgba(0,149,255,0.08)";

const PASSWORD_PATTERNS = {
    hasUpperCase: /[A-Z]/,
    hasLowerCase: /[a-z]/,
    hasNumbers: /[0-9]/,
    hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
} as const;
const PASSWORD_MIN_LENGTH = 12;

// Region slug → ISO 3166-1 alpha-2 country code (flagcdn renders SVGs).
const REGION_CC: Record<string, string> = {
    india: "in", in: "in", blr: "in", bom: "in", del: "in",
    france: "fr", fr: "fr", par: "fr",
    germany: "de", de: "de", fra: "de", ger: "de",
    uk: "gb", gb: "gb", "united-kingdom": "gb", britain: "gb", lon: "gb",
    us: "us", usa: "us", "united-states": "us",
    "us-east": "us", "us-west": "us", "us-central": "us", nyc: "us",
    singapore: "sg", sg: "sg", sgp: "sg",
    netherlands: "nl", nl: "nl", ams: "nl",
    australia: "au", au: "au", syd: "au",
    canada: "ca", ca: "ca", tor: "ca", mtl: "ca",
    japan: "jp", jp: "jp", tok: "jp", tyo: "jp",
    brazil: "br", br: "br", sao: "br",
    uae: "ae", ae: "ae", dxb: "ae",
    poland: "pl", pl: "pl",
    sweden: "se", se: "se",
    ireland: "ie", ie: "ie",
    italy: "it", it: "it",
    spain: "es", es: "es",
};

function flagCodeFor(id: string): string | null {
    if (!id) return null;
    const tokens = id.toLowerCase().split(/[-_/\s]+/).filter(Boolean);
    for (const t of [...tokens].reverse()) {
        if (REGION_CC[t]) return REGION_CC[t];
    }
    return REGION_CC[id.toLowerCase()] ?? null;
}

function FlagImg({ id, size = 22 }: { id: string; size?: number }) {
    const code = flagCodeFor(id);
    if (!code) {
        return (
            <MapPin
                className="text-white/40"
                style={{ width: size * 0.7, height: size * 0.7 }}
            />
        );
    }
    const w = size;
    const h = Math.round(size * (2 / 3));
    return (
        <Image
            src={`https://flagcdn.com/${size * 2}x${h * 2}/${code}.png`}
            alt=""
            width={w}
            height={h}
            className="object-cover"
            style={{ width: w, height: h }}
            unoptimized
        />
    );
}

interface Region {
    id: string;
    name: string;
    available: boolean;
}
interface OSOption {
    id: string;
    name: string;
    regions: string[];
}
interface PlanOption {
    slug: string;
    name: string;
    tier: "shared" | "dedicated";
    vcpu: number;
    memoryMB: number;
    diskGB: number;
    hourlyUSD: number;
    monthlyUSD: number;
    tagline?: string;
    allowedRegions?: string[];
    allowedHostIds?: string[];
}
interface ComputeOptions {
    regions: Region[];
    osOptions: OSOption[];
    plans?: PlanOption[];
    planAvailability?: Record<string, Record<string, boolean>>;
}

const VPSSelect = ({ computeOptions }: { computeOptions: ComputeOptions }) => {
    // ─── State ──────────────────────────────────────────────────
    const [hostname, setHostname] = useState("");
    const [selectedRegion, setSelectedRegion] = useState("");
    const [selectedOS, setSelectedOS] = useState("");
    const [selectedTier, setSelectedTier] = useState<"shared" | "dedicated">(
        "shared",
    );
    const [selectedPlanSlug, setSelectedPlanSlug] = useState("");
    const [sshPassword, setSshPassword] = useState("");
    const [sshPasswordConfirm, setSshPasswordConfirm] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<Record<string, unknown> | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [deploymentServerId, setDeploymentServerId] = useState<number | null>(
        null,
    );

    const regions = computeOptions.regions;
    const allPlans = computeOptions.plans ?? [];
    const planAvailability = computeOptions.planAvailability ?? {};

    // ─── Derived ────────────────────────────────────────────────
    const availableOS = useMemo(() => {
        if (!selectedRegion) return computeOptions.osOptions;
        return computeOptions.osOptions.filter((os) =>
            os.regions.includes(selectedRegion),
        );
    }, [computeOptions.osOptions, selectedRegion]);

    const selectedOSName =
        availableOS.find((o) => o.id === selectedOS)?.name || selectedOS;
    const isWindows = selectedOSName.toLowerCase().includes("windows");
    const isDesktop = selectedOSName.toLowerCase().includes("desktop");
    const usesRDP = isWindows || isDesktop;

    const selectedPlan = useMemo(
        () => allPlans.find((p) => p.slug === selectedPlanSlug) ?? null,
        [allPlans, selectedPlanSlug],
    );

    const visiblePlans = useMemo(() => {
        const minRamMB = isWindows || isDesktop ? 2048 : 0;
        const minDiskGB = isWindows ? 40 : isDesktop ? 25 : 0;
        return allPlans
            .filter((p) => p.tier === selectedTier)
            .filter((p) => p.memoryMB >= minRamMB && p.diskGB >= minDiskGB)
            .filter((p) => {
                if (!selectedRegion) return true;
                if (p.allowedRegions && p.allowedRegions.length > 0) {
                    return p.allowedRegions.includes(selectedRegion);
                }
                return true;
            })
            .filter((p) => {
                if (!selectedRegion) return true;
                if (!p.allowedHostIds || p.allowedHostIds.length === 0) return true;
                const avail = planAvailability[selectedRegion]?.[p.slug];
                return avail !== false;
            })
            .sort((a, b) => a.vcpu - b.vcpu || a.memoryMB - b.memoryMB);
    }, [
        allPlans,
        selectedTier,
        selectedRegion,
        planAvailability,
        isWindows,
        isDesktop,
    ]);

    // ─── Defaults ───────────────────────────────────────────────
    useEffect(() => {
        if (regions.length > 0 && !selectedRegion) {
            const first = regions.find((r) => r.available) ?? regions[0];
            setSelectedRegion(first.id);
        }
    }, [regions, selectedRegion]);

    useEffect(() => {
        if (
            availableOS.length > 0 &&
            !availableOS.find((o) => o.id === selectedOS)
        ) {
            setSelectedOS(availableOS[0].id);
        }
    }, [availableOS, selectedOS]);

    useEffect(() => {
        if (
            selectedPlanSlug &&
            !visiblePlans.some((p) => p.slug === selectedPlanSlug)
        ) {
            setSelectedPlanSlug("");
        }
    }, [visiblePlans, selectedPlanSlug]);

    // ─── Validation ─────────────────────────────────────────────
    const hostnameValid = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(
        hostname.trim(),
    );
    const passwordChecks = {
        length: sshPassword.length >= PASSWORD_MIN_LENGTH,
        upper: PASSWORD_PATTERNS.hasUpperCase.test(sshPassword),
        lower: PASSWORD_PATTERNS.hasLowerCase.test(sshPassword),
        number: PASSWORD_PATTERNS.hasNumbers.test(sshPassword),
        special: PASSWORD_PATTERNS.hasSpecialChar.test(sshPassword),
    };
    const passwordValid =
        Object.values(passwordChecks).every(Boolean) &&
        sshPassword === sshPasswordConfirm;
    const formValid =
        hostnameValid &&
        !!selectedRegion &&
        !!selectedOS &&
        !!selectedPlan &&
        passwordValid;

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
            const { data: userData } = await supabase.auth.getUser();
            const accessToken = sessionData?.session?.access_token;

            const payload = {
                region: selectedRegion,
                os: selectedOSName,
                hostname: hostname.trim(),
                planSlug: selectedPlan!.slug,
                cpuCores: selectedPlan!.vcpu,
                memoryMB: selectedPlan!.memoryMB,
                diskGB: selectedPlan!.diskGB,
                sshPassword,
                ownerId: userData?.user?.id,
                ownerEmail: userData?.user?.email,
            };

            const res = await fetch("/api/services/compute/vms/create", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(accessToken
                        ? { Authorization: `Bearer ${accessToken}` }
                        : {}),
                },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok || !json.ok) {
                throw new Error(
                    json.error ||
                        "Something went wrong while creating your server.",
                );
            }
            setDeploymentServerId(json.serverId);
            setResult(json);
            toast.success(`Deploying "${hostname}"...`);
        } catch (err) {
            const raw = err instanceof Error ? err.message : "";
            const friendly =
                raw &&
                raw.length < 200 &&
                !raw.includes("fetch") &&
                !raw.includes("ECONNREFUSED");
            const msg = friendly
                ? raw
                : "Something went wrong while creating your server.";
            setError(msg);
            toast.error(msg);
        } finally {
            setIsLoading(false);
        }
    };

    const defaultUser = isWindows
        ? "admin"
        : selectedOSName.toLowerCase().includes("debian")
          ? "debian"
          : selectedOSName.toLowerCase().includes("centos") ||
              selectedOSName.toLowerCase().includes("almalinux") ||
              selectedOSName.toLowerCase().includes("rocky")
            ? selectedOSName.toLowerCase().includes("centos")
                ? "centos"
                : selectedOSName.toLowerCase().includes("alma")
                  ? "almalinux"
                  : "rocky"
            : "ubuntu";

    // ─── Deployment progress view ───────────────────────────────
    if (result?.ok && deploymentServerId) {
        const resultIp = (result as { ip?: string }).ip ?? "";
        return (
            <div className="relative min-h-full bg-[#08090b] text-white px-6 sm:px-10 py-8">
                <DeploymentProgress
                    serverId={deploymentServerId}
                    serverName={hostname}
                    serverIp={resultIp}
                    serverOs={selectedOSName}
                    connectionType={usesRDP ? "rdp" : "ssh"}
                    username={defaultUser}
                    onCreateAnother={() => {
                        setResult(null);
                        setDeploymentServerId(null);
                        setHostname("");
                        setSshPassword("");
                        setSshPasswordConfirm("");
                    }}
                />
            </div>
        );
    }

    const selectedRegionName =
        regions.find((r) => r.id === selectedRegion)?.name ?? "—";
    const ramGB = selectedPlan
        ? selectedPlan.memoryMB % 1024 === 0
            ? selectedPlan.memoryMB / 1024
            : (selectedPlan.memoryMB / 1024).toFixed(1)
        : null;

    // ─── Section validation states ──────────────────────────────
    const imageStatus = selectedOS ? "done" : "idle";
    const regionStatus = selectedRegion ? "done" : "idle";
    const planStatus = selectedPlan ? "done" : selectedRegion ? "active" : "idle";
    const detailsStatus = hostnameValid
        ? "done"
        : hostname
          ? "active"
          : "idle";
    const authStatus = passwordValid
        ? "done"
        : sshPassword
          ? "active"
          : "idle";

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

            <div className="relative z-10 px-6 py-7 sm:px-10 sm:py-9 max-w-[1360px] mx-auto">
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
                    <span
                        style={SERIF_STYLE}
                        className="text-white/55 font-normal"
                    >
                        a server
                    </span>
                    .
                </h1>
                <p
                    className={`${MONO} max-w-xl text-[11.5px] text-white/45 leading-relaxed mb-10`}
                >
                    Pick an image, choose a region, and we provision compute,
                    networking, and storage. Per-second billing.
                </p>

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-10 items-start">
                    {/* ─── LEFT: Sections ──────────────────────── */}
                    <div className="min-w-0">
                        {/* 01 Image */}
                        <Section
                            num="01"
                            title="Image"
                            desc="Operating system installed on the server."
                            status={imageStatus}
                            statusLabel={selectedOSName || "Required"}
                        >
                            <div className="max-w-[520px]">
                                <FieldLabel
                                    hint={usesRDP ? "RDP access" : "SSH access"}
                                >
                                    Operating system
                                </FieldLabel>
                                <Select
                                    value={selectedOS}
                                    onValueChange={setSelectedOS}
                                >
                                    <SelectTrigger
                                        className={`${MONO} h-11 bg-[#0d0e11] border-white/[0.08] text-white text-[12.5px] rounded-[6px]`}
                                    >
                                        <SelectValue placeholder="Select an OS" />
                                    </SelectTrigger>
                                    <SelectContent className="border-white/[0.1] bg-[#111216] text-white">
                                        {availableOS.map((os) => (
                                            <SelectItem key={os.id} value={os.id}>
                                                {os.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p
                                    className={`${MONO} mt-2 text-[10.5px] text-white/40`}
                                >
                                    Linux uses SSH on port 22. Windows and
                                    Desktop builds use RDP on port 3389.
                                </p>
                            </div>
                        </Section>

                        {/* 02 Region */}
                        <Section
                            num="02"
                            title="Region"
                            desc="Where the server will be deployed."
                            status={regionStatus}
                            statusLabel={
                                selectedRegion ? selectedRegionName : "Required"
                            }
                        >
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-px bg-white/[0.06] border border-white/[0.06] rounded-[6px] overflow-hidden">
                                {regions.map((r) => (
                                    <RegionCard
                                        key={r.id}
                                        region={r}
                                        selected={selectedRegion === r.id}
                                        onClick={() =>
                                            r.available &&
                                            setSelectedRegion(r.id)
                                        }
                                    />
                                ))}
                            </div>
                        </Section>

                        {/* 03 Plan */}
                        <Section
                            num="03"
                            title="Plan"
                            desc="vCPU, RAM, and storage. Shared is burstable; Dedicated pins 1:1 to cores."
                            status={planStatus}
                            statusLabel={
                                selectedPlan
                                    ? `${selectedPlan.slug} · ${selectedPlan.vcpu} vCPU`
                                    : selectedRegion
                                      ? "Choose a plan"
                                      : "Pick region first"
                            }
                        >
                            <PlanPicker
                                plans={visiblePlans}
                                selectedTier={selectedTier}
                                setSelectedTier={setSelectedTier}
                                selectedPlanSlug={selectedPlanSlug}
                                setSelectedPlanSlug={setSelectedPlanSlug}
                                anyPlans={allPlans.length > 0}
                                isWindowsOrDesktop={isWindows || isDesktop}
                                isWindows={isWindows}
                                isDesktop={isDesktop}
                            />
                        </Section>

                        {/* 04 Details */}
                        <Section
                            num="04"
                            title="Details"
                            desc="A friendly name to identify the server in your dashboard."
                            status={detailsStatus}
                            statusLabel={
                                hostnameValid
                                    ? "Valid"
                                    : hostname
                                      ? "Check format"
                                      : "Required"
                            }
                        >
                            <div className="max-w-[520px]">
                                <FieldLabel hint="required">Hostname</FieldLabel>
                                <Input
                                    value={hostname}
                                    onChange={(e) =>
                                        setHostname(e.target.value)
                                    }
                                    placeholder="my-server-01"
                                    className={`${MONO} h-11 bg-[#0d0e11] border-white/[0.08] text-white text-[12.5px] rounded-[6px]`}
                                />
                                <div className="mt-2 flex items-center justify-between gap-2">
                                    <span
                                        className={`${MONO} text-[10.5px] text-white/40`}
                                    >
                                        Letters · numbers · hyphens · 1–63 chars
                                    </span>
                                    {hostname && (
                                        <span
                                            className={`${MONO} text-[10.5px] inline-flex items-center gap-1 ${
                                                hostnameValid
                                                    ? "text-emerald-400"
                                                    : "text-red-400"
                                            }`}
                                        >
                                            {hostnameValid ? (
                                                <>
                                                    <Check className="h-3 w-3" />{" "}
                                                    Available
                                                </>
                                            ) : (
                                                "Invalid format"
                                            )}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </Section>

                        {/* 05 Authentication */}
                        <Section
                            num="05"
                            title={
                                usesRDP
                                    ? "RDP authentication"
                                    : "SSH authentication"
                            }
                            desc={`Set a strong password for the ${usesRDP ? "RDP" : "SSH"} session. Connection details arrive after deployment.`}
                            status={authStatus}
                            statusLabel={
                                passwordValid
                                    ? "Strong"
                                    : sshPassword
                                      ? "Needs work"
                                      : "Required"
                            }
                        >
                            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px] gap-5">
                                <div className="space-y-3">
                                    <div>
                                        <FieldLabel hint="required">
                                            {usesRDP
                                                ? "RDP password"
                                                : "Root / sudo password"}
                                        </FieldLabel>
                                        <div className="relative">
                                            <Input
                                                type={
                                                    showPassword
                                                        ? "text"
                                                        : "password"
                                                }
                                                value={sshPassword}
                                                onChange={(e) =>
                                                    setSshPassword(
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="At least 12 characters, mixed case, number, symbol"
                                                className="h-11 bg-[#0d0e11] border-white/[0.08] text-white text-[12.5px] pr-16 rounded-[6px]"
                                            />
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setShowPassword(
                                                        (s) => !s,
                                                    )
                                                }
                                                className={`${MONO} absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-[0.14em] text-white/45 hover:text-white px-2 py-1 rounded-[3px]`}
                                            >
                                                {showPassword ? "Hide" : "Show"}
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <FieldLabel>
                                            Confirm password
                                        </FieldLabel>
                                        <Input
                                            type={
                                                showPassword
                                                    ? "text"
                                                    : "password"
                                            }
                                            value={sshPasswordConfirm}
                                            onChange={(e) =>
                                                setSshPasswordConfirm(
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="Re-enter the same password"
                                            className="h-11 bg-[#0d0e11] border-white/[0.08] text-white text-[12.5px] rounded-[6px]"
                                        />
                                        {sshPasswordConfirm &&
                                            sshPassword !==
                                                sshPasswordConfirm && (
                                                <p
                                                    className={`${MONO} mt-1.5 text-[10.5px] text-red-400/85`}
                                                >
                                                    Passwords don&apos;t match
                                                </p>
                                            )}
                                    </div>
                                </div>

                                <div className="border border-white/[0.06] bg-[#0d0e11] rounded-[6px] p-3.5">
                                    <p
                                        className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40 mb-2.5 font-semibold`}
                                    >
                                        Requirements
                                    </p>
                                    <ReqCheck ok={passwordChecks.length}>
                                        12+ characters
                                    </ReqCheck>
                                    <ReqCheck ok={passwordChecks.upper}>
                                        Uppercase letter
                                    </ReqCheck>
                                    <ReqCheck ok={passwordChecks.lower}>
                                        Lowercase letter
                                    </ReqCheck>
                                    <ReqCheck ok={passwordChecks.number}>
                                        Number
                                    </ReqCheck>
                                    <ReqCheck ok={passwordChecks.special}>
                                        Special character
                                    </ReqCheck>
                                </div>
                            </div>
                        </Section>
                    </div>

                    {/* ─── RIGHT: Sticky summary ───────────────── */}
                    <aside className="lg:sticky lg:top-6 self-start">
                        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
                            <header className="border-b border-white/[0.06] px-5 py-4 flex items-start justify-between gap-2">
                                <div>
                                    <p
                                        className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40 mb-1`}
                                    >
                                        Configuration
                                    </p>
                                    <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-white">
                                        Your server
                                    </h3>
                                </div>
                                <span
                                    className={`${MONO} inline-flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.14em] font-semibold`}
                                    style={{
                                        color: formValid ? "#4ade80" : ACCENT,
                                    }}
                                >
                                    <span
                                        className="h-1.5 w-1.5 rounded-full"
                                        style={{
                                            background: formValid
                                                ? "#4ade80"
                                                : ACCENT,
                                            boxShadow: `0 0 6px ${formValid ? "#4ade80" : ACCENT}`,
                                        }}
                                    />
                                    {formValid ? "Ready" : "Pending"}
                                </span>
                            </header>

                            {/* Summary rows */}
                            <div className="px-5 py-3">
                                <SumRow
                                    k="Hostname"
                                    v={hostname || "—"}
                                    empty={!hostname}
                                    mono
                                />
                                <SumRowFlag
                                    k="Region"
                                    regionId={selectedRegion}
                                    regionName={selectedRegionName}
                                />
                                <SumRow
                                    k="Image"
                                    v={selectedOSName || "—"}
                                    empty={!selectedOSName}
                                />
                                <SumRow
                                    k="Plan"
                                    v={selectedPlan?.slug || "—"}
                                    empty={!selectedPlan}
                                    mono
                                />
                                {selectedPlan && (
                                    <>
                                        <SumRow
                                            k="vCPU"
                                            v={`${selectedPlan.vcpu}`}
                                            mono
                                        />
                                        <SumRow
                                            k="Memory"
                                            v={`${ramGB} GB`}
                                            mono
                                        />
                                        <SumRow
                                            k="Storage"
                                            v={`${selectedPlan.diskGB} GB NVMe`}
                                            mono
                                        />
                                        <SumRow
                                            k="Tier"
                                            v={
                                                selectedPlan.tier === "shared"
                                                    ? "Shared CPU"
                                                    : "Dedicated CPU"
                                            }
                                        />
                                    </>
                                )}
                                <SumRow
                                    k="Auth"
                                    v={usesRDP ? "RDP password" : "SSH password"}
                                />
                            </div>

                            {/* Connection preview */}
                            {hostname && hostnameValid && selectedOSName && (
                                <div className="mx-5 mb-4 px-3 py-2.5 border border-white/[0.06] bg-[#08090b] rounded-[5px]">
                                    <div
                                        className={`${MONO} flex items-center justify-between mb-1.5 text-[9.5px] uppercase tracking-[0.14em] font-semibold text-white/35`}
                                    >
                                        Connection preview
                                    </div>
                                    <code
                                        className={`${MONO} text-[10.5px] break-all leading-snug text-white/55`}
                                    >
                                        {usesRDP ? (
                                            <>
                                                <span
                                                    style={{ color: ACCENT }}
                                                >
                                                    rdp://
                                                </span>
                                                <span className="text-emerald-400">
                                                    {defaultUser}
                                                </span>
                                                @
                                                <span className="text-white/85">
                                                    {hostname}
                                                </span>
                                                :3389
                                            </>
                                        ) : (
                                            <>
                                                <span
                                                    style={{ color: ACCENT }}
                                                >
                                                    ssh{" "}
                                                </span>
                                                <span className="text-emerald-400">
                                                    {defaultUser}
                                                </span>
                                                @
                                                <span className="text-white/85">
                                                    {hostname}
                                                </span>
                                            </>
                                        )}
                                    </code>
                                </div>
                            )}

                            {/* Cost block */}
                            <div className="px-5 py-4 bg-[#08090b] border-t border-white/[0.06]">
                                <div className="flex items-baseline justify-between mb-2">
                                    <span
                                        className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/40`}
                                    >
                                        Monthly cost
                                    </span>
                                    {selectedPlan && (
                                        <span
                                            className={`${MONO} text-[10.5px] text-white/45`}
                                        >
                                            ${selectedPlan.hourlyUSD.toFixed(3)}{" "}
                                            / hr
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-baseline gap-1">
                                    {!selectedPlan ? (
                                        <span
                                            style={SERIF_STYLE}
                                            className="text-[28px] font-bold text-white/35 leading-none"
                                        >
                                            —
                                        </span>
                                    ) : (
                                        <>
                                            <span
                                                style={SERIF_STYLE}
                                                className="text-[18px] text-white/50 font-medium leading-none"
                                            >
                                                $
                                            </span>
                                            <span
                                                style={SERIF_STYLE}
                                                className="text-[38px] font-bold tracking-[-0.03em] tabular-nums text-white leading-none"
                                            >
                                                {selectedPlan.monthlyUSD.toFixed(
                                                    selectedPlan.monthlyUSD %
                                                        1 ===
                                                        0
                                                        ? 0
                                                        : 2,
                                                )}
                                            </span>
                                            <span
                                                className={`${MONO} text-[11px] text-white/40 ml-1`}
                                            >
                                                / mo
                                            </span>
                                        </>
                                    )}
                                </div>

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
                                        color:
                                            formValid && !isLoading
                                                ? "#ffffff"
                                                : "rgba(255,255,255,0.35)",
                                        boxShadow:
                                            formValid && !isLoading
                                                ? "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)"
                                                : "none",
                                        cursor:
                                            formValid && !isLoading
                                                ? "pointer"
                                                : "not-allowed",
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!formValid || isLoading) return;
                                        e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT_BRIGHT}, ${ACCENT})`;
                                        e.currentTarget.style.transform =
                                            "translateY(-1px)";
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!formValid || isLoading) return;
                                        e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
                                        e.currentTarget.style.transform =
                                            "none";
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
                                <p
                                    className={`${MONO} text-center text-[10px] text-white/35 mt-2`}
                                >
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
        </div>
    );
};

export default VPSSelect;

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
              : {
                    dot: "rgba(255,255,255,0.25)",
                    text: "rgba(255,255,255,0.35)",
                };

    return (
        <section className="border-t border-white/[0.06] py-8 first:border-t-0 first:pt-0">
            <header className="mb-5 flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
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
                            className={`${MONO} mt-1 text-[11px] text-white/45 leading-snug max-w-[520px]`}
                        >
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
                            boxShadow:
                                status !== "idle"
                                    ? `0 0 6px ${tone.dot}`
                                    : "none",
                        }}
                    />
                    <span className="truncate">{statusLabel}</span>
                </span>
            </header>
            {children}
        </section>
    );
}

function FieldLabel({
    children,
    hint,
}: {
    children: React.ReactNode;
    hint?: string;
}) {
    return (
        <label className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium text-white/85">
                {children}
            </span>
            {hint && (
                <span className={`${MONO} text-[10px] text-white/35`}>
                    {hint}
                </span>
            )}
        </label>
    );
}

function RegionCard({
    region,
    selected,
    onClick,
}: {
    region: Region;
    selected: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={!region.available}
            className="relative text-left px-4 py-3.5 bg-[#111216] hover:bg-[#16181d] transition-colors min-h-[78px] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#111216]"
            style={
                selected
                    ? {
                          background: "#16181d",
                          boxShadow: `inset 0 0 0 1px ${ACCENT}`,
                      }
                    : undefined
            }
        >
            <div className="flex items-center justify-between mb-2">
                <span
                    className={`${MONO} text-[11px] font-semibold tracking-[0.04em] uppercase truncate`}
                    style={{
                        color: selected
                            ? ACCENT
                            : "rgba(255,255,255,0.55)",
                    }}
                >
                    {region.id}
                </span>
                {region.available ? (
                    <span
                        className={`${MONO} text-[9px] uppercase tracking-[0.12em] font-semibold inline-flex items-center gap-1 text-emerald-300/85`}
                    >
                        <span
                            className="h-1 w-1 rounded-full bg-emerald-400"
                            style={{ boxShadow: "0 0 5px #4ade80" }}
                        />
                        Ready
                    </span>
                ) : (
                    <span
                        className={`${MONO} text-[9px] uppercase tracking-[0.12em] font-semibold text-red-400/70`}
                    >
                        Unavailable
                    </span>
                )}
            </div>
            <div className="flex items-center gap-2 min-w-0">
                <FlagImg id={region.id} size={18} />
                <span className="text-[13.5px] font-semibold tracking-[-0.005em] text-white truncate">
                    {region.name}
                </span>
            </div>
        </button>
    );
}

function ReqCheck({
    ok,
    children,
}: {
    ok: boolean;
    children: React.ReactNode;
}) {
    return (
        <div
            className={`${MONO} flex items-center gap-2 text-[11px] py-0.5 ${
                ok ? "text-emerald-300/85" : "text-white/40"
            }`}
        >
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

function SumRow({
    k,
    v,
    empty,
    mono,
}: {
    k: string;
    v: string;
    empty?: boolean;
    mono?: boolean;
}) {
    return (
        <div className="flex items-center justify-between gap-3 py-2 border-b border-white/[0.04] last:border-b-0">
            <span
                className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-medium text-white/40`}
            >
                {k}
            </span>
            <span
                className={`${mono ? MONO : ""} text-[12px] font-medium truncate max-w-[200px] ${
                    empty ? "text-white/25" : "text-white/90"
                }`}
                title={v}
            >
                {v}
            </span>
        </div>
    );
}

function SumRowFlag({
    k,
    regionId,
    regionName,
}: {
    k: string;
    regionId: string;
    regionName: string;
}) {
    const empty = !regionId;
    return (
        <div className="flex items-center justify-between gap-3 py-2 border-b border-white/[0.04] last:border-b-0">
            <span
                className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-medium text-white/40`}
            >
                {k}
            </span>
            <span className="flex items-center gap-2 text-right max-w-[200px] min-w-0">
                {!empty && <FlagImg id={regionId} size={14} />}
                <span
                    className={`text-[12px] font-medium truncate ${
                        empty ? "text-white/25" : "text-white/90"
                    }`}
                >
                    {empty ? "—" : regionName}
                </span>
            </span>
        </div>
    );
}

// ─── Plan picker ──────────────────────────────────────────────────

function PlanPicker({
    plans,
    selectedTier,
    setSelectedTier,
    selectedPlanSlug,
    setSelectedPlanSlug,
    anyPlans,
    isWindowsOrDesktop,
    isWindows,
    isDesktop,
}: {
    plans: PlanOption[];
    selectedTier: "shared" | "dedicated";
    setSelectedTier: (t: "shared" | "dedicated") => void;
    selectedPlanSlug: string;
    setSelectedPlanSlug: (s: string) => void;
    anyPlans: boolean;
    isWindowsOrDesktop: boolean;
    isWindows: boolean;
    isDesktop: boolean;
}) {
    if (!anyPlans) {
        return (
            <div
                className={`${MONO} border border-amber-400/20 bg-amber-400/[0.04] rounded-[6px] p-4 text-[12px] text-amber-200/85`}
            >
                Plan catalog is empty. An administrator needs to add plans
                before VMs can be created.
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Tier toggle — chip style */}
            <div className="inline-flex border border-white/[0.06] bg-[#0d0e11] rounded-[5px] p-0.5 gap-0.5">
                {(["shared", "dedicated"] as const).map((t) => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => setSelectedTier(t)}
                        className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] font-semibold px-3 h-7 rounded-[4px] transition-colors`}
                        style={
                            selectedTier === t
                                ? {
                                      color: ACCENT,
                                      background: ACCENT_DIM,
                                      border:
                                          "1px solid rgba(0,149,255,0.25)",
                                  }
                                : {
                                      color: "rgba(255,255,255,0.55)",
                                      border: "1px solid transparent",
                                  }
                        }
                    >
                        {t === "shared" ? "Shared CPU" : "Dedicated CPU"}
                    </button>
                ))}
            </div>

            {plans.length === 0 ? (
                <div
                    className={`${MONO} border border-dashed border-white/[0.08] rounded-[6px] p-6 text-center text-[11px] text-white/45`}
                >
                    No {selectedTier} plans match the current selection.
                    {isWindowsOrDesktop && (
                        <span className="block mt-1 text-[10.5px] text-white/40">
                            {isWindows ? "Windows" : "Desktop"} requires ≥ 2 GB
                            RAM and{" "}
                            {isWindows ? "≥ 40 GB disk" : "≥ 25 GB disk"}
                        </span>
                    )}
                </div>
            ) : (
                <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
                    {/* Column header */}
                    <div className="hidden md:grid grid-cols-[26px_minmax(64px,86px)_minmax(0,1.4fr)_minmax(120px,1fr)_minmax(120px,1fr)_160px] gap-3 px-4 py-2.5 border-b border-white/[0.06]">
                        <span />
                        <ColHead>Slug</ColHead>
                        <ColHead>Name</ColHead>
                        <ColHead align="right">vCPU / RAM</ColHead>
                        <ColHead align="right">Storage</ColHead>
                        <ColHead align="right">Monthly</ColHead>
                    </div>
                    {plans.map((p, idx) => {
                        const sel = selectedPlanSlug === p.slug;
                        const ramGB =
                            p.memoryMB % 1024 === 0
                                ? p.memoryMB / 1024
                                : (p.memoryMB / 1024).toFixed(1);
                        const popular =
                            !sel && idx === 2 && plans.length >= 4;
                        return (
                            <button
                                type="button"
                                key={p.slug}
                                onClick={() => setSelectedPlanSlug(p.slug)}
                                className="relative group w-full text-left transition-colors border-b border-white/[0.04] last:border-b-0"
                                style={
                                    sel
                                        ? { background: ACCENT_DIM }
                                        : { background: "transparent" }
                                }
                                onMouseEnter={(e) => {
                                    if (!sel)
                                        e.currentTarget.style.background =
                                            "rgba(255,255,255,0.02)";
                                }}
                                onMouseLeave={(e) => {
                                    if (!sel)
                                        e.currentTarget.style.background =
                                            "transparent";
                                }}
                            >
                                {sel && (
                                    <span
                                        className="absolute left-0 top-0 bottom-0 w-[2px]"
                                        style={{ background: ACCENT }}
                                    />
                                )}

                                {/* Desktop row */}
                                <div className="hidden md:grid grid-cols-[26px_minmax(64px,86px)_minmax(0,1.4fr)_minmax(120px,1fr)_minmax(120px,1fr)_160px] gap-3 px-4 py-2.5 items-center">
                                    <span
                                        aria-hidden
                                        className="relative h-[15px] w-[15px] rounded-full shrink-0"
                                        style={{
                                            border: `1.5px solid ${sel ? ACCENT : "rgba(255,255,255,0.18)"}`,
                                        }}
                                    >
                                        {sel && (
                                            <span
                                                className="absolute inset-[3px] rounded-full block"
                                                style={{
                                                    background: ACCENT,
                                                    boxShadow: `0 0 6px rgba(0,149,255,0.6)`,
                                                }}
                                            />
                                        )}
                                    </span>
                                    <span
                                        className={`${MONO} text-[11.5px] text-white/85`}
                                    >
                                        {p.slug}
                                    </span>
                                    <span className="flex items-center gap-2 min-w-0">
                                        <span className="text-[13px] text-white truncate">
                                            {p.name}
                                        </span>
                                        {popular && (
                                            <span
                                                className={`${MONO} text-[9px] font-semibold uppercase tracking-[0.12em] px-1.5 py-px rounded-[3px] shrink-0`}
                                                style={{
                                                    background: ACCENT_DIM,
                                                    color: ACCENT,
                                                    border: "1px solid rgba(0,149,255,0.25)",
                                                }}
                                            >
                                                Popular
                                            </span>
                                        )}
                                    </span>
                                    <span
                                        className={`${MONO} text-right text-[11.5px] text-white/85 tabular-nums`}
                                    >
                                        {p.vcpu} vCPU
                                        <span className="text-white/25">
                                            {" · "}
                                        </span>
                                        {ramGB} GB
                                    </span>
                                    <span
                                        className={`${MONO} text-right text-[11.5px] text-white/65 tabular-nums`}
                                    >
                                        {p.diskGB} GB NVMe
                                    </span>
                                    <span className="text-right flex items-baseline justify-end gap-1.5">
                                        <span
                                            style={SERIF_STYLE}
                                            className="text-[16px] leading-none text-white font-bold tabular-nums"
                                        >
                                            $
                                            {p.monthlyUSD.toFixed(
                                                p.monthlyUSD % 1 === 0
                                                    ? 0
                                                    : 2,
                                            )}
                                        </span>
                                        <span
                                            className={`${MONO} text-[10px] text-white/35`}
                                        >
                                            /mo
                                        </span>
                                    </span>
                                </div>

                                {/* Mobile stacked */}
                                <div className="md:hidden px-4 py-3 flex items-start gap-3">
                                    <span
                                        aria-hidden
                                        className="mt-0.5 relative h-4 w-4 rounded-full shrink-0"
                                        style={{
                                            border: `1.5px solid ${sel ? ACCENT : "rgba(255,255,255,0.18)"}`,
                                        }}
                                    >
                                        {sel && (
                                            <span
                                                className="absolute inset-[3px] rounded-full block"
                                                style={{
                                                    background: ACCENT,
                                                    boxShadow: `0 0 6px rgba(0,149,255,0.6)`,
                                                }}
                                            />
                                        )}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span
                                                className={`${MONO} text-[11.5px] text-white/85`}
                                            >
                                                {p.slug}
                                            </span>
                                            <span className="text-[13px] text-white truncate">
                                                {p.name}
                                            </span>
                                            {popular && (
                                                <span
                                                    className={`${MONO} text-[9px] font-semibold uppercase tracking-[0.12em] px-1.5 py-px rounded-[3px]`}
                                                    style={{
                                                        background:
                                                            ACCENT_DIM,
                                                        color: ACCENT,
                                                        border: "1px solid rgba(0,149,255,0.25)",
                                                    }}
                                                >
                                                    Popular
                                                </span>
                                            )}
                                        </div>
                                        <div
                                            className={`${MONO} mt-1 text-[11px] text-white/55 tabular-nums`}
                                        >
                                            {p.vcpu} vCPU · {ramGB} GB ·{" "}
                                            {p.diskGB} GB NVMe
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <span
                                            style={SERIF_STYLE}
                                            className="text-[16px] leading-none text-white font-bold tabular-nums"
                                        >
                                            $
                                            {p.monthlyUSD.toFixed(
                                                p.monthlyUSD % 1 === 0
                                                    ? 0
                                                    : 2,
                                            )}
                                        </span>
                                        <span
                                            className={`${MONO} ml-1 text-[10px] text-white/35`}
                                        >
                                            /mo
                                        </span>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function ColHead({
    children,
    align = "left",
}: {
    children: React.ReactNode;
    align?: "left" | "right";
}) {
    return (
        <span
            className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/40 ${
                align === "right" ? "text-right" : ""
            }`}
        >
            {children}
        </span>
    );
}

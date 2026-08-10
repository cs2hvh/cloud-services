"use client";

// Bucket create — single-page editorial form matching the
// database/VPS/apps new pages. Numbered sections on the left, sticky
// summary with monthly price + gradient Create button on the right.
// Wiring (name availability check, ACL/CORS/versioning, project, terms)
// is preserved. Admin mode adds an "Owner" section.

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
    AlertCircle,
    ArrowRight,
    Check,
    ChevronLeft,
    Globe,
    HardDrive,
    Loader2,
    Lock,
    MapPin,
    Search,
    Unlock,
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Tables } from "@/lib/supabase/types";
import { BUCKET_NAME_RULES } from "@/lib/validation/object-storage";

// ─── Design tokens ─────────────────────────────────────────────────
const SERIF_STYLE: React.CSSProperties = {
    fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";
const ACCENT_DIM = "rgba(0,149,255,0.08)";

interface BucketCreateProps {
    projects: Tables<"projects">[];
    locations: Tables<"locations">[];
    userId: string;
    buckets: { name: string }[];
    role: "user" | "admin";
    allUsers?: Array<{
        id: string;
        email: string;
        username?: string;
    }>;
}

const BucketCreate = ({
    projects,
    locations,
    userId,
    buckets,
    role,
    allUsers = [],
}: BucketCreateProps) => {
    const router = useRouter();
    const isAdmin = role === "admin";

    const [isLoading, setIsLoading] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [userSearchQuery, setUserSearchQuery] = useState("");
    // null = we could not read the catalog. Distinct from 0, which genuinely
    // means free — conflating the two made a failed price fetch advertise
    // "Free" storage on a paid bucket.
    const [storagePrice, setStoragePrice] = useState<number | null>(null);
    const [loadingPrice, setLoadingPrice] = useState(true);
    const [isCheckingName, setIsCheckingName] = useState(false);
    const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);

    const [formData, setFormData] = useState({
        selectedUser: isAdmin ? "" : userId,
        name: "",
        region: undefined as string | undefined,
        project_id: projects[0]?.id || "",
        acl: "private" as "private" | "public-read",
        cors_enabled: false,
        versioning_enabled: false,
    });

    // ── Fetch storage price ─────────────────────────────────────
    useEffect(() => {
        (async () => {
            try {
                const endpoint = isAdmin
                    ? "/api/admin/products?type=object-storage"
                    : "/api/products?type=object-storage";
                const res = await axios.get(endpoint);
                const products = res?.data?.products;
                if (products && products.length > 0) {
                    setStoragePrice(parseFloat(products[0].price) || 0);
                }
            } catch (err) {
                console.error("Error fetching storage price:", err);
                setStoragePrice(null);
            } finally {
                setLoadingPrice(false);
            }
        })();
    }, [isAdmin]);

    // ── Validation helpers ─────────────────────────────────────
    const localNameError = useMemo(() => {
        const n = formData.name;
        if (!n) return "";
        if (n.length < BUCKET_NAME_RULES.minLength)
            return `At least ${BUCKET_NAME_RULES.minLength} characters`;
        if (n.length > BUCKET_NAME_RULES.maxLength)
            return `At most ${BUCKET_NAME_RULES.maxLength} characters`;
        if (!BUCKET_NAME_RULES.pattern.test(n))
            return BUCKET_NAME_RULES.description;
        if (n.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/))
            return "Cannot be an IP address";
        if (n.startsWith("xn--")) return "Cannot start with 'xn--'";
        if (n.endsWith("-s3alias")) return "Cannot end with '-s3alias'";
        if (buckets.some((b) => b.name === n))
            return "Name already taken in this account";
        return "";
    }, [formData.name, buckets]);

    // Debounced global availability check
    useEffect(() => {
        if (!formData.name || localNameError) {
            setNameAvailable(null);
            return;
        }
        const t = setTimeout(async () => {
            setIsCheckingName(true);
            try {
                const resp = await axios.get(
                    "/api/services/object-storage/check-bucket",
                    { params: { name: formData.name } },
                );
                const exists = resp.data?.exists;
                setNameAvailable(!exists);
            } catch (err) {
                console.error("name availability check failed", err);
                setNameAvailable(null);
            } finally {
                setIsCheckingName(false);
            }
        }, 450);
        return () => clearTimeout(t);
    }, [formData.name, localNameError]);

    const ownerOk = !isAdmin || !!formData.selectedUser;
    const nameOk =
        !!formData.name && !localNameError && nameAvailable === true;
    const regionOk = !!formData.region;
    const projectOk = !!formData.project_id;
    const canSubmit =
        ownerOk && nameOk && regionOk && projectOk && termsAccepted && !isLoading;

    // ── Filtered users (admin) ─────────────────────────────────
    const filteredUsers = useMemo(() => {
        const q = userSearchQuery.toLowerCase();
        return allUsers.filter(
            (u) =>
                !q ||
                u.email.toLowerCase().includes(q) ||
                (u.username && u.username.toLowerCase().includes(q)) ||
                u.id.toLowerCase().includes(q),
        );
    }, [allUsers, userSearchQuery]);

    const handleUserSelect = (selectedUserId: string) => {
        setFormData((prev) => {
            const projectBelongs = projects.some(
                (p) => p.id === prev.project_id && p.owner === selectedUserId,
            );
            return {
                ...prev,
                selectedUser: selectedUserId,
                project_id: projectBelongs
                    ? prev.project_id
                    : projects.find((p) => p.owner === selectedUserId)?.id ?? "",
            };
        });
    };

    // ── Filtered projects (admin filters by selected user) ─────
    const filteredProjects = useMemo(() => {
        if (!isAdmin || !formData.selectedUser) return projects;
        return projects.filter((p) => p.owner === formData.selectedUser);
    }, [isAdmin, formData.selectedUser, projects]);

    // ── Submit ─────────────────────────────────────────────────
    const onSubmit = async () => {
        if (!canSubmit) {
            toast.error("Please complete every section");
            return;
        }
        setIsLoading(true);
        try {
            const payload = {
                type: "bucket" as const,
                name: formData.name.toLowerCase(),
                region: formData.region,
                project_id: formData.project_id,
                owner_id: isAdmin ? formData.selectedUser : userId,
                acl: formData.acl,
                cors_enabled: formData.cors_enabled,
                versioning_enabled: formData.versioning_enabled,
                status: "creating" as const,
                size_bytes: 0,
                object_count: 0,
            };
            await axios.post(
                "/api/services/object-storage/buckets/create",
                payload,
            );
            toast.success("Bucket created");
            router.push(
                isAdmin
                    ? "/dashboard/admin/object-storage"
                    : "/dashboard/services/object-storage",
            );
            router.refresh();
        } catch (err) {
            toast.error(
                axios.isAxiosError(err)
                    ? err.response?.data?.error || "Failed to create bucket"
                    : "Failed to create bucket",
            );
        } finally {
            setIsLoading(false);
        }
    };

    const selectedLocation = locations.find(
        (loc) => loc.short === formData.region,
    );
    const selectedProject = projects.find(
        (p) => p.id === formData.project_id,
    );
    const selectedUser = allUsers.find((u) => u.id === formData.selectedUser);

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

            <div className="relative z-10 px-6 py-8 sm:px-10 sm:py-10 max-w-[1560px] mx-auto">
                {/* Back link */}
                <div className="mb-6">
                    <Link
                        href={
                            isAdmin
                                ? "/dashboard/admin/object-storage"
                                : "/dashboard/services/object-storage"
                        }
                        className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/40 hover:text-white/75 transition-colors`}
                    >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Back to buckets
                    </Link>
                </div>

                {/* Hero */}
                <h1 className="text-[34px] sm:text-[40px] leading-[1.05] tracking-[-0.025em] text-white font-semibold mb-2">
                    Create{" "}
                    <span
                        style={{ ...SERIF_STYLE, color: ACCENT }}
                        className="font-normal"
                    >
                        a bucket
                    </span>
                </h1>
                <p
                    className={`${MONO} max-w-2xl text-[11.5px] text-white/45 leading-relaxed mb-10`}
                >
                    Pick a name, choose a region, set access. S3-compatible
                    endpoints provisioned in seconds.
                </p>

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-10 items-start">
                    {/* ─── LEFT: Sections ──────────────────────── */}
                    <div className="min-w-0">
                        {/* Admin-only: 00 Owner */}
                        {isAdmin && (
                            <Section
                                num="00"
                                title="Bucket owner"
                                desc="Assign this bucket to a customer account."
                                status={ownerOk ? "done" : "idle"}
                                statusLabel={
                                    selectedUser
                                        ? selectedUser.email
                                        : "Required"
                                }
                            >
                                <div className="max-w-[640px]">
                                    <div className="flex items-center gap-2.5 px-3 h-9 mb-3 border border-white/[0.08] bg-[#0d0e11] rounded-[5px] focus-within:border-white/25">
                                        <Search className="h-3.5 w-3.5 text-white/40 shrink-0" />
                                        <input
                                            type="text"
                                            placeholder="Search email, username, or user ID…"
                                            value={userSearchQuery}
                                            onChange={(e) =>
                                                setUserSearchQuery(
                                                    e.target.value,
                                                )
                                            }
                                            className={`${MONO} flex-1 bg-transparent text-[12px] text-white placeholder:text-white/30 outline-none`}
                                        />
                                    </div>
                                    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden max-h-72 overflow-y-auto">
                                        {filteredUsers.length === 0 ? (
                                            <div
                                                className={`${MONO} text-[11px] text-white/45 p-6 text-center`}
                                            >
                                                No users found
                                            </div>
                                        ) : (
                                            filteredUsers.map((u) => {
                                                const sel =
                                                    formData.selectedUser ===
                                                    u.id;
                                                return (
                                                    <button
                                                        key={u.id}
                                                        type="button"
                                                        onClick={() =>
                                                            handleUserSelect(
                                                                u.id,
                                                            )
                                                        }
                                                        className="relative w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-white/[0.04] last:border-b-0 transition-colors"
                                                        style={
                                                            sel
                                                                ? {
                                                                      background:
                                                                          ACCENT_DIM,
                                                                  }
                                                                : {
                                                                      background:
                                                                          "transparent",
                                                                  }
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
                                                                style={{
                                                                    background:
                                                                        ACCENT,
                                                                }}
                                                            />
                                                        )}
                                                        <div className="min-w-0 flex-1">
                                                            <div
                                                                className={`${MONO} text-[12px] text-white truncate`}
                                                            >
                                                                {u.email}
                                                            </div>
                                                            <div
                                                                className={`${MONO} text-[10px] text-white/40 mt-0.5 truncate`}
                                                            >
                                                                {u.username
                                                                    ? `@${u.username}`
                                                                    : u.id.slice(
                                                                          0,
                                                                          8,
                                                                      ) + "…"}
                                                            </div>
                                                        </div>
                                                        {sel && (
                                                            <span
                                                                className="h-4 w-4 rounded-full inline-flex items-center justify-center"
                                                                style={{
                                                                    background:
                                                                        ACCENT,
                                                                }}
                                                            >
                                                                <Check
                                                                    className="h-2.5 w-2.5 text-white"
                                                                    strokeWidth={
                                                                        3
                                                                    }
                                                                />
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            </Section>
                        )}

                        {/* 01 Identity */}
                        <Section
                            num="01"
                            title="Bucket identity"
                            desc="Globally unique name used in S3 URLs and ARNs."
                            status={
                                nameOk
                                    ? "done"
                                    : formData.name
                                      ? "active"
                                      : "idle"
                            }
                            statusLabel={
                                nameOk
                                    ? "Available"
                                    : formData.name
                                      ? isCheckingName
                                          ? "Checking…"
                                          : localNameError ||
                                            (nameAvailable === false
                                                ? "Taken globally"
                                                : "Check name")
                                      : "Required"
                            }
                        >
                            <div className="max-w-[680px]">
                                <FieldLabel hint="3–63 chars · lowercase">
                                    Bucket name
                                </FieldLabel>
                                <Input
                                    value={formData.name}
                                    onChange={(e) => {
                                        const v = e.target.value.toLowerCase();
                                        setFormData({ ...formData, name: v });
                                    }}
                                    placeholder="my-bucket"
                                    mono
                                />
                                <div className="mt-2 flex items-center justify-between gap-2 min-h-[16px]">
                                    <span
                                        className={`${MONO} text-[10.5px] text-white/40`}
                                    >
                                        Lowercase letters, numbers, and hyphens
                                        only
                                    </span>
                                    {formData.name && (
                                        <span
                                            className={`${MONO} text-[10.5px] inline-flex items-center gap-1`}
                                            style={{
                                                color: localNameError
                                                    ? "#f87171"
                                                    : isCheckingName
                                                      ? "rgba(255,255,255,0.55)"
                                                      : nameAvailable === true
                                                        ? "#4ade80"
                                                        : nameAvailable ===
                                                            false
                                                          ? "#f87171"
                                                          : "rgba(255,255,255,0.45)",
                                            }}
                                        >
                                            {localNameError ? (
                                                <>
                                                    <AlertCircle className="h-3 w-3" />
                                                    {localNameError}
                                                </>
                                            ) : isCheckingName ? (
                                                <>
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                    Checking
                                                </>
                                            ) : nameAvailable === true ? (
                                                <>
                                                    <Check className="h-3 w-3" />
                                                    Available
                                                </>
                                            ) : nameAvailable === false ? (
                                                <>
                                                    <AlertCircle className="h-3 w-3" />
                                                    Taken globally
                                                </>
                                            ) : null}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </Section>

                        {/* 02 Region */}
                        <Section
                            num="02"
                            title="Region"
                            desc="Where the bucket primary copies live. Replicas can be added later."
                            status={regionOk ? "done" : "idle"}
                            statusLabel={
                                selectedLocation
                                    ? selectedLocation.city
                                    : "Required"
                            }
                        >
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-px bg-white/[0.06] border border-white/[0.06] rounded-[6px] overflow-hidden">
                                {locations.map((r) => {
                                    const sel = formData.region === r.short;
                                    return (
                                        <button
                                            key={r.id}
                                            type="button"
                                            disabled={!r.available}
                                            onClick={() =>
                                                setFormData({
                                                    ...formData,
                                                    region: r.short,
                                                })
                                            }
                                            className="relative text-left px-4 py-3.5 bg-[#111216] hover:bg-[#16181d] transition-colors min-h-[78px] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#111216]"
                                            style={
                                                sel
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
                                                        color: sel
                                                            ? ACCENT
                                                            : "rgba(255,255,255,0.55)",
                                                    }}
                                                >
                                                    {r.short} ·{" "}
                                                    {r.country_code || ""}
                                                </span>
                                                {r.available ? (
                                                    <span
                                                        className={`${MONO} text-[9px] uppercase tracking-[0.12em] font-semibold inline-flex items-center gap-1 text-emerald-300/85`}
                                                    >
                                                        <span
                                                            className="h-1 w-1 rounded-full bg-emerald-400"
                                                            style={{
                                                                boxShadow:
                                                                    "0 0 5px #4ade80",
                                                            }}
                                                        />
                                                        Ready
                                                    </span>
                                                ) : (
                                                    <span
                                                        className={`${MONO} text-[9px] uppercase tracking-[0.12em] font-semibold text-white/35`}
                                                    >
                                                        Soon
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 min-w-0">
                                                {r.country_code ? (
                                                    <Image
                                                        src={`https://flagcdn.com/${r.country_code.toLowerCase()}.svg`}
                                                        alt=""
                                                        width={18}
                                                        height={12}
                                                        className="rounded-sm shrink-0"
                                                        unoptimized
                                                    />
                                                ) : (
                                                    <MapPin className="h-3 w-3 text-white/40 shrink-0" />
                                                )}
                                                <div className="min-w-0">
                                                    <div className="text-[13.5px] font-semibold tracking-[-0.005em] text-white truncate">
                                                        {r.city}
                                                    </div>
                                                    <div
                                                        className={`${MONO} text-[10px] text-white/40 truncate`}
                                                    >
                                                        {r.country}
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </Section>

                        {/* 03 Access & policies */}
                        <Section
                            num="03"
                            title="Access & policies"
                            desc="ACL defaults, CORS, and per-object versioning."
                            status="done"
                            statusLabel={
                                formData.acl === "private"
                                    ? "Private"
                                    : "Public read"
                            }
                        >
                            <div className="grid grid-cols-1 gap-3 max-w-[640px]">
                                <ToggleRow
                                    icon={
                                        formData.acl === "private" ? (
                                            <Lock className="h-3.5 w-3.5 text-emerald-300" />
                                        ) : (
                                            <Unlock className="h-3.5 w-3.5 text-amber-300" />
                                        )
                                    }
                                    title="Access control (ACL)"
                                    desc={
                                        formData.acl === "private"
                                            ? "Private — only signed requests can read or write."
                                            : "Public read — anonymous GET allowed on objects."
                                    }
                                    right={
                                        <Select
                                            value={formData.acl}
                                            onValueChange={(
                                                v: "private" | "public-read",
                                            ) =>
                                                setFormData({
                                                    ...formData,
                                                    acl: v,
                                                })
                                            }
                                        >
                                            <SelectTrigger
                                                className={`${MONO} h-9 w-[160px] bg-[#0d0e11] border-white/[0.08] text-white text-[11.5px] rounded-[5px]`}
                                            >
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="border-white/[0.1] bg-[#111216] text-white">
                                                <SelectItem value="private">
                                                    Private
                                                </SelectItem>
                                                <SelectItem value="public-read">
                                                    Public read
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    }
                                />
                                <ToggleRow
                                    icon={
                                        <Globe
                                            className="h-3.5 w-3.5"
                                            style={{ color: ACCENT }}
                                        />
                                    }
                                    title="CORS"
                                    desc="Allow cross-origin requests to objects in this bucket."
                                    right={
                                        <Switch
                                            on={formData.cors_enabled}
                                            onChange={(v) =>
                                                setFormData({
                                                    ...formData,
                                                    cors_enabled: v,
                                                })
                                            }
                                        />
                                    }
                                />
                                <ToggleRow
                                    icon={
                                        <HardDrive
                                            className="h-3.5 w-3.5"
                                            style={{ color: "#a78bfa" }}
                                        />
                                    }
                                    title="Object versioning"
                                    desc="Keep historical versions of every object. Soft-delete protection."
                                    right={
                                        <Switch
                                            on={formData.versioning_enabled}
                                            onChange={(v) =>
                                                setFormData({
                                                    ...formData,
                                                    versioning_enabled: v,
                                                })
                                            }
                                        />
                                    }
                                />
                            </div>
                        </Section>

                        {/* 04 Project */}
                        <Section
                            num="04"
                            title="Project"
                            desc="Resource group for IAM, billing, and quotas."
                            status={projectOk ? "done" : "idle"}
                            statusLabel={
                                selectedProject?.name ?? "Required"
                            }
                        >
                            <div className="max-w-[680px]">
                                <FieldLabel hint="required">Project</FieldLabel>
                                {filteredProjects.length === 0 ? (
                                    <div
                                        className={`${MONO} text-[11px] text-white/45 px-4 h-11 inline-flex items-center border border-dashed border-white/[0.08] rounded-[6px] w-full`}
                                    >
                                        {isAdmin && formData.selectedUser
                                            ? "No projects found for selected user"
                                            : "No projects available"}
                                    </div>
                                ) : (
                                    <Select
                                        value={formData.project_id}
                                        onValueChange={(v) =>
                                            setFormData({
                                                ...formData,
                                                project_id: v,
                                            })
                                        }
                                    >
                                        <SelectTrigger
                                            className={`${MONO} h-11 bg-[#0d0e11] border-white/[0.08] text-white text-[12px] rounded-[6px]`}
                                        >
                                            <SelectValue placeholder="Select project" />
                                        </SelectTrigger>
                                        <SelectContent className="border-white/[0.1] bg-[#111216] text-white">
                                            {filteredProjects.map((p) => (
                                                <SelectItem
                                                    key={p.id}
                                                    value={p.id}
                                                >
                                                    {p.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                        </Section>

                        {/* 05 Confirm */}
                        <Section
                            num="05"
                            title="Review and confirm"
                            desc="Provisioning begins immediately after confirmation."
                            status={termsAccepted ? "done" : "idle"}
                            statusLabel={
                                termsAccepted ? "Accepted" : "Required"
                            }
                        >
                            <label className="flex items-start gap-3 px-4 py-3 border border-white/[0.06] bg-[#111216] rounded-[6px] cursor-pointer max-w-[640px]">
                                <input
                                    type="checkbox"
                                    checked={termsAccepted}
                                    onChange={(e) =>
                                        setTermsAccepted(e.target.checked)
                                    }
                                    className="mt-1 h-3.5 w-3.5 accent-[#0095FF]"
                                />
                                <span className="text-[12.5px] leading-snug text-white/75">
                                    I accept the{" "}
                                    <Link
                                        href="/terms"
                                        className="text-white underline underline-offset-4"
                                    >
                                        Terms of Service
                                    </Link>{" "}
                                    and{" "}
                                    <Link
                                        href="/privacy"
                                        className="text-white underline underline-offset-4"
                                    >
                                        Privacy Policy
                                    </Link>{" "}
                                    for provisioning this bucket.
                                </span>
                            </label>
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
                                        Your bucket
                                    </h3>
                                </div>
                                <span
                                    className={`${MONO} inline-flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.14em] font-semibold`}
                                    style={{
                                        color: canSubmit ? "#4ade80" : ACCENT,
                                    }}
                                >
                                    <span
                                        className="h-1.5 w-1.5 rounded-full"
                                        style={{
                                            background: canSubmit
                                                ? "#4ade80"
                                                : ACCENT,
                                            boxShadow: `0 0 6px ${canSubmit ? "#4ade80" : ACCENT}`,
                                        }}
                                    />
                                    {canSubmit ? "Ready" : "Pending"}
                                </span>
                            </header>

                            {/* Summary rows */}
                            <div className="px-5 py-3">
                                {isAdmin && (
                                    <SumRow
                                        k="Owner"
                                        v={selectedUser?.email || "—"}
                                        empty={!selectedUser}
                                    />
                                )}
                                <SumRow
                                    k="Name"
                                    v={formData.name || "—"}
                                    empty={!formData.name}
                                    mono
                                />
                                <SumRow
                                    k="Region"
                                    v={
                                        selectedLocation
                                            ? `${selectedLocation.city} · ${selectedLocation.short}`
                                            : "—"
                                    }
                                    empty={!selectedLocation}
                                />
                                <SumRow
                                    k="Access"
                                    v={
                                        formData.acl === "private"
                                            ? "Private"
                                            : "Public read"
                                    }
                                />
                                <SumRow
                                    k="CORS"
                                    v={
                                        formData.cors_enabled
                                            ? "Enabled"
                                            : "Off"
                                    }
                                />
                                <SumRow
                                    k="Versioning"
                                    v={
                                        formData.versioning_enabled
                                            ? "Enabled"
                                            : "Off"
                                    }
                                />
                                <SumRow
                                    k="Project"
                                    v={selectedProject?.name || "—"}
                                    empty={!selectedProject}
                                />
                            </div>

                            {/* Endpoint preview */}
                            {formData.name && nameOk && selectedLocation && (
                                <div className="mx-5 mb-4 px-3 py-2.5 border border-white/[0.06] bg-[#08090b] rounded-[5px]">
                                    <div
                                        className={`${MONO} flex items-center justify-between mb-1.5 text-[9.5px] uppercase tracking-[0.14em] font-semibold text-white/35`}
                                    >
                                        Endpoint preview
                                    </div>
                                    <code
                                        className={`${MONO} text-[10.5px] break-all leading-snug text-white/55`}
                                    >
                                        <span style={{ color: ACCENT }}>
                                            https://
                                        </span>
                                        <span className="text-white/85">
                                            {formData.name}
                                        </span>
                                        .s3.
                                        <span className="text-emerald-400">
                                            {selectedLocation.short.toLowerCase()}
                                        </span>
                                        .ahurasense.com
                                    </code>
                                </div>
                            )}

                            {/* Cost block */}
                            <div className="px-5 py-4 bg-[#08090b] border-t border-white/[0.06]">
                                <p
                                    className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/40 mb-2`}
                                >
                                    Monthly cost
                                </p>
                                <div className="flex items-baseline gap-1">
                                    {/* Not-yet-known and could-not-be-known read
                                        the same to the customer; only a real 0
                                        from the catalog may say "Free". */}
                                    {loadingPrice || storagePrice === null ? (
                                        <span
                                            style={SERIF_STYLE}
                                            className="text-[28px] font-bold text-white/35 leading-none"
                                        >
                                            —
                                        </span>
                                    ) : storagePrice === 0 ? (
                                        <span
                                            style={SERIF_STYLE}
                                            className="text-[34px] font-bold text-emerald-300 leading-none"
                                        >
                                            Free
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
                                                {storagePrice.toFixed(
                                                    storagePrice < 10 ? 2 : 0,
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
                                <p
                                    className={`${MONO} mt-2 text-[10.5px] text-white/40`}
                                >
                                    Storage + egress billed by usage
                                </p>

                                <button
                                    type="button"
                                    disabled={!canSubmit}
                                    onClick={onSubmit}
                                    className={`${MONO} mt-4 w-full inline-flex items-center justify-center gap-2 h-11 text-[11.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all`}
                                    style={{
                                        background: canSubmit
                                            ? `linear-gradient(135deg, ${ACCENT}, #0066B3)`
                                            : "#1a1d24",
                                        color: canSubmit
                                            ? "#ffffff"
                                            : "rgba(255,255,255,0.35)",
                                        boxShadow: canSubmit
                                            ? "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)"
                                            : "none",
                                        cursor: canSubmit
                                            ? "pointer"
                                            : "not-allowed",
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!canSubmit) return;
                                        e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT_BRIGHT}, ${ACCENT})`;
                                        e.currentTarget.style.transform =
                                            "translateY(-1px)";
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!canSubmit) return;
                                        e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
                                        e.currentTarget.style.transform =
                                            "none";
                                    }}
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            Creating
                                        </>
                                    ) : (
                                        <>
                                            Create bucket
                                            <ArrowRight className="h-3.5 w-3.5" />
                                        </>
                                    )}
                                </button>
                                <p
                                    className={`${MONO} text-center text-[10px] text-white/35 mt-2`}
                                >
                                    S3-compatible · ready in seconds
                                </p>
                            </div>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
};

export default BucketCreate;

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
            <header className="mb-5 flex items-start justify-between gap-4 flex-wrap">
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
                            className={`${MONO} mt-1 text-[11px] text-white/45 leading-snug max-w-[680px]`}
                        >
                            {desc}
                        </p>
                    </div>
                </div>
                <span
                    className={`${MONO} inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] font-semibold shrink-0 mt-1 truncate max-w-[220px]`}
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

function Input({
    mono,
    className,
    ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
    return (
        <input
            {...rest}
            className={`${mono ? MONO : ""} w-full h-11 bg-[#0d0e11] border border-white/[0.08] text-white text-[12.5px] px-3 rounded-[6px] outline-none placeholder:text-white/25 hover:border-white/15 focus:border-[${ACCENT}] focus:shadow-[0_0_0_3px_rgba(0,149,255,0.09)] transition-all ${className ?? ""}`}
        />
    );
}

function ToggleRow({
    icon,
    title,
    desc,
    right,
}: {
    icon: React.ReactNode;
    title: string;
    desc: string;
    right: React.ReactNode;
}) {
    return (
        <div className="flex items-center justify-between gap-4 border border-white/[0.06] bg-[#111216] rounded-[6px] px-4 py-3">
            <div className="flex items-start gap-3 min-w-0">
                <span className="h-7 w-7 shrink-0 inline-flex items-center justify-center border border-white/[0.08] bg-[#0d0e11] rounded-[5px]">
                    {icon}
                </span>
                <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-white">
                        {title}
                    </div>
                    <p
                        className={`${MONO} mt-0.5 text-[10.5px] text-white/45 leading-snug`}
                    >
                        {desc}
                    </p>
                </div>
            </div>
            <div className="shrink-0">{right}</div>
        </div>
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
            className="relative inline-flex w-9 h-5 items-center border rounded-full transition-colors p-0.5"
            style={{
                background: on ? ACCENT : "#0d0e11",
                borderColor: on
                    ? "rgba(0,149,255,0.4)"
                    : "rgba(255,255,255,0.08)",
            }}
            role="switch"
            aria-checked={on}
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


"use client";

// Spectrum / DDoS protection create — single-page editorial form
// matching the database/VPS/apps new pages. Numbered sections on the
// left, sticky summary with monthly price + gradient Create button on
// the right. All form data + submission wiring preserved.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    AlertCircle,
    ArrowRight,
    Check,
    ChevronLeft,
    Loader2,
    Search,
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

// ─── Design tokens ─────────────────────────────────────────────────
const SERIF_STYLE: React.CSSProperties = {
    fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";
const ACCENT_DIM = "rgba(0,149,255,0.08)";

interface SpectrumFormData {
    selectedUser?: string;
    appType: "tcp" | "udp" | "ssh" | "rdp" | "";
    domain: string;
    edgePort: number;
    originType: "ip-dns" | "load-balancer" | "";
    originIP: string;
    originPort: number;
    argoSmartRouting: boolean;
    tls: "off" | "full";
    ipAccessRule: boolean;
    proxyProtocol: "off" | "v1" | "v2" | "simple";
    edgeIpType: string;
    edgeIpConnectivity: string;
    trafficType: string;
    project_id: string;
}

interface SpectrumAppCreateProps {
    projects: Tables<"projects">[];
    userId: string;
    role?: "user" | "admin";
    allUsers?: Array<{
        id: string;
        email: string;
        username?: string;
    }>;
    spectrumApps?: string[];
}

const APP_TYPES = [
    {
        value: "tcp",
        label: "TCP",
        desc: "Generic TCP listener — game servers, MQTT, custom services.",
    },
    {
        value: "udp",
        label: "UDP",
        desc: "Connectionless UDP — DNS, QUIC, real-time game traffic.",
    },
    {
        value: "ssh",
        label: "SSH",
        desc: "Shell access — port 22 locked end-to-end.",
    },
    {
        value: "rdp",
        label: "RDP",
        desc: "Remote desktop — port 3389 locked end-to-end.",
    },
] as const;

const SpectrumAppCreate = ({
    projects,
    userId,
    role = "user",
    allUsers = [],
    spectrumApps = [],
}: SpectrumAppCreateProps) => {
    const router = useRouter();
    const isAdmin = role === "admin";

    const [isLoading, setIsLoading] = useState(false);
    const [userSearchQuery, setUserSearchQuery] = useState("");
    const [spectrumPrice, setSpectrumPrice] = useState<number>(0);
    const [loadingPrice, setLoadingPrice] = useState(true);
    const [termsAccepted, setTermsAccepted] = useState(false);

    const [formData, setFormData] = useState<SpectrumFormData>({
        selectedUser: isAdmin ? "" : userId,
        appType: "",
        domain: "",
        edgePort: 0,
        originType: "ip-dns",
        originIP: "",
        originPort: 0,
        argoSmartRouting: false,
        tls: "off",
        ipAccessRule: false,
        proxyProtocol: "off",
        edgeIpType: "dynamic",
        edgeIpConnectivity: "all",
        trafficType: "direct",
        project_id: projects[0]?.id || "",
    });

    const updateFormData = (data: Partial<SpectrumFormData>) =>
        setFormData((prev) => ({ ...prev, ...data }));

    const isSSHorRDP = formData.appType === "ssh" || formData.appType === "rdp";

    // ── Fetch price ─────────────────────────────────────────────
    useEffect(() => {
        (async () => {
            try {
                if (isAdmin) {
                    const res = await axios.get(
                        "/api/admin/products?type=network-ddos",
                    );
                    const products = res?.data?.products;
                    if (products && products.length > 0) {
                        setSpectrumPrice(parseFloat(products[0].price) || 0);
                    }
                } else {
                    const res = await axios.get(
                        "/api/pricing?category=network-ddos",
                    );
                    const monthly = res?.data?.category?.tiers?.[0]?.price?.monthly;
                    if (typeof monthly === "number" && Number.isFinite(monthly)) {
                        setSpectrumPrice(monthly);
                    }
                }
            } catch (err) {
                console.error("Error fetching spectrum price:", err);
                setSpectrumPrice(0);
            } finally {
                setLoadingPrice(false);
            }
        })();
    }, [isAdmin]);

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
        setFormData((prev) => ({
            ...prev,
            selectedUser: selectedUserId,
        }));
    };

    // ── Filtered projects (admin filters by selected user) ─────
    const filteredProjects = useMemo(() => {
        if (!isAdmin || !formData.selectedUser) return projects;
        return projects.filter(
            (project) =>
                project.owner === formData.selectedUser ||
                (project.users &&
                    Array.isArray(project.users) &&
                    (project.users as string[]).includes(
                        formData.selectedUser!,
                    )),
        );
    }, [isAdmin, formData.selectedUser, projects]);

    // ── Validation ──────────────────────────────────────────────
    const ownerOk = !isAdmin || !!formData.selectedUser;
    const appTypeOk = !!formData.appType;
    const domainNameError = useMemo(() => {
        const v = formData.domain;
        if (!v) return "";
        if (
            !/^(?=.*[A-Za-z])[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$/.test(v)
        )
            return "Must start with a letter, letters/numbers only";
        if (spectrumApps.includes(v))
            return "Domain name already in use";
        return "";
    }, [formData.domain, spectrumApps]);
    const domainOk = !!formData.domain && !domainNameError;
    const edgePortOk =
        isSSHorRDP ||
        (formData.edgePort >= 1 && formData.edgePort <= 65535);
    const originOk =
        !!formData.originIP &&
        formData.originPort >= 1 &&
        formData.originPort <= 65535;
    const projectOk = !!formData.project_id;
    const canSubmit =
        ownerOk &&
        appTypeOk &&
        domainOk &&
        edgePortOk &&
        originOk &&
        projectOk &&
        termsAccepted &&
        !isLoading;

    // ── Submit ─────────────────────────────────────────────────
    const onSubmit = async () => {
        if (!canSubmit) {
            toast.error("Please complete every section");
            return;
        }

        const targetUserId = isAdmin ? formData.selectedUser : userId;
        if (!targetUserId) {
            toast.error("Invalid user selection");
            return;
        }

        setIsLoading(true);
        try {
            const protocol =
                formData.appType === "rdp" || formData.appType === "ssh"
                    ? "tcp"
                    : formData.appType;
            const res = await fetch("/api/services/spectrum/apps/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    dns: {
                        name: formData.domain,
                        type: "CNAME",
                        original_protocol: formData.appType,
                    },
                    protocol: `${protocol}/${formData.edgePort}`,
                    argo_smart_routing: true,
                    proxy_protocol: formData.proxyProtocol,
                    tls: "off",
                    origin_direct: [
                        `${protocol}://${formData.originIP}:${formData.originPort}`,
                    ],
                    project_id: formData.project_id,
                    owner_id: targetUserId,
                    role: role,
                }),
            });

            if (res.status === 201) {
                toast.success("Spectrum application created.");
                router.push(
                    isAdmin
                        ? "/dashboard/admin/network-ddos"
                        : "/dashboard/services/network-ddos",
                );
                router.refresh();
            } else if (res.status === 402) {
                toast.error(
                    "Insufficient balance. Please top up your account.",
                );
                router.push("/dashboard/nav/billing");
            } else {
                toast.error(
                    "We are temporarily unable to process your request. Please try again later.",
                );
            }
        } catch (err) {
            console.error("Failed to create Spectrum app:", err);
            toast.error("Failed to create Spectrum application.");
        } finally {
            setIsLoading(false);
        }
    };

    const selectedUserObj = allUsers.find(
        (u) => u.id === formData.selectedUser,
    );
    const selectedProject = filteredProjects.find(
        (p) => p.id === formData.project_id,
    );

    // Default edge port for SSH/RDP
    useEffect(() => {
        if (formData.appType === "ssh") {
            updateFormData({ edgePort: 22, originPort: 22 });
        } else if (formData.appType === "rdp") {
            updateFormData({ edgePort: 3389, originPort: 3389 });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formData.appType]);

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

            <div className="relative z-10 px-6 py-8 sm:px-10 sm:py-10">
                {/* Back link */}
                <div className="mb-6">
                    <Link
                        href={
                            isAdmin
                                ? "/dashboard/admin/network-ddos"
                                : "/dashboard/services/network-ddos"
                        }
                        className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/40 hover:text-white/75 transition-colors`}
                    >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Back to protection
                    </Link>
                </div>

                {/* Hero */}
                <h1 className="text-[34px] sm:text-[40px] leading-[1.05] tracking-[-0.025em] text-white font-semibold mb-2">
                    Protect{" "}
                    <span
                        style={{ ...SERIF_STYLE, color: ACCENT }}
                        className="font-normal"
                    >
                        an application
                    </span>
                </h1>
                <p
                    className={`${MONO} max-w-2xl text-[11.5px] text-white/45 leading-relaxed mb-10`}
                >
                    Route Layer-4 traffic through a global anycast edge with
                    always-on DDoS mitigation.
                </p>

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-10 items-start">
                    {/* ─── LEFT: Sections ──────────────────────── */}
                    <div className="min-w-0">
                        {/* Admin-only: 00 Owner */}
                        {isAdmin && (
                            <Section
                                num="00"
                                title="Application owner"
                                desc="Assign this app to a customer account."
                                status={ownerOk ? "done" : "idle"}
                                statusLabel={
                                    selectedUserObj
                                        ? selectedUserObj.email
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
                                                                      ) +
                                                                      "…"}
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

                        {/* 01 App type */}
                        <Section
                            num="01"
                            title="Application protocol"
                            desc="Layer-4 protocol for the listener."
                            status={appTypeOk ? "done" : "idle"}
                            statusLabel={
                                formData.appType
                                    ? formData.appType.toUpperCase()
                                    : "Required"
                            }
                        >
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-[720px]">
                                {APP_TYPES.map((t) => {
                                    const sel = formData.appType === t.value;
                                    return (
                                        <button
                                            key={t.value}
                                            type="button"
                                            onClick={() =>
                                                updateFormData({
                                                    appType: t.value,
                                                })
                                            }
                                            className="text-left border rounded-[6px] p-4 flex flex-col gap-2 transition-all"
                                            style={
                                                sel
                                                    ? {
                                                          borderColor: ACCENT,
                                                          background:
                                                              "linear-gradient(135deg, #111216 0%, rgba(0,149,255,0.05) 100%)",
                                                          boxShadow: `0 0 0 1px ${ACCENT}, 0 4px 14px rgba(0,149,255,0.08)`,
                                                      }
                                                    : {
                                                          borderColor:
                                                              "rgba(255,255,255,0.06)",
                                                          background: "#111216",
                                                      }
                                            }
                                        >
                                            <div className="flex items-center justify-between">
                                                <span
                                                    className="text-[20px] font-bold leading-none tracking-[-0.02em]"
                                                    style={{
                                                        ...SERIF_STYLE,
                                                        color: sel
                                                            ? ACCENT
                                                            : "#ffffff",
                                                    }}
                                                >
                                                    {t.label}
                                                </span>
                                                {sel && (
                                                    <span
                                                        className="h-4 w-4 rounded-full inline-flex items-center justify-center"
                                                        style={{
                                                            background: ACCENT,
                                                        }}
                                                    >
                                                        <Check
                                                            className="h-2.5 w-2.5 text-white"
                                                            strokeWidth={3}
                                                        />
                                                    </span>
                                                )}
                                            </div>
                                            <p
                                                className={`${MONO} text-[10.5px] text-white/45 leading-snug`}
                                            >
                                                {t.desc}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        </Section>

                        {/* 02 Domain */}
                        <Section
                            num="02"
                            title="DNS name"
                            desc="Hostname your service is reachable under."
                            status={
                                domainOk
                                    ? "done"
                                    : formData.domain
                                      ? "active"
                                      : "idle"
                            }
                            statusLabel={
                                domainOk
                                    ? "Valid"
                                    : formData.domain
                                      ? domainNameError || "Check"
                                      : "Required"
                            }
                        >
                            <div className="max-w-[680px]">
                                <FieldLabel hint="alphanumeric only">
                                    Domain name
                                </FieldLabel>
                                <Input
                                    value={formData.domain}
                                    onChange={(e) =>
                                        updateFormData({
                                            domain: e.target.value.replace(
                                                /[^a-zA-Z0-9]/g,
                                                "",
                                            ),
                                        })
                                    }
                                    placeholder="myapp123"
                                    mono
                                />
                                <div className="mt-2 flex items-center justify-between gap-2 min-h-[16px]">
                                    <span
                                        className={`${MONO} text-[10.5px] text-white/40`}
                                    >
                                        Letters and numbers only — must start
                                        with a letter
                                    </span>
                                    {formData.domain && (
                                        <span
                                            className={`${MONO} text-[10.5px] inline-flex items-center gap-1`}
                                            style={{
                                                color: domainNameError
                                                    ? "#f87171"
                                                    : "#4ade80",
                                            }}
                                        >
                                            {domainNameError ? (
                                                <>
                                                    <AlertCircle className="h-3 w-3" />
                                                    {domainNameError}
                                                </>
                                            ) : (
                                                <>
                                                    <Check className="h-3 w-3" />
                                                    Available
                                                </>
                                            )}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </Section>

                        {/* 03 Edge port (skip for SSH/RDP) */}
                        {!isSSHorRDP && (
                            <Section
                                num="03"
                                title="Edge port"
                                desc="Port the edge listens on for inbound connections."
                                status={edgePortOk ? "done" : "idle"}
                                statusLabel={
                                    edgePortOk
                                        ? String(formData.edgePort)
                                        : "Required"
                                }
                            >
                                <div className="max-w-[260px]">
                                    <FieldLabel hint="1–65535">
                                        Port number
                                    </FieldLabel>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={65535}
                                        value={formData.edgePort || ""}
                                        onChange={(e) => {
                                            const v = parseInt(
                                                e.target.value,
                                                10,
                                            );
                                            if (isNaN(v))
                                                updateFormData({
                                                    edgePort: 0,
                                                });
                                            else
                                                updateFormData({
                                                    edgePort: Math.min(
                                                        Math.max(v, 1),
                                                        65535,
                                                    ),
                                                });
                                        }}
                                        placeholder="8080"
                                        mono
                                    />
                                </div>
                            </Section>
                        )}

                        {/* 04 Origin */}
                        <Section
                            num={isSSHorRDP ? "03" : "04"}
                            title="Origin"
                            desc="Where edge traffic terminates — your protected service."
                            status={originOk ? "done" : "idle"}
                            statusLabel={
                                originOk
                                    ? `${formData.originIP}:${formData.originPort}`
                                    : "Required"
                            }
                        >
                            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_140px] gap-3 max-w-[640px]">
                                <div>
                                    <FieldLabel hint="IP or DNS">
                                        Origin host
                                    </FieldLabel>
                                    <Input
                                        value={formData.originIP}
                                        onChange={(e) =>
                                            updateFormData({
                                                originIP: e.target.value,
                                            })
                                        }
                                        placeholder="192.0.2.10 or origin.example.com"
                                        mono
                                    />
                                </div>
                                <div>
                                    <FieldLabel hint="1–65535">
                                        Origin port
                                    </FieldLabel>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={65535}
                                        value={formData.originPort || ""}
                                        disabled={isSSHorRDP}
                                        onChange={(e) => {
                                            const v = parseInt(
                                                e.target.value,
                                                10,
                                            );
                                            if (isNaN(v))
                                                updateFormData({
                                                    originPort: 0,
                                                });
                                            else
                                                updateFormData({
                                                    originPort: Math.min(
                                                        Math.max(v, 1),
                                                        65535,
                                                    ),
                                                });
                                        }}
                                        placeholder="443"
                                        mono
                                    />
                                </div>
                            </div>
                            {isSSHorRDP && (
                                <p
                                    className={`${MONO} mt-3 text-[10.5px] text-white/40 max-w-[640px]`}
                                >
                                    Origin port locked to {formData.originPort}{" "}
                                    to match the{" "}
                                    {formData.appType?.toUpperCase()} service
                                    profile.
                                </p>
                            )}
                        </Section>

                        {/* 05 Advanced settings (skip for SSH/RDP) */}
                        {!isSSHorRDP && (
                            <Section
                                num="05"
                                title="Advanced settings"
                                desc="Optional — proxy protocol, IP rules, and edge connectivity."
                                status="done"
                                statusLabel={
                                    formData.proxyProtocol === "off" &&
                                    !formData.ipAccessRule
                                        ? "Defaults"
                                        : "Custom"
                                }
                            >
                                <div className="grid grid-cols-1 gap-3 max-w-[640px]">
                                    <div>
                                        <FieldLabel hint="preserve client IP">
                                            Proxy protocol
                                        </FieldLabel>
                                        <Select
                                            value={formData.proxyProtocol}
                                            onValueChange={(
                                                v:
                                                    | "off"
                                                    | "v1"
                                                    | "v2"
                                                    | "simple",
                                            ) =>
                                                updateFormData({
                                                    proxyProtocol: v,
                                                })
                                            }
                                        >
                                            <SelectTrigger
                                                className={`${MONO} h-11 bg-[#0d0e11] border-white/[0.08] text-white text-[12px] rounded-[6px]`}
                                            >
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="border-white/[0.1] bg-[#111216] text-white">
                                                <SelectItem value="off">
                                                    Off
                                                </SelectItem>
                                                {formData.appType === "udp" ? (
                                                    <SelectItem value="simple">
                                                        Simple
                                                    </SelectItem>
                                                ) : (
                                                    <SelectItem value="v1">
                                                        V1
                                                    </SelectItem>
                                                )}
                                                <SelectItem value="v2">
                                                    V2
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </Section>
                        )}

                        {/* 06 Project */}
                        <Section
                            num="06"
                            title="Project"
                            desc="Billing and access group."
                            status={projectOk ? "done" : "idle"}
                            statusLabel={
                                selectedProject?.name ?? "Required"
                            }
                        >
                            <div className="max-w-[680px]">
                                <FieldLabel hint="required">
                                    Project
                                </FieldLabel>
                                {filteredProjects.length === 0 ? (
                                    <div
                                        className={`${MONO} text-[11px] text-white/45 px-4 h-11 inline-flex items-center border border-dashed border-white/[0.08] rounded-[6px] w-full`}
                                    >
                                        {isAdmin && formData.selectedUser
                                            ? "No projects for selected user"
                                            : "No projects available"}
                                    </div>
                                ) : (
                                    <Select
                                        value={formData.project_id}
                                        onValueChange={(v) =>
                                            updateFormData({ project_id: v })
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

                        {/* 07 Confirm */}
                        <Section
                            num="07"
                            title="Review and confirm"
                            desc="Provisioning starts on confirm."
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
                                    for provisioning this Spectrum
                                    application.
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
                                        Your application
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

                            <div className="px-5 py-3">
                                {isAdmin && (
                                    <SumRow
                                        k="Owner"
                                        v={selectedUserObj?.email || "—"}
                                        empty={!selectedUserObj}
                                    />
                                )}
                                <SumRow
                                    k="Protocol"
                                    v={
                                        formData.appType
                                            ? formData.appType.toUpperCase()
                                            : "—"
                                    }
                                    empty={!formData.appType}
                                />
                                <SumRow
                                    k="Domain"
                                    v={formData.domain || "—"}
                                    empty={!formData.domain}
                                    mono
                                />
                                <SumRow
                                    k="Edge"
                                    v={
                                        formData.edgePort
                                            ? `:${formData.edgePort}`
                                            : "—"
                                    }
                                    empty={!formData.edgePort}
                                    mono
                                />
                                <SumRow
                                    k="Origin"
                                    v={
                                        formData.originIP &&
                                        formData.originPort
                                            ? `${formData.originIP}:${formData.originPort}`
                                            : "—"
                                    }
                                    empty={
                                        !formData.originIP ||
                                        !formData.originPort
                                    }
                                    mono
                                />
                                <SumRow
                                    k="Proxy"
                                    v={
                                        formData.proxyProtocol === "off"
                                            ? "Off"
                                            : `PROXY ${formData.proxyProtocol.toUpperCase()}`
                                    }
                                />
                                <SumRow
                                    k="Project"
                                    v={selectedProject?.name || "—"}
                                    empty={!selectedProject}
                                />
                            </div>

                            {/* Route preview */}
                            {formData.domain && formData.originIP && (
                                <div className="mx-5 mb-4 px-3 py-2.5 border border-white/[0.06] bg-[#08090b] rounded-[5px]">
                                    <div
                                        className={`${MONO} flex items-center justify-between mb-1.5 text-[9.5px] uppercase tracking-[0.14em] font-semibold text-white/35`}
                                    >
                                        Route preview
                                    </div>
                                    <code
                                        className={`${MONO} text-[10.5px] break-all leading-snug text-white/55`}
                                    >
                                        <span style={{ color: ACCENT }}>
                                            {formData.appType?.toUpperCase() ||
                                                "TCP"}
                                            ://
                                        </span>
                                        <span className="text-emerald-400">
                                            {formData.domain}
                                        </span>
                                        :{formData.edgePort || "?"}
                                        <span className="text-white/30">
                                            {" → "}
                                        </span>
                                        <span className="text-white/85">
                                            {formData.originIP}
                                        </span>
                                        :{formData.originPort || "?"}
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
                                    {loadingPrice ? (
                                        <span
                                            style={SERIF_STYLE}
                                            className="text-[28px] font-bold text-white/35 leading-none"
                                        >
                                            —
                                        </span>
                                    ) : spectrumPrice === 0 ? (
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
                                                {spectrumPrice.toFixed(
                                                    spectrumPrice < 10 ? 2 : 0,
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
                                    Per protected application · cancel anytime
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
                                            Protect application
                                            <ArrowRight className="h-3.5 w-3.5" />
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
};

export default SpectrumAppCreate;

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
            className={`${mono ? MONO : ""} w-full h-11 bg-[#0d0e11] border border-white/[0.08] text-white text-[12.5px] px-3 rounded-[6px] outline-none placeholder:text-white/25 hover:border-white/15 focus:border-[${ACCENT}] focus:shadow-[0_0_0_3px_rgba(0,149,255,0.09)] transition-all disabled:opacity-50 disabled:cursor-not-allowed ${className ?? ""}`}
        />
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

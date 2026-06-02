"use client";
import { assetUrl } from "@/lib/asset-url";

// App deploy — single-page editorial form matching the database/VPS
// pattern. Numbered sections on the left (Source → Repository → Identity
// → Build → Instance → Environment), sticky right summary with cost +
// gradient brand-blue Deploy CTA. All wiring (provider connect, repo
// browse, framework auto-detect, env vars, instance sizing) preserved.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { safeRandomUUID } from "@/lib/utils/safe-uuid";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
    ArrowRight,
    Check,
    ChevronLeft,
    Code,
    GitBranch,
    Loader2,
    Search,
} from "lucide-react";
import { toast } from "sonner";

import { Tables } from "@/lib/supabase/types";
import { useProviderConnection } from "@/lib/hooks/use-provider-connection";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import { EnvVarsEditor, EnvVar } from "./env-vars-editor";
import { SummarySidebar } from "./new-summary-sidebar";
import {
    Repository,
    Branch,
    GitProvider,
    ProviderConnection,
    PricingRates,
    FRAMEWORK_MAP,
    frameworkConfigs,
    instanceSizeConfigs,
} from "./new-types";

// ─── Design tokens ─────────────────────────────────────────────────
const SERIF_STYLE: React.CSSProperties = {
    fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";
const ACCENT_DIM = "rgba(0,149,255,0.08)";

// Per-provider brand swatch for the logo tile.
const PROVIDER_TILE: Record<string, string> = {
    github: "linear-gradient(135deg, #1a1c23, #0d0e11)",
    gitlab: "linear-gradient(135deg, #fc6d26, #e24329)",
    bitbucket: "linear-gradient(135deg, #2684ff, #0052cc)",
};

// Language → dot color (GitHub-style).
const LANG_COLOR: Record<string, string> = {
    typescript: "#3178c6",
    javascript: "#f1e05a",
    python: "#3776ab",
    go: "#00add8",
    rust: "#dea584",
    java: "#b07219",
    ruby: "#701516",
    php: "#4f5d95",
    swift: "#fa7343",
    kotlin: "#a97bff",
    dart: "#00b4ab",
    c: "#555555",
    "c++": "#f34b7d",
    "c#": "#178600",
    html: "#e34c26",
    css: "#563d7c",
    shell: "#89e051",
    vue: "#41b883",
    svelte: "#ff3e00",
};

function langColor(lang: string | null | undefined): string {
    if (!lang) return "#52525b";
    return LANG_COLOR[lang.toLowerCase()] ?? "#71717a";
}

// Framework letter badge for the auto-detect chip.
function frameworkBadge(name: string): { letter: string; color: string } {
    const n = name.toLowerCase();
    if (n.includes("next")) return { letter: "▲", color: "#ffffff" };
    if (n.includes("nuxt")) return { letter: "N", color: "#00DC82" };
    if (n.includes("vite")) return { letter: "V", color: "#646cff" };
    if (n.includes("vue")) return { letter: "V", color: "#41b883" };
    if (n.includes("svelte")) return { letter: "S", color: "#ff3e00" };
    if (n.includes("angular")) return { letter: "A", color: "#dd0031" };
    if (n.includes("react")) return { letter: "R", color: "#61dafb" };
    if (n.includes("express")) return { letter: "E", color: "#a1a1aa" };
    if (n.includes("node")) return { letter: "N", color: "#5fa04e" };
    if (n.includes("django")) return { letter: "D", color: "#0c4b33" };
    if (n.includes("flask")) return { letter: "F", color: "#a1a1aa" };
    if (n.includes("fastapi")) return { letter: "F", color: "#009688" };
    if (n.includes("python")) return { letter: "P", color: "#3776ab" };
    if (n.includes("java")) return { letter: "J", color: "#b07219" };
    if (n.includes("docker")) return { letter: "D", color: "#0db7ed" };
    return { letter: name.charAt(0).toUpperCase() || "•", color: "#a1a1aa" };
}

interface PageProps {
    projects: Tables<"projects">[];
    pricing?: Record<string, PricingRates>;
}

const REPOS_PER_PAGE = 5;

const AppDeploymentSelect = ({ projects, pricing }: PageProps) => {
    const router = useRouter();

    // ── Provider ────────────────────────────────────────────────
    const [gitProviders, setGitProviders] = useState<GitProvider[]>([
        { id: "github", name: "GitHub", icon: assetUrl("/github.png"), connected: false },
        { id: "gitlab", name: "GitLab", icon: assetUrl("/gitlab.png"), connected: false },
        { id: "bitbucket", name: "Bitbucket", icon: assetUrl("/BitBucket.png"), connected: false },
    ]);
    const [loadingProviders, setLoadingProviders] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
    const [connectionError, setConnectionError] = useState<{ provider: string; message: string } | null>(null);
    const [selectedProvider, setSelectedProvider] = useState("");

    // ── Repository ──────────────────────────────────────────────
    const [repositories, setRepositories] = useState<Repository[]>([]);
    const [loadingRepos, setLoadingRepos] = useState(false);
    const [selectedRepo, setSelectedRepo] = useState("");
    const [repoSearchTerm, setRepoSearchTerm] = useState("");
    const [currentPage, setCurrentPage] = useState(1);

    // ── Branch ──────────────────────────────────────────────────
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loadingBranches, setLoadingBranches] = useState(false);
    const [selectedBranch, setSelectedBranch] = useState("");

    // ── Configure ───────────────────────────────────────────────
    const [selectedProject, setSelectedProject] = useState("none");
    const [appName, setAppName] = useState("");
    const [framework, setFramework] = useState("");
    const [envVars, setEnvVars] = useState<EnvVar[]>([]);
    const [size, setSize] = useState("small");
    const [autoDeploy, setAutoDeploy] = useState(true);
    const [hasDockerfile, setHasDockerfile] = useState(false);
    const [containerPort, setContainerPort] = useState<number | undefined>(undefined);
    const [detectedPort, setDetectedPort] = useState<number | undefined>(undefined);
    const [healthcheckPath, setHealthcheckPath] = useState("");
    const [detectingFramework, setDetectingFramework] = useState(false);
    const userEditedPortRef = useRef(false);

    // ── Derived ─────────────────────────────────────────────────
    const selectedRepoData = repositories.find((r) => r.id === selectedRepo);
    const selectedProviderData = gitProviders.find((p) => p.id === selectedProvider);
    const selectedFrameworkConfig = framework ? frameworkConfigs[framework] : undefined;
    const showPortInput = hasDockerfile || framework === "Dockerfile" || framework === "Java";
    const fwBadge = framework ? frameworkBadge(framework) : null;

    // ── API: Providers ──────────────────────────────────────────
    const fetchProviderStatus = useCallback(async () => {
        setLoadingProviders(true);
        try {
            const res = await fetch("/api/auth/providers");
            if (res.ok) {
                const data = await res.json();
                setGitProviders((prev) =>
                    prev.map((p) => {
                        const match = (data.providers ?? []).find(
                            (x: ProviderConnection) => x.provider === p.id,
                        );
                        return {
                            ...p,
                            connected: match?.integration_connected ?? false,
                            username: match?.integration_username ?? null,
                        };
                    }),
                );
            } else {
                toast.error("Failed to fetch provider status");
            }
        } catch {
            toast.error("Failed to check provider connections");
        } finally {
            setLoadingProviders(false);
        }
    }, []);

    const fetchRepositories = useCallback(async (provider: string) => {
        if (!["github", "gitlab", "bitbucket"].includes(provider)) {
            toast.error("Provider not supported");
            return;
        }
        setLoadingRepos(true);
        try {
            const res = await fetch(`/api/${provider}/repositories`);
            const data = await res.json();
            if (res.ok) {
                setRepositories(data.repositories ?? []);
                if (!data.repositories?.length)
                    toast.info(`No repositories found in your ${provider} account`);
                else if (data.note) toast.success(data.note);
                else if (data.warning) toast.warning(data.warning);
            } else {
                toast.error(data.message || "Failed to fetch repositories");
                setRepositories([]);
            }
        } catch {
            toast.error("Network error fetching repositories");
            setRepositories([]);
        } finally {
            setLoadingRepos(false);
        }
    }, []);

    const fetchBranches = useCallback(async (provider: string, repo: Repository) => {
        if (!provider || !repo) {
            setBranches([]);
            return;
        }
        setLoadingBranches(true);
        try {
            const endpoints: Record<string, string> = {
                github: `/api/github/branches?repo=${encodeURIComponent(repo.fullName)}`,
                gitlab: `/api/gitlab/branches?project_id=${encodeURIComponent(repo.id)}`,
                bitbucket: `/api/bitbucket/branches?repo=${encodeURIComponent(repo.fullName)}`,
            };
            const endpoint = endpoints[provider];
            if (!endpoint) {
                toast.error("Provider not supported for branch fetching");
                setBranches([]);
                return;
            }
            const res = await fetch(endpoint);
            const data = await res.json();
            if (res.ok) {
                setBranches(data.branches ?? []);
                if (data.note) toast.success(data.note);
            } else {
                toast.error(data.message || "Failed to fetch branches");
                setBranches([]);
            }
        } catch {
            toast.error("Network error fetching branches");
            setBranches([]);
        } finally {
            setLoadingBranches(false);
        }
    }, []);

    const detectFramework = useCallback(
        async (provider: string, repo: Repository, branch: string) => {
            if (!provider || !repo) return;
            setDetectingFramework(true);
            try {
                const res = await fetch("/api/detect-framework", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        provider,
                        repoFullName: repo.fullName,
                        branch,
                    }),
                });
                if (!res.ok) return;
                const data = await res.json();
                if (!data.framework || data.framework === "Unknown") {
                    toast.error("Framework not detected", {
                        description:
                            "No supported framework or Dockerfile found. Select manually.",
                    });
                    setFramework("");
                    setHasDockerfile(false);
                    return;
                }
                const normalized = FRAMEWORK_MAP[data.framework] ?? data.framework;
                const dockerfileDetected = data.hasDockerfile ?? false;
                if (["React", "Svelte", "Static"].includes(normalized)) {
                    if (dockerfileDetected) {
                        toast.info("Using Dockerfile pipeline for this framework.");
                        setFramework("Dockerfile");
                    } else {
                        toast.error(
                            "Framework not directly supported. Add a Dockerfile or choose a pipeline.",
                        );
                        setFramework("");
                    }
                } else {
                    setFramework(normalized);
                }
                setHasDockerfile(dockerfileDetected);
                if (data.detectedPort) {
                    setDetectedPort(data.detectedPort);
                    if (!userEditedPortRef.current)
                        setContainerPort(data.detectedPort);
                } else {
                    setDetectedPort(undefined);
                    if (!userEditedPortRef.current) setContainerPort(undefined);
                }
            } catch (e) {
                console.error("Framework detection error:", e);
            } finally {
                setDetectingFramework(false);
            }
        },
        [],
    );

    // ── Effects ─────────────────────────────────────────────────
    useEffect(() => {
        fetchProviderStatus();
    }, [fetchProviderStatus]);

    useEffect(() => {
        const handleFocus = () => fetchProviderStatus();
        window.addEventListener("focus", handleFocus);
        return () => window.removeEventListener("focus", handleFocus);
    }, [fetchProviderStatus]);

    useEffect(() => {
        if (selectedProvider) {
            fetchRepositories(selectedProvider);
            setCurrentPage(1);
        } else setRepositories([]);
        setSelectedRepo("");
        setBranches([]);
        setSelectedBranch("");
    }, [selectedProvider, fetchRepositories]);

    useEffect(() => {
        if (!selectedRepo) return;
        const repo = repositories.find((r) => r.id === selectedRepo);
        if (repo) {
            setAppName(repo.name);
            userEditedPortRef.current = false;
            setContainerPort(undefined);
            setDetectedPort(undefined);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedRepo]);

    useEffect(() => {
        if (!selectedRepo) {
            setBranches([]);
            setSelectedBranch("");
            return;
        }
        const repo = repositories.find((r) => r.id === selectedRepo);
        if (!repo) return;
        if (!selectedBranch) setSelectedBranch(repo.defaultBranch);
        fetchBranches(selectedProvider, repo);
        detectFramework(
            selectedProvider,
            repo,
            selectedBranch || repo.defaultBranch,
        );
    }, [
        selectedRepo,
        selectedProvider,
        fetchBranches,
        detectFramework,
        selectedBranch,
        repositories,
    ]);

    // ── Provider connection ─────────────────────────────────────
    const { connectProvider: performConnection } = useProviderConnection({
        returnTo: "/dashboard/services/apps/new",
        mode: "integration",
    });

    const connectProvider = async (providerId: string) => {
        setIsLoading(true);
        setConnectingProvider(providerId);
        setConnectionError(null);
        const result = await performConnection(providerId, "connect");
        if (!result.success && result.error) {
            setConnectionError({ provider: providerId, message: result.error });
            setIsLoading(false);
            setConnectingProvider(null);
        }
    };

    const autoDockerfileFrameworks = new Set([
        "Next.js", "Nuxt.js", "Vite-React", "Vue.js", "Angular", "SvelteKit",
        "express", "python", "django", "flask", "fastapi", "Node.js",
    ]);
    const handleFrameworkChange = (v: string) => {
        setFramework(v);
        if (autoDockerfileFrameworks.has(v)) {
            userEditedPortRef.current = false;
            setContainerPort(undefined);
        }
    };
    const handleContainerPortChange = (port: number | undefined) => {
        userEditedPortRef.current = port !== undefined;
        setContainerPort(port);
    };

    // ── Validation ──────────────────────────────────────────────
    const nameOk = (() => {
        const n = appName.toLowerCase().trim();
        return n.length >= 3 && n.length <= 63;
    })();
    const sourceOk = !!selectedProvider && !!selectedProviderData?.connected;
    const repoOk = !!selectedRepo;
    const identityOk = nameOk;
    const buildOk = !!framework && (!showPortInput || containerPort !== undefined);
    const instanceOk = !!size;
    const canSubmit =
        sourceOk && repoOk && identityOk && buildOk && instanceOk && !isLoading;

    // ── Submit ──────────────────────────────────────────────────
    const onSubmit = async () => {
        if (!selectedRepo || !selectedProvider || !appName || !framework) {
            toast.error("Please fill in all required fields");
            return;
        }
        if (!selectedRepoData) {
            toast.error("Selected repository not found");
            return;
        }
        setIsLoading(true);
        try {
            const normalizedName = appName
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, "-")
                .replace(/^-+|-+$/g, "")
                .replace(/-+/g, "-");
            const validName =
                normalizedName.match(/^[a-z0-9]/) &&
                normalizedName.match(/[a-z0-9]$/)
                    ? normalizedName
                    : `app-${normalizedName}`.replace(/^-+|-+$/g, "");
            if (validName.length < 3) {
                toast.error("App name too short after normalization");
                return;
            }

            const repoUrls: Record<string, string> = {
                github: `https://github.com/${selectedRepoData.fullName}`,
                gitlab: `https://gitlab.com/${selectedRepoData.fullName}`,
                bitbucket: `https://bitbucket.org/${selectedRepoData.fullName}`,
            };

            const res = await fetch("/api/services/platform-apps/create", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Idempotency-Key": `app-create:${safeRandomUUID()}`,
                },
                body: JSON.stringify({
                    name: validName,
                    git_provider: selectedProvider,
                    repository_id: selectedRepoData.id,
                    repository_name: selectedRepoData.fullName,
                    repository_url:
                        repoUrls[selectedProvider] ??
                        `https://${selectedProvider}.com/${selectedRepoData.fullName}`,
                    branch:
                        selectedBranch ||
                        selectedRepoData.defaultBranch ||
                        "main",
                    framework,
                    env_vars: envVars.filter((ev) => ev.key && ev.value),
                    size: size || "small",
                    auto_deploy: autoDeploy,
                    deploy_branch:
                        selectedBranch ||
                        selectedRepoData.defaultBranch ||
                        "main",
                    project_id:
                        selectedProject && selectedProject !== "none"
                            ? selectedProject
                            : undefined,
                    container_port: containerPort,
                    healthcheck_path: healthcheckPath || undefined,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                if (data.partial_success && data.app_id) {
                    toast.warning(data.message ?? "Deployment started, billing needs attention.");
                    router.push(`/dashboard/services/apps/${data.app_id}`);
                    return;
                }
                throw new Error(data.message ?? data.error ?? "Failed to create application");
            }

            toast.success("Application deployment started successfully.");
            setTimeout(
                () =>
                    router.push(
                        data.app_id
                            ? `/dashboard/services/apps/${data.app_id}`
                            : "/dashboard/services/apps",
                    ),
                1500,
            );
        } catch (e: unknown) {
            toast.error(
                e instanceof Error
                    ? e.message
                    : "Failed to start deployment. Please try again.",
            );
        } finally {
            setIsLoading(false);
        }
    };

    // ── Repo list pagination ────────────────────────────────────
    const filteredRepos = useMemo(() => {
        const q = repoSearchTerm.toLowerCase();
        return repositories.filter(
            (r) =>
                r.name.toLowerCase().includes(q) ||
                r.fullName.toLowerCase().includes(q) ||
                r.description?.toLowerCase().includes(q),
        );
    }, [repositories, repoSearchTerm]);

    const totalPages = Math.max(1, Math.ceil(filteredRepos.length / REPOS_PER_PAGE));
    const pageRepos = filteredRepos.slice(
        (currentPage - 1) * REPOS_PER_PAGE,
        currentPage * REPOS_PER_PAGE,
    );

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

            <div className="relative z-10 px-6 py-7 sm:px-10 sm:py-9">
                {/* Back link */}
                <div className="mb-6">
                    <Link
                        href="/dashboard/services/apps"
                        className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/40 hover:text-white/75 transition-colors`}
                    >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Back to applications
                    </Link>
                </div>

                {/* Hero */}
                <h1 className="text-[34px] sm:text-[40px] leading-[1.05] tracking-[-0.025em] text-white font-semibold mb-2">
                    Deploy{" "}
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
                    Connect a repo — we detect the framework and build it.
                </p>

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-10 items-start">
                    {/* ─── LEFT: Sections ──────────────────────── */}
                    <div className="min-w-0">
                        {/* 01 Source */}
                        <Section
                            num="01"
                            title="Source provider"
                            desc="Read-only access to the repos you pick."
                            status={sourceOk ? "done" : "idle"}
                            statusLabel={
                                sourceOk && selectedProviderData
                                    ? selectedProviderData.name
                                    : "Required"
                            }
                            statusRight={
                                <button
                                    type="button"
                                    onClick={fetchProviderStatus}
                                    disabled={loadingProviders}
                                    className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/45 hover:text-white transition-colors`}
                                >
                                    {loadingProviders ? "…" : "Refresh"}
                                </button>
                            }
                        >
                            {loadingProviders ? (
                                <div className="flex items-center gap-3 text-white/55 py-8 justify-center border border-white/[0.06] bg-[#111216] rounded-[6px]">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span
                                        className={`${MONO} text-[11px] uppercase tracking-[0.14em]`}
                                    >
                                        Checking connections
                                    </span>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {gitProviders.map((provider) => {
                                        const selected = selectedProvider === provider.id;
                                        const isConnecting = connectingProvider === provider.id;
                                        const interactive = provider.connected;
                                        return (
                                            <div
                                                key={provider.id}
                                                role={interactive ? "button" : undefined}
                                                tabIndex={interactive ? 0 : -1}
                                                aria-pressed={
                                                    interactive ? selected : undefined
                                                }
                                                aria-disabled={!interactive}
                                                onClick={() =>
                                                    interactive &&
                                                    setSelectedProvider(provider.id)
                                                }
                                                onKeyDown={(e) => {
                                                    if (!interactive) return;
                                                    if (e.key === "Enter" || e.key === " ") {
                                                        e.preventDefault();
                                                        setSelectedProvider(provider.id);
                                                    }
                                                }}
                                                className={`relative border rounded-[6px] p-4 flex flex-col gap-3 transition-all ${
                                                    interactive
                                                        ? "cursor-pointer"
                                                        : "cursor-not-allowed opacity-50"
                                                }`}
                                                style={
                                                    selected
                                                        ? {
                                                              borderColor: ACCENT,
                                                              background:
                                                                  "linear-gradient(135deg, #111216 0%, rgba(0,149,255,0.05) 100%)",
                                                              boxShadow: `0 0 0 1px ${ACCENT}, 0 6px 18px rgba(0,149,255,0.08)`,
                                                          }
                                                        : {
                                                              borderColor: "rgba(255,255,255,0.06)",
                                                              background: "#111216",
                                                          }
                                                }
                                                onMouseEnter={(e) => {
                                                    if (selected || !interactive) return;
                                                    e.currentTarget.style.borderColor =
                                                        "rgba(255,255,255,0.14)";
                                                    e.currentTarget.style.background = "#16181d";
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (selected || !interactive) return;
                                                    e.currentTarget.style.borderColor =
                                                        "rgba(255,255,255,0.06)";
                                                    e.currentTarget.style.background = "#111216";
                                                }}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <div
                                                        className="h-9 w-9 inline-flex items-center justify-center rounded-[6px] shrink-0"
                                                        style={{
                                                            background:
                                                                PROVIDER_TILE[provider.id] ??
                                                                "#1a1c23",
                                                        }}
                                                    >
                                                        <Image
                                                            src={provider.icon}
                                                            alt={provider.name}
                                                            width={20}
                                                            height={20}
                                                            className="object-contain"
                                                            unoptimized
                                                        />
                                                    </div>
                                                    {selected && (
                                                        <span
                                                            className="h-4 w-4 rounded-full inline-flex items-center justify-center"
                                                            style={{ background: ACCENT }}
                                                        >
                                                            <Check
                                                                className="h-2.5 w-2.5 text-white"
                                                                strokeWidth={3}
                                                            />
                                                        </span>
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="text-[13.5px] font-semibold text-white">
                                                        {provider.name}
                                                    </div>
                                                    <div
                                                        className={`${MONO} mt-0.5 text-[10.5px] text-white/45 truncate`}
                                                    >
                                                        {provider.connected
                                                            ? provider.username
                                                                ? `@${provider.username}`
                                                                : "Connected"
                                                            : "Not connected"}
                                                    </div>
                                                </div>
                                                {!provider.connected && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            connectProvider(provider.id);
                                                        }}
                                                        disabled={
                                                            isLoading ||
                                                            connectingProvider !== null
                                                        }
                                                        className={`${MONO} mt-1 inline-flex h-7 items-center justify-center gap-1.5 px-2.5 text-[10px] uppercase tracking-[0.14em] font-semibold rounded-[4px] transition-colors disabled:opacity-50`}
                                                        style={{
                                                            background: ACCENT,
                                                            color: "#ffffff",
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.background =
                                                                ACCENT_BRIGHT;
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.background =
                                                                ACCENT;
                                                        }}
                                                    >
                                                        {isConnecting ? (
                                                            <>
                                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                                Connecting
                                                            </>
                                                        ) : (
                                                            "Connect"
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {connectionError && (
                                <div className="mt-3 border border-red-400/25 bg-red-400/[0.06] rounded-[6px] px-3.5 py-2.5">
                                    <p className="text-[12px] text-red-300">
                                        {connectionError.message}
                                    </p>
                                </div>
                            )}
                        </Section>

                        {/* 02 Repository */}
                        <Section
                            num="02"
                            title="Repository"
                            desc="Pick a repo and branch."
                            status={repoOk ? "done" : sourceOk ? "active" : "idle"}
                            statusLabel={
                                selectedRepoData
                                    ? selectedRepoData.name
                                    : sourceOk
                                      ? "Choose a repo"
                                      : "Pick provider first"
                            }
                        >
                            {!sourceOk ? (
                                <div
                                    className={`${MONO} text-[11px] text-white/45 px-6 py-10 text-center border border-dashed border-white/[0.08] rounded-[6px]`}
                                >
                                    Connect a Git provider above to browse
                                    repositories.
                                </div>
                            ) : loadingRepos ? (
                                <div className="flex items-center gap-3 text-white/55 py-10 justify-center border border-white/[0.06] bg-[#111216] rounded-[6px]">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span
                                        className={`${MONO} text-[11px] uppercase tracking-[0.14em]`}
                                    >
                                        Loading repositories
                                    </span>
                                </div>
                            ) : repositories.length === 0 ? (
                                <div className="border border-dashed border-white/[0.1] bg-[#111216] rounded-[6px] py-10 px-6 text-center">
                                    <Code className="mx-auto h-8 w-8 text-white/20" />
                                    <p className="mt-3 text-[13px] text-white/65">
                                        No repositories found
                                    </p>
                                    <p
                                        className={`${MONO} mt-1 text-[11px] text-white/40 max-w-sm mx-auto`}
                                    >
                                        {selectedProvider === "github"
                                            ? "Connect the GitHub App with repository permissions to access private repos."
                                            : `Make sure you have repositories in your ${selectedProviderData?.name ?? ""} account.`}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => fetchRepositories(selectedProvider)}
                                        className={`${MONO} mt-4 h-8 px-3 border border-white/[0.08] text-[10.5px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[4px] transition-colors`}
                                    >
                                        Refresh
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {/* Search bar */}
                                    <div className="flex items-center gap-2.5 px-3 h-9 border border-white/[0.08] bg-[#0d0e11] rounded-[5px] focus-within:border-white/25">
                                        <Search className="h-3.5 w-3.5 text-white/40 shrink-0" />
                                        <input
                                            type="text"
                                            placeholder={`Search repositories${selectedProviderData?.username ? ` from @${selectedProviderData.username}` : ""}…`}
                                            value={repoSearchTerm}
                                            onChange={(e) => {
                                                setRepoSearchTerm(e.target.value);
                                                setCurrentPage(1);
                                            }}
                                            className={`${MONO} flex-1 bg-transparent text-[12px] text-white placeholder:text-white/30 outline-none`}
                                        />
                                        <span
                                            className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/35`}
                                        >
                                            {filteredRepos.length} / {repositories.length}
                                        </span>
                                    </div>

                                    {pageRepos.length > 0 ? (
                                        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
                                            {pageRepos.map((repo) => {
                                                const selected = selectedRepo === repo.id;
                                                const langDot = langColor(repo.language);
                                                return (
                                                    <button
                                                        key={repo.id}
                                                        type="button"
                                                        onClick={() => setSelectedRepo(repo.id)}
                                                        className="relative w-full flex items-start gap-3 px-4 py-3 text-left border-b border-white/[0.04] last:border-b-0 transition-colors"
                                                        style={
                                                            selected
                                                                ? { background: ACCENT_DIM }
                                                                : { background: "transparent" }
                                                        }
                                                        onMouseEnter={(e) => {
                                                            if (!selected)
                                                                e.currentTarget.style.background =
                                                                    "rgba(255,255,255,0.02)";
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            if (!selected)
                                                                e.currentTarget.style.background =
                                                                    "transparent";
                                                        }}
                                                    >
                                                        {selected && (
                                                            <span
                                                                className="absolute left-0 top-0 bottom-0 w-[2px]"
                                                                style={{ background: ACCENT }}
                                                            />
                                                        )}
                                                        <div
                                                            className="h-8 w-8 shrink-0 mt-0.5 flex items-center justify-center border border-white/[0.06] bg-[#0d0e11] rounded-[5px]"
                                                        >
                                                            <Code className="h-3.5 w-3.5 text-white/55" />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span
                                                                    className={`${MONO} text-[12.5px] font-semibold text-white truncate`}
                                                                >
                                                                    {repo.name}
                                                                </span>
                                                                {repo.private && (
                                                                    <span
                                                                        className={`${MONO} text-[9px] uppercase tracking-[0.12em] font-semibold border border-white/[0.08] bg-[#0d0e11] text-white/50 px-1.5 py-px rounded-[3px]`}
                                                                    >
                                                                        Private
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div
                                                                className={`${MONO} mt-1 flex items-center gap-2 text-[10.5px] text-white/45 flex-wrap`}
                                                            >
                                                                {repo.language && (
                                                                    <span className="inline-flex items-center gap-1.5">
                                                                        <span
                                                                            className="h-1.5 w-1.5 rounded-full"
                                                                            style={{
                                                                                background: langDot,
                                                                            }}
                                                                        />
                                                                        {repo.language}
                                                                    </span>
                                                                )}
                                                                {repo.language && (
                                                                    <span className="text-white/15">
                                                                        ·
                                                                    </span>
                                                                )}
                                                                <span>
                                                                    {new Date(
                                                                        repo.updatedAt,
                                                                    ).toLocaleDateString()}
                                                                </span>
                                                                <span className="text-white/15">
                                                                    ·
                                                                </span>
                                                                <span>
                                                                    default:{" "}
                                                                    {repo.defaultBranch}
                                                                </span>
                                                            </div>
                                                            {repo.description && (
                                                                <p className="mt-1 text-[11px] text-white/40 line-clamp-1">
                                                                    {repo.description}
                                                                </p>
                                                            )}
                                                        </div>
                                                        {selected && (
                                                            <span
                                                                className="h-4 w-4 rounded-full inline-flex items-center justify-center shrink-0 mt-1"
                                                                style={{ background: ACCENT }}
                                                            >
                                                                <Check
                                                                    className="h-2.5 w-2.5 text-white"
                                                                    strokeWidth={3}
                                                                />
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="border border-dashed border-white/[0.08] bg-[#111216] rounded-[6px] py-8 px-6 text-center">
                                            <p
                                                className={`${MONO} text-[11px] text-white/45`}
                                            >
                                                No repositories match &ldquo;
                                                {repoSearchTerm}&rdquo;
                                            </p>
                                        </div>
                                    )}

                                    {/* Pagination */}
                                    {filteredRepos.length > REPOS_PER_PAGE && (
                                        <div className="flex items-center justify-between gap-3">
                                            <span
                                                className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/40`}
                                            >
                                                Page {currentPage} of {totalPages}
                                            </span>
                                            <div className="flex items-center gap-1">
                                                <PageBtn
                                                    onClick={() =>
                                                        setCurrentPage(
                                                            Math.max(1, currentPage - 1),
                                                        )
                                                    }
                                                    disabled={currentPage === 1}
                                                >
                                                    ←
                                                </PageBtn>
                                                <PageBtn
                                                    onClick={() =>
                                                        setCurrentPage(
                                                            Math.min(
                                                                totalPages,
                                                                currentPage + 1,
                                                            ),
                                                        )
                                                    }
                                                    disabled={currentPage === totalPages}
                                                >
                                                    →
                                                </PageBtn>
                                            </div>
                                        </div>
                                    )}

                                    {/* Branch selector — shows after repo is picked */}
                                    {selectedRepoData && (
                                        <div className="max-w-[680px]">
                                            <FieldLabel
                                                hint={
                                                    loadingBranches ? "loading…" : "deploys from"
                                                }
                                            >
                                                Branch
                                            </FieldLabel>
                                            {loadingBranches ? (
                                                <div
                                                    className={`${MONO} h-11 inline-flex items-center gap-2 px-3 border border-white/[0.08] bg-[#0d0e11] rounded-[6px] text-[12px] text-white/40 w-full`}
                                                >
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    Loading branches
                                                </div>
                                            ) : branches.length > 0 ? (
                                                <Select
                                                    value={selectedBranch}
                                                    onValueChange={setSelectedBranch}
                                                >
                                                    <SelectTrigger
                                                        className={`${MONO} h-11 bg-[#0d0e11] border-white/[0.08] text-white text-[12px] rounded-[6px]`}
                                                    >
                                                        <SelectValue placeholder="Select branch" />
                                                    </SelectTrigger>
                                                    <SelectContent className="border-white/[0.1] bg-[#111216] text-white">
                                                        {branches.map((b) => (
                                                            <SelectItem
                                                                key={b.name}
                                                                value={b.name}
                                                            >
                                                                <span className="inline-flex items-center gap-2">
                                                                    <GitBranch className="h-3 w-3 text-white/40" />
                                                                    {b.name}
                                                                    {b.protected && (
                                                                        <span className="text-white/40 text-[10px]">
                                                                            (protected)
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <Input
                                                    value={selectedBranch}
                                                    onChange={(e) =>
                                                        setSelectedBranch(e.target.value)
                                                    }
                                                    placeholder="main"
                                                    mono
                                                />
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </Section>

                        {/* 03 Identity */}
                        <Section
                            num="03"
                            title="Application identity"
                            desc="Shown in dashboards, logs, and DNS."
                            status={
                                identityOk ? "done" : appName ? "active" : "idle"
                            }
                            statusLabel={
                                identityOk
                                    ? "Valid"
                                    : appName
                                      ? "Check"
                                      : "Required"
                            }
                        >
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[640px]">
                                <div>
                                    <FieldLabel hint="3–63 chars · slug">App name</FieldLabel>
                                    <Input
                                        value={appName}
                                        onChange={(e) => setAppName(e.target.value)}
                                        placeholder="my-awesome-app"
                                        mono
                                    />
                                </div>
                                <div>
                                    <FieldLabel hint="optional">Project</FieldLabel>
                                    <Select
                                        value={selectedProject}
                                        onValueChange={setSelectedProject}
                                    >
                                        <SelectTrigger
                                            className={`${MONO} h-11 bg-[#0d0e11] border-white/[0.08] text-white text-[12px] rounded-[6px]`}
                                        >
                                            <SelectValue placeholder="No project" />
                                        </SelectTrigger>
                                        <SelectContent className="border-white/[0.1] bg-[#111216] text-white">
                                            <SelectItem value="none">No project</SelectItem>
                                            {projects.map((p) => (
                                                <SelectItem key={p.id} value={p.id}>
                                                    {p.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Auto-deploy toggle */}
                            <label className="mt-4 inline-flex items-center gap-3 cursor-pointer">
                                <span
                                    onClick={() => setAutoDeploy(!autoDeploy)}
                                    className="relative inline-flex w-9 h-5 items-center border border-white/[0.08] rounded-full transition-colors p-0.5"
                                    style={{
                                        background: autoDeploy ? ACCENT : "#0d0e11",
                                        borderColor: autoDeploy
                                            ? "rgba(0,149,255,0.4)"
                                            : "rgba(255,255,255,0.08)",
                                    }}
                                >
                                    <span
                                        className="h-3.5 w-3.5 bg-white rounded-full transition-transform"
                                        style={{
                                            transform: autoDeploy
                                                ? "translateX(16px)"
                                                : "translateX(0)",
                                        }}
                                    />
                                </span>
                                <span
                                    className={`${MONO} text-[11px] uppercase tracking-[0.12em] font-semibold text-white/85`}
                                >
                                    Auto-deploy on git push
                                </span>
                                <span
                                    className={`${MONO} text-[10.5px] text-white/40`}
                                >
                                    {autoDeploy ? "Enabled" : "Manual only"}
                                </span>
                            </label>
                        </Section>

                        {/* 04 Build */}
                        <Section
                            num="04"
                            title="Build profile"
                            desc="Auto-detected from your repo."
                            status={
                                buildOk
                                    ? "done"
                                    : framework
                                      ? "active"
                                      : "idle"
                            }
                            statusLabel={
                                framework
                                    ? buildOk
                                        ? framework
                                        : "Port required"
                                    : "Required"
                            }
                        >
                            {fwBadge && selectedFrameworkConfig && (
                                <div
                                    className="mb-4 relative border rounded-[6px] px-3 py-2.5 flex items-center gap-3"
                                    style={{
                                        borderColor: "rgba(0,149,255,0.4)",
                                        background:
                                            "linear-gradient(135deg, #111216 0%, rgba(0,149,255,0.05) 100%)",
                                        boxShadow: `0 0 0 1px ${ACCENT}, 0 4px 14px rgba(0,149,255,0.08)`,
                                    }}
                                >
                                    <span
                                        className={`${MONO} h-8 w-8 shrink-0 flex items-center justify-center text-[15px] font-bold border border-white/[0.08] bg-[#0d0e11] rounded-[5px]`}
                                        style={{ color: fwBadge.color }}
                                    >
                                        {fwBadge.letter}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[13px] font-semibold text-white truncate">
                                                {framework}
                                            </span>
                                            <span
                                                className={`${MONO} shrink-0 text-[9px] uppercase tracking-[0.14em] font-semibold px-1.5 py-px rounded-[3px]`}
                                                style={{
                                                    background: ACCENT_DIM,
                                                    color: ACCENT,
                                                    border:
                                                        "1px solid rgba(0,149,255,0.25)",
                                                }}
                                            >
                                                {hasDockerfile ? "Dockerfile" : "Auto-detected"}
                                            </span>
                                        </div>
                                        <p
                                            className={`${MONO} mt-0.5 text-[10.5px] text-white/45 truncate`}
                                        >
                                            {selectedFrameworkConfig.description}
                                        </p>
                                    </div>
                                    {detectingFramework ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-white/60 shrink-0" />
                                    ) : selectedRepoData ? (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                detectFramework(
                                                    selectedProvider,
                                                    selectedRepoData,
                                                    selectedBranch,
                                                )
                                            }
                                            className={`${MONO} shrink-0 text-[10px] uppercase tracking-[0.14em] font-semibold transition-colors`}
                                            style={{ color: ACCENT }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.color =
                                                    ACCENT_BRIGHT;
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.color = ACCENT;
                                            }}
                                        >
                                            Re-detect
                                        </button>
                                    ) : null}
                                </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[640px]">
                                <div>
                                    <FieldLabel hint="required">
                                        Framework or pipeline
                                    </FieldLabel>
                                    <Select
                                        value={framework}
                                        onValueChange={handleFrameworkChange}
                                    >
                                        <SelectTrigger
                                            className={`${MONO} h-11 bg-[#0d0e11] border-white/[0.08] text-white text-[12px] rounded-[6px]`}
                                        >
                                            <SelectValue placeholder="Select framework" />
                                        </SelectTrigger>
                                        <SelectContent className="border-white/[0.1] bg-[#111216] text-white">
                                            <SelectItem value="simple-test">
                                                Simple test (no build)
                                            </SelectItem>
                                            <SelectItem value="Java">
                                                Java (Maven / Dockerfile)
                                            </SelectItem>
                                            <SelectItem value="Dockerfile">
                                                Dockerfile (existing)
                                            </SelectItem>
                                            <SelectItem value="Next.js">Next.js</SelectItem>
                                            <SelectItem value="Nuxt.js">Nuxt.js</SelectItem>
                                            <SelectItem value="Vite-React">
                                                React + Vite
                                            </SelectItem>
                                            <SelectItem value="Vue.js">Vue.js</SelectItem>
                                            <SelectItem value="Angular">Angular</SelectItem>
                                            <SelectItem value="SvelteKit">SvelteKit</SelectItem>
                                            <SelectItem value="express">Express.js</SelectItem>
                                            <SelectItem value="Node.js">
                                                Node.js (bring Dockerfile)
                                            </SelectItem>
                                            <SelectItem value="python">Python</SelectItem>
                                            <SelectItem value="django">Django</SelectItem>
                                            <SelectItem value="flask">Flask</SelectItem>
                                            <SelectItem value="fastapi">FastAPI</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {showPortInput && (
                                    <div>
                                        <FieldLabel
                                            hint={
                                                detectedPort
                                                    ? `detected: ${detectedPort}`
                                                    : "set manually"
                                            }
                                        >
                                            Application port
                                        </FieldLabel>
                                        <Input
                                            type="number"
                                            min={1}
                                            max={65535}
                                            value={containerPort ?? ""}
                                            onChange={(e) =>
                                                handleContainerPortChange(
                                                    e.target.value
                                                        ? parseInt(e.target.value, 10)
                                                        : undefined,
                                                )
                                            }
                                            placeholder={
                                                detectedPort
                                                    ? String(detectedPort)
                                                    : "3000"
                                            }
                                            mono
                                        />
                                    </div>
                                )}
                                <div>
                                    <FieldLabel hint="optional · HTTP GET">
                                        Health check path
                                    </FieldLabel>
                                    <Input
                                        value={healthcheckPath}
                                        onChange={(e) => setHealthcheckPath(e.target.value)}
                                        placeholder="/health"
                                        mono
                                    />
                                    <p className={`${MONO} mt-1.5 text-[11px] text-white/35`}>
                                        The platform probes this endpoint to confirm the app is live before routing traffic.
                                    </p>
                                </div>
                            </div>

                            {selectedFrameworkConfig && (
                                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-[640px]">
                                    {selectedFrameworkConfig.installCommand && (
                                        <CmdCard
                                            label="Install"
                                            cmd={
                                                selectedFrameworkConfig.installCommand
                                            }
                                        />
                                    )}
                                    <CmdCard
                                        label={hasDockerfile ? "Default build" : "Build"}
                                        cmd={selectedFrameworkConfig.buildCommand || "—"}
                                    />
                                    <CmdCard
                                        label={hasDockerfile ? "Default output" : "Output"}
                                        cmd={selectedFrameworkConfig.outputDir || "."}
                                    />
                                </div>
                            )}
                        </Section>

                        {/* 05 Instance */}
                        <Section
                            num="05"
                            title="Instance size"
                            desc="Compute and memory tier."
                            status="done"
                            statusLabel={
                                size.charAt(0).toUpperCase() + size.slice(1)
                            }
                        >
                            <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-5 gap-3">
                                {(["small", "medium", "large", "xlarge", "xxlarge"] as const).map((opt) => {
                                    const cfg = instanceSizeConfigs[opt];
                                    const sizePrice = pricing?.[opt];
                                    const selected = size === opt;
                                    return (
                                        <button
                                            key={opt}
                                            type="button"
                                            onClick={() => setSize(opt)}
                                            className="text-left border rounded-[6px] p-4 flex flex-col gap-2 transition-all"
                                            style={
                                                selected
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
                                            onMouseEnter={(e) => {
                                                if (selected) return;
                                                e.currentTarget.style.borderColor =
                                                    "rgba(255,255,255,0.14)";
                                            }}
                                            onMouseLeave={(e) => {
                                                if (selected) return;
                                                e.currentTarget.style.borderColor =
                                                    "rgba(255,255,255,0.06)";
                                            }}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span
                                                    className="text-[13.5px] font-semibold capitalize"
                                                    style={{
                                                        color: selected
                                                            ? ACCENT
                                                            : "#ffffff",
                                                    }}
                                                >
                                                    {opt}
                                                </span>
                                                {opt === "medium" && (
                                                    <span
                                                        className={`${MONO} text-[9px] uppercase tracking-[0.12em] font-semibold px-1.5 py-px rounded-[3px]`}
                                                        style={{
                                                            background: ACCENT_DIM,
                                                            color: ACCENT,
                                                            border:
                                                                "1px solid rgba(0,149,255,0.25)",
                                                        }}
                                                    >
                                                        Popular
                                                    </span>
                                                )}
                                            </div>
                                            <div
                                                className={`${MONO} text-[10.5px] text-white/45 flex flex-col gap-0.5`}
                                            >
                                                <span>{cfg.cpu} vCPU</span>
                                                <span>{cfg.ram} RAM</span>
                                                <span>{cfg.replicas} instance{cfg.replicas === 1 ? "" : "s"}</span>
                                            </div>
                                            <div className="mt-auto pt-2 border-t border-white/[0.05] flex items-baseline gap-1">
                                                {sizePrice?.price && sizePrice.price > 0 ? (
                                                    <>
                                                        <span
                                                            style={SERIF_STYLE}
                                                            className="text-[12px] text-white/55 font-medium"
                                                        >
                                                            $
                                                        </span>
                                                        <span
                                                            style={SERIF_STYLE}
                                                            className="text-[18px] font-bold tabular-nums tracking-[-0.02em] text-white"
                                                        >
                                                            {sizePrice.price.toFixed(0)}
                                                        </span>
                                                        <span
                                                            className={`${MONO} ml-0.5 text-[9.5px] text-white/40`}
                                                        >
                                                            /mo
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span
                                                        style={SERIF_STYLE}
                                                        className="text-[18px] font-bold text-emerald-300"
                                                    >
                                                        Free
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </Section>

                        {/* 06 Environment */}
                        <Section
                            num="06"
                            title="Environment variables"
                            desc="Encrypted, injected at runtime."
                            status={envVars.length > 0 ? "done" : "idle"}
                            statusLabel={
                                envVars.length > 0
                                    ? `${envVars.length} variable${envVars.length === 1 ? "" : "s"}`
                                    : "Optional"
                            }
                        >
                            <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-3 max-w-[720px]">
                                <EnvVarsEditor
                                    value={envVars}
                                    onChange={setEnvVars}
                                />
                            </div>
                        </Section>
                    </div>

                    {/* ─── RIGHT: Sticky summary ───────────────── */}
                    <aside className="lg:sticky lg:top-6 self-start">
                        <SummarySidebar
                            projects={projects}
                            pricing={pricing}
                            selectedProviderData={selectedProviderData}
                            selectedRepoData={selectedRepoData}
                            selectedBranch={selectedBranch}
                            appName={appName}
                            framework={framework}
                            selectedProject={selectedProject}
                            size={size}
                            autoDeploy={autoDeploy}
                            containerPort={containerPort}
                        />

                        {/* Deploy CTA */}
                        <button
                            type="button"
                            disabled={!canSubmit}
                            onClick={onSubmit}
                            className={`${MONO} mt-3 w-full inline-flex items-center justify-center gap-2 h-11 text-[11.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all`}
                            style={{
                                background: canSubmit
                                    ? `linear-gradient(135deg, ${ACCENT}, #0066B3)`
                                    : "#1a1d24",
                                color: canSubmit ? "#ffffff" : "rgba(255,255,255,0.35)",
                                boxShadow: canSubmit
                                    ? "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)"
                                    : "none",
                                cursor: canSubmit ? "pointer" : "not-allowed",
                            }}
                            onMouseEnter={(e) => {
                                if (!canSubmit) return;
                                e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT_BRIGHT}, ${ACCENT})`;
                                e.currentTarget.style.transform = "translateY(-1px)";
                            }}
                            onMouseLeave={(e) => {
                                if (!canSubmit) return;
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
                                    Deploy application
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </>
                            )}
                        </button>
                        <p
                            className={`${MONO} text-center text-[10px] text-white/35 mt-2`}
                        >
                            Per-second billing · cancel anytime
                        </p>
                    </aside>
                </div>
            </div>
        </div>
    );
};

export default AppDeploymentSelect;

// ─── Subcomponents ────────────────────────────────────────────────

type SectionStatus = "done" | "active" | "idle";

function Section({
    num,
    title,
    desc,
    status,
    statusLabel,
    statusRight,
    children,
}: {
    num: string;
    title: string;
    desc: string;
    status: SectionStatus;
    statusLabel: string;
    statusRight?: React.ReactNode;
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
                <div className="flex items-center gap-3 shrink-0 mt-1">
                    {statusRight}
                    <span
                        className={`${MONO} inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] font-semibold truncate max-w-[200px]`}
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
                </div>
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

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
    const { mono, className, ...rest } = props;
    return (
        <input
            {...rest}
            className={`${mono ? MONO : ""} w-full h-11 bg-[#0d0e11] border border-white/[0.08] text-white text-[12.5px] px-3 rounded-[6px] outline-none placeholder:text-white/25 hover:border-white/15 focus:border-[${ACCENT}] focus:shadow-[0_0_0_3px_rgba(0,149,255,0.09)] transition-all ${className ?? ""}`}
        />
    );
}

function CmdCard({ label, cmd }: { label: string; cmd: string }) {
    return (
        <div className="border border-white/[0.06] bg-[#0d0e11] rounded-[5px] px-3 py-2">
            <div
                className={`${MONO} text-[9px] uppercase tracking-[0.14em] font-semibold text-white/35`}
            >
                {label}
            </div>
            <code
                className={`${MONO} mt-0.5 block break-all text-[10.5px] text-white/80 leading-snug`}
            >
                {cmd}
            </code>
        </div>
    );
}

function PageBtn({
    children,
    onClick,
    disabled,
}: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`${MONO} h-7 min-w-[28px] px-2 text-[11px] border border-white/[0.08] bg-[#0d0e11] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[4px] transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
        >
            {children}
        </button>
    );
}

"use client";

// App deploy wizard — editorial dark surface, Nunito-accent title,
// 4-step horizontal indicator, single scrolling main column + sticky
// summary. Brand blue is the only accent. Matches the design language
// established on the GPU deploy + VPS pages.

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useProviderConnection } from "@/lib/hooks/use-provider-connection";
import { Tables } from "@/lib/supabase/types";
import { EnvVar } from "./env-vars-editor";
import {
  Repository, Branch, GitProvider, ProviderConnection, PricingRates,
  FRAMEWORK_MAP, STEP_META,
} from "./new-types";
import { StepProvider } from "./new-step-provider";
import { StepRepository } from "./new-step-repository";
import { StepConfigure } from "./new-step-configure";
import { StepReview } from "./new-step-review";
import { SummarySidebar } from "./new-summary-sidebar";

// ─── Design tokens (scoped) ──────────────────────────────────────────
const SERIF_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

interface PageProps {
  projects: Tables<"projects">[];
  pricing?: Record<string, PricingRates>;
}

const AppDeploymentSelect = ({ projects, pricing }: PageProps) => {
  const router = useRouter();

  // ── Navigation ──────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState(1);

  // ── Provider ─────────────────────────────────────────────────
  const [gitProviders, setGitProviders] = useState<GitProvider[]>([
    { id: "github",    name: "GitHub",    icon: "/github.png",     connected: false },
    { id: "gitlab",    name: "GitLab",    icon: "/gitlab.png",     connected: false },
    { id: "bitbucket", name: "Bitbucket", icon: "/BitBucket.png",  connected: false },
  ]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<{ provider: string; message: string } | null>(null);
  const [selectedProvider, setSelectedProvider] = useState("");

  // ── Repository ───────────────────────────────────────────────
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [repoSearchTerm, setRepoSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const reposPerPage = 5;

  // ── Branch ───────────────────────────────────────────────────
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState("");

  // ── Configure ────────────────────────────────────────────────
  const [selectedProject, setSelectedProject] = useState("");
  const [appName, setAppName] = useState("");
  const [framework, setFramework] = useState("");
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [size, setSize] = useState("small");
  const [autoDeploy, setAutoDeploy] = useState(true);
  const [hasDockerfile, setHasDockerfile] = useState(false);
  const [containerPort, setContainerPort] = useState<number | undefined>(undefined);
  const [detectedPort, setDetectedPort] = useState<number | undefined>(undefined);
  const [detectingFramework, setDetectingFramework] = useState(false);
  const userEditedPortRef = useRef(false);

  // ── Derived ──────────────────────────────────────────────────
  const selectedRepoData = repositories.find((r) => r.id === selectedRepo);
  const selectedProviderData = gitProviders.find((p) => p.id === selectedProvider);

  // ── API: Providers ───────────────────────────────────────────
  const fetchProviderStatus = useCallback(async () => {
    setLoadingProviders(true);
    try {
      const res = await fetch("/api/auth/providers");
      if (res.ok) {
        const data = await res.json();
        setGitProviders((prev) =>
          prev.map((p) => {
            const match = (data.providers ?? []).find((x: ProviderConnection) => x.provider === p.id);
            return { ...p, connected: match?.integration_connected ?? false, username: match?.integration_username ?? null };
          }),
        );
      } else { toast.error("Failed to fetch provider status"); }
    } catch { toast.error("Failed to check provider connections"); }
    finally { setLoadingProviders(false); }
  }, []);

  const fetchRepositories = useCallback(async (provider: string) => {
    if (!["github", "gitlab", "bitbucket"].includes(provider)) { toast.error("Provider not supported"); return; }
    setLoadingRepos(true);
    try {
      const res = await fetch(`/api/${provider}/repositories`);
      const data = await res.json();
      if (res.ok) {
        setRepositories(data.repositories ?? []);
        if (!data.repositories?.length) toast.info(`No repositories found in your ${provider} account`);
        else if (data.note) toast.success(data.note);
        else if (data.warning) toast.warning(data.warning);
      } else {
        toast.error(data.message || "Failed to fetch repositories");
        setRepositories([]);
      }
    } catch { toast.error("Network error fetching repositories"); setRepositories([]); }
    finally { setLoadingRepos(false); }
  }, []);

  const fetchBranches = useCallback(async (provider: string, repo: Repository) => {
    if (!provider || !repo) { setBranches([]); return; }
    setLoadingBranches(true);
    try {
      const endpoints: Record<string, string> = {
        github:    `/api/github/branches?repo=${encodeURIComponent(repo.fullName)}`,
        gitlab:    `/api/gitlab/branches?project_id=${encodeURIComponent(repo.id)}`,
        bitbucket: `/api/bitbucket/branches?repo=${encodeURIComponent(repo.fullName)}`,
      };
      const endpoint = endpoints[provider];
      if (!endpoint) { toast.error("Provider not supported for branch fetching"); setBranches([]); return; }
      const res = await fetch(endpoint);
      const data = await res.json();
      if (res.ok) { setBranches(data.branches ?? []); if (data.note) toast.success(data.note); }
      else { toast.error(data.message || "Failed to fetch branches"); setBranches([]); }
    } catch { toast.error("Network error fetching branches"); setBranches([]); }
    finally { setLoadingBranches(false); }
  }, []);

  const detectFramework = useCallback(async (provider: string, repo: Repository, branch: string) => {
    if (!provider || !repo) return;
    setDetectingFramework(true);
    try {
      const res = await fetch("/api/detect-framework", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, repoFullName: repo.fullName, branch }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.framework || data.framework === "Unknown") {
        toast.error("Framework not detected", { description: "No supported framework or Dockerfile found. Select manually." });
        setFramework(""); setHasDockerfile(false); return;
      }
      const normalized = FRAMEWORK_MAP[data.framework] ?? data.framework;
      const dockerfileDetected = data.hasDockerfile ?? false;
      if (["React", "Svelte", "Static"].includes(normalized)) {
        if (dockerfileDetected) { toast.info("Using Dockerfile pipeline for this framework."); setFramework("Dockerfile"); }
        else { toast.error("Framework not directly supported. Add a Dockerfile or choose a pipeline."); setFramework(""); }
      } else { setFramework(normalized); }
      setHasDockerfile(dockerfileDetected);
      if (data.detectedPort) {
        setDetectedPort(data.detectedPort);
        if (!userEditedPortRef.current) setContainerPort(data.detectedPort);
      } else {
        setDetectedPort(undefined);
        if (!userEditedPortRef.current) setContainerPort(undefined);
      }
    } catch (e) { console.error("Framework detection error:", e); }
    finally { setDetectingFramework(false); }
  }, []);

  // ── Effects ──────────────────────────────────────────────────
  useEffect(() => { fetchProviderStatus(); }, [fetchProviderStatus]);

  useEffect(() => {
    const handleFocus = () => fetchProviderStatus();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchProviderStatus]);

  useEffect(() => {
    if (selectedProvider) { fetchRepositories(selectedProvider); setCurrentPage(1); }
    else setRepositories([]);
    setBranches([]); setSelectedBranch("");
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
    if (!selectedRepo) { setBranches([]); setSelectedBranch(""); return; }
    const repo = repositories.find((r) => r.id === selectedRepo);
    if (!repo) return;
    if (!selectedBranch) setSelectedBranch(repo.defaultBranch);
    fetchBranches(selectedProvider, repo);
    detectFramework(selectedProvider, repo, selectedBranch || repo.defaultBranch);
  }, [selectedRepo, selectedProvider, fetchBranches, detectFramework, selectedBranch, repositories]);

  // ── Provider connection ──────────────────────────────────────
  const { connectProvider: performConnection } = useProviderConnection({ returnTo: "/dashboard/services/apps/new", mode: "integration" });

  const connectProvider = async (providerId: string) => {
    setIsLoading(true); setConnectingProvider(providerId); setConnectionError(null);
    const result = await performConnection(providerId, "connect");
    if (!result.success && result.error) {
      setConnectionError({ provider: providerId, message: result.error });
      setIsLoading(false); setConnectingProvider(null);
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

  // ── Step navigation ──────────────────────────────────────────
  const handleNext = () => {
    if (currentStep === 1 && !selectedProvider) { toast.error("Please select a Git provider"); return; }
    if (currentStep === 2 && !selectedRepo) { toast.error("Please select a repository"); return; }
    if (currentStep === 3) {
      if (!appName.trim()) { toast.error("Please enter an app name"); return; }
      if (!framework) { toast.error("Please select a framework"); return; }
      const n = appName.toLowerCase().trim();
      if (n.length < 3) { toast.error("App name must be at least 3 characters"); return; }
      if (n.length > 63) { toast.error("App name must be at most 63 characters"); return; }
    }
    if (currentStep < 4) setCurrentStep((s) => s + 1);
  };

  // ── Submit ───────────────────────────────────────────────────
  const onSubmit = async () => {
    if (!selectedRepo || !selectedProvider || !appName || !framework) { toast.error("Please fill in all required fields"); return; }
    if (!selectedRepoData) { toast.error("Selected repository not found"); return; }
    setIsLoading(true);
    try {
      const normalizedName = appName.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "").replace(/-+/g, "-");
      const validName = (normalizedName.match(/^[a-z0-9]/) && normalizedName.match(/[a-z0-9]$/)) ? normalizedName : `app-${normalizedName}`.replace(/^-+|-+$/g, "");
      if (validName.length < 3) { toast.error("App name too short after normalization"); return; }

      const repoUrls: Record<string, string> = {
        github: `https://github.com/${selectedRepoData.fullName}`,
        gitlab: `https://gitlab.com/${selectedRepoData.fullName}`,
        bitbucket: `https://bitbucket.org/${selectedRepoData.fullName}`,
      };

      const res = await fetch("/api/services/platform-apps/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": `app-create:${crypto.randomUUID()}` },
        body: JSON.stringify({
          name: validName,
          git_provider: selectedProvider,
          repository_id: selectedRepoData.id,
          repository_name: selectedRepoData.fullName,
          repository_url: repoUrls[selectedProvider] ?? `https://${selectedProvider}.com/${selectedRepoData.fullName}`,
          branch: selectedBranch || selectedRepoData.defaultBranch || "main",
          framework,
          env_vars: envVars.filter((ev) => ev.key && ev.value),
          size: size || "small",
          auto_deploy: autoDeploy,
          deploy_branch: selectedBranch || selectedRepoData.defaultBranch || "main",
          project_id: selectedProject && selectedProject !== "none" ? selectedProject : undefined,
          container_port: containerPort,
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

      toast.success("Application deployment started successfully!");
      setTimeout(() => router.push(data.app_id ? `/dashboard/services/apps/${data.app_id}` : "/dashboard/services/apps"), 1500);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to start deployment. Please try again.");
    } finally { setIsLoading(false); }
  };

  // ── Step completion flags (for the stepper visual) ───────────
  const stepComplete: Record<number, boolean> = {
    1: !!selectedProvider,
    2: !!selectedRepo,
    3: !!selectedProvider && !!selectedRepo && !!appName && !!framework,
    4: false, // can't be "complete" — final action lives there
  };

  return (
    <div className="relative min-h-full bg-[#08090b] text-white">
      {/*
       * Background layer — its own overflow-hidden so the aurora gradients
       * clip without making the page wrapper a sticky containing block
       * (which would break the sticky summary).
       */}
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
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-[44px] sm:text-[52px] leading-[1] tracking-[-0.025em] text-white font-semibold">
            Deploy{" "}
            <span style={SERIF_STYLE} className="text-white/55 font-normal">
              an app
            </span>
          </h1>
          <Link
            href="/dashboard/services/apps"
            className={`${MONO} h-9 inline-flex items-center px-3.5 border border-white/[0.08] bg-[#111216] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] transition-colors`}
          >
            Cancel
          </Link>
        </div>

        {/* Stepper — per-cell progress line on top, badge left + text right */}
        <div className="mt-8 mb-8 grid grid-cols-2 sm:grid-cols-4 gap-x-4 sm:gap-x-6">
          {STEP_META.map((step) => (
            <StepperCell
              key={step.id}
              num={step.id}
              label={step.name}
              hint={step.title}
              active={currentStep === step.id}
              complete={stepComplete[step.id] && currentStep !== step.id}
              clickable={step.id < currentStep || stepComplete[step.id]}
              onClick={() => {
                if (step.id < currentStep || stepComplete[step.id]) setCurrentStep(step.id);
              }}
            />
          ))}
        </div>

        {/* Body */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            {currentStep === 1 && (
              <StepProvider
                gitProviders={gitProviders}
                loadingProviders={loadingProviders}
                selectedProvider={selectedProvider}
                onSelectProvider={setSelectedProvider}
                isLoading={isLoading}
                connectingProvider={connectingProvider}
                connectionError={connectionError}
                onConnect={connectProvider}
                onRefresh={fetchProviderStatus}
                onNext={handleNext}
              />
            )}
            {currentStep === 2 && (
              <StepRepository
                repositories={repositories}
                loadingRepos={loadingRepos}
                selectedRepo={selectedRepo}
                onSelectRepo={setSelectedRepo}
                selectedProvider={selectedProvider}
                selectedProviderData={selectedProviderData}
                repoSearchTerm={repoSearchTerm}
                onSearchChange={setRepoSearchTerm}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                reposPerPage={reposPerPage}
                isLoading={isLoading}
                onConnect={connectProvider}
                onRefreshRepos={() => fetchRepositories(selectedProvider)}
                onPrev={() => setCurrentStep((s) => s - 1)}
                onNext={handleNext}
              />
            )}
            {currentStep === 3 && (
              <StepConfigure
                projects={projects}
                pricing={pricing}
                selectedProject={selectedProject}
                onSelectProject={setSelectedProject}
                appName={appName}
                onAppNameChange={setAppName}
                selectedBranch={selectedBranch}
                onSelectBranch={setSelectedBranch}
                branches={branches}
                loadingBranches={loadingBranches}
                framework={framework}
                onFrameworkChange={handleFrameworkChange}
                detectingFramework={detectingFramework}
                hasDockerfile={hasDockerfile}
                containerPort={containerPort}
                onContainerPortChange={handleContainerPortChange}
                detectedPort={detectedPort}
                size={size}
                onSizeChange={setSize}
                autoDeploy={autoDeploy}
                onAutoDeployChange={setAutoDeploy}
                envVars={envVars}
                onEnvVarsChange={setEnvVars}
                selectedRepoData={selectedRepoData}
                selectedProvider={selectedProvider}
                onDetectFramework={() => { if (selectedRepoData) detectFramework(selectedProvider, selectedRepoData, selectedBranch); }}
                onRefreshBranches={() => { if (selectedRepoData) { fetchBranches(selectedProvider, selectedRepoData); detectFramework(selectedProvider, selectedRepoData, selectedBranch); } }}
                onPrev={() => setCurrentStep((s) => s - 1)}
                onNext={handleNext}
              />
            )}
            {currentStep === 4 && (
              <StepReview
                projects={projects}
                pricing={pricing}
                selectedProject={selectedProject}
                appName={appName}
                selectedRepoData={selectedRepoData}
                selectedBranch={selectedBranch}
                framework={framework}
                size={size}
                autoDeploy={autoDeploy}
                envVars={envVars}
                containerPort={containerPort}
                isLoading={isLoading}
                onPrev={() => setCurrentStep((s) => s - 1)}
                onSubmit={onSubmit}
              />
            )}
          </div>

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
        </div>
      </div>
    </div>
  );
};

// ─── Stepper cell ─────────────────────────────────────────────────
//
// Per-cell progress line on top + badge-left + label/hint-right.
// All cells share the same internal layout so they line up perfectly
// regardless of which one is active. No outer box — the cells sit
// directly on the page.

function StepperCell({
  num,
  label,
  hint,
  active,
  complete,
  clickable,
  onClick,
}: {
  num: number;
  label: string;
  hint: string;
  active?: boolean;
  complete?: boolean;
  clickable?: boolean;
  onClick: () => void;
}) {
  const ACCENT = "#0095FF";
  const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

  const badgeStyle: React.CSSProperties = active
    ? {
        background: ACCENT,
        color: "#001930",
        boxShadow: `0 0 0 4px rgba(0,149,255,0.18), 0 0 0 1px ${ACCENT}`,
      }
    : complete
      ? {
          background: "rgba(0,149,255,0.12)",
          color: ACCENT,
          boxShadow: `0 0 0 1px ${ACCENT}`,
        }
      : {
          background: "#111216",
          color: "rgba(255,255,255,0.4)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.08)",
        };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable && !active}
      className={`flex flex-col gap-3.5 text-left ${
        clickable || active ? "cursor-pointer" : "cursor-default"
      }`}
    >
      {/* Top progress line */}
      <span className="block h-[2px] w-full bg-white/[0.06] relative overflow-hidden">
        <span
          className="absolute inset-y-0 left-0 transition-all duration-500"
          style={{
            width: active || complete ? "100%" : "0%",
            background: ACCENT,
            boxShadow: active ? `0 0 10px rgba(0,149,255,0.5)` : "none",
          }}
        />
      </span>

      {/* Badge + labels row */}
      <span className="flex items-start gap-3">
        <span
          className={`${MONO} h-7 w-7 shrink-0 inline-flex items-center justify-center text-[11px] font-semibold transition-all`}
          style={badgeStyle}
        >
          {complete ? "✓" : String(num).padStart(2, "0")}
        </span>
        <span className="min-w-0 flex flex-col">
          <span
            className={`text-[13px] font-semibold tracking-[-0.01em] truncate ${
              active || complete ? "text-white" : "text-white/55"
            }`}
          >
            {label}
          </span>
          <span className={`${MONO} text-[10.5px] text-white/35 truncate mt-0.5`}>
            {hint}
          </span>
        </span>
      </span>
    </button>
  );
}

export default AppDeploymentSelect;

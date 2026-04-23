"use client";
import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useProviderConnection } from "@/lib/hooks/use-provider-connection";
import { Tables } from "@/lib/supabase/types";
import { EnvVar } from "./env-vars-editor";
import {
  Repository, Branch, GitProvider, ProviderConnection, PricingRates,
  STEP_META, FRAMEWORK_MAP,
} from "./new-types";
import { StepProvider } from "./new-step-provider";
import { StepRepository } from "./new-step-repository";
import { StepConfigure } from "./new-step-configure";
import { StepReview } from "./new-step-review";
import { SummarySidebar } from "./new-summary-sidebar";

interface PageProps {
  projects: Tables<"projects">[];
  pricing?: Record<string, PricingRates>;
}

const AppDeploymentSelect = ({ projects, pricing }: PageProps) => {
  const router = useRouter();

  // ── Navigation ──────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState(1);
  const progressPct = (currentStep / STEP_META.length) * 100;

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
  const reposPerPage = 3;

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

  // ── Derived ──────────────────────────────────────────────────
  const selectedRepoData = repositories.find((r) => r.id === selectedRepo);
  const selectedProviderData = gitProviders.find((p) => p.id === selectedProvider);
  const activeStepMeta = STEP_META[currentStep - 1];

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
      if (data.detectedPort) { setDetectedPort(data.detectedPort); if (containerPort === undefined) setContainerPort(data.detectedPort); }
      else { setDetectedPort(undefined); }
    } catch (e) { console.error("Framework detection error:", e); }
    finally { setDetectingFramework(false); }
  }, [containerPort]);

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

  // Auto-fill app name ONLY when repo changes (not on branch changes)
  useEffect(() => {
    if (!selectedRepo) return;
    const repo = repositories.find((r) => r.id === selectedRepo);
    if (repo) setAppName(repo.name);
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

  useEffect(() => {
    if (!selectedRepo) return;
    const repo = repositories.find((r) => r.id === selectedRepo);
    if (!repo || !selectedBranch) return;
    detectFramework(selectedProvider, repo, selectedBranch);
  }, [selectedBranch, selectedRepo, selectedProvider, repositories, detectFramework]);

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

  return (
    <div className="space-y-6 px-2 pt-4 text-white sm:px-3 lg:px-4">
      {/* ── Top header / stepper ──────────────────────────────── */}
      <div className="glass-panel overflow-hidden">
        <div className="flex flex-col gap-3 px-5 py-4 sm:px-6 sm:py-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/70">Application Deployment</p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">Deploy repository-backed applications</h1>
            <p className="mt-2 text-sm leading-6 text-white/48">{activeStepMeta.description}</p>
          </div>
          <Image
            src="/dashboard-services-icons/da application deployment.png"
            alt=""
            width={160}
            height={160}
            className="hidden shrink-0 object-contain lg:block lg:h-[190px] lg:w-[190px] xl:h-[220px] xl:w-[220px]"
            priority
            unoptimized
          />
        </div>

        <div className="border-t border-white/[0.06] px-5 py-4 sm:px-6">
          <div className="mb-3 h-1 w-full overflow-hidden bg-white/[0.05]">
            <div className="h-full bg-gradient-to-r from-blue-400/85 to-white transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {STEP_META.map((step) => {
              const isActive = currentStep === step.id;
              const isCompleted = currentStep > step.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => { if (step.id < currentStep) setCurrentStep(step.id); }}
                  className={`border px-3 py-3 text-left transition-colors ${isActive ? "border-blue-400/30 bg-blue-500/10" : isCompleted ? "border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.06]" : "border-white/[0.06] bg-transparent"} ${step.id < currentStep ? "cursor-pointer" : "cursor-default"}`}
                >
                  <div className="flex h-full flex-col">
                    <span className="text-xs font-semibold text-white/32">0{step.id}</span>
                    <div className="mt-2 flex items-center justify-between gap-2 pt-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">{step.name}</div>
                        <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-white/40">{step.title}</div>
                      </div>
                      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
                        <Image src={step.iconSrc} alt={step.name} width={40} height={40} className="h-10 w-10 object-contain" />
                        {isCompleted && (
                          <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500">
                            <svg className="h-2 w-2 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Main content + sidebar ──────────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div>
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
              onFrameworkChange={setFramework}
              detectingFramework={detectingFramework}
              hasDockerfile={hasDockerfile}
              containerPort={containerPort}
              onContainerPortChange={setContainerPort}
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
        />
      </div>
    </div>
  );
};

export default AppDeploymentSelect;

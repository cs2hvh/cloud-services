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

const STEP_META = [
  {
    id: 1,
    name: "Provider",
    title: "Select source control provider",
    description: "Connect an approved Git provider and choose the account you want to deploy from.",
    iconSrc: "/dashboard icons/provider .png",
  },
  {
    id: 2,
    name: "Repository",
    title: "Choose repository and branch",
    description: "Select the repository, review available branches, and confirm the code source for deployment.",
    iconSrc: "/dashboard icons/repository.png",
  },
  {
    id: 3,
    name: "Configure",
    title: "Define runtime and capacity",
    description: "Set the application name, framework profile, environment variables, and resource sizing.",
    iconSrc: "/dashboard icons/configure.png",
  },
  {
    id: 4,
    name: "Deploy",
    title: "Review and launch",
    description: "Confirm deployment settings, billing impact, and rollout preferences before provisioning begins.",
    iconSrc: "/dashboard icons/deploy.png",
  },
] as const;

const panelClassName = "glass-panel overflow-hidden";

function SummaryRow({ label, value, icon, empty }: { label: string; value: React.ReactNode; icon?: string; empty?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="flex items-center gap-2">
        {icon && (
          <Image src={icon} alt="" width={14} height={14} className={`h-3.5 w-3.5 shrink-0 object-contain ${empty ? "opacity-20" : "opacity-50"}`} />
        )}
        <span className={`text-sm ${empty ? "text-white/28" : "text-white/42"}`}>{label}</span>
      </div>
      <span className={`text-right text-sm ${empty ? "text-white/20" : "font-medium text-white/88"}`}>{value}</span>
    </div>
  );
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
      <div className={panelClassName}>
        <div className="flex flex-col gap-3 px-5 py-4 sm:px-6 sm:py-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/70">
              Application Deployment
            </p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
              Deploy repository-backed applications with a cleaner rollout workflow.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">
              {activeStepMeta.description}
            </p>
          </div>
          <Image
            src="/dashboard-services-icons/da application deployment.png"
            alt=""
            width={160}
            height={160}
            className="hidden shrink-0 object-contain lg:block lg:h-[190px] lg:w-[190px] xl:h-[220px] xl:w-[220px]"
            priority
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
            <Card className={panelClassName}>
              <CardHeader className="border-b border-white/[0.06] px-6 py-5 sm:px-7">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
                  Runtime Configuration
                </p>
                <CardTitle className="mt-2 text-xl font-semibold tracking-tight text-white">
                  Configure deployment
                </CardTitle>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-white/48">
                  Define the service name, deploy branch, build profile, capacity, and release
                  behavior before provisioning begins.
                </p>
              </CardHeader>
              <CardContent className="space-y-6 px-6 py-6 sm:px-7 sm:py-7">
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]">
                  <div className="space-y-6">
                    <div className="border border-white/[0.08] bg-white/[0.04] p-5 sm:p-6">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center border border-white/[0.1] bg-white/[0.05] text-blue-300">
                          <Settings2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                            Deployment Basics
                          </p>
                          <h3 className="mt-2 text-base font-semibold text-white">
                            Name, grouping, and branch strategy
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-white/45">
                            Keep naming and branch selection explicit so operators can map each
                            deployment to the right workload and release stream.
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 grid gap-5">
                        <div>
                          <Label className="mb-2 flex items-center gap-2 text-sm font-medium text-white/82">
                            <FolderKanban className="h-4 w-4 text-blue-300" />
                            Project association
                          </Label>
                          <Select value={selectedProject} onValueChange={setSelectedProject}>
                            <SelectTrigger className="border-white/[0.14] bg-white/[0.05] text-white">
                              <SelectValue placeholder="Select a project (optional)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No project</SelectItem>
                              {projects.map((project) => (
                                <SelectItem key={project.id} value={project.id}>
                                  {project.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="mt-2 text-sm text-white/42">
                            Current assignment: <span className="text-white/72">{selectedProjectName}</span>
                          </p>
                        </div>

                        <div className="grid gap-5 md:grid-cols-2">
                          <div>
                            <Label className="mb-2 block text-sm font-medium text-white/82">
                              Application name
                            </Label>
                            <Input
                              value={appName}
                              onChange={(e) => setAppName(e.target.value)}
                              placeholder="my-awesome-app"
                              className="border-white/[0.14] bg-white/[0.05] text-white placeholder:text-white/30"
                            />
                            <p className="mt-2 text-xs leading-5 text-white/42">
                              Use a stable, lowercase service name that is easy to recognize in logs
                              and the app inventory.
                            </p>
                          </div>

                          <div>
                            <Label className="mb-2 block text-sm font-medium text-white/82">
                              Deploy branch
                            </Label>
                            {loadingBranches ? (
                              <div className="flex items-center gap-2 border border-white/[0.12] bg-white/[0.04] px-3 py-3 text-sm text-white/55">
                                <Loader2 className="h-4 w-4 animate-spin text-blue-300" />
                                Loading repository branches...
                              </div>
                            ) : branches.length > 0 ? (
                              <div className="space-y-3">
                                <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                                  <SelectTrigger className="border-white/[0.14] bg-white/[0.05] text-white">
                                    <SelectValue placeholder="Select branch" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {branches.map((branch) => (
                                      <SelectItem key={branch.name} value={branch.name}>
                                        {branch.protected ? `${branch.name} (Protected)` : branch.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  onClick={async () => {
                                    if (!selectedRepoData) return;
                                    await fetchBranches(selectedProvider, selectedRepoData);
                                    const branchToDetect =
                                      selectedBranch || selectedRepoData.defaultBranch;
                                    detectFramework(
                                      selectedProvider,
                                      selectedRepoData,
                                      branchToDetect,
                                    );
                                  }}
                                  variant="outline"
                                  size="sm"
                                  className="border-white/[0.14] bg-white/[0.03] text-white/82 hover:bg-white/[0.07]"
                                  disabled={loadingBranches}
                                >
                                  <Loader2
                                    className={`mr-2 h-4 w-4 ${loadingBranches ? "animate-spin" : "hidden"}`}
                                  />
                                  Refresh branches
                                </Button>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <Input
                                  value={selectedBranch}
                                  onChange={(e) => setSelectedBranch(e.target.value)}
                                  placeholder="main"
                                  className="border-white/[0.14] bg-white/[0.05] text-white placeholder:text-white/30"
                                />
                                <Button
                                  onClick={async () => {
                                    if (!selectedRepoData) return;
                                    await fetchBranches(selectedProvider, selectedRepoData);
                                    const branchToDetect =
                                      selectedBranch || selectedRepoData.defaultBranch;
                                    detectFramework(
                                      selectedProvider,
                                      selectedRepoData,
                                      branchToDetect,
                                    );
                                  }}
                                  variant="outline"
                                  size="sm"
                                  className="border-white/[0.14] bg-white/[0.03] text-white/82 hover:bg-white/[0.07]"
                                  disabled={loadingBranches}
                                >
                                  <Loader2
                                    className={`mr-2 h-4 w-4 ${loadingBranches ? "animate-spin" : "hidden"}`}
                                  />
                                  Refresh branches
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="border border-white/[0.08] bg-white/[0.04] p-5 sm:p-6">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center border border-white/[0.1] bg-white/[0.05] text-blue-300">
                          <Layers3 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                            Build Profile
                          </p>
                          <h3 className="mt-2 text-base font-semibold text-white">
                            Framework and runtime defaults
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-white/45">
                            Choose the build pipeline that best matches the repository. Platform
                            defaults stay visible so teams know exactly what is generated.
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-start">
                        <div className="min-w-0 flex-1">
                          <Label className="mb-2 block text-sm font-medium text-white/82">
                            Framework or pipeline type
                          </Label>
                          <Select value={framework} onValueChange={setFramework}>
                            <SelectTrigger className="border-white/[0.14] bg-white/[0.05] text-white">
                              <SelectValue placeholder="Select framework" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="simple-test">Simple test (no build or deploy)</SelectItem>
                              <SelectItem value="Java">Java (uses your Dockerfile)</SelectItem>
                              <SelectItem value="Dockerfile">Dockerfile (uses your existing Dockerfile)</SelectItem>
                              <SelectItem value="Next.js">Next.js (auto-Dockerfile)</SelectItem>
                              <SelectItem value="Nuxt.js">Nuxt.js (auto-Dockerfile)</SelectItem>
                              <SelectItem value="Vite-React">React + Vite (auto-Dockerfile)</SelectItem>
                              <SelectItem value="Vue.js">Vue.js (auto-Dockerfile)</SelectItem>
                              <SelectItem value="Angular">Angular (auto-Dockerfile)</SelectItem>
                              <SelectItem value="SvelteKit">SvelteKit (auto-Dockerfile)</SelectItem>
                              <SelectItem value="express">Express.js (auto-Dockerfile)</SelectItem>
                              <SelectItem value="React">React CRA (bring Dockerfile)</SelectItem>
                              <SelectItem value="Svelte">Svelte (bring Dockerfile)</SelectItem>
                              <SelectItem value="Node.js">Node.js (bring Dockerfile)</SelectItem>
                              <SelectItem value="python">Python (auto-Dockerfile)</SelectItem>
                              <SelectItem value="django">Django (auto-Dockerfile)</SelectItem>
                              <SelectItem value="flask">Flask (auto-Dockerfile)</SelectItem>
                              <SelectItem value="fastapi">FastAPI (auto-Dockerfile)</SelectItem>
                              <SelectItem value="Static">Static site</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="lg:pt-7">
                          <Button
                            onClick={async () => {
                              if (!selectedRepoData) return;
                              await detectFramework(
                                selectedProvider,
                                selectedRepoData,
                                selectedBranch,
                              );
                            }}
                            variant="outline"
                            size="sm"
                            className="w-full border-white/[0.14] bg-white/[0.03] text-white/82 hover:bg-white/[0.07] lg:w-auto"
                            disabled={detectingFramework || !selectedRepoData}
                          >
                            <Loader2
                              className={`mr-2 h-4 w-4 ${detectingFramework ? "animate-spin" : "hidden"}`}
                            />
                            {detectingFramework ? "Detecting..." : "Detect from repository"}
                          </Button>
                        </div>
                      </div>

                      {selectedFrameworkConfig && (
                        <div
                          className={`mt-5 rounded-xl border p-4 sm:p-5 ${
                            hasDockerfile
                              ? "border-emerald-500/20 bg-emerald-500/10"
                              : "border-blue-500/20 bg-blue-500/10"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${
                                hasDockerfile ? "bg-emerald-500/20 text-emerald-300" : "bg-blue-500/20 text-blue-300"
                              }`}
                            >
                              {hasDockerfile ? (
                                <CheckCircle2 className="h-4 w-4" />
                              ) : (
                                <Layers3 className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-semibold text-white">
                                  Build pipeline details
                                </h4>
                                {detectingFramework && (
                                  <Loader2 className="h-4 w-4 animate-spin text-blue-300" />
                                )}
                              </div>
                              <p className="mt-2 text-sm leading-6 text-white/55">
                                {hasDockerfile
                                  ? framework === "Java"
                                    ? "A repository Dockerfile is detected and will be used for the Java build path. Platform defaults remain visible for reference."
                                    : "A repository Dockerfile is detected and will be used during deployment. Platform defaults remain visible for reference."
                                  : selectedFrameworkConfig.description}
                              </p>

                              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                {selectedFrameworkConfig.installCommand && (
                                  <div className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
                                      Install command
                                    </div>
                                    <code className="mt-2 block break-all text-[12px] leading-5 text-white/82">
                                      {selectedFrameworkConfig.installCommand}
                                    </code>
                                  </div>
                                )}

                                <div className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
                                    {hasDockerfile ? "Platform default build" : "Build command"}
                                  </div>
                                  <code className="mt-2 block break-all text-[12px] leading-5 text-white/82">
                                    {selectedFrameworkConfig.buildCommand || "Not required"}
                                  </code>
                                </div>

                                <div className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
                                    {hasDockerfile ? "Platform default output" : "Output directory"}
                                  </div>
                                  <code className="mt-2 block break-all text-[12px] leading-5 text-white/82">
                                    {selectedFrameworkConfig.outputDir || "."}
                                  </code>
                                </div>
                              </div>

                              {!hasDockerfile && (
                                <p className="mt-4 text-xs leading-5 text-white/48">
                                  Add a <code className="text-blue-300">Dockerfile</code> to the
                                  repository when you need full control over the container build.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {(hasDockerfile || framework === "Dockerfile" || framework === "Java") && (
                        <div className="mt-5 rounded-xl border border-white/[0.08] bg-black/20 p-4 sm:p-5">
                          <Label className="mb-2 block text-sm font-medium text-white/82">
                            Container port
                          </Label>
                          <Input
                            type="number"
                            min="1"
                            max="65535"
                            value={containerPort ?? ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setContainerPort(val ? parseInt(val, 10) : undefined);
                            }}
                            placeholder={detectedPort ? detectedPort.toString() : "3000"}
                            className="border-white/[0.14] bg-white/[0.05] text-white placeholder:text-white/30"
                          />
                          {detectedPort && (
                            <p className="mt-2 text-xs text-emerald-300">
                              Detected from Dockerfile: <span className="font-mono">EXPOSE {detectedPort}</span>
                            </p>
                          )}
                          {!detectedPort && containerPort === undefined && (
                            <p className="mt-2 text-xs text-amber-300">
                              Port was not detected automatically. Confirm the listening port before
                              deployment.
                            </p>
                          )}
                          <p className="mt-2 text-xs leading-5 text-white/45">
                            This is the internal port your container listens on. The platform routes
                            traffic to this port after provisioning.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="border border-white/[0.08] bg-white/[0.04] p-5 sm:p-6">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center border border-white/[0.1] bg-white/[0.05] text-blue-300">
                          <Cpu className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                            Capacity
                          </p>
                          <h3 className="mt-2 text-base font-semibold text-white">
                            Instance sizing and cost profile
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-white/45">
                            Pick a runtime size that matches the application footprint. Capacity can
                            be resized later as traffic and workload change.
                          </p>
                        </div>
                      </div>

                      <RadioGroup value={size} onValueChange={setSize} className="mt-6 grid gap-3">
                        {(["small", "medium", "large"] as const).map((sizeOption) => {
                          const config = instanceSizeConfigs[sizeOption];
                          const sizePrice = pricing?.[sizeOption];
                          const monthlyPrice = sizePrice?.price ?? 0;
                          const hourlyRate = sizePrice?.hourlyRate ?? 0;

                          return (
                            <div key={sizeOption}>
                              <RadioGroupItem
                                value={sizeOption}
                                id={`size-${sizeOption}`}
                                className="peer sr-only"
                              />
                              <Label
                                htmlFor={`size-${sizeOption}`}
                                className="block cursor-pointer border border-white/[0.08] bg-white/[0.03] p-4 transition-colors peer-data-[state=checked]:border-blue-400/35 peer-data-[state=checked]:bg-blue-500/10 hover:bg-white/[0.05]"
                              >
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="flex min-w-0 items-start gap-3">
                                    <div
                                      className={`mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                                        size === sizeOption ? "border-blue-400 bg-blue-400" : "border-white/30"
                                      }`}
                                    >
                                      {size === sizeOption && <div className="h-2 w-2 rounded-full bg-white" />}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="text-sm font-semibold capitalize text-white">
                                        {sizeOption}
                                      </div>
                                      <div className="mt-1 text-sm leading-6 text-white/50">
                                        {config.cpu} CPU / {config.ram} RAM / {config.replicas} replica{config.replicas > 1 ? "s" : ""}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="text-left sm:text-right">
                                    {monthlyPrice > 0 ? (
                                      <>
                                        <div className="text-sm font-semibold text-white">
                                          ${monthlyPrice.toFixed(2)}
                                          <span className="ml-1 text-xs text-white/50">/mo</span>
                                        </div>
                                        <div className="mt-1 text-xs text-white/45">
                                          ${hourlyRate.toFixed(4)}/hour usage rate
                                        </div>
                                      </>
                                    ) : (
                                      <div className="text-sm font-semibold text-emerald-300">Free</div>
                                    )}
                                  </div>
                                </div>
                              </Label>
                            </div>
                          );
                        })}
                      </RadioGroup>
                    </div>

                    <div className="border border-white/[0.08] bg-white/[0.04] p-5 sm:p-6">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center border border-white/[0.1] bg-white/[0.05] text-blue-300">
                          <GitBranch className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                            Release Behavior
                          </p>
                          <h3 className="mt-2 text-base font-semibold text-white">
                            Automatic delivery on branch updates
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-white/45">
                            Control whether pushes to the selected branch trigger new deployments
                            after the initial rollout completes.
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 rounded-xl border border-white/[0.08] bg-black/20 p-4 sm:p-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <Label className="text-sm font-medium text-white/82">
                              Auto-deploy on git push
                            </Label>
                            <p className="mt-2 text-sm leading-6 text-white/48">
                              New commits on <span className="break-all font-mono text-blue-300">{selectedBranch || "selected branch"}</span> trigger deployment automatically when enabled.
                            </p>
                          </div>
                          <Switch
                            checked={autoDeploy}
                            onCheckedChange={setAutoDeploy}
                            className="data-[state=checked]:bg-blue-500"
                          />
                        </div>

                        <div className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 text-sm leading-6 text-white/50">
                          {autoDeploy
                            ? "A repository webhook is created so future pushes trigger fresh deployments automatically."
                            : "Deployments remain manual after launch, which is useful for controlled release processes."}
                        </div>
                      </div>
                    </div>

                    <div className="border border-white/[0.08] bg-white/[0.04] p-5 sm:p-6">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center border border-white/[0.1] bg-white/[0.05] text-blue-300">
                          <Globe2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                            Access URL
                          </p>
                          <h3 className="mt-2 text-base font-semibold text-white">
                            Platform hostname and custom domain path
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-white/45">
                            Each deployment gets a platform URL immediately. Custom domains can be
                            attached after DNS verification in the application detail view.
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 rounded-xl border border-blue-400/20 bg-blue-500/10 p-4 sm:p-5">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-200/80">
                          Default hostname
                        </div>
                        <div className="mt-2 break-all font-mono text-sm text-white">
                          {appName || "your-app"}.galaxyhvh.com
                        </div>
                        <p className="mt-3 text-sm leading-6 text-white/55">
                          Add a custom domain such as <span className="text-white/78">example.com</span> after deployment from the app&apos;s <span className="text-white/78">Domains</span> tab.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                      Secrets
                    </p>
                    <h3 className="mt-2 text-base font-semibold text-white">
                      Environment variables
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-white/45">
                      Provide runtime secrets and service configuration. You can add values one by
                      one, paste an existing env file, or upload a file directly.
                    </p>
                  </div>
                  <EnvVarsEditor value={envVars} onChange={setEnvVars} />
                </div>
              </CardContent>
              <CardFooter className="flex justify-between border-t border-white/[0.06] px-6 py-5 sm:px-7">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="cursor-pointer rounded-md border-white/[0.14] bg-white/[0.03] text-white/82 hover:bg-white/[0.07]"
                >
                  Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  className="cursor-pointer rounded-md border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}
          {/* Step 4: Review & Deploy */}
          {currentStep === 4 && (
            <Card className={panelClassName}>
              <CardHeader>
                <CardTitle className="text-white">Review & Deploy</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Deployment Summary */}
                <div>
                  <Label className="text-white">Deployment Summary</Label>
                  <div className="mt-4 space-y-3 p-4 bg-white/10 rounded-lg">
                    <div className="flex justify-between">
                      <span className="text-white/60">Project:</span>
                      <span className="text-white">
                        {selectedProject && selectedProject !== "none"
                          ? projects.find((p) => p.id === selectedProject)
                              ?.name || "Unknown"
                          : "No project"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Application Name:</span>
                      <span className="text-white">{appName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Repository:</span>
                      <span className="text-white">
                        {selectedRepoData?.fullName}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Branch:</span>
                      <span className="text-white">{selectedBranch}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Framework:</span>
                      <span className="text-white">{framework}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Instance Size:</span>
                      <span className="text-white capitalize">
                        {size} (
                        {
                          instanceSizeConfigs[
                            size as keyof typeof instanceSizeConfigs
                          ]?.cpu
                        }{" "}
                        CPU /{" "}
                        {
                          instanceSizeConfigs[
                            size as keyof typeof instanceSizeConfigs
                          ]?.ram
                        }{" "}
                        RAM)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Estimated Cost:</span>
                      <span className="text-white">
                        {(() => {
                          const sizePrice = pricing?.[size];
                          const monthlyPrice = sizePrice?.price ?? 0;
                          return monthlyPrice > 0
                            ? `$${monthlyPrice.toFixed(2)}/mo`
                            : "Free";
                        })()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Auto-Deploy:</span>
                      <span
                        className={
                          autoDeploy ? "text-green-400" : "text-white/60"
                        }
                      >
                        {autoDeploy ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Platform URL:</span>
                      <span className="text-blue-400 font-mono text-sm">
                        {appName || "your-app"}.galaxyhvh.com
                      </span>
                    </div>
                    {envVars.length > 0 && (
                      <div>
                        <div className="text-white/60 mb-2">
                          Environment Variables:
                        </div>
                        <div className="ml-4 space-y-1">
                          {envVars.map((env, index) => (
                            <div key={index} className="text-sm text-white/70">
                              {env.key}: {env.value ? "***" : "Not set"}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <Separator className="bg-white/10" />
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="cursor-pointer rounded-md border-white/[0.14] bg-white/[0.03] text-white/82 hover:bg-white/[0.07]"
                >
                  Back
                </Button>
                <Button
                  onClick={onSubmit}
                  disabled={isLoading}
                  className="cursor-pointer rounded-md border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Deploying...
                    </>
                  ) : (
                    "Deploy Application"
                  )}
                </Button>
              </CardFooter>
            </Card>
          )}
        </div>

        {/* Summary Sidebar */}
        <div>
          <div className={`${panelClassName} lg:sticky lg:top-8`}>
            <div className="border-b border-white/[0.06] px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">Summary</p>
              <h3 className="mt-2 text-lg font-semibold text-white">Configuration</h3>
            </div>
            <div className="px-6 py-4">
              <div className="space-y-0.5">
                <SummaryRow icon="/dashboard icons/provider .png" label="Git provider" value={selectedProviderData?.name ?? "—"} empty={!selectedProviderData} />
                <SummaryRow icon="/dashboard icons/repository.png" label="Repository" value={selectedRepoData?.name ?? "—"} empty={!selectedRepoData} />
                <SummaryRow label="Branch" value={(selectedBranch || selectedRepoData?.defaultBranch) ?? "—"} empty={!(selectedBranch || selectedRepoData?.defaultBranch)} />
                <SummaryRow icon="/dashboard icons/name.png" label="App name" value={appName || "—"} empty={!appName} />
                <SummaryRow icon="/dashboard icons/apptype .png" label="Framework" value={framework || "—"} empty={!framework} />
              </div>

              <div className="my-3 border-t border-white/[0.05]" />

              <div className="space-y-0.5">
                <SummaryRow icon="/dashboard icons/plan _1.png" label="Instance" value={`${size.charAt(0).toUpperCase() + size.slice(1)} / ${selectedSizeConfig.cpu} CPU / ${selectedSizeConfig.ram} RAM`} />
                <SummaryRow label="Auto deploy" value={autoDeploy ? "Enabled" : "Manual only"} />
                {selectedProject && selectedProject !== "none" && (
                  <SummaryRow icon="/dashboard icons/project _1.png" label="Project" value={projects.find((p) => p.id === selectedProject)?.name || "Assigned"} />
                )}
              </div>

              <Separator className="my-4 bg-white/[0.08]" />

              <div className="rounded border border-blue-400/20 bg-blue-500/10 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-200/80">
                  Estimated cost
                </p>
                {selectedSizePrice?.price ? (
                  <>
                    <div className="mt-2 text-2xl font-semibold text-white">
                      ${selectedSizePrice.price.toFixed(2)}
                      <span className="ml-1 text-sm font-medium text-white/50">/mo</span>
                    </div>
                    <p className="mt-1 text-sm text-white/55">
                      {selectedSizePrice.hourlyRate > 0
                        ? `$${selectedSizePrice.hourlyRate.toFixed(4)}/hour usage rate`
                        : "Billed hourly based on runtime usage."}
                    </p>
                    {selectedSizePrice.initialCost > 0 && (
                      <p className="mt-2 text-sm text-white/55">
                        + ${selectedSizePrice.initialCost.toFixed(2)} one-time setup fee
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="mt-2 text-2xl font-semibold text-white">Free</div>
                    <p className="mt-1 text-sm text-white/55">
                      Included with the current platform profile.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppDeploymentSelect;

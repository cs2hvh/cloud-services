"use client";
import { useState, useEffect, useCallback } from "react";
import { useProviderConnection } from "@/lib/hooks/use-provider-connection";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  ChevronRight,
  Code,
  Cpu,
  FolderKanban,
  GitBranch,
  Globe2,
  Layers3,
  Loader2,
  Settings2,
} from "lucide-react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { EnvVarsEditor, EnvVar } from "./env-vars-editor";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { Tables } from "@/lib/supabase/types";

interface Repository {
  id: string;
  name: string;
  fullName: string;
  description: string;
  private: boolean;
  defaultBranch: string;
  language: string;
  updatedAt: string;
  provider: "github" | "gitlab" | "bitbucket";
}

interface Branch {
  name: string;
  commitSha: string;
  protected: boolean;
}

interface GitProvider {
  id: "github" | "gitlab" | "bitbucket";
  name: string;
  icon: string;
  connected: boolean;
  username?: string | null;
}

interface ProviderConnection {
  provider: string;
  status: boolean;
  integration_connected: boolean;
  integration_username: string | null;
}

// Framework detection and build settings
const frameworkConfigs = {
  "simple-test": {
    buildCommand: "",
    outputDir: ".",
    installCommand: "",
    description: "Test pipeline - no deployment",
  },
  Dockerfile: {
    buildCommand: "docker build",
    outputDir: "",
    installCommand: "",
    description:
      "Uses your existing Dockerfile - supports any language/runtime",
  },
  Java: {
    buildCommand: "mvn package",
    outputDir: "target",
    installCommand: "mvn install",
    description: "Auto-generates Dockerfile with Maven multi-stage build",
  },
  "Next.js": {
    buildCommand: "npm run build",
    outputDir: ".next",
    installCommand: "npm install",
    description: "Auto-generates Dockerfile",
  },
  "Nuxt.js": {
    buildCommand: "npm run build",
    outputDir: ".output",
    installCommand: "npm install",
    description: "Auto-generates Dockerfile",
  },
  "Vite-React": {
    buildCommand: "npm run build",
    outputDir: "dist",
    installCommand: "npm install",
    description: "Auto-generates Dockerfile (Vite)",
  },
  React: {
    buildCommand: "npm run build",
    outputDir: "build",
    installCommand: "npm install",
    description: "Auto-generates Dockerfile (CRA)",
  },
  "Vue.js": {
    buildCommand: "npm run build",
    outputDir: "dist",
    installCommand: "npm install",
    description: "Auto-generates Dockerfile (Vite)",
  },
  Angular: {
    buildCommand: "npm run build",
    outputDir: "dist",
    installCommand: "npm install",
    description: "Auto-generates Dockerfile (Angular CLI)",
  },
  SvelteKit: {
    buildCommand: "npm run build",
    outputDir: "build",
    installCommand: "npm install",
    description: "Auto-generates Dockerfile (Node adapter)",
  },
  Svelte: {
    buildCommand: "npm run build",
    outputDir: "public/build",
    installCommand: "npm install",
    description: "Auto-generates Dockerfile",
  },
  "Node.js": {
    buildCommand: "npm run build",
    outputDir: ".",
    installCommand: "npm install",
    description: "Auto-generates Dockerfile",
  },
  express: {
    buildCommand: "",
    outputDir: ".",
    installCommand: "npm ci --only=production",
    description: "Auto-generates Dockerfile",
  },
  python: {
    buildCommand: "",
    outputDir: ".",
    installCommand: "pip install -r requirements.txt",
    description: "Auto-generates Dockerfile",
  },
  django: {
    buildCommand: "",
    outputDir: ".",
    installCommand: "pip install -r requirements.txt",
    description: "Auto-generates Dockerfile",
  },
  flask: {
    buildCommand: "",
    outputDir: ".",
    installCommand: "pip install -r requirements.txt",
    description: "Auto-generates Dockerfile",
  },
  fastapi: {
    buildCommand: "",
    outputDir: ".",
    installCommand: "pip install -r requirements.txt",
    description: "Auto-generates Dockerfile",
  },
  Static: {
    buildCommand: "",
    outputDir: ".",
    installCommand: "",
    description: "Static files only",
  },
};

// Instance size configurations with resource specs
const instanceSizeConfigs = {
  small: { cpu: "250m", ram: "256Mi", replicas: 1 },
  medium: { cpu: "500m", ram: "512Mi", replicas: 2 },
  large: { cpu: "1", ram: "1Gi", replicas: 3 },
};

interface PricingRates {
  initialCost: number;
  hourlyRate: number;
  price: number; // Monthly price
}

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

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-sm text-white/42">{label}</span>
      <div className="text-right text-sm font-medium text-white/88">{value}</div>
    </div>
  );
}

const AppDeploymentSelect = ({ projects, pricing }: PageProps) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(
    null,
  ); // Track which provider is being connected
  const [connectionError, setConnectionError] = useState<{
    provider: string;
    message: string;
  } | null>(null); // Inline error
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [gitProviders, setGitProviders] = useState<GitProvider[]>([
    { id: "github", name: "GitHub", icon: "/github.png", connected: false },
    { id: "gitlab", name: "GitLab", icon: "/gitlab.png", connected: false },
    {
      id: "bitbucket",
      name: "Bitbucket",
      icon: "/BitBucket.png",
      connected: false,
    },
  ]);
  const [loadingProviders, setLoadingProviders] = useState(true);

  // Form state
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [appName, setAppName] = useState("");
  const [framework, setFramework] = useState<string>("");
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [size, setSize] = useState<string>("small");
  const [autoDeploy, setAutoDeploy] = useState<boolean>(true); // Auto-deploy on git push
  const [hasDockerfile, setHasDockerfile] = useState<boolean>(false); // Track if repo has Dockerfile
  const [containerPort, setContainerPort] = useState<number | undefined>(
    undefined,
  ); // User-specified port
  const [detectedPort, setDetectedPort] = useState<number | undefined>(
    undefined,
  ); // Port detected from Dockerfile
  const [detectingFramework, setDetectingFramework] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const reposPerPage = 3;
  const [repoSearchTerm, setRepoSearchTerm] = useState<string>("");

  // Fetch real provider connection status
  const fetchProviderStatus = useCallback(async () => {
    setLoadingProviders(true);
    try {
      const response = await fetch("/api/auth/providers");
      if (response.ok) {
        const data = await response.json();
        const providers = data.providers || [];

        // Use integration_connected (repo tokens) not identity status
        setGitProviders((prev) =>
          prev.map((provider) => {
            const match = providers.find(
              (p: ProviderConnection) => p.provider === provider.id,
            );
            return {
              ...provider,
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

  // Fetch repositories from API when provider is selected
  const fetchRepositories = useCallback(async (provider: string) => {
    const supportedProviders = ["github", "gitlab", "bitbucket"];

    if (!supportedProviders.includes(provider)) {
      setRepositories([]);
      toast.error("Provider not supported yet");
      return;
    }

    setLoadingRepos(true);
    try {
      const apiEndpoint = `/api/${provider}/repositories`;
      const response = await fetch(apiEndpoint);

      if (response.ok) {
        const data = await response.json();
        setRepositories(data.repositories || []);

        if (data.repositories?.length === 0) {
          toast.info(
            `No repositories found in your ${provider.charAt(0).toUpperCase() + provider.slice(1)} account`,
          );
        } else if (data.note) {
          toast.success(data.note);
        } else if (data.warning) {
          toast.warning(data.warning);
        } else if (data.message && data.needsAppAuth) {
          toast.info(data.message);
        }
      } else {
        const errorData = await response.json();
        console.error("Repository fetch error:", errorData);

        if (response.status === 400 && errorData.needsAppAuth) {
          // Show GitHub App connect option
          setRepositories([]);
          toast.error(
            errorData.message ||
              `${provider.charAt(0).toUpperCase() + provider.slice(1)} App connection required for private repositories`,
          );
        } else {
          toast.error(errorData.message || "Failed to fetch repositories");
          setRepositories([]);
        }
      }
    } catch {
      toast.error("Network error while fetching repositories");
      setRepositories([]);
    } finally {
      setLoadingRepos(false);
    }
  }, []);

  // Fetch branches from API when repository is selected
  const fetchBranches = useCallback(
    async (provider: string, repo: Repository) => {
      if (!provider || !repo) {
        setBranches([]);
        return;
      }

      setLoadingBranches(true);
      try {
        let apiEndpoint = "";

        if (provider === "github") {
          apiEndpoint = `/api/github/branches?repo=${encodeURIComponent(repo.fullName)}`;
        } else if (provider === "gitlab") {
          apiEndpoint = `/api/gitlab/branches?project_id=${encodeURIComponent(repo.id)}`;
        } else if (provider === "bitbucket") {
          apiEndpoint = `/api/bitbucket/branches?repo=${encodeURIComponent(repo.fullName)}`;
        } else {
          setBranches([]);
          toast.error("Provider not supported for branch fetching");
          return;
        }

        const response = await fetch(apiEndpoint);

        if (response.ok) {
          const data = await response.json();
          setBranches(data.branches || []);

          if (data.branches?.length === 0) {
            toast.info(`No branches found in the selected repository`);
          } else if (data.note) {
            toast.success(data.note);
          }
        } else {
          const errorData = await response.json();
          console.error("Branch fetch error:", errorData);
          toast.error(errorData.message || "Failed to fetch branches");
          setBranches([]);
        }
      } catch {
        toast.error("Network error while fetching branches");
        setBranches([]);
      } finally {
        setLoadingBranches(false);
      }
    },
    [],
  );

  // Detect framework from repository files
  const detectFramework = useCallback(
    async (provider: string, repo: Repository, branch: string) => {
      if (!provider || !repo) {
        return;
      }
      setDetectingFramework(true);
      try {
        const response = await fetch("/api/detect-framework", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            provider,
            repoFullName: repo.fullName,
            branch,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.framework) {
            // Handle Unknown framework (no framework detected, no Dockerfile)
            if (data.framework === "Unknown") {
              toast.error("Framework not detected", {
                description:
                  "No supported framework or Dockerfile found. Please add a Dockerfile or select a framework manually.",
              });
              setFramework(""); // Don't auto-select anything
              setHasDockerfile(false);
              return;
            }

            // Normalize framework name to match our configs
            let normalizedFramework = data.framework;

            // Map detected frameworks to our config keys
            // Note: Backend should already normalize Laravel/PHP/Ruby/Sinatra to "Dockerfile" or "Unknown"
            // This mapping acts as a safety fallback in case backend sends raw framework names
            const frameworkMap: Record<string, string> = {
              "Next.js": "Next.js",
              "Nuxt.js": "Nuxt.js",
              "Vite-React": "Vite-React",
              React: "React",
              "Vue.js": "Vue.js",
              Angular: "Angular",
              SvelteKit: "SvelteKit",
              Svelte: "Svelte",
              Express: "express",
              "Node.js": "Node.js",
              Django: "django",
              Flask: "flask",
              FastAPI: "fastapi",
              Dockerfile: "Dockerfile",
              Python: "python",
              python: "python",
              // Java / Maven detection: map backend values to our UI option 'Java'
              Java: "Java",
              java: "Java",
              Maven: "Java",
              maven: "Java",
              mvn: "Java",
              Mvn: "Java",
              // Safety fallback: If backend sends these (shouldn't happen), show as Dockerfile
              Laravel: "Dockerfile",
              Symfony: "Dockerfile",
              "Ruby on Rails": "Dockerfile",
              PHP: "Dockerfile",
              Ruby: "Dockerfile",
              Sinatra: "Dockerfile",
            };

            normalizedFramework = frameworkMap[data.framework] || data.framework;

            const dockerfileDetected = data.hasDockerfile || false;
            if (
              normalizedFramework === "React" ||
              normalizedFramework === "Svelte" ||
              normalizedFramework === "Static"
            ) {
              if (dockerfileDetected) {
                toast.info("Repository Dockerfile detected", {
                  description:
                    "This framework does not have a dedicated platform pipeline. Using the Dockerfile pipeline instead.",
                });
                setFramework("Dockerfile");
              } else {
                toast.error("Framework detected but not directly supported", {
                  description:
                    "Add a Dockerfile to the repository or choose one of the supported deployment pipelines.",
                });
                setFramework("");
              }
            } else {
              setFramework(normalizedFramework);
            }

            // Store Dockerfile detection result
            setHasDockerfile(dockerfileDetected);

            // Handle detected port from Dockerfile
            if (data.detectedPort) {
              setDetectedPort(data.detectedPort);
              // Prefill containerPort if user hasn't manually set it
              if (containerPort === undefined) {
                setContainerPort(data.detectedPort);
              }
            } else {
              setDetectedPort(undefined);
            }

            if (data.buildSystem) {
              console.log("Detected build system:", data.buildSystem);
            }
          }
        }
      } catch (error) {
        console.error("Framework detection error:", error);
      } finally {
        setDetectingFramework(false);
      }
    },
    [containerPort],
  );

  // Load provider status on component mount
  useEffect(() => {
    fetchProviderStatus();
  }, [fetchProviderStatus]);

  // Load repositories when provider is selected
  useEffect(() => {
    if (selectedProvider) {
      fetchRepositories(selectedProvider);
      setCurrentPage(1);
    } else {
      setRepositories([]);
    }
    // Clear branches when provider changes
    setBranches([]);
    setSelectedBranch("");
  }, [selectedProvider, fetchRepositories]);

  // Auto-fill app name when repository is selected
  useEffect(() => {
    if (selectedRepo) {
      const repo = repositories.find((r) => r.id === selectedRepo);
      if (repo) {
        setAppName(repo.name);
        // Only set the deploy branch to the repo default if the user hasn't selected one
        if (!selectedBranch) {
          setSelectedBranch(repo.defaultBranch);
        }
        // Fetch branches for the selected repository
        fetchBranches(selectedProvider, repo);
        // Detect framework for the selected repository (use currently selected branch or default)
        const branchToDetect = selectedBranch || repo.defaultBranch;
        detectFramework(selectedProvider, repo, branchToDetect);
      }
    } else {
      setBranches([]);
      setSelectedBranch("");
    }
  }, [
    selectedRepo,
    selectedProvider,
    fetchBranches,
    detectFramework,
    selectedBranch,
    repositories,
  ]);

  // Re-run framework detection whenever the selected branch changes
  useEffect(() => {
    if (!selectedRepo) return;

    const repo = repositories.find((r) => r.id === selectedRepo);
    if (!repo) return;

    // Only attempt detection when a branch is selected
    const branchToDetect = selectedBranch || repo.defaultBranch;
    if (!branchToDetect) return;

    detectFramework(selectedProvider, repo, branchToDetect);
  }, [
    selectedBranch,
    selectedRepo,
    selectedProvider,
    repositories,
    detectFramework,
  ]);

  const { connectProvider: performConnection } = useProviderConnection({
    returnTo: "/dashboard/services/apps/new",
    mode: "integration",
  });

  const connectProvider = async (providerId: string) => {
    setIsLoading(true);
    setConnectingProvider(providerId);
    setConnectionError(null); // Clear previous errors
    try {
      const result = await performConnection(providerId, "connect");
      if (!result.success && result.error) {
        setConnectionError({ provider: providerId, message: result.error });
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Connection failed";
      setConnectionError({ provider: providerId, message: errorMessage });
    } finally {
      setIsLoading(false);
      setConnectingProvider(null);
    }
  };

  // Auto-refresh provider status when window regains focus (after OAuth redirect)
  useEffect(() => {
    const handleFocus = () => {
      // Refresh provider status when user returns from OAuth
      fetchProviderStatus();
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchProviderStatus]);

  const handleNextStep = () => {
    if (currentStep === 1 && !selectedProvider) {
      toast.error("Please select a Git provider");
      return;
    }
    if (currentStep === 2 && !selectedRepo) {
      toast.error("Please select a repository");
      return;
    }
    if (currentStep === 3) {
      if (!appName.trim()) {
        toast.error("Please enter an app name");
        return;
      }
      if (!framework) {
        toast.error("Please select a framework");
        return;
      }
      // Validate app name format
      const normalizedName = appName.toLowerCase().trim();
      if (normalizedName.length < 3) {
        toast.error("App name must be at least 3 characters long");
        return;
      }
      if (normalizedName.length > 63) {
        toast.error("App name must be at most 63 characters long");
        return;
      }
    }

    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const router = useRouter();

  const onSubmit = async () => {
    if (!selectedRepo || !selectedProvider || !appName || !framework) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsLoading(true);
    try {
      const selectedRepoData = repositories.find((r) => r.id === selectedRepo);
      if (!selectedRepoData) {
        toast.error("Selected repository not found");
        setIsLoading(false);
        return;
      }

      // Normalize app name to meet validation requirements
      const normalizedName = appName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/^-+|-+$/g, "") // Remove leading/trailing hyphens
        .replace(/-+/g, "-"); // Replace multiple hyphens with single hyphen

      // Ensure name starts and ends with alphanumeric
      const validName =
        normalizedName.match(/^[a-z0-9]/) && normalizedName.match(/[a-z0-9]$/)
          ? normalizedName
          : `app-${normalizedName}`.replace(/^-+|-+$/g, "");

      if (validName.length < 3) {
        toast.error("App name must be at least 3 characters long");
        setIsLoading(false);
        return;
      }

      // Construct proper repository URL based on provider
      const repoUrlMap: Record<string, string> = {
        github: `https://github.com/${selectedRepoData.fullName}`,
        gitlab: `https://gitlab.com/${selectedRepoData.fullName}`,
        bitbucket: `https://bitbucket.org/${selectedRepoData.fullName}`,
      };

      const payload = {
        name: validName,
        git_provider: selectedProvider as "github" | "gitlab" | "bitbucket",
        repository_id: selectedRepoData.id,
        repository_name: selectedRepoData.fullName,
        repository_url:
          repoUrlMap[selectedProvider] ||
          `https://${selectedProvider}.com/${selectedRepoData.fullName}`,
        branch: selectedBranch || selectedRepoData.defaultBranch || "main",
        framework: framework as
          | "simple-test"
          | "Next.js"
          | "Nuxt.js"
          | "Vite-React"
          | "Vue.js"
          | "Angular"
          | "SvelteKit"
          | "Node.js"
          | "express"
          | "python"
          | "django"
          | "flask"
          | "fastapi"
          | "Java"
          | "Dockerfile",
        env_vars: envVars.filter((ev) => ev.key && ev.value),
        size: size || "small",
        auto_deploy: autoDeploy,
        deploy_branch:
          selectedBranch || selectedRepoData.defaultBranch || "main",
        project_id:
          selectedProject && selectedProject !== "none"
            ? selectedProject
            : undefined,
        container_port: containerPort, // Optional: only sent if user has Dockerfile
      };

      const response = await fetch("/api/services/platform-apps/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `app-create:${crypto.randomUUID()}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.partial_success && data.app_id) {
          toast.warning(
            data.message ||
              "Deployment started, but billing registration needs attention.",
          );
          router.push(`/dashboard/services/apps/${data.app_id}`);
          return;
        }

        throw new Error(
          data.message || data.error || "Failed to create application",
        );
      }

      toast.success("Application deployment started successfully!");

      // Redirect to apps list page after a short delay
      setTimeout(() => {
        router.push("/dashboard/services/apps");
      }, 1500);
    } catch (error: unknown) {
      console.error("Deployment error:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to start deployment. Please try again.";
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const steps = STEP_META;

  const selectedRepoData = repositories.find((r) => r.id === selectedRepo);
  const selectedProviderData = gitProviders.find(
    (p) => p.id === selectedProvider,
  );
  const activeStepMeta = STEP_META[currentStep - 1];
  const progressPercentage = (currentStep / STEP_META.length) * 100;
  const selectedSizeConfig =
    instanceSizeConfigs[size as keyof typeof instanceSizeConfigs] || instanceSizeConfigs.small;
  const selectedSizePrice = pricing?.[size];
  const selectedFrameworkConfig = framework
    ? frameworkConfigs[framework as keyof typeof frameworkConfigs]
    : undefined;
  const selectedProjectName =
    selectedProject && selectedProject !== "none"
      ? projects.find((project) => project.id === selectedProject)?.name || "Assigned"
      : "Not attached";

  // Filter repositories based on search term
  const filteredRepositories = repositories.filter((repo) => {
    const searchLower = repoSearchTerm.toLowerCase();
    return (
      repo.name.toLowerCase().includes(searchLower) ||
      repo.fullName.toLowerCase().includes(searchLower) ||
      (repo.description && repo.description.toLowerCase().includes(searchLower))
    );
  });

  return (
    <div className="space-y-6 px-2 py-4 text-white sm:px-3 lg:px-4">
      <div className={panelClassName}>
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-end lg:justify-between">
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

          <div className="grid grid-cols-2 gap-3 sm:min-w-[240px]">
            <div className="border border-white/[0.08] bg-white/[0.04] px-3 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Progress
              </div>
              <div className="mt-1.5 text-lg font-semibold text-white">
                {currentStep} / {STEP_META.length}
              </div>
            </div>
            <div className="border border-white/[0.08] bg-white/[0.04] px-3 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Monthly
              </div>
              <div className="mt-1.5 text-lg font-semibold text-white">
                {selectedSizePrice?.price && selectedSizePrice.price > 0
                  ? `$${selectedSizePrice.price.toFixed(2)}/mo`
                  : "Free"}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/[0.06] px-5 py-4 sm:px-6">
          <div className="mb-3 h-1.5 w-full overflow-hidden bg-white/[0.05]">
            <div
              className="h-full bg-gradient-to-r from-blue-400/85 to-white transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {steps.map((step) => {
              const isActive = currentStep === step.id;
              const isCompleted = currentStep > step.id;

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    if (step.id < currentStep) {
                      setCurrentStep(step.id);
                    }
                  }}
                  className={`border px-3 py-3 text-left transition-colors ${
                    isActive
                      ? "border-blue-400/30 bg-blue-500/10"
                      : isCompleted
                        ? "border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.06]"
                        : "border-white/[0.06] bg-transparent"
                  } ${step.id < currentStep ? "cursor-pointer" : "cursor-default"}`}
                >
                  <div className="flex flex-col h-full">
                    <span className="text-xs font-semibold text-white/32">0{step.id}</span>
                    <div className="mt-2 flex items-center justify-between gap-2 pt-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">{step.name}</div>
                        <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-white/40">{step.title}</div>
                      </div>
                      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
                        <Image src={step.iconSrc} alt={step.name} width={44} height={44} className="h-11 w-11 object-contain" />
                        {isCompleted && (
                          <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500">
                            <svg className="h-2 w-2 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {/* Step 1: Git Provider */}
          {currentStep === 1 && (
            <Card className={panelClassName}>
              <CardHeader>
                <CardTitle className="text-white">
                  Select Git Provider
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingProviders ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-8 h-8 text-blue-400 mx-auto mb-4 animate-spin" />
                    <p className="text-white/60">
                      Checking connected providers...
                    </p>
                  </div>
                ) : (
                  <RadioGroup
                    value={selectedProvider}
                    onValueChange={setSelectedProvider}
                    className="grid grid-cols-1 gap-4"
                  >
                    {gitProviders.map((provider) => (
                      <div key={provider.id}>
                        <RadioGroupItem
                          value={provider.id}
                          id={provider.id}
                          className="peer sr-only"
                          disabled={!provider.connected}
                        />
                        <Label
                          htmlFor={provider.id}
                          className="flex items-center gap-4 p-4 bg-white/10 rounded-lg border-2 border-transparent cursor-pointer transition-all peer-data-[state=checked]:border-blue-500 hover:bg-white/15 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                selectedProvider === provider.id
                                  ? "border-blue-500 bg-blue-500"
                                  : "border-white/30"
                              }`}
                            >
                              {selectedProvider === provider.id && (
                                <div className="w-2 h-2 rounded-full bg-white"></div>
                              )}
                            </div>
                            <Image
                              src={provider.icon}
                              alt={provider.name}
                              width={32}
                              height={32}
                              className="rounded"
                            />
                          </div>
                          <div className="flex-1">
                            <div className="font-semibold text-white">
                              {provider.name}
                            </div>
                            <div className="text-sm text-white/60">
                              {provider.connected
                                ? `Repo access connected${provider.username ? ` — @${provider.username}` : ""}`
                                : "Repo access not connected"}
                            </div>
                          </div>
                          {provider.connected ? (
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                              Connected
                            </Badge>
                          ) : (
                            <div className="flex flex-col items-end gap-1">
                              <Button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  connectProvider(provider.id);
                                }}
                                size="sm"
                                className="cursor-pointer border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500"
                                disabled={
                                  isLoading || connectingProvider !== null
                                }
                              >
                                {connectingProvider === provider.id ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Connecting...
                                  </>
                                ) : (
                                  "Connect"
                                )}
                              </Button>
                              {connectionError?.provider === provider.id && (
                                <span className="text-xs text-red-400 max-w-[150px] text-right">
                                  {connectionError.message}
                                </span>
                              )}
                            </div>
                          )}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                )}
                <div className="flex justify-between items-center mt-4">
                  <p className="text-xs text-white/60">
                    Connect a Git provider to access your repositories for deployment
                  </p>
                  <Button
                    onClick={fetchProviderStatus}
                    size="sm"
                    variant="outline"
                    className="border-white/[0.14] bg-white/[0.03] text-white/82 hover:bg-white/[0.07]"
                    disabled={loadingProviders}
                  >
                    {loadingProviders ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Refresh Status"
                    )}
                  </Button>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button
                  onClick={handleNextStep}
                  disabled={loadingProviders || !selectedProvider}
                  className="cursor-pointer rounded-md border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 2: Repository Selection */}
          {currentStep === 2 && (
            <Card className={panelClassName}>
              <CardHeader>
                <CardTitle className="text-white">Select Repository</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingRepos ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-8 h-8 text-blue-400 mx-auto mb-4 animate-spin" />
                    <p className="text-white/60">
                      Loading repositories from {selectedProviderData?.name}...
                    </p>
                  </div>
                ) : repositories.length > 0 ? (
                  <div>
                    <div className="mb-4">
                      <input
                        type="text"
                        placeholder="Search repositories..."
                        value={repoSearchTerm}
                        onChange={(e) => {
                          setRepoSearchTerm(e.target.value);
                          setCurrentPage(1); // Reset to first page when searching
                        }}
                        className="w-full bg-white/10 border border-white/20 rounded-md text-white placeholder:text-white/50 p-3 focus:outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                    {filteredRepositories.length > 0 ? (
                      <div>
                        <RadioGroup
                          value={selectedRepo}
                          onValueChange={setSelectedRepo}
                          className="grid grid-cols-1 gap-4"
                        >
                          {filteredRepositories
                            .slice(
                              (currentPage - 1) * reposPerPage,
                              currentPage * reposPerPage,
                            )
                            .map((repo) => (
                              <div key={repo.id}>
                                <RadioGroupItem
                                  value={repo.id}
                                  id={repo.id}
                                  className="peer sr-only"
                                />
                                <Label
                                  htmlFor={repo.id}
                                  className="flex items-start gap-4 p-4 bg-white/10 rounded-lg border-2 border-transparent cursor-pointer transition-all peer-data-[state=checked]:border-blue-500 hover:bg-white/15"
                                >
                                  <div
                                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center mt-1 ${
                                      selectedRepo === repo.id
                                        ? "border-blue-500 bg-blue-500"
                                        : "border-white/30"
                                    }`}
                                  >
                                    {selectedRepo === repo.id && (
                                      <div className="w-2 h-2 rounded-full bg-white"></div>
                                    )}
                                  </div>
                                  <Code className="w-6 h-6 text-blue-400 mt-1" />
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <div className="font-semibold text-white">
                                        {repo.name}
                                      </div>
                                      {repo.private && (
                                        <Badge
                                          variant="outline"
                                          className="text-xs text-white/70 border-white/30"
                                        >
                                          Private
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="text-sm text-white/60 mt-1">
                                      {repo.fullName}
                                    </div>
                                    {repo.description && (
                                      <div className="text-xs text-white/50 mt-1">
                                        {repo.description}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-4 mt-2 text-xs text-white/50">
                                      <span>{repo.language}</span>
                                      <span>
                                        Updated{" "}
                                        {new Date(
                                          repo.updatedAt,
                                        ).toLocaleDateString()}
                                      </span>
                                      <span>Default: {repo.defaultBranch}</span>
                                    </div>
                                  </div>
                                </Label>
                              </div>
                            ))}
                        </RadioGroup>

                        {/* Repository List Pagination */}
                        {filteredRepositories.length > reposPerPage &&
                          (() => {
                            const totalPages = Math.ceil(
                              filteredRepositories.length / reposPerPage,
                            );

                            // Generate page numbers with ellipsis for large page counts
                            const getPageNumbers = () => {
                              const pages: (number | string)[] = [];

                              if (totalPages <= 7) {
                                // Show all pages if 7 or fewer
                                for (let i = 1; i <= totalPages; i++) {
                                  pages.push(i);
                                }
                              } else {
                                // Always show first page
                                pages.push(1);

                                if (currentPage > 3) {
                                  pages.push("...");
                                }

                                // Show pages around current page
                                const start = Math.max(2, currentPage - 1);
                                const end = Math.min(
                                  totalPages - 1,
                                  currentPage + 1,
                                );

                                for (let i = start; i <= end; i++) {
                                  pages.push(i);
                                }

                                if (currentPage < totalPages - 2) {
                                  pages.push("...");
                                }

                                // Always show last page
                                pages.push(totalPages);
                              }

                              return pages;
                            };

                            return (
                              <div className="mt-4 pt-4 border-t border-white/10">
                                <p className="text-xs text-white/40 text-center mb-2">
                                  Page {currentPage} of {totalPages} - {filteredRepositories.length} repositories
                                  {filteredRepositories.length} repositories
                                </p>
                                <div className="flex items-center justify-center gap-1">
                                  {/* Previous Page */}
                                  <Button
                                    onClick={() =>
                                      setCurrentPage((prev) =>
                                        Math.max(1, prev - 1),
                                      )
                                    }
                                    disabled={currentPage === 1}
                                    variant="ghost"
                                    size="sm"
                                    className="text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    Prev
                                  </Button>

                                  {/* Page Numbers */}
                                  <div className="flex items-center gap-1">
                                    {getPageNumbers().map((pageNum, idx) =>
                                      pageNum === "..." ? (
                                        <span
                                          key={`ellipsis-${idx}`}
                                          className="px-2 text-white/40"
                                        >
                                          ...
                                        </span>
                                      ) : (
                                        <Button
                                          key={pageNum}
                                          onClick={() =>
                                            setCurrentPage(pageNum as number)
                                          }
                                          variant="ghost"
                                          size="sm"
                                          className={`
                                        min-w-[32px] h-8
                                        ${
                                          currentPage === pageNum
                                            ? "bg-white/20 text-white"
                                            : "text-white/50 hover:text-white hover:bg-white/10"
                                        }
                                      `}
                                        >
                                          {pageNum}
                                        </Button>
                                      ),
                                    )}
                                  </div>

                                  {/* Next Page */}
                                  <Button
                                    onClick={() =>
                                      setCurrentPage((prev) =>
                                        Math.min(totalPages, prev + 1),
                                      )
                                    }
                                    disabled={currentPage === totalPages}
                                    variant="ghost"
                                    size="sm"
                                    className="text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    Next
                                  </Button>
                                </div>
                              </div>
                            );
                          })()}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Code className="w-8 h-8 text-white/20 mx-auto mb-2" />
                        <p className="text-sm text-white/50">
                          No repositories match &quot;{repoSearchTerm}&quot;
                        </p>
                        <Button
                          onClick={() => setRepoSearchTerm("")}
                          size="sm"
                          variant="outline"
                          className="mt-3 border-white/[0.14] bg-white/[0.03] text-white/82 hover:bg-white/[0.07]"
                        >
                          Clear Search
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Code className="w-12 h-12 text-white/30 mx-auto mb-4" />
                    <p className="text-white/60 mb-4">No repositories found</p>
                    <p className="text-sm text-white/50 mb-4">
                      {selectedProvider === "github"
                        ? "For private repository access, connect GitHub App with repository permissions"
                        : `Make sure you have repositories in your connected ${selectedProviderData?.name} account`}
                    </p>
                    <div className="flex gap-2 justify-center">
                      <Button
                        onClick={() => fetchRepositories(selectedProvider)}
                        className="border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500"
                      >
                        Refresh Repositories
                      </Button>
                      {selectedProvider === "github" && (
                        <Button
                          onClick={() => connectProvider("github")}
                          className="bg-blue-500 text-white hover:bg-blue-600"
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            "Connect GitHub App"
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
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
                  onClick={handleNextStep}
                  disabled={loadingRepos}
                  className="cursor-pointer rounded-md border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}


          {/* Step 3: Configuration */}
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
                              <SelectItem value="Node.js">Node.js (bring Dockerfile)</SelectItem>
                              <SelectItem value="python">Python (auto-Dockerfile)</SelectItem>
                              <SelectItem value="django">Django (auto-Dockerfile)</SelectItem>
                              <SelectItem value="flask">Flask (auto-Dockerfile)</SelectItem>
                              <SelectItem value="fastapi">FastAPI (auto-Dockerfile)</SelectItem>
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
                                    {sizePrice?.price && sizePrice.price > 0 ? (
                                      <>
                                        <div className="text-sm font-semibold text-white">
                                          ${sizePrice.price.toFixed(2)}
                                          <span className="ml-1 text-xs text-white/50">/mo</span>
                                        </div>
                                        <div className="mt-1 text-xs text-white/45">
                                          ${sizePrice.hourlyRate.toFixed(4)}/hour usage rate
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
                        {selectedSizePrice?.price && selectedSizePrice.price > 0
                          ? `$${selectedSizePrice.price.toFixed(2)}/mo`
                          : "Free"}
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
          <div className="sticky top-6 space-y-6">
            <Card className={`${panelClassName} sticky top-6`}>
              <CardHeader className="border-b border-white/[0.06] px-6 py-5 sm:px-7">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
                  Summary
                </p>
                <CardTitle className="mt-1.5 text-lg font-semibold text-white">
                  Deployment Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="px-6 py-5 sm:px-7">
                {(selectedProviderData || selectedRepoData || appName || selectedBranch || framework) ? (
                  <div className="divide-y divide-white/[0.05]">
                    {selectedProviderData && (
                      <SummaryRow label="Git provider" value={selectedProviderData.name} />
                    )}
                    {selectedRepoData && (
                      <SummaryRow label="Repository" value={selectedRepoData.name} />
                    )}
                    {(selectedBranch || selectedRepoData?.defaultBranch) && (
                      <SummaryRow label="Deploy branch" value={selectedBranch || selectedRepoData?.defaultBranch} />
                    )}
                    {appName && (
                      <SummaryRow label="Application name" value={appName} />
                    )}
                    {framework && (
                      <SummaryRow label="Framework" value={framework} />
                    )}
                    {selectedProject && selectedProject !== "none" && (
                      <SummaryRow label="Project" value={projects.find((p) => p.id === selectedProject)?.name || "Assigned"} />
                    )}
                    <SummaryRow
                      label="Instance"
                      value={`${size.charAt(0).toUpperCase() + size.slice(1)} / ${selectedSizeConfig.cpu} CPU / ${selectedSizeConfig.ram} RAM`}
                    />
                    <SummaryRow label="Auto deploy" value={autoDeploy ? "Enabled" : "Manual only"} />
                  </div>
                ) : null}

                <Separator className="my-4 bg-white/[0.08]" />

                <div className="rounded border border-blue-400/20 bg-blue-500/10 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-200/80">
                    Estimated cost
                  </p>
                  {selectedSizePrice?.price && selectedSizePrice.price > 0 ? (
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
                      {(selectedSizePrice?.initialCost ?? 0) > 0 && (
                        <p className="mt-2 text-sm text-white/55">
                          + ${(selectedSizePrice?.initialCost ?? 0).toFixed(2)} one-time setup fee
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
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </div>
  );
};

export default AppDeploymentSelect;

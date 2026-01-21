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
  Loader2,
  FolderKanban,
  // GitBranch,
  // Globe,
  // Settings,
  // ExternalLink,
} from "lucide-react";
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
import Image from "next/image";
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
}

interface ProviderConnection {
  provider: string;
  status: boolean;
}

// Framework detection and build settings
const frameworkConfigs = {
  'simple-test': { buildCommand: '', outputDir: '.', installCommand: '', description: 'Test pipeline - no deployment' },
  'Next.js': { buildCommand: 'npm run build', outputDir: '.next', installCommand: 'npm install', description: 'Auto-generates Dockerfile' },
  'Nuxt.js': { buildCommand: 'npm run build', outputDir: '.output', installCommand: 'npm install', description: 'Auto-generates Dockerfile' },
  'Vite-React': { buildCommand: 'npm run build', outputDir: 'dist', installCommand: 'npm install', description: 'Auto-generates Dockerfile (Vite)' },
  'React': { buildCommand: 'npm run build', outputDir: 'build', installCommand: 'npm install', description: 'Auto-generates Dockerfile (CRA)' },
  'Vue.js': { buildCommand: 'npm run build', outputDir: 'dist', installCommand: 'npm install', description: 'Auto-generates Dockerfile (Vite)' },
  'Angular': { buildCommand: 'npm run build', outputDir: 'dist', installCommand: 'npm install', description: 'Auto-generates Dockerfile (Angular CLI)' },
  'SvelteKit': { buildCommand: 'npm run build', outputDir: 'build', installCommand: 'npm install', description: 'Auto-generates Dockerfile (Node adapter)' },
  'Svelte': { buildCommand: 'npm run build', outputDir: 'public/build', installCommand: 'npm install', description: 'Auto-generates Dockerfile' },
  'Node.js': { buildCommand: 'npm run build', outputDir: '.', installCommand: 'npm install', description: 'Auto-generates Dockerfile' },
  'express': { buildCommand: '', outputDir: '.', installCommand: 'npm ci --only=production', description: 'Auto-generates Dockerfile' },
  'python': { buildCommand: '', outputDir: '.', installCommand: 'pip install -r requirements.txt', description: 'Auto-generates Dockerfile' },
  'django': { buildCommand: '', outputDir: '.', installCommand: 'pip install -r requirements.txt', description: 'Auto-generates Dockerfile' },
  'flask': { buildCommand: '', outputDir: '.', installCommand: 'pip install -r requirements.txt', description: 'Auto-generates Dockerfile' },
  'fastapi': { buildCommand: '', outputDir: '.', installCommand: 'pip install -r requirements.txt', description: 'Auto-generates Dockerfile' },
  'Static': { buildCommand: '', outputDir: '.', installCommand: '', description: 'Static files only' },
};

// Instance size configurations with resource specs
const instanceSizeConfigs = {
  small: { cpu: '250m', ram: '256Mi', replicas: 1 },
  medium: { cpu: '500m', ram: '512Mi', replicas: 2 },
  large: { cpu: '1', ram: '1Gi', replicas: 3 },
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

const AppDeploymentSelect = ({ projects, pricing }: PageProps) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null); // Track which provider is being connected
  const [connectionError, setConnectionError] = useState<{ provider: string; message: string } | null>(null); // Inline error
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
  const [currentPage, setCurrentPage] = useState<number>(1);
  const reposPerPage = 3;

  // Fetch real provider connection status
  const fetchProviderStatus = useCallback(async () => {
    setLoadingProviders(true);
    try {
      const response = await fetch("/api/auth/providers");
      if (response.ok) {
        const data = await response.json();
        const providers = data.providers || [];

        // Update git providers with real connection status - replace 'any' with proper type
        setGitProviders((prev) =>
          prev.map((provider) => ({
            ...provider,
            connected:
              providers.find(
                (p: ProviderConnection) => p.provider === provider.id
              )?.status || false,
          }))
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
            `No repositories found in your ${provider.charAt(0).toUpperCase() + provider.slice(1)} account`
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
              `${provider.charAt(0).toUpperCase() + provider.slice(1)} App connection required for private repositories`
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
    []
  );

  // Detect framework from repository files
  const detectFramework = useCallback(
    async (provider: string, repo: Repository, branch: string) => {
      if (!provider || !repo) {
        return;
      }

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
          // Normalize framework name to match our configs
          let normalizedFramework = data.framework;
          
          // Map detected frameworks to our config keys
          const frameworkMap: Record<string, string> = {
            'Next.js': 'Next.js',
            'Nuxt.js': 'Nuxt.js',
            'Vite-React': 'Vite-React',
            'React': 'React',
            'Vue.js': 'Vue.js',
            'Angular': 'Angular',
            'SvelteKit': 'SvelteKit',
            'Svelte': 'Svelte',
            'Express': 'express',
            'Node.js': 'Node.js',
            'Django': 'django',
            'Flask': 'flask',
            'FastAPI': 'fastapi',
            'Laravel': 'Static',
            'Symfony': 'Static',
            'Ruby on Rails': 'Static',
            'PHP': 'Static',
            'Python': 'python',
            'python': 'python',
            'Ruby': 'Static',
            'Static': 'Static'
          };
          
          normalizedFramework = frameworkMap[data.framework] || 'Static';
          
          setFramework(normalizedFramework);
          
          // Store Dockerfile detection result
          setHasDockerfile(data.hasDockerfile || false);
          
          if (data.buildSystem) {
            console.log('Detected build system:', data.buildSystem);
          }
        }
      }
    } catch (error) {
      console.error('Framework detection error:', error);
    }
  }, []);

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
        setSelectedBranch(repo.defaultBranch);
        // Fetch branches for the selected repository
        fetchBranches(selectedProvider, repo);
        // Detect framework for the selected repository
        detectFramework(selectedProvider, repo, repo.defaultBranch);
      }
    } else {
      setBranches([]);
      setSelectedBranch("");
    }
  }, [
    selectedRepo,
    repositories,
    selectedProvider,
    fetchBranches,
    detectFramework,
  ]);

  const { connectProvider: performConnection } = useProviderConnection({
    returnTo: '/dashboard/services/apps/new'
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
      const errorMessage = err instanceof Error ? err.message : 'Connection failed';
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

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
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
        repository_url: repoUrlMap[selectedProvider] || `https://${selectedProvider}.com/${selectedRepoData.fullName}`,
        branch: selectedBranch || selectedRepoData.defaultBranch || 'main',
        framework: framework as 'simple-test' | 'Next.js' | 'React' | 'Vue.js' | 'Node.js' | 'express' | 'python' | 'django' | 'flask' | 'fastapi' | 'Static',
        env_vars: envVars.filter(ev => ev.key && ev.value),
        size: size || 'small',
        auto_deploy: autoDeploy,
        deploy_branch:
          selectedBranch || selectedRepoData.defaultBranch || "main",
        project_id: selectedProject && selectedProject !== "none" ? selectedProject : undefined,
      };

      const response = await fetch("/api/services/platform-apps/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create application");
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

  const steps = [
    { id: 1, name: "Provider" },
    { id: 2, name: "Repository" },
    { id: 3, name: "Configure" },
    { id: 4, name: "Deploy" },
  ];

  const selectedRepoData = repositories.find((r) => r.id === selectedRepo);
  const selectedProviderData = gitProviders.find(
    (p) => p.id === selectedProvider
  );

  return (
    <div className="py-4">
      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex justify-between mb-2">
          {steps.map((step, index) => (
            <div key={step.id} className="flex-1 flex flex-col items-center">
              <div className="flex items-center w-full">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-300 ${
                    currentStep > step.id
                      ? "bg-blue-600 text-white"
                      : currentStep === step.id
                        ? "bg-blue-500 text-white"
                        : "bg-white/10 text-white/50"
                  }`}
                >
                  {currentStep > step.id ? <CheckCircle2 size={16} /> : step.id}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 transition-colors duration-300 ${
                      currentStep > step.id ? "bg-blue-600" : "bg-white/10"
                    }`}
                  ></div>
                )}
              </div>
              <p
                className={`mt-2 text-xs ${currentStep >= step.id ? "text-white" : "text-white/50"}`}
              >
                {step.name}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Step 1: Git Provider */}
          {currentStep === 1 && (
            <Card className="bg-white/5 border-white/10">
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
                                ? "Connected and ready to use"
                                : "Not connected"}
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
                                style={{ backgroundColor: "white" }}
                                className={`${
                                  isLoading || connectingProvider !== null
                                    ? "bg-white text-black hover:bg-gray-200"
                                    : "cursor-pointer bg-white text-black hover:bg-gray-200"
                                }`}
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
                    Connect your Git provider to access your repositories
                  </p>
                  <Button
                    onClick={fetchProviderStatus}
                    size="sm"
                    variant="outline"
                    className="border-white/20 text-white hover:bg-white/10"
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
                  className="cursor-pointer bg-white text-black rounded-md hover:bg-white/90"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 2: Repository Selection */}
          {currentStep === 2 && (
            <Card className="bg-white/5 border-white/10">
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
                        className="w-full bg-white/10 border-white/20 rounded-md text-white placeholder:text-white/50 p-3"
                        onChange={() => {
                          // You can implement repository filtering here
                        }}
                      />
                    </div>
                    <div>
                      <RadioGroup
                        value={selectedRepo}
                        onValueChange={setSelectedRepo}
                        className="grid grid-cols-1 gap-4"
                      >
                        {repositories
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

                      {/* Pagination Controls */}
                      {repositories.length > reposPerPage && (
                        <div className="mt-4 pt-4 border-t border-white/10">
                          <div
                            className="
    flex items-center justify-center gap-2
    flex-wrap
    sm:flex-nowrap
    overflow-x-auto
    scrollbar-hide
    px-2
  "
                          >
                            {Array.from(
                              {
                                length: Math.ceil(
                                  repositories.length / reposPerPage,
                                ),
                              },
                              (_, i) => i + 1,
                            ).map((pageNum) => (
                              <Button
                                key={pageNum}
                                onClick={() => setCurrentPage(pageNum)}
                                variant={
                                  currentPage === pageNum
                                    ? "default"
                                    : "outline"
                                }
                                size="sm"
                                className={`
          min-w-[40px]
          ${
            currentPage === pageNum
              ? "bg-white/90 text-black hover:bg-white/90"
              : "border-white/20 text-white hover:bg-white/10"
          }
        `}
                              >
                                {pageNum}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
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
                        className="bg-white text-black hover:bg-gray-200"
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
                  className="cursor-pointer rounded-md border-white/20 text-white hover:bg-white/10"
                >
                  Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  disabled={loadingRepos}
                  className="cursor-pointer bg-white text-black rounded-md hover:bg-white/90"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 3: Configuration */}
          {currentStep === 3 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">
                  Configure Deployment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Project Selection */}
                <div>
                  <Label className="text-white flex items-center gap-2">
                    <FolderKanban className="w-4 h-4" />
                    Select Project
                  </Label>
                  <Select
                    value={selectedProject}
                    onValueChange={setSelectedProject}
                  >
                    <SelectTrigger className="bg-white/10 border-white/20 text-white mt-2">
                      <SelectValue placeholder="Select a project (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Project</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-white/50 mt-1">
                    Associate this app with a project to track activity logs
                  </p>
                </div>

                <Separator className="bg-white/10" />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-white">Application Name</Label>
                    <Input
                      value={appName}
                      onChange={(e) => setAppName(e.target.value)}
                      placeholder="my-awesome-app"
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                    />
                  </div>
                  <div>
                    <Label className="text-white">Deploy Branch</Label>
                    {loadingBranches ? (
                      <div className="flex items-center gap-2 p-3 bg-white/10 rounded-md">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-white/60 text-sm">
                          Loading branches...
                        </span>
                      </div>
                    ) : branches.length > 0 ? (
                      <div className="space-y-2">
                        <Select
                          value={selectedBranch}
                          onValueChange={setSelectedBranch}
                        >
                          <SelectTrigger className="bg-white/10 border-white/20 text-white">
                            <SelectValue placeholder="Select branch" />
                          </SelectTrigger>
                          <SelectContent>
                            {branches.map((branch) => (
                              <SelectItem key={branch.name} value={branch.name}>
                                <div className="flex items-center gap-2">
                                  <span>{branch.name}</span>
                                  {branch.protected && (
                                    <Badge
                                      variant="outline"
                                      className="text-xs text-yellow-400 border-yellow-400/30"
                                    >
                                      Protected
                                    </Badge>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          onClick={() =>
                            selectedRepoData &&
                            fetchBranches(selectedProvider, selectedRepoData)
                          }
                          variant="outline"
                          size="sm"
                          className="border-white/20 text-white hover:bg-white/10"
                          disabled={loadingBranches}
                        >
                          <Loader2
                            className={`w-4 h-4 mr-2 ${loadingBranches ? "animate-spin" : "hidden"}`}
                          />
                          Refresh Branches
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Input
                          value={selectedBranch}
                          onChange={(e) => setSelectedBranch(e.target.value)}
                          placeholder="main"
                          className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                        />
                        <Button
                          onClick={() =>
                            selectedRepoData &&
                            fetchBranches(selectedProvider, selectedRepoData)
                          }
                          variant="outline"
                          size="sm"
                          className="border-white/20 text-white hover:bg-white/10"
                          disabled={loadingBranches}
                        >
                          <Loader2
                            className={`w-4 h-4 mr-2 ${loadingBranches ? "animate-spin" : "hidden"}`}
                          />
                          Refresh Branches
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <Label className="text-white">
                    Framework / Pipeline Type
                  </Label>
                  <div className="flex gap-2">
                    <Select value={framework} onValueChange={setFramework}>
                      <SelectTrigger className="bg-white/10 border-white/20 text-white flex-1">
                        <SelectValue placeholder="Select framework" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Test Pipeline */}
                        <SelectItem value="simple-test">
                          Simple Test (No Build/Deploy)
                        </SelectItem>

                        {/* Node.js Frameworks - Auto Dockerfile */}
                        <SelectItem value="Next.js">
                          {" "}
                          Next.js (auto-Dockerfile)
                        </SelectItem>
                        <SelectItem value="Nuxt.js">
                          {" "}
                          Nuxt.js (auto-Dockerfile)
                        </SelectItem>
                        <SelectItem value="Vite-React">
                          {" "}
                          React + Vite (auto-Dockerfile)
                        </SelectItem>
                        <SelectItem value="Vue.js">
                          {" "}
                          Vue.js (auto-Dockerfile)
                        </SelectItem>
                        <SelectItem value="Angular">
                          {" "}
                          Angular (auto-Dockerfile)
                        </SelectItem>
                        <SelectItem value="SvelteKit">
                          {" "}
                          SvelteKit (auto-Dockerfile)
                        </SelectItem>
                        <SelectItem value="express">
                          {" "}
                          Express.js (auto-Dockerfile)
                        </SelectItem>

                        {/* Node.js Frameworks - Bring Dockerfile */}
                        <SelectItem value="React">
                          {" "}
                          React CRA (bring Dockerfile)
                        </SelectItem>
                        <SelectItem value="Svelte">
                          {" "}
                          Svelte (bring Dockerfile)
                        </SelectItem>
                        <SelectItem value="Node.js">
                          {" "}
                          Node.js (bring Dockerfile)
                        </SelectItem>

                        {/* Python Frameworks */}
                        <SelectItem value="python">
                          {" "}
                          Python (auto-Dockerfile)
                        </SelectItem>
                        <SelectItem value="django">
                          {" "}
                          Django (auto-Dockerfile)
                        </SelectItem>
                        <SelectItem value="flask">
                          {" "}
                          Flask (auto-Dockerfile)
                        </SelectItem>
                        <SelectItem value="fastapi">
                          {" "}
                          FastAPI (auto-Dockerfile)
                        </SelectItem>

                        {/* Static */}
                        <SelectItem value="Static">Static Site</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={() =>
                        selectedRepoData &&
                        detectFramework(
                          selectedProvider,
                          selectedRepoData,
                          selectedBranch,
                        )
                      }
                      variant="outline"
                      size="sm"
                      className="border-white/20 text-white hover:bg-white/10"
                    >
                      Detect
                    </Button>
                  </div>
                </div>

                {/* Build Configuration Info */}
                {framework &&
                  frameworkConfigs[
                    framework as keyof typeof frameworkConfigs
                  ] && (
                    <div
                      className={`p-4 border rounded-lg ${
                        hasDockerfile
                          ? "bg-green-500/10 border-green-500/20"
                          : "bg-blue-500/10 border-blue-500/20"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5 ${
                            hasDockerfile ? "bg-green-500/20" : "bg-blue-500/20"
                          }`}
                        >
                          {hasDockerfile ? (
                            <svg
                              className="w-4 h-4 text-green-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="w-4 h-4 text-blue-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-white font-medium mb-1">
                            Build & Deployment
                          </h3>

                          {/* Show Dockerfile status */}
                          {hasDockerfile ? (
                            <div className="mb-3">
                              <p className="text-sm text-green-300 font-medium mb-1">
                                ✓ Using your repository&apos;s Dockerfile
                              </p>
                              <p className="text-xs text-white/60">
                                Your custom Dockerfile will be used for the
                                build. The platform defaults below are for
                                reference only.
                              </p>
                            </div>
                          ) : (
                            <p className="text-sm text-white/70 mb-3">
                              {
                                frameworkConfigs[
                                  framework as keyof typeof frameworkConfigs
                                ].description
                              }
                            </p>
                          )}

                          {/* Show build defaults (for reference or actual use) */}
                          {frameworkConfigs[
                            framework as keyof typeof frameworkConfigs
                          ].buildCommand && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-white/60 min-w-[120px]">
                                  {hasDockerfile
                                    ? "Platform default:"
                                    : "Build command:"}
                                </span>
                                <code
                                  className={`px-2 py-1 rounded font-mono ${
                                    hasDockerfile
                                      ? "text-white/50 bg-white/5"
                                      : "text-blue-400 bg-white/5"
                                  }`}
                                >
                                  {
                                    frameworkConfigs[
                                      framework as keyof typeof frameworkConfigs
                                    ].buildCommand
                                  }
                                </code>
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-white/60 min-w-[120px]">
                                  {hasDockerfile
                                    ? "Platform default:"
                                    : "Output directory:"}
                                </span>
                                <code
                                  className={`px-2 py-1 rounded font-mono ${
                                    hasDockerfile
                                      ? "text-white/50 bg-white/5"
                                      : "text-blue-400 bg-white/5"
                                  }`}
                                >
                                  {
                                    frameworkConfigs[
                                      framework as keyof typeof frameworkConfigs
                                    ].outputDir
                                  }
                                </code>
                              </div>
                            </div>
                          )}

                          {!hasDockerfile && (
                            <p className="text-xs text-white/50 mt-3">
                              💡 For full control over the build process, add a{" "}
                              <code className="text-blue-300">Dockerfile</code>{" "}
                              to your repository.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                <div className="mt-4">
                  <Label className="text-white">Instance Size</Label>
                  <p className="text-xs text-white/50 mt-1 mb-3">
                    Select the resources for your application. You can resize
                    anytime.
                  </p>
                  <RadioGroup
                    value={size}
                    onValueChange={setSize}
                    className="grid grid-cols-1 gap-3"
                  >
                    {(["small", "medium", "large"] as const).map(
                      (sizeOption) => {
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
                              className="flex items-center justify-between p-4 bg-white/10 rounded-lg border-2 border-transparent cursor-pointer transition-all peer-data-[state=checked]:border-blue-500 hover:bg-white/15"
                            >
                              <div className="flex items-center gap-4">
                                <div
                                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                    size === sizeOption
                                      ? "border-blue-500 bg-blue-500"
                                      : "border-white/30"
                                  }`}
                                >
                                  {size === sizeOption && (
                                    <div className="w-2 h-2 rounded-full bg-white"></div>
                                  )}
                                </div>
                                <div>
                                  <div className="font-semibold text-white capitalize">
                                    {sizeOption}
                                  </div>
                                  <div className="text-xs text-white/60">
                                    {config.cpu} CPU / {config.ram} RAM /{" "}
                                    {config.replicas} replica
                                    {config.replicas > 1 ? "s" : ""}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                {monthlyPrice > 0 ? (
                                  <>
                                    <div className="font-bold text-white">
                                      ${monthlyPrice.toFixed(2)}
                                      <span className="text-xs text-white/60">
                                        /mo
                                      </span>
                                    </div>
                                    <div className="text-xs text-white/50">
                                      ${(hourlyRate * 24 * 30).toFixed(2)}/mo
                                      based on usage
                                    </div>
                                  </>
                                ) : (
                                  <div className="font-bold text-green-400">
                                    Free
                                  </div>
                                )}
                              </div>
                            </Label>
                          </div>
                        );
                      },
                    )}
                  </RadioGroup>
                </div>

                {/* Auto-Deploy Toggle */}
                <div className="mt-4 p-4 bg-white/5 rounded-lg border border-white/10">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="text-white font-medium">
                        Auto-Deploy on Git Push
                      </Label>
                      <p className="text-xs text-white/60">
                        Automatically deploy when you push to the{" "}
                        <span className="font-mono text-blue-400">
                          {selectedBranch || "selected branch"}
                        </span>
                      </p>
                    </div>
                    <Switch
                      checked={autoDeploy}
                      onCheckedChange={setAutoDeploy}
                      className="data-[state=checked]:bg-blue-500"
                    />
                  </div>
                  {autoDeploy && (
                    <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-md">
                      <p className="text-xs text-blue-300">
                        ✓ A webhook will be created in your repository to
                        trigger deployments automatically when you push commits.
                      </p>
                    </div>
                  )}
                </div>

                {/* Environment Variables */}
                <EnvVarsEditor value={envVars} onChange={setEnvVars} />

                {/* Custom Domain Info */}
                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-400">🌐</span>
                    </div>
                    <div>
                      <Label className="text-white font-medium">
                        Custom Domain
                      </Label>
                      <p className="text-xs text-white/60 mt-1">
                        Your app will be available at{" "}
                        <span className="font-mono text-blue-400">
                          {appName || "your-app"}.galaxyhvh.com
                        </span>
                      </p>
                      <p className="text-xs text-white/50 mt-2">
                        You can add a custom domain (e.g., example.com) after
                        deployment from the app&apos;s <strong>Domains</strong>{" "}
                        tab. Custom domains require DNS verification before
                        activation.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="cursor-pointer rounded-md border-white/20 text-white hover:bg-white/10"
                >
                  Back
                </Button>
                <Button
                  onClick={handleNextStep}
                  className="cursor-pointer bg-white text-black rounded-md hover:bg-white/90"
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 4: Review & Deploy */}
          {currentStep === 4 && (
            <Card className="bg-white/5 border-white/10">
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
                        {autoDeploy ? "✓ Enabled" : "Disabled"}
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

                {/* Deployment Info */}
                <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <h4 className="text-white font-medium mb-2">
                    What happens next?
                  </h4>
                  <ul className="text-sm text-white/70 space-y-1">
                    <li>• Your repository will be cloned and built</li>
                    <li>
                      • Application will be deployed to our global
                      infrastructure
                    </li>
                    <li>• SSL certificate will be automatically provisioned</li>
                    <li>
                      • You&apos;ll receive a deployment URL to access your app
                    </li>
                    {autoDeploy && (
                      <li className="text-green-400">
                        • A webhook will be set up to auto-deploy on push to{" "}
                        <span className="font-mono">{selectedBranch}</span>
                      </li>
                    )}
                  </ul>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="cursor-pointer rounded-md border-white/20 text-white hover:bg-white/10"
                >
                  Back
                </Button>
                <Button
                  onClick={onSubmit}
                  disabled={isLoading}
                  className="cursor-pointer bg-white text-black rounded-md hover:bg-white/90"
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
        <div className="lg:col-span-1">
          <Card className="bg-white/5 border-white/10 sticky top-6">
            <CardHeader>
              <CardTitle className="text-white">Deployment Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm text-white/60">Git Provider</div>
                <div className="text-white">
                  {selectedProviderData?.name || "Not selected"}
                </div>
              </div>

              {selectedRepoData && (
                <div>
                  <div className="text-sm text-white/60">Repository</div>
                  <div className="text-white">{selectedRepoData.name}</div>
                  <div className="text-xs text-white/60">
                    {selectedRepoData.language}
                  </div>
                </div>
              )}

              <div>
                <div className="text-sm text-white/60">Application Name</div>
                <div className="text-white">{appName || "Not set"}</div>
              </div>

              {framework && (
                <div>
                  <div className="text-sm text-white/60">Framework</div>
                  <div className="text-white">{framework}</div>
                </div>
              )}

              <div>
                <div className="text-sm text-white/60">Deploy Branch</div>
                <div className="text-white">{selectedBranch || "Not set"}</div>
              </div>

              <div>
                <div className="text-sm text-white/60">Instance Size</div>
                <div className="text-white capitalize">{size}</div>
                <div className="text-xs text-white/60">
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
                  RAM
                </div>
              </div>

              <Separator className="bg-white/10" />

              <div className="text-center">
                <div className="text-sm text-white/60">Estimated Cost</div>
                {(() => {
                  const sizePrice = pricing?.[size];
                  const monthlyPrice = sizePrice?.price ?? 0;
                  const initialCost = sizePrice?.initialCost ?? 0;

                  if (monthlyPrice > 0) {
                    return (
                      <>
                        <div className="text-lg font-bold text-white">
                          ${monthlyPrice.toFixed(2)}
                          <span className="text-sm text-white/60">/mo</span>
                        </div>
                        {initialCost > 0 && (
                          <div className="text-xs text-white/60">
                            + ${initialCost.toFixed(2)} setup fee
                          </div>
                        )}
                        <div className="text-xs text-white/50 mt-1">
                          Billed hourly based on usage
                        </div>
                      </>
                    );
                  }
                  return (
                    <>
                      <div className="text-lg font-bold text-green-400">
                        FREE
                      </div>
                      <div className="text-xs text-white/60">
                        Included with platform
                      </div>
                    </>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AppDeploymentSelect;

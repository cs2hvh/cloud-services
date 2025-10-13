'use client';
import { useState, useEffect, useCallback } from "react";
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
  // GitBranch,
  // Globe,
  // Settings,
  // ExternalLink,
} from "lucide-react";
import { Input } from "@/components/ui/input";
// import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
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

interface Repository {
  id: string;
  name: string;
  fullName: string;
  description: string;
  private: boolean;
  defaultBranch: string;
  language: string;
  updatedAt: string;
  provider: 'github' | 'gitlab' | 'bitbucket';
}

interface GitProvider {
  id: 'github' | 'gitlab' | 'bitbucket';
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
  'Next.js': { buildCommand: 'npm run build', outputDir: '.next', installCommand: 'npm install' },
  'React': { buildCommand: 'npm run build', outputDir: 'build', installCommand: 'npm install' },
  'Vue.js': { buildCommand: 'npm run build', outputDir: 'dist', installCommand: 'npm install' },
  'Node.js': { buildCommand: 'npm run build', outputDir: '.', installCommand: 'npm install' },
  'Static': { buildCommand: '', outputDir: '.', installCommand: '' },
};

const AppDeploymentSelect = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [gitProviders, setGitProviders] = useState<GitProvider[]>([
    { id: 'github', name: 'GitHub', icon: '/github.png', connected: false },
    { id: 'gitlab', name: 'GitLab', icon: '/gitlab.png', connected: false },
    { id: 'bitbucket', name: 'Bitbucket', icon: '/BitBucket.png', connected: false },
  ]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  
  // Form state
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [selectedRepo, setSelectedRepo] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [appName, setAppName] = useState('');
  const [framework, setFramework] = useState<string>('');
  const [buildCommand, setBuildCommand] = useState<string>('');
  const [outputDir, setOutputDir] = useState<string>('');
  const [envVars, setEnvVars] = useState<{key: string, value: string}[]>([]);
  const [customDomain, setCustomDomain] = useState<string>('');

  // Fetch real provider connection status
  const fetchProviderStatus = useCallback(async () => {
    setLoadingProviders(true);
    try {
      const response = await fetch('/api/auth/providers');
      if (response.ok) {
        const data = await response.json();
        const providers = data.providers || [];
        
        // Update git providers with real connection status - replace 'any' with proper type
        setGitProviders(prev => prev.map(provider => ({
          ...provider,
          connected: providers.find((p: ProviderConnection) => p.provider === provider.id)?.status || false
        })));
      } else {
        toast.error('Failed to fetch provider status');
      }
    } catch {
      toast.error('Failed to check provider connections');
    } finally {
      setLoadingProviders(false);
    }
  }, []);

  // Fetch repositories from API when provider is selected
  const fetchRepositories = useCallback(async (provider: string) => {
    const supportedProviders = ['github', 'gitlab', 'bitbucket'];
    
    if (!supportedProviders.includes(provider)) {
      setRepositories([]);
      toast.error('Provider not supported yet');
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
          toast.info(`No repositories found in your ${provider.charAt(0).toUpperCase() + provider.slice(1)} account`);
        } else if (data.note) {
          toast.success(data.note);
        } else if (data.warning) {
          toast.warning(data.warning);
        } else if (data.message && data.needsAppAuth) {
          toast.info(data.message);
        }
      } else {
        const errorData = await response.json();
        console.error('Repository fetch error:', errorData);
        
        if (response.status === 400 && errorData.needsAppAuth) {
          // Show GitHub App connect option
          setRepositories([]);
          toast.error(errorData.message || `${provider.charAt(0).toUpperCase() + provider.slice(1)} App connection required for private repositories`);
        } else {
          toast.error(errorData.message || 'Failed to fetch repositories');
          setRepositories([]);
        }
      }
    } catch {
      toast.error('Network error while fetching repositories');
      setRepositories([]);
    } finally {
      setLoadingRepos(false);
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
    } else {
      setRepositories([]);
    }
  }, [selectedProvider, fetchRepositories]);

  // Auto-fill build settings when framework is selected
  useEffect(() => {
    if (framework && frameworkConfigs[framework as keyof typeof frameworkConfigs]) {
      const config = frameworkConfigs[framework as keyof typeof frameworkConfigs];
      setBuildCommand(config.buildCommand);
      setOutputDir(config.outputDir);
    }
  }, [framework]);

  // Auto-fill app name when repository is selected
  useEffect(() => {
    if (selectedRepo) {
      const repo = repositories.find(r => r.id === selectedRepo);
      if (repo) {
        setAppName(repo.name);
        setSelectedBranch(repo.defaultBranch);
      }
    }
  }, [selectedRepo, repositories]);

  const connectProvider = async (providerId: string) => {
    setIsLoading(true);
    try {
      let response;
      
      if (providerId === 'github') {
        // Use GitHub App flow for better repository access
        response = await fetch('/api/github/app-auth', {
          method: 'POST',
        });
      } else {
        // Use standard Supabase OAuth for other providers
        response = await fetch(`/api/auth/signin/${providerId}`, {
          method: 'POST',
        });
      }
      
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      toast.error(`Failed to connect to ${providerId}`);
    } finally {
      setIsLoading(false);
    }
  };

  const addEnvVar = () => {
    setEnvVars([...envVars, { key: '', value: '' }]);
  };

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const updateEnvVar = (index: number, field: 'key' | 'value', value: string) => {
    setEnvVars(envVars.map((env, i) => 
      i === index ? { ...env, [field]: value } : env
    ));
  };

  const handleNextStep = () => {
    if (currentStep === 1 && !selectedProvider) {
      toast.error('Please select a Git provider');
      return;
    }
    if (currentStep === 2 && !selectedRepo) {
      toast.error('Please select a repository');
      return;
    }
    if (currentStep === 3 && (!appName.trim() || !framework)) {
      toast.error('Please enter app name and select framework');
      return;
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

  const onSubmit = async () => {
    setIsLoading(true);
    try {
      // Here you would make the API call to deploy the application
      await new Promise(resolve => setTimeout(resolve, 3000)); // Simulate deployment
      toast.success('Application deployment started successfully!');
      // Redirect to deployment status page
    } catch {
      toast.error('Failed to start deployment. Please try again.');
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

  const selectedRepoData = repositories.find(r => r.id === selectedRepo);
  const selectedProviderData = gitProviders.find(p => p.id === selectedProvider);

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
                    currentStep > step.id ? "bg-blue-600 text-white" : 
                    currentStep === step.id ? "bg-blue-500 text-white" : "bg-white/10 text-white/50"
                  }`}
                >
                  {currentStep > step.id ? <CheckCircle2 size={16} /> : step.id}
                </div>
                {index < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 transition-colors duration-300 ${
                    currentStep > step.id ? 'bg-blue-600' : 'bg-white/10'
                  }`}></div>
                )}
              </div>
              <p className={`mt-2 text-xs ${currentStep >= step.id ? 'text-white' : 'text-white/50'}`}>{step.name}</p>
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
                <CardTitle className="text-white">Select Git Provider</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingProviders ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-8 h-8 text-blue-400 mx-auto mb-4 animate-spin" />
                    <p className="text-white/60">Checking connected providers...</p>
                  </div>
                ) : (
                  <RadioGroup value={selectedProvider} onValueChange={setSelectedProvider} className="grid grid-cols-1 gap-4">
                    {gitProviders.map((provider) => (
                      <div key={provider.id}>
                        <RadioGroupItem value={provider.id} id={provider.id} className="peer sr-only" disabled={!provider.connected} />
                        <Label htmlFor={provider.id} className="flex items-center gap-4 p-4 bg-white/10 rounded-lg border-2 border-transparent cursor-pointer transition-all peer-data-[state=checked]:border-blue-500 hover:bg-white/15 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed">
                          <div className="flex items-center gap-3">
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                              selectedProvider === provider.id 
                                ? 'border-blue-500 bg-blue-500' 
                                : 'border-white/30'
                            }`}>
                              {selectedProvider === provider.id && (
                                <div className="w-2 h-2 rounded-full bg-white"></div>
                              )}
                            </div>
                            <Image src={provider.icon} alt={provider.name} width={32} height={32} className="rounded" />
                          </div>
                          <div className="flex-1">
                            <div className="font-semibold text-white">{provider.name}</div>
                            <div className="text-sm text-white/60">
                              {provider.connected ? 'Connected and ready to use' : 'Not connected'}
                            </div>
                          </div>
                          {provider.connected ? (
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                              Connected
                            </Badge>
                          ) : (
                            <Button
                              onClick={() => connectProvider(provider.id)}
                              size="sm"
                              className="bg-white text-black hover:bg-gray-200"
                              disabled={isLoading}
                            >
                              Connect
                            </Button>
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
                      'Refresh Status'
                    )}
                  </Button>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button 
                  onClick={handleNextStep} 
                  disabled={loadingProviders || !selectedProvider}
                  className="bg-white text-black rounded-md hover:bg-white/90"
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
                    <p className="text-white/60">Loading repositories from {selectedProviderData?.name}...</p>
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
                    <RadioGroup value={selectedRepo} onValueChange={setSelectedRepo} className="grid grid-cols-1 gap-4 max-h-96 overflow-y-auto custom-scrollbar">
                      {repositories.map((repo) => (
                        <div key={repo.id}>
                          <RadioGroupItem value={repo.id} id={repo.id} className="peer sr-only" />
                          <Label htmlFor={repo.id} className="flex items-start gap-4 p-4 bg-white/10 rounded-lg border-2 border-transparent cursor-pointer transition-all peer-data-[state=checked]:border-blue-500 hover:bg-white/15">
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center mt-1 ${
                              selectedRepo === repo.id 
                                ? 'border-blue-500 bg-blue-500' 
                                : 'border-white/30'
                            }`}>
                              {selectedRepo === repo.id && (
                                <div className="w-2 h-2 rounded-full bg-white"></div>
                              )}
                            </div>
                            <Code className="w-6 h-6 text-blue-400 mt-1" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <div className="font-semibold text-white">{repo.name}</div>
                                {repo.private && (
                                  <Badge variant="outline" className="text-xs text-white/70 border-white/30">
                                    Private
                                  </Badge>
                                )}
                              </div>
                              <div className="text-sm text-white/60 mt-1">{repo.fullName}</div>
                              {repo.description && (
                                <div className="text-xs text-white/50 mt-1">{repo.description}</div>
                              )}
                              <div className="flex items-center gap-4 mt-2 text-xs text-white/50">
                                <span>{repo.language}</span>
                                <span>Updated {new Date(repo.updatedAt).toLocaleDateString()}</span>
                                <span>Default: {repo.defaultBranch}</span>
                              </div>
                            </div>
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Code className="w-12 h-12 text-white/30 mx-auto mb-4" />
                    <p className="text-white/60 mb-4">No repositories found</p>
                    <p className="text-sm text-white/50 mb-4">
                      {selectedProvider === 'github' 
                        ? 'For private repository access, connect GitHub App with repository permissions'
                        : `Make sure you have repositories in your connected ${selectedProviderData?.name} account`
                      }
                    </p>
                    <div className="flex gap-2 justify-center">
                      <Button 
                        onClick={() => fetchRepositories(selectedProvider)}
                        className="bg-white text-black hover:bg-gray-200"
                      >
                        Refresh Repositories
                      </Button>
                      {selectedProvider === 'github' && (
                        <Button 
                          onClick={() => connectProvider('github')}
                          className="bg-blue-500 text-white hover:bg-blue-600"
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            'Connect GitHub App'
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={handlePrevStep} className="rounded-md border-white/20 text-white hover:bg-white/10">Back</Button>
                <Button onClick={handleNextStep} disabled={loadingRepos} className="bg-white text-black rounded-md hover:bg-white/90">Next <ChevronRight size={16} className="ml-2" /></Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 3: Configuration */}
          {currentStep === 3 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Configure Deployment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
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
                    <Input
                      value={selectedBranch}
                      onChange={(e) => setSelectedBranch(e.target.value)}
                      placeholder="main"
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-white">Framework</Label>
                  <Select value={framework} onValueChange={setFramework}>
                    <SelectTrigger className="bg-white/10 border-white/20 text-white">
                      <SelectValue placeholder="Select framework" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Next.js">Next.js</SelectItem>
                      <SelectItem value="React">React</SelectItem>
                      <SelectItem value="Vue.js">Vue.js</SelectItem>
                      <SelectItem value="Node.js">Node.js</SelectItem>
                      <SelectItem value="Static">Static Site</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-white">Build Command</Label>
                    <Input
                      value={buildCommand}
                      onChange={(e) => setBuildCommand(e.target.value)}
                      placeholder="npm run build"
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                    />
                  </div>
                  <div>
                    <Label className="text-white">Output Directory</Label>
                    <Input
                      value={outputDir}
                      onChange={(e) => setOutputDir(e.target.value)}
                      placeholder="dist"
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-4">
                    <Label className="text-white">Environment Variables</Label>
                    <Button onClick={addEnvVar} size="sm" className="bg-white text-black hover:bg-gray-200">
                      Add Variable
                    </Button>
                  </div>
                  {envVars.map((env, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={env.key}
                        onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                        placeholder="VARIABLE_NAME"
                        className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                      />
                      <Input
                        value={env.value}
                        onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                        placeholder="variable_value"
                        className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                      />
                      <Button
                        onClick={() => removeEnvVar(index)}
                        size="sm"
                        variant="outline"
                        className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>

                <div>
                  <Label className="text-white">Custom Domain (Optional)</Label>
                  <Input
                    value={customDomain}
                    onChange={(e) => setCustomDomain(e.target.value)}
                    placeholder="myapp.example.com"
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                  />
                  <p className="text-xs text-white/60 mt-1">
                    Leave empty to use our default domain
                  </p>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={handlePrevStep} className="rounded-md border-white/20 text-white hover:bg-white/10">Back</Button>
                <Button onClick={handleNextStep} className="bg-white text-black rounded-md hover:bg-white/90">Next <ChevronRight size={16} className="ml-2" /></Button>
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
                      <span className="text-white/60">Application Name:</span>
                      <span className="text-white">{appName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Repository:</span>
                      <span className="text-white">{selectedRepoData?.fullName}</span>
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
                      <span className="text-white/60">Build Command:</span>
                      <span className="text-white font-mono text-sm">{buildCommand || 'None'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Output Directory:</span>
                      <span className="text-white font-mono text-sm">{outputDir}</span>
                    </div>
                    {customDomain && (
                      <div className="flex justify-between">
                        <span className="text-white/60">Custom Domain:</span>
                        <span className="text-white">{customDomain}</span>
                      </div>
                    )}
                    {envVars.length > 0 && (
                      <div>
                        <div className="text-white/60 mb-2">Environment Variables:</div>
                        <div className="ml-4 space-y-1">
                          {envVars.map((env, index) => (
                            <div key={index} className="text-sm text-white/70">
                              {env.key}: {env.value ? '***' : 'Not set'}
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
                  <h4 className="text-white font-medium mb-2">What happens next?</h4>
                  <ul className="text-sm text-white/70 space-y-1">
                    <li>• Your repository will be cloned and built</li>
                    <li>• Application will be deployed to our global infrastructure</li>
                    <li>• SSL certificate will be automatically provisioned</li>
                    <li>• You&apos;ll receive a deployment URL to access your app</li>
                    <li>• Future pushes to {selectedBranch} will trigger automatic deployments</li>
                  </ul>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={handlePrevStep} className="rounded-md border-white/20 text-white hover:bg-white/10">Back</Button>
                <Button
                  onClick={onSubmit}
                  disabled={isLoading}
                  className="bg-white text-black rounded-md hover:bg-white/90"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Deploying...
                    </>
                  ) : (
                    'Deploy Application'
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
                <div className="text-white">{selectedProviderData?.name || 'Not selected'}</div>
              </div>
              
              {selectedRepoData && (
                <div>
                  <div className="text-sm text-white/60">Repository</div>
                  <div className="text-white">{selectedRepoData.name}</div>
                  <div className="text-xs text-white/60">{selectedRepoData.language}</div>
                </div>
              )}

              <div>
                <div className="text-sm text-white/60">Application Name</div>
                <div className="text-white">{appName || 'Not set'}</div>
              </div>

              {framework && (
                <div>
                  <div className="text-sm text-white/60">Framework</div>
                  <div className="text-white">{framework}</div>
                </div>
              )}

              <div>
                <div className="text-sm text-white/60">Deploy Branch</div>
                <div className="text-white">{selectedBranch || 'Not set'}</div>
              </div>

              <Separator className="bg-white/10" />
              
              <div className="text-center">
                <div className="text-sm text-white/60">Deployment</div>
                <div className="text-lg font-bold text-green-400">FREE</div>
                <div className="text-xs text-white/60">Included with platform</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AppDeploymentSelect;

"use client";
import { CheckCircle2, ChevronRight, Cpu, FolderKanban, GitBranch, Globe2, Layers3, Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EnvVarsEditor, EnvVar } from "./env-vars-editor";
import { Tables } from "@/lib/supabase/types";
import { frameworkConfigs, instanceSizeConfigs, PricingRates, Repository, Branch } from "./new-types";

interface Props {
  projects: Tables<"projects">[];
  pricing?: Record<string, PricingRates>;
  selectedProject: string;
  onSelectProject: (v: string) => void;
  appName: string;
  onAppNameChange: (v: string) => void;
  selectedBranch: string;
  onSelectBranch: (v: string) => void;
  branches: Branch[];
  loadingBranches: boolean;
  framework: string;
  onFrameworkChange: (v: string) => void;
  detectingFramework: boolean;
  hasDockerfile: boolean;
  containerPort: number | undefined;
  onContainerPortChange: (v: number | undefined) => void;
  detectedPort: number | undefined;
  size: string;
  onSizeChange: (v: string) => void;
  autoDeploy: boolean;
  onAutoDeployChange: (v: boolean) => void;
  envVars: EnvVar[];
  onEnvVarsChange: (v: EnvVar[]) => void;
  selectedRepoData: Repository | undefined;
  selectedProvider: string;
  onDetectFramework: () => void;
  onRefreshBranches: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export function StepConfigure({
  projects, pricing, selectedProject, onSelectProject,
  appName, onAppNameChange, selectedBranch, onSelectBranch,
  branches, loadingBranches, framework, onFrameworkChange,
  detectingFramework, hasDockerfile, containerPort, onContainerPortChange,
  detectedPort, size, onSizeChange, autoDeploy, onAutoDeployChange,
  envVars, onEnvVarsChange, selectedRepoData, onDetectFramework,
  onRefreshBranches, onPrev, onNext,
}: Props) {
  const selectedProjectName =
    selectedProject && selectedProject !== "none"
      ? projects.find((p) => p.id === selectedProject)?.name ?? "Assigned"
      : "Not attached";

  const selectedFrameworkConfig = framework ? frameworkConfigs[framework] : undefined;
  const showPortInput = hasDockerfile || framework === "Dockerfile" || framework === "Java";

  return (
    <Card className="glass-panel overflow-hidden">
      <CardHeader className="border-b border-white/[0.06] px-6 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Step 3 — Runtime Configuration</p>
        <CardTitle className="mt-1 text-lg font-semibold text-white">Configure deployment</CardTitle>
        <p className="mt-1 text-sm text-white/48">Define the service name, deploy branch, build profile, capacity, and release behavior.</p>
      </CardHeader>

      <CardContent className="space-y-6 px-6 py-6">
        {/* ── Deployment Basics ── */}
        <section className="border border-white/[0.08] bg-white/[0.03] p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-white/[0.1] bg-white/[0.05] text-blue-300">
              <Settings2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Deployment Basics</p>
              <h3 className="mt-1 text-sm font-semibold text-white">Name, grouping, and branch strategy</h3>
            </div>
          </div>

          <div className="mt-5 space-y-5">
            {/* Project association */}
            <div>
              <Label className="mb-2 flex items-center gap-1.5 text-sm font-medium text-white/80">
                <FolderKanban className="h-3.5 w-3.5 text-blue-300" /> Project association
              </Label>
              <Select value={selectedProject} onValueChange={onSelectProject}>
                <SelectTrigger className="w-full border-white/[0.14] bg-white/[0.05] text-white">
                  <SelectValue placeholder="Select a project (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-xs text-white/40">Current: <span className="text-white/65">{selectedProjectName}</span></p>
            </div>

            {/* App name + branch — 2-col on md+ */}
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <Label className="mb-2 block text-sm font-medium text-white/80">Application name</Label>
                <Input
                  value={appName}
                  onChange={(e) => onAppNameChange(e.target.value)}
                  placeholder="my-awesome-app"
                  className="border-white/[0.14] bg-white/[0.05] text-white placeholder:text-white/30"
                />
                <p className="mt-1.5 text-xs text-white/40">Lowercase, used in logs and inventory.</p>
              </div>

              <div>
                <Label className="mb-2 block text-sm font-medium text-white/80">Deploy branch</Label>
                {loadingBranches ? (
                  <div className="flex items-center gap-2 border border-white/[0.12] bg-white/[0.04] px-3 py-2.5 text-sm text-white/50">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-300" /> Loading branches...
                  </div>
                ) : branches.length > 0 ? (
                  <Select value={selectedBranch} onValueChange={onSelectBranch}>
                    <SelectTrigger className="w-full border-white/[0.14] bg-white/[0.05] text-white">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.name} value={b.name}>
                          {b.protected ? `${b.name} (Protected)` : b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={selectedBranch}
                    onChange={(e) => onSelectBranch(e.target.value)}
                    placeholder="main"
                    className="border-white/[0.14] bg-white/[0.05] text-white placeholder:text-white/30"
                  />
                )}
                <Button
                  onClick={onRefreshBranches}
                  variant="outline"
                  size="sm"
                  disabled={loadingBranches || !selectedRepoData}
                  className="mt-2 w-full border-white/[0.14] bg-white/[0.03] text-white/75 hover:bg-white/[0.07]"
                >
                  {loadingBranches ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  Refresh branches
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* ── Build Profile ── */}
        <section className="border border-white/[0.08] bg-white/[0.03] p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-white/[0.1] bg-white/[0.05] text-blue-300">
              <Layers3 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Build Profile</p>
              <h3 className="mt-1 text-sm font-semibold text-white">Framework and runtime defaults</h3>
              <p className="mt-1 text-xs text-white/42">Choose the pipeline that best matches the repository. Platform defaults stay visible.</p>
            </div>
          </div>

          {/* Framework select + detect button — always stacked, full-width */}
          <div className="mt-5 space-y-3">
            <div>
              <Label className="mb-2 block text-sm font-medium text-white/80">Framework or pipeline type</Label>
              <Select value={framework} onValueChange={onFrameworkChange}>
                <SelectTrigger className="w-full border-white/[0.14] bg-white/[0.05] text-white">
                  <SelectValue placeholder="Select framework" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple-test">Simple test (no build or deploy)</SelectItem>
                  <SelectItem value="Java">Java (Maven / Dockerfile)</SelectItem>
                  <SelectItem value="Dockerfile">Dockerfile (existing)</SelectItem>
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
            <Button
              onClick={onDetectFramework}
              variant="outline"
              size="sm"
              disabled={detectingFramework || !selectedRepoData}
              className="w-full border-white/[0.14] bg-white/[0.03] text-white/75 hover:bg-white/[0.07]"
            >
              {detectingFramework
                ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Detecting...</>
                : "Detect from repository"}
            </Button>
          </div>

          {/* Build pipeline details */}
          {selectedFrameworkConfig && (
            <div className={`mt-4 border p-4 ${hasDockerfile ? "border-emerald-500/20 bg-emerald-500/10" : "border-blue-500/20 bg-blue-500/10"}`}>
              <div className="flex items-start gap-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center ${hasDockerfile ? "bg-emerald-500/20 text-emerald-300" : "bg-blue-500/20 text-blue-300"}`}>
                  {hasDockerfile ? <CheckCircle2 className="h-4 w-4" /> : <Layers3 className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-white">Build pipeline details</h4>
                    {detectingFramework && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-300" />}
                  </div>
                  <p className="mt-1.5 text-xs leading-5 text-white/55">
                    {hasDockerfile
                      ? "A Dockerfile is detected and will be used. Platform defaults shown for reference."
                      : selectedFrameworkConfig.description}
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {selectedFrameworkConfig.installCommand && (
                      <div className="border border-white/[0.08] bg-black/20 p-2.5">
                        <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35">Install</div>
                        <code className="mt-1 block break-all text-[11px] text-white/80">{selectedFrameworkConfig.installCommand}</code>
                      </div>
                    )}
                    <div className="border border-white/[0.08] bg-black/20 p-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35">{hasDockerfile ? "Default build" : "Build"}</div>
                      <code className="mt-1 block break-all text-[11px] text-white/80">{selectedFrameworkConfig.buildCommand || "Not required"}</code>
                    </div>
                    <div className="border border-white/[0.08] bg-black/20 p-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35">{hasDockerfile ? "Default output" : "Output"}</div>
                      <code className="mt-1 block break-all text-[11px] text-white/80">{selectedFrameworkConfig.outputDir || "."}</code>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Container port */}
          {showPortInput && (
            <div className="mt-4 border border-white/[0.08] bg-black/20 p-4">
              <Label className="mb-2 block text-sm font-medium text-white/80">Container port</Label>
              <Input
                type="number" min="1" max="65535"
                value={containerPort ?? ""}
                onChange={(e) => onContainerPortChange(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                placeholder={detectedPort ? String(detectedPort) : "3000"}
                className="border-white/[0.14] bg-white/[0.05] text-white placeholder:text-white/30"
              />
              {detectedPort && (
                <p className="mt-1.5 text-xs text-emerald-300">Detected: <code>EXPOSE {detectedPort}</code></p>
              )}
              {!detectedPort && containerPort === undefined && (
                <p className="mt-1.5 text-xs text-amber-300">Port not auto-detected. Confirm before deploying.</p>
              )}
              <p className="mt-1.5 text-xs text-white/40">The port your container listens on internally.</p>
            </div>
          )}
        </section>

        {/* ── Capacity ── */}
        <section className="border border-white/[0.08] bg-white/[0.03] p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-white/[0.1] bg-white/[0.05] text-blue-300">
              <Cpu className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Capacity</p>
              <h3 className="mt-1 text-sm font-semibold text-white">Instance sizing and cost profile</h3>
              <p className="mt-1 text-xs text-white/42">Pick a size that matches your app footprint. Can be resized later.</p>
            </div>
          </div>

          <RadioGroup value={size} onValueChange={onSizeChange} className="mt-5 space-y-2">
            {(["small", "medium", "large"] as const).map((opt) => {
              const cfg = instanceSizeConfigs[opt];
              const sizePrice = pricing?.[opt];
              return (
                <div key={opt}>
                  <RadioGroupItem value={opt} id={`sz-${opt}`} className="peer sr-only" />
                  <Label
                    htmlFor={`sz-${opt}`}
                    className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-white/[0.08] bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.06] peer-data-[state=checked]:border-blue-400/35 peer-data-[state=checked]:bg-blue-500/10"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${size === opt ? "border-blue-400 bg-blue-400" : "border-white/30"}`}>
                        {size === opt && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </div>
                      <div>
                        <div className="text-sm font-semibold capitalize text-white">{opt}</div>
                        <div className="text-xs text-white/45">{cfg.cpu} CPU · {cfg.ram} RAM · {cfg.replicas} replica{cfg.replicas > 1 ? "s" : ""}</div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {sizePrice?.price && sizePrice.price > 0 ? (
                        <>
                          <div className="text-sm font-semibold text-white">${sizePrice.price.toFixed(2)}<span className="ml-1 text-xs text-white/45">/mo</span></div>
                          <div className="text-xs text-white/40">${sizePrice.hourlyRate.toFixed(4)}/hr</div>
                        </>
                      ) : (
                        <div className="text-sm font-semibold text-emerald-300">Free</div>
                      )}
                    </div>
                  </Label>
                </div>
              );
            })}
          </RadioGroup>
        </section>

        {/* ── Release Behavior ── */}
        <section className="border border-white/[0.08] bg-white/[0.03] p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-white/[0.1] bg-white/[0.05] text-blue-300">
              <GitBranch className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Release Behavior</p>
              <h3 className="mt-1 text-sm font-semibold text-white">Automatic delivery on branch updates</h3>
            </div>
          </div>

          <div className="mt-5 border border-white/[0.08] bg-black/20 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Label className="text-sm font-medium text-white/82">Auto-deploy on git push</Label>
                <p className="mt-1 text-xs leading-5 text-white/45">
                  New commits on <span className="break-all font-mono text-blue-300">{selectedBranch || "selected branch"}</span> trigger deployment automatically.
                </p>
              </div>
              <Switch checked={autoDeploy} onCheckedChange={onAutoDeployChange} className="shrink-0 data-[state=checked]:bg-blue-500" />
            </div>
            <p className="mt-3 border border-white/[0.06] bg-white/[0.03] p-3 text-xs leading-5 text-white/45">
              {autoDeploy ? "A webhook is created so pushes trigger fresh deployments automatically." : "Deployments stay manual — useful for controlled release processes."}
            </p>
          </div>
        </section>

        {/* ── Access URL ── */}
        <section className="border border-white/[0.08] bg-white/[0.03] p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-white/[0.1] bg-white/[0.05] text-blue-300">
              <Globe2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Access URL</p>
              <h3 className="mt-1 text-sm font-semibold text-white">Platform hostname</h3>
            </div>
          </div>
          <div className="mt-5 border border-blue-400/20 bg-blue-500/10 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-200/70">Default hostname</p>
            <p className="mt-1.5 break-all font-mono text-sm text-white">{appName || "your-app"}.galaxyhvh.com</p>
            <p className="mt-2 text-xs text-white/45">Custom domains can be attached from the app&apos;s Domains tab after deployment.</p>
          </div>
        </section>

        {/* ── Environment Variables ── */}
        <section className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Secrets</p>
            <h3 className="mt-1 text-sm font-semibold text-white">Environment variables</h3>
            <p className="mt-1 text-xs text-white/42">Add secrets one by one, paste an .env file, or upload directly.</p>
          </div>
          <EnvVarsEditor value={envVars} onChange={onEnvVarsChange} />
        </section>
      </CardContent>

      <CardFooter className="flex justify-between border-t border-white/[0.06] px-6 py-4">
        <Button variant="outline" onClick={onPrev} className="cursor-pointer rounded-md border-white/[0.14] bg-white/[0.03] text-white/75 hover:bg-white/[0.07]">Back</Button>
        <Button onClick={onNext} className="cursor-pointer rounded-md bg-white text-black hover:bg-white/90">
          Next <ChevronRight className="ml-1.5 h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}

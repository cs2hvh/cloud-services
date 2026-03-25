"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Check,
  CheckCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  HardDrive,
  LockKeyhole,
  Loader2,
  type LucideIcon,
  MapPin,
  MonitorUp,
  Server,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import DeploymentProgress from "./deployment-progress";

// Password validation constants
const PASSWORD_PATTERNS = {
  hasUpperCase: /[A-Z]/,
  hasLowerCase: /[a-z]/,
  hasNumbers: /[0-9]/,
  hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
} as const;

const PASSWORD_MIN_LENGTH = 12;

interface Region {
  id: string;
  name: string;
  available: boolean;
}

interface OSOption {
  id: string;
  name: string;
  regions: string[];
}

interface ComputeOptions {
  regions: Region[];
  osOptions: OSOption[];
  specs?: {
    minCpuCores: number;
    maxCpuCores: number;
    minMemoryMB: number;
    maxMemoryMB: number;
    minDiskGB: number;
    maxDiskGB: number;
  };
}

interface PageProps {
  computeOptions: ComputeOptions;
}

const STEP_META: Array<{
  id: number;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    id: 0,
    label: "Name",
    title: "Name the machine",
    description: "Use a short, production-safe hostname that will stay readable in your fleet view.",
    icon: Server,
  },
  {
    id: 1,
    label: "Region",
    title: "Choose deployment region",
    description: "Place the VPS close to your workloads, end users, or compliance boundary.",
    icon: MapPin,
  },
  {
    id: 2,
    label: "Operating System",
    title: "Select the base image",
    description: "Pick the operating system and review its access model before provisioning.",
    icon: MonitorUp,
  },
  {
    id: 3,
    label: "Configuration",
    title: "Right-size compute and storage",
    description: "Set CPU, memory, and disk with the current network rate cap shown alongside.",
    icon: Cpu,
  },
  {
    id: 4,
    label: "Access",
    title: "Secure initial access",
    description: "Define the initial password used for SSH or RDP depending on the selected image.",
    icon: LockKeyhole,
  },
];

const panelClassName = "glass-panel overflow-hidden";
const inputClassName =
  "border-white/[0.14] bg-white/[0.05] text-white placeholder:text-white/30 focus-visible:ring-0 focus-visible:border-white/25";

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-sm text-white/42">{label}</span>
      <div className="text-right text-sm font-medium text-white/88">{value}</div>
    </div>
  );
}

function StepContainer({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className={panelClassName}>
      <div className="border-b border-white/[0.06] px-6 py-5 sm:px-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">{eyebrow}</p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">{description}</p>
      </div>
      <div className="px-6 py-6 sm:px-7 sm:py-7">{children}</div>
    </div>
  );
}

const VPSSelect = ({ computeOptions }: PageProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Form state
  const [hostname, setHostname] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<string>("");
  const [selectedOS, setSelectedOS] = useState<string>("");
  const [cpuCores, setCpuCores] = useState(2);
  const [memoryGB, setMemoryGB] = useState(2);
  const [diskGB, setDiskGB] = useState(50);
  const [sshPassword, setSshPassword] = useState("");
  const [sshPasswordConfirm, setSshPasswordConfirm] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deploymentServerId, setDeploymentServerId] = useState<number | null>(null);

  const regions = computeOptions.regions;

  // Filter OS options to only those available in the selected region
  const availableOS = useMemo(() => {
    if (!selectedRegion) return computeOptions.osOptions;
    return computeOptions.osOptions.filter(os => os.regions.includes(selectedRegion));
  }, [computeOptions.osOptions, selectedRegion]);

  // Derive whether selected OS is Windows or Desktop (both use RDP)
  const isWindows = useMemo(() => {
    const osName = (availableOS.find(o => o.id === selectedOS)?.name || selectedOS).toLowerCase();
    return osName.includes("windows");
  }, [selectedOS, availableOS]);

  const isDesktop = useMemo(() => {
    const osName = (availableOS.find(o => o.id === selectedOS)?.name || selectedOS).toLowerCase();
    return osName.includes("desktop");
  }, [selectedOS, availableOS]);

  const usesRDP = isWindows || isDesktop;

  useEffect(() => {
    if (regions.length > 0 && !selectedRegion) {
      const firstAvailable = regions.find(r => r.available);
      setSelectedRegion(firstAvailable?.id || regions[0].id);
    }
  }, [regions, selectedRegion]);

  useEffect(() => {
    if (availableOS.length > 0 && !availableOS.find(o => o.id === selectedOS)) {
      setSelectedOS(availableOS[0].id);
    }
  }, [availableOS, selectedOS]);

  // Auto-enforce minimum specs when switching to Windows/Desktop
  useEffect(() => {
    if (isWindows) {
      if (memoryGB < 2) setMemoryGB(2);
      if (diskGB < 40) setDiskGB(40);
    } else if (isDesktop) {
      if (memoryGB < 2) setMemoryGB(2);
      if (diskGB < 25) setDiskGB(25);
    }
  }, [isWindows, isDesktop, memoryGB, diskGB]);

  const stepsValid = [
    hostname.trim().length > 0,
    !!selectedRegion,
    !!selectedOS,
    cpuCores >= 1 && memoryGB >= (usesRDP ? 2 : 1) && diskGB >= (isWindows ? 40 : isDesktop ? 25 : 10),
    sshPassword.length >= 12 && sshPassword === sshPasswordConfirm,
  ];

  const handleNextStep = () => {
    if (currentStep === 0 && !hostname.trim()) {
      toast.error("Please enter a hostname");
      return;
    }
    if (currentStep === 1 && !selectedRegion) {
      toast.error("Please select a region");
      return;
    }
    if (currentStep === 2 && !selectedOS) {
      toast.error("Please select an operating system");
      return;
    }
    if (currentStep === 3) {
      if (cpuCores < 1 || memoryGB < 1 || diskGB < 10) {
        toast.error("Invalid configuration");
        return;
      }
    }
      if (currentStep === 4) {
        if (sshPassword.length < PASSWORD_MIN_LENGTH) {
          toast.error(`${usesRDP ? "RDP" : "SSH"} password must be at least ${PASSWORD_MIN_LENGTH} characters`);
          return;
        }
        if (sshPassword !== sshPasswordConfirm) {
          toast.error("Passwords do not match");
          return;
        }
        // Validate password strength
        const hasUpperCase = PASSWORD_PATTERNS.hasUpperCase.test(sshPassword);
        const hasLowerCase = PASSWORD_PATTERNS.hasLowerCase.test(sshPassword);
        const hasNumbers = PASSWORD_PATTERNS.hasNumbers.test(sshPassword);
        const hasSpecialChar = PASSWORD_PATTERNS.hasSpecialChar.test(sshPassword);

        if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
          toast.error("Password must contain uppercase, lowercase, numbers, and special characters");
          return;
        }
      }    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSubmit = async () => {
    // Validate all steps
    const firstInvalid = stepsValid.findIndex((v) => !v);
    if (firstInvalid >= 0) {
      setCurrentStep(firstInvalid);
      toast.error("Please complete all required fields");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      // Get auth session
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const { data: userData } = await supabase.auth.getUser();
      const accessToken = sessionData?.session?.access_token;

      // Find the selected OS template name
      const selectedOSName = availableOS.find(t => t.id === selectedOS)?.name || selectedOS;

      const payload = {
        region: selectedRegion,
        os: selectedOSName,
        hostname: hostname,
        cpuCores: cpuCores,
        memoryMB: memoryGB * 1024,
        diskGB: diskGB,
        sshPassword: sshPassword,
        ownerId: userData?.user?.id,
        ownerEmail: userData?.user?.email,
      };



      const res = await fetch("/api/services/compute/vms/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Something went wrong while creating your server.");
      }

      // API returns immediately with serverId — server is now provisioning in background
      setDeploymentServerId(json.serverId);
      setResult(json);
      toast.success(`Deploying "${hostname}"...`);
    } catch (err) {
      console.error("VPS creation error:", err);
      const raw = err instanceof Error ? err.message : "";
      // Only show the message if it looks user-friendly (from our API), otherwise show a generic message
      const isFriendly = raw && !raw.includes("fetch") && !raw.includes("500") && !raw.includes("ECONNREFUSED") && !raw.includes("TypeError") && !raw.includes("SyntaxError") && raw.length < 200;
      const message = isFriendly ? raw : "Something went wrong while creating your server. Please try again or contact support.";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedRegionData = regions.find((r) => r.id === selectedRegion);
  const selectedOSName = availableOS.find((o) => o.id === selectedOS)?.name || "Select an operating system";
  const connectionLabel = usesRDP ? "RDP" : "SSH";
  const bandwidthLabel = cpuCores <= 2 ? "4 MBps" : cpuCores <= 4 ? "8 MBps" : cpuCores <= 6 ? "15 MBps" : "30 MBps";
  const activeStepMeta = STEP_META[currentStep];
  const selectedDefaultUser =
    isWindows ? "admin" : selectedOS.toLowerCase().includes("debian") ? "debian" : selectedOS.toLowerCase().includes("centos") ? "centos" : "ubuntu";

  return (
    <div className="space-y-6 px-2 py-4 text-white sm:px-3 lg:px-4">
      {!result?.ok ? (
        <>
          {/* ─── Unified top panel: header + stats + progress bar + step grid ─── */}
          <div className={panelClassName}>
            <div className="flex flex-col gap-4 px-5 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/70">
                  VPS Provisioning
                </p>
                <h1 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                  Configure and deploy a virtual machine with guided, staged provisioning.
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">
                  Select region, OS, compute specs, and access credentials. The platform provisions
                  asynchronously and streams live progress back into the dashboard.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:min-w-[220px]">
                <div className="border border-white/[0.08] bg-white/[0.04] px-3 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                    Progress
                  </div>
                  <div className="mt-1.5 text-lg font-semibold text-white">
                    {currentStep + 1} / 5
                  </div>
                </div>
                <div className="border border-white/[0.08] bg-white/[0.04] px-3 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                    Rate cap
                  </div>
                  <div className="mt-1.5 text-lg font-semibold text-white">
                    {bandwidthLabel}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-white/[0.06] px-5 py-4 sm:px-6">
              <div className="mb-3 h-1.5 w-full overflow-hidden bg-white/[0.05]">
                <div
                  className="h-full bg-gradient-to-r from-blue-400/85 to-white transition-all duration-300"
                  style={{ width: `${((currentStep + 1) / 5) * 100}%` }}
                />
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
                {STEP_META.map((step) => {
                  const Icon = step.icon;
                  const isActive = currentStep === step.id;
                  const isCompleted = currentStep > step.id;
                  const accessible = step.id === 0 || stepsValid.slice(0, step.id).every(Boolean);

                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => {
                        if (accessible) setCurrentStep(step.id);
                      }}
                      disabled={!accessible}
                      className={`border px-3 py-3 text-left transition-colors ${
                        isActive
                          ? "border-blue-400/30 bg-blue-500/10"
                          : isCompleted
                            ? "border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.06]"
                            : "border-white/[0.06] bg-transparent"
                      } ${accessible ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div
                          className={`flex h-8 w-8 items-center justify-center border bg-white/[0.05] ${
                            isActive ? "border-blue-400/30 text-blue-300" : "border-white/[0.10] text-white/78"
                          }`}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                          ) : (
                            <Icon className="h-4 w-4" />
                          )}
                        </div>
                        <span className="text-xs font-semibold text-white/32">0{step.id + 1}</span>
                      </div>
                      <div className="mt-3 text-sm font-semibold text-white">{step.label}</div>
                      <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-white/40">{step.title}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ─── Main two-column layout ─── */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            {/* Left: step form + navigation */}
            <div className="space-y-6">
              <StepContainer
                eyebrow={`Step ${String(currentStep + 1).padStart(2, "0")}`}
                title={activeStepMeta.title}
                description={activeStepMeta.description}
              >
                {/* Step 0: Hostname */}
                {currentStep === 0 && (
                  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
                    <div>
                      <Label htmlFor="hostname" className="mb-3 block text-sm font-medium text-white/78">
                        Hostname
                      </Label>
                      <Input
                        id="hostname"
                        value={hostname}
                        onChange={(e) => setHostname(e.target.value)}
                        placeholder="prod-web-01"
                        className={inputClassName}
                      />
                      <p className="mt-3 text-sm leading-6 text-white/42">
                        Use a stable, lowercase identifier — easy to recognize in tickets, dashboards,
                        and fleet views.
                      </p>
                    </div>
                    <div className="border border-white/[0.08] bg-white/[0.04] p-5">
                      <h3 className="text-sm font-semibold text-white">Naming rules</h3>
                      <div className="mt-4 space-y-3 text-sm text-white/50">
                        <p>2–63 characters</p>
                        <p>Lowercase letters, numbers, hyphens</p>
                        <p>No spaces or special characters</p>
                        <p>Must be unique in your fleet</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 1: Region */}
                {currentStep === 1 && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {regions.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => r.available && setSelectedRegion(r.id)}
                        disabled={!r.available}
                        className={`flex items-center gap-4 border p-4 text-left transition-colors ${
                          r.available
                            ? selectedRegion === r.id
                              ? "border-blue-400/30 bg-blue-500/10"
                              : "border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.06]"
                            : "border-white/[0.05] bg-white/[0.02] cursor-not-allowed opacity-55"
                        }`}
                      >
                        <div className="flex h-10 w-10 items-center justify-center border border-white/[0.08] bg-white/[0.05]">
                          <MapPin className="h-4 w-4 text-white/60" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-white">{r.name}</div>
                          {!r.available && (
                            <div className="mt-1 text-xs text-red-400/80">Unavailable</div>
                          )}
                        </div>
                        {selectedRegion === r.id && (
                          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-blue-300" />
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Step 2: Operating System */}
                {currentStep === 2 && (
                  <div className="space-y-5">
                    <div>
                      <Label htmlFor="os-select" className="mb-3 block text-sm font-medium text-white/78">
                        Operating System
                      </Label>
                      <Select value={selectedOS} onValueChange={setSelectedOS}>
                        <SelectTrigger id="os-select" className={inputClassName}>
                          <SelectValue placeholder="Select OS" />
                        </SelectTrigger>
                        <SelectContent className="border-white/[0.12] bg-[#0a0a0c] text-white">
                          {availableOS.map((os) => (
                            <SelectItem key={os.id} value={os.id}>
                              {os.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="border border-white/[0.08] bg-white/[0.04] p-5">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                          <MonitorUp className="h-3.5 w-3.5 text-cyan-300" />
                          Access mode
                        </div>
                        <p className="mt-3 text-sm font-medium text-white">
                          {usesRDP ? "RDP-enabled image" : "SSH-first image"}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-white/42">
                          {usesRDP
                            ? "Connect via Remote Desktop Protocol on port 3389."
                            : "Connect via SSH on port 22 using password authentication."}
                        </p>
                      </div>
                      <div className="border border-white/[0.08] bg-white/[0.04] p-5">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                          Default user
                        </div>
                        <p className="mt-3 text-sm font-medium text-white">{selectedDefaultUser}</p>
                        <p className="mt-2 text-xs leading-5 text-white/42">
                          Initial system account created by cloud-init at boot.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 3: Configuration */}
                {currentStep === 3 && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                      <div>
                        <Label htmlFor="cpu-cores" className="mb-3 block text-sm font-medium text-white/78">
                          vCPU Cores
                        </Label>
                        <Input
                          id="cpu-cores"
                          type="number"
                          min={1}
                          max={32}
                          value={cpuCores}
                          onChange={(e) => setCpuCores(parseInt(e.target.value || "1", 10))}
                          className={inputClassName}
                        />
                        <p className="mt-2 text-xs text-white/40">1 – 32 cores</p>
                      </div>
                      <div>
                        <Label htmlFor="memory-gb" className="mb-3 block text-sm font-medium text-white/78">
                          Memory (GB)
                        </Label>
                        <Input
                          id="memory-gb"
                          type="number"
                          min={isWindows ? 2 : 1}
                          max={128}
                          value={memoryGB}
                          onChange={(e) => setMemoryGB(parseInt(e.target.value || (isWindows ? "2" : "1"), 10))}
                          className={inputClassName}
                        />
                        {isWindows ? (
                          <p className="mt-2 text-xs text-amber-400/80">Min 2 GB for Windows</p>
                        ) : (
                          <p className="mt-2 text-xs text-white/40">1 – 128 GB</p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="disk-gb" className="mb-3 block text-sm font-medium text-white/78">
                          Storage (GB)
                        </Label>
                        <Input
                          id="disk-gb"
                          type="number"
                          min={isWindows ? 40 : 10}
                          max={2000}
                          value={diskGB}
                          onChange={(e) => setDiskGB(parseInt(e.target.value || (isWindows ? "40" : "10"), 10))}
                          className={inputClassName}
                        />
                        {isWindows ? (
                          <p className="mt-2 text-xs text-amber-400/80">Min 40 GB for Windows</p>
                        ) : (
                          <p className="mt-2 text-xs text-white/40">10 – 2000 GB</p>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="border border-white/[0.08] bg-white/[0.04] p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                          CPU model
                        </div>
                        <p className="mt-2 text-sm font-medium text-white">Host CPU passthrough</p>
                        <p className="mt-1 text-xs text-white/40">Closer-to-bare-metal performance</p>
                      </div>
                      <div className="border border-white/[0.08] bg-white/[0.04] p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                          Rate limit
                        </div>
                        <p className="mt-2 text-sm font-medium text-white">{bandwidthLabel} network cap</p>
                        <p className="mt-1 text-xs text-white/40">Scales with vCPU count</p>
                      </div>
                      <div className="border border-white/[0.08] bg-white/[0.04] p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                          Network model
                        </div>
                        <p className="mt-2 text-sm font-medium text-white">VirtIO on routed IPv4</p>
                        <p className="mt-1 text-xs text-white/40">Public IP allocated at boot</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 4: Access / Password */}
                {currentStep === 4 && (
                  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="password" className="mb-3 block text-sm font-medium text-white/78">
                          {usesRDP ? "RDP Password" : "SSH Password"}
                        </Label>
                        <Input
                          id="password"
                          type="password"
                          value={sshPassword}
                          onChange={(e) => setSshPassword(e.target.value)}
                          placeholder="Enter a strong password"
                          className={inputClassName}
                        />
                      </div>
                      <div>
                        <Label htmlFor="password-confirm" className="mb-3 block text-sm font-medium text-white/78">
                          Confirm Password
                        </Label>
                        <Input
                          id="password-confirm"
                          type="password"
                          value={sshPasswordConfirm}
                          onChange={(e) => setSshPasswordConfirm(e.target.value)}
                          placeholder="Re-enter password"
                          className={inputClassName}
                        />
                        {sshPasswordConfirm && sshPassword !== sshPasswordConfirm && (
                          <p className="mt-2 text-xs text-red-400">Passwords do not match</p>
                        )}
                      </div>
                    </div>

                    <div className="border border-white/[0.08] bg-white/[0.04] p-5">
                      <h3 className="text-sm font-semibold text-white">Password requirements</h3>
                      <div className="mt-4 space-y-3 text-sm text-white/50">
                        <p>At least 12 characters</p>
                        <p>Uppercase letter (A–Z)</p>
                        <p>Lowercase letter (a–z)</p>
                        <p>Number (0–9)</p>
                        <p>Special character (!@#$…)</p>
                      </div>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="mt-4 border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    {error}
                  </div>
                )}
              </StepContainer>

              {/* Navigation */}
              <div className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePrevStep}
                  disabled={currentStep === 0 || isLoading}
                  className="border-white/[0.12] bg-transparent px-4 text-white hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>

                {currentStep < 4 ? (
                  <Button
                    type="button"
                    onClick={handleNextStep}
                    disabled={!stepsValid[currentStep]}
                    className="border border-blue-400/25 bg-blue-500/90 px-5 text-white hover:bg-blue-500 disabled:opacity-50"
                  >
                    Continue
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={onSubmit}
                    disabled={isLoading || !stepsValid.every(Boolean)}
                    className="border border-blue-400/25 bg-blue-500/90 px-5 text-white hover:bg-blue-500 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Provisioning...
                      </>
                    ) : (
                      <>
                        Deploy VPS
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* Right: sticky sidebar */}
            <div className="space-y-6">
              <div className={`${panelClassName} lg:sticky lg:top-8`}>
                <div className="border-b border-white/[0.06] px-6 py-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">
                    Deployment Summary
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-white">Machine configuration</h3>
                </div>

                <div className="px-6 py-5">
                  <div className="space-y-1">
                    <SummaryRow label="Hostname" value={hostname || "Pending"} />
                    <SummaryRow label="Region" value={selectedRegionData?.name || "Pending"} />
                    <SummaryRow label="OS" value={selectedOSName} />
                    <SummaryRow label="vCPU" value={`${cpuCores} cores`} />
                    <SummaryRow label="Memory" value={`${memoryGB} GB`} />
                    <SummaryRow label="Storage" value={`${diskGB} GB`} />
                  </div>

                  <Separator className="my-4 bg-white/[0.08]" />

                  <div className="space-y-3">
                    <div className="border border-white/[0.08] bg-white/[0.04] px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                        CPU model
                      </div>
                      <p className="mt-2 text-sm text-white">Host CPU passthrough</p>
                    </div>
                    <div className="border border-white/[0.08] bg-white/[0.04] px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                        Network
                      </div>
                      <p className="mt-2 text-sm text-white">Routed public IPv4 · {bandwidthLabel} cap</p>
                    </div>
                    <div className="border border-white/[0.08] bg-white/[0.04] px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                        Initial access
                      </div>
                      <p className="mt-2 text-sm text-white">
                        {connectionLabel} · user {selectedDefaultUser}
                      </p>
                    </div>
                  </div>

                  <Separator className="my-4 bg-white/[0.08]" />

                  <p className="text-xs leading-5 text-white/42">
                    After submission, the platform allocates an IP, clones the image, applies
                    cloud-init, and boots the VM. Live progress streams back into this page
                    automatically.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Deployment Progress — live tracking via Supabase realtime */
        deploymentServerId ? (
          <DeploymentProgress
            serverId={deploymentServerId}
            serverName={result?.name as string || hostname}
            serverIp={result?.ip as string || ""}
            serverOs={result?.os as string || availableOS.find(o => o.id === selectedOS)?.name || selectedOS}
            connectionType={usesRDP ? "rdp" : "ssh"}
            username={
              (result?.ssh as Record<string, unknown>)?.username as string ||
              (result?.rdp as Record<string, unknown>)?.username as string ||
              (isWindows ? "admin" : selectedOS.toLowerCase().includes("debian") ? "debian" : selectedOS.toLowerCase().includes("centos") ? "centos" : "ubuntu")
            }
            onCreateAnother={() => {
              setResult(null);
              setDeploymentServerId(null);
              setHostname("");
              setSshPassword("");
              setSshPasswordConfirm("");
              setError(null);
              setCurrentStep(0);
            }}
          />
        ) : (
          /* Fallback success message */
          <Card className="bg-black/50 border-white/10">
            <CardHeader className="text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-emerald-400" />
              </div>
              <CardTitle className="text-white mt-3">VPS Created Successfully</CardTitle>
              <CardDescription className="text-white/70">
                Your VPS is being provisioned. You can manage it from your dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center gap-3">
              <Button
                onClick={() => {
                  setResult(null);
                  setHostname("");
                  setCurrentStep(0);
                }}
                className="bg-white/10 hover:bg-white/20 text-white border border-white/10"
              >
                Create Another VPS
              </Button>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
};

export default VPSSelect;

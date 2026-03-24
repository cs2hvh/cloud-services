"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, ChevronLeft, ChevronRight, MapPin, Cpu, HardDrive, Zap, CheckCircle } from "lucide-react";
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

  return (
    <div className="space-y-6">
      {!result?.ok ? (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Main column */}
          <div className="md:col-span-9 space-y-4">
            {/* Horizontal breadcrumb */}
            {(() => {
              const steps = [
                { label: "Name", valid: stepsValid[0] },
                { label: "Region", valid: stepsValid[1] },
                { label: "OS", valid: stepsValid[2] },
                { label: "Configuration", valid: stepsValid[3] },
                { label: "Password", valid: stepsValid[4] },
              ];
              const canAccess = (i: number) => steps.slice(0, i).every((s) => s.valid);
              return (
                <div className="w-full">
                  <div className="flex items-center justify-between">
                    {steps.map((s, idx) => {
                      const active = currentStep === idx;
                      const done = currentStep > idx && steps[idx].valid;
                      const accessible = idx === 0 || canAccess(idx);
                      return (
                        <div key={idx} className="flex-1 flex items-center">
                          <button
                            type="button"
                            onClick={() => accessible && setCurrentStep(idx)}
                            disabled={!accessible}
                            className={`flex items-center gap-2 ${
                              accessible ? "cursor-pointer" : "cursor-not-allowed opacity-50"
                            }`}
                          >
                            <div
                              className={`w-6 h-6 rounded-full border flex items-center justify-center text-[10px] ${
                                done
                                  ? "border-green-400 bg-green-500/20 text-green-300"
                                  : active
                                  ? "border-blue-400 bg-blue-500/20 text-blue-300"
                                  : "border-white/20 bg-white/10 text-white/70"
                              }`}
                            >
                              {done ? <Check className="h-3 w-3" /> : idx + 1}
                            </div>
                            <span
                              className={`text-xs md:text-sm ${
                                active ? "text-white" : "text-white/70"
                              }`}
                            >
                              {s.label}
                            </span>
                          </button>
                          {idx < steps.length - 1 && (
                            <div
                              className={`mx-2 h-0.5 flex-1 rounded ${
                                canAccess(idx + 1) ? "bg-white/40" : "bg-white/10"
                              }`}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <Card className="bg-black/50 border-white/10">
              <CardHeader>
                <CardTitle className="text-white text-base">
                  {["Hostname", "Region", "Operating System", "Configuration", usesRDP ? "RDP Password" : "SSH Password"][
                    currentStep
                  ]}
                </CardTitle>
                <CardDescription className="text-white/60">
                  Step {currentStep + 1} of 5
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Step 0: Hostname */}
                {currentStep === 0 && (
                  <div className="space-y-3">
                    <Label className="text-white">Hostname</Label>
                    <Input
                      value={hostname}
                      onChange={(e) => setHostname(e.target.value)}
                      placeholder="e.g. prod-web-01"
                      className="bg-black text-white border-white/10"
                    />
                  </div>
                )}

                {/* Step 1: Region */}
                {currentStep === 1 && (
                  <div className="space-y-3">
                    <Label className="text-white">Region</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {regions.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => r.available && setSelectedRegion(r.id)}
                            disabled={!r.available}
                            className={`w-full text-left rounded-xl border px-3 py-3 transition ${
                              selectedRegion === r.id
                                ? "bg-blue-500/10 border-blue-400 text-white"
                                : r.available
                                ? "bg-white/5 border-white/10 text-white/80 hover:bg-white/10"
                                : "bg-white/5 border-white/10 text-white/40 cursor-not-allowed opacity-50"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <MapPin className="text-white/60 h-4 w-4" />
                              <div className="min-w-0">
                                <div className="truncate text-sm text-white">{r.name}</div>
                                {!r.available && <div className="text-xs text-red-400">Sold out</div>}
                              </div>
                            </div>
                          </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 2: OS */}
                {currentStep === 2 && (
                  <div className="space-y-3">
                    <Label className="text-white">Operating System</Label>
                    <Select value={selectedOS} onValueChange={setSelectedOS}>
                      <SelectTrigger className="bg-black text-white border-white/10">
                        <SelectValue placeholder="Select OS" />
                      </SelectTrigger>
                      <SelectContent className="bg-black text-white border-white/10 max-h-64 overflow-auto">
                        {availableOS.map((os) => (
                          <SelectItem key={os.id} value={os.id}>
                            {os.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Step 3: Configuration */}
                {currentStep === 3 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-white">vCPU Cores</Label>
                      <Input
                        type="number"
                        min={1}
                        max={32}
                        value={cpuCores}
                        onChange={(e) => setCpuCores(parseInt(e.target.value || "1", 10))}
                        className="mt-2 bg-black text-white border-white/10"
                      />
                    </div>
                    <div>
                      <Label className="text-white">Memory (GB)</Label>
                      <Input
                        type="number"
                        min={isWindows ? 2 : 1}
                        max={128}
                        value={memoryGB}
                        onChange={(e) => setMemoryGB(parseInt(e.target.value || (isWindows ? "2" : "1"), 10))}
                        className="mt-2 bg-black text-white border-white/10"
                      />
                      {isWindows && <p className="text-xs text-yellow-400 mt-1">Windows requires minimum 2 GB RAM</p>}
                    </div>
                    <div>
                      <Label className="text-white">Storage (GB)</Label>
                      <Input
                        type="number"
                        min={isWindows ? 40 : 10}
                        max={2000}
                        value={diskGB}
                        onChange={(e) => setDiskGB(parseInt(e.target.value || (isWindows ? "40" : "10"), 10))}
                        className="mt-2 bg-black text-white border-white/10"
                      />
                      {isWindows && <p className="text-xs text-yellow-400 mt-1">Windows requires minimum 40 GB storage</p>}
                    </div>
                  </div>
                )}

                {/* Step 4: Password */}
                {currentStep === 4 && (
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <Label className="text-white">{usesRDP ? "RDP Password" : "SSH Password"}</Label>
                      <Input
                        type="password"
                        value={sshPassword}
                        onChange={(e) => setSshPassword(e.target.value)}
                        placeholder="Enter a strong password"
                        className="mt-2 bg-black text-white border-white/10"
                      />
                    </div>
                    <div>
                      <Label className="text-white">Confirm Password</Label>
                      <Input
                        type="password"
                        value={sshPasswordConfirm}
                        onChange={(e) => setSshPasswordConfirm(e.target.value)}
                        placeholder="Re-enter password"
                        className="mt-2 bg-black text-white border-white/10"
                      />
                    </div>
                    {sshPasswordConfirm && sshPassword !== sshPasswordConfirm && (
                      <div className="text-red-400 text-xs">Passwords do not match</div>
                    )}
                  </div>
                )}

                {error && <div className="text-red-400 text-sm">{error}</div>}

                <div className="flex items-center justify-between pt-2">
                  <Button
                    type="button"
                    onClick={handlePrevStep}
                    disabled={currentStep === 0}
                    className="bg-white/10 hover:bg-white/20 text-white border border-white/10 disabled:opacity-50"
                  >
                    <ChevronLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  {currentStep < 4 ? (
                    <Button
                      type="button"
                      onClick={handleNextStep}
                      disabled={!stepsValid[currentStep]}
                      className="bg-white/10 hover:bg-white/20 text-white border border-white/10 disabled:opacity-50"
                    >
                      Next <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={onSubmit}
                      disabled={isLoading || !stepsValid.every((v) => v)}
                      className="bg-white/10 hover:bg-white/20 text-white border border-white/10 disabled:opacity-50"
                    >
                      {isLoading ? "Creating..." : "Create VPS"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Summary sidebar */}
          <div className="md:col-span-3">
            <Card className="bg-black/50 border-white/10 sticky top-16">
              <CardHeader>
                <CardTitle className="text-white text-base">Summary</CardTitle>
                <CardDescription className="text-white/60">Review your configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex items-center justify-between py-2 border-b border-white/10">
                  <div className="text-white/60">Hostname</div>
                  <div className="text-white break-all ml-4 max-w-[60%] text-right">
                    {hostname || "—"}
                  </div>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-white/10">
                  <div className="text-white/60 flex items-center gap-2">
                    <MapPin className="h-4 w-4" /> Region
                  </div>
                  <div className="text-white ml-4 max-w-[60%] text-right">
                    {selectedRegionData?.name || "—"}
                  </div>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-white/10">
                  <div className="text-white/60">Operating System</div>
                  <div className="text-white ml-4 max-w-[60%] text-right">
                    {availableOS.find((o) => o.id === selectedOS)?.name || "—"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs bg-white/10 border border-white/10 text-white/90">
                    <Cpu className="h-3 w-3" /> {cpuCores} vCPU
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs bg-white/10 border border-white/10 text-white/90">
                    <Zap className="h-3 w-3" /> {memoryGB} GB
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs bg-white/10 border border-white/10 text-white/90">
                    <HardDrive className="h-3 w-3" /> {diskGB} GB
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
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

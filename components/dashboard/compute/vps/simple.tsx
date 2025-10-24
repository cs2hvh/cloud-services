"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, ChevronLeft, ChevronRight, MapPin, Cpu, HardDrive, Zap, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { Tables } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/client";

// Password validation constants - moved outside component to prevent recompilation
const PASSWORD_PATTERNS = {
  hasUpperCase: /[A-Z]/,
  hasLowerCase: /[a-z]/,
  hasNumbers: /[0-9]/,
  hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
} as const;

const PASSWORD_MIN_LENGTH = 12;

interface ComputeOptions {
  locations?: Array<{ id: string; name: string; node: string }>;
  osTemplates?: Array<{ id: string; name: string; type: string }>;
}

interface PageProps {
  locations: Tables<"locations">[];
  computeOptions?: ComputeOptions;
}

const VPSSelect = ({ locations, computeOptions }: PageProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Form state
  const [hostname, setHostname] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [selectedOS, setSelectedOS] = useState<string>("Ubuntu 24.04 LTS");
  const [cpuCores, setCpuCores] = useState(2);
  const [memoryGB, setMemoryGB] = useState(2);
  const [diskGB, setDiskGB] = useState(50);
  const [sshPassword, setSshPassword] = useState("");
  const [sshPasswordConfirm, setSshPasswordConfirm] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Use Proxmox hosts as locations
  const effectiveLocations = useMemo(() => {
    if (computeOptions?.locations && computeOptions.locations.length > 0) {
      return computeOptions.locations.map(h => ({
        id: h.id,
        short: h.id,
        city: h.name,
        country: "Host",
        country_code: "US",
        node: h.node,
      }));
    }
    return locations || [];
  }, [computeOptions, locations]);

  // Use templates as OS options
  const effectiveOS = useMemo(() => {
    if (computeOptions?.osTemplates && computeOptions.osTemplates.length > 0) {
      return computeOptions.osTemplates.map(t => ({
        id: t.id,
        name: t.name,
      }));
    }
    return [];
  }, [computeOptions]);

  useEffect(() => {
    if (effectiveLocations.length > 0 && !selectedLocation) {
      setSelectedLocation(String(effectiveLocations[0].id));
    }
  }, [effectiveLocations, selectedLocation]);

  useEffect(() => {
    if (effectiveOS.length > 0 && !selectedOS) {
      setSelectedOS(effectiveOS[0].id);
    }
  }, [effectiveOS, selectedOS]);

  const stepsValid = [
    hostname.trim().length > 0,
    !!selectedLocation,
    !!selectedOS,
    cpuCores >= 1 && memoryGB >= 1 && diskGB >= 10,
    sshPassword.length >= 12 && sshPassword === sshPasswordConfirm,
  ];

  const handleNextStep = () => {
    if (currentStep === 0 && !hostname.trim()) {
      toast.error("Please enter a hostname");
      return;
    }
    if (currentStep === 1 && !selectedLocation) {
      toast.error("Please select a location");
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
          toast.error(`SSH password must be at least ${PASSWORD_MIN_LENGTH} characters`);
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

      // Find the selected OS template name (backend expects name, not ID)
      const selectedOSName = effectiveOS.find(t => t.id === selectedOS)?.name || selectedOS;

      const payload = {
        location: selectedLocation,
        os: selectedOSName,  // Send template name instead of ID
        hostname: hostname,
        cpuCores: cpuCores,
        memoryMB: memoryGB * 1024,
        diskGB: diskGB,
        sshPassword: sshPassword,
        ownerId: userData?.user?.id,
        ownerEmail: userData?.user?.email,
      };

      console.log("VPS Creation Payload:", payload);

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
        throw new Error(json.error || "Failed to create VM");
      }

      setResult(json);
      toast.success(`VPS "${hostname}" created successfully!`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create VM";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedLocationData = effectiveLocations.find((l) => l.id === selectedLocation);

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
                { label: "Location", valid: stepsValid[1] },
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
                  {["Hostname", "Location", "Operating System", "Configuration", "SSH Password"][
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

                {/* Step 1: Location */}
                {currentStep === 1 && (
                  <div className="space-y-3">
                    <Label className="text-white">Location</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {effectiveLocations.map((l) => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => setSelectedLocation(String(l.id))}
                            className={`w-full text-left rounded-xl border px-3 py-3 transition ${
                              selectedLocation === String(l.id)
                                ? "bg-blue-500/10 border-blue-400 text-white"
                                : "bg-white/5 border-white/10 text-white/80 hover:bg-white/10"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <MapPin className="text-white/60 h-4 w-4" />
                              <div className="min-w-0">
                                <div className="truncate text-sm text-white">{l.city}</div>
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
                        {effectiveOS.map((os) => (
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
                        min={1}
                        max={128}
                        value={memoryGB}
                        onChange={(e) => setMemoryGB(parseInt(e.target.value || "1", 10))}
                        className="mt-2 bg-black text-white border-white/10"
                      />
                    </div>
                    <div>
                      <Label className="text-white">Storage (GB)</Label>
                      <Input
                        type="number"
                        min={10}
                        max={2000}
                        value={diskGB}
                        onChange={(e) => setDiskGB(parseInt(e.target.value || "10", 10))}
                        className="mt-2 bg-black text-white border-white/10"
                      />
                    </div>
                  </div>
                )}

                {/* Step 4: Password */}
                {currentStep === 4 && (
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <Label className="text-white">SSH Password</Label>
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
                    <MapPin className="h-4 w-4" /> Location
                  </div>
                  <div className="text-white ml-4 max-w-[60%] text-right">
                    {selectedLocationData?.city || "—"}
                  </div>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-white/10">
                  <div className="text-white/60">Operating System</div>
                  <div className="text-white ml-4 max-w-[60%] text-right">
                    {effectiveOS.find((o) => o.id === selectedOS)?.name || "—"}
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
        /* Success message */
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
      )}
    </div>
  );
};

export default VPSSelect;

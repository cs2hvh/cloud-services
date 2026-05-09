"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import axios from "axios";
import { toast } from "sonner";
import {
  Plus,
  Minus,
  Trash2,
  Loader2,
  Server,
  Network,
  Lock,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getErrorMessage } from "@/config/functions";
import { vmLocations } from "@/config/locations";

const K8S_VERSIONS = ["1.31.0", "1.30.0", "1.29.0"];

const NODE_SIZES = [
  { slug: "s-2vcpu-4gb",   label: "2 vCPU / 4 GB",   tier: "Standard" },
  { slug: "s-4vcpu-8gb",   label: "4 vCPU / 8 GB",   tier: "Standard" },
  { slug: "s-8vcpu-16gb",  label: "8 vCPU / 16 GB",  tier: "Standard" },
  { slug: "c-2",           label: "2 vCPU (CPU-Opt)", tier: "Optimized" },
  { slug: "c-4",           label: "4 vCPU (CPU-Opt)", tier: "Optimized" },
];

interface NodeEntry {
  id: string;
  host: string;
  private_ip: string;
  role: "control-plane" | "worker";
}

const emptyNode = (role: "control-plane" | "worker"): NodeEntry => ({
  id: crypto.randomUUID(),
  host: "",
  private_ip: "",
  role,
});

const IP_REGEX = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const isValidIp = (v: string) => IP_REGEX.test(v);
const CIDR_REGEX = /^(?:\d{1,3}\.){3}\d{1,3}\/([0-9]|[12]\d|3[012])$/;
const isValidCidr = (v: string) => CIDR_REGEX.test(v);

type Step = 1 | 2;
const STEP_LABELS: Record<Step, string> = { 1: "Configure", 2: "Review" };

interface Props {
  onCreated?: () => void;
}

export default function CreateInternalClusterDialog({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // ── Required fields ────────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [nodeCount, setNodeCount] = useState(1);
  const [nodeSize, setNodeSize] = useState("s-2vcpu-4gb");
  const [k8sMinor, setK8sMinor] = useState("1.31.0");

  // ── Advanced / optional (all have safe defaults) ──────────────────────────
  const [podCidr, setPodCidr] = useState("10.244.0.0/16");
  const [sshUser, setSshUser] = useState("ubuntu");
  const [sshPassword, setSshPassword] = useState("");

  // ── Manual mode — existing servers ────────────────────────────────────────
  const [useExistingServers, setUseExistingServers] = useState(false);
  const [controlPlane, setControlPlane] = useState<NodeEntry>(emptyNode("control-plane"));
  const [workers, setWorkers] = useState<NodeEntry[]>([]);

  // Sync worker count to nodeCount whenever manual mode is active
  useEffect(() => {
    if (!useExistingServers) return;
    const needed = Math.max(nodeCount - 1, 0);
    setWorkers((prev) => {
      if (prev.length === needed) return prev;
      if (prev.length < needed)
        return [...prev, ...Array(needed - prev.length).fill(null).map(() => emptyNode("worker"))];
      return prev.slice(0, needed);
    });
  }, [nodeCount, useExistingServers]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const resetForm = () => {
    setStep(1);
    setShowAdvanced(false);
    setShowPassword(false);
    setName("");
    setLocation("");
    setNodeCount(1);
    setNodeSize("s-2vcpu-4gb");
    setK8sMinor("1.31.0");
    setPodCidr("10.244.0.0/16");
    setSshUser("ubuntu");
    setSshPassword("");
    setUseExistingServers(false);
    setControlPlane(emptyNode("control-plane"));
    setWorkers([]);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) resetForm();
    setOpen(v);
  };

  const isManualMode = useExistingServers;

  // ── Validation ─────────────────────────────────────────────────────────────
  const nameValid = /^[a-z0-9][a-z0-9-]*$/.test(name) && name.length > 0;
  const locationValid = location.trim().length > 0;
  const cidrValid = isValidCidr(podCidr);
  const cpIpsValid =
    !isManualMode ||
    (isValidIp(controlPlane.host) && isValidIp(controlPlane.private_ip));
  const workerIpsValid =
    !isManualMode ||
    workers.every((w) => isValidIp(w.host) && isValidIp(w.private_ip));
  const sshPasswordValid = !isManualMode || sshPassword.length >= 1;

  const step1Valid =
    nameValid && locationValid && cidrValid && cpIpsValid && workerIpsValid && sshPasswordValid;

  const canProceed: Record<Step, boolean> = { 1: step1Valid, 2: true };

  // ── Node patch helpers ─────────────────────────────────────────────────────
  const patchControlPlane = (field: keyof NodeEntry, value: string) =>
    setControlPlane((prev) => ({ ...prev, [field]: value }));

  const patchWorker = (id: string, field: keyof NodeEntry, value: string) =>
    setWorkers((prev) => prev.map((w) => (w.id === id ? { ...w, [field]: value } : w)));

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      let payload: Record<string, unknown>;

      if (isManualMode) {
        if (!sshPassword) {
          toast.error("SSH password is required when using existing servers");
          return;
        }
        payload = {
          mode: "manual",
          name,
          location,
          k8s_minor: k8sMinor,
          pod_cidr: podCidr,
          ssh_user: sshUser,
          ssh_password: sshPassword,
          nodes: [controlPlane, ...workers].map((n) => ({
            host: n.host,
            private_ip: n.private_ip,
            role: n.role,
          })),
        };
      } else {
        payload = {
          mode: "auto",
          name,
          location,
          k8s_minor: k8sMinor,
          node_count: nodeCount,
          node_size: nodeSize,
          pod_cidr: podCidr,
          ssh_user: sshUser,
          ...(sshPassword ? { ssh_password: sshPassword } : {}),
        };
      }

      const { data } = await axios.post("/api/admin/kubernetes/internal-clusters", payload);
      const clusterId: string = data.clusterId ?? "";
      const msg = isManualMode
        ? `Cluster "${name}" queued — job ${data.jobId}`
        : `Cluster "${name}" provisioning started (${clusterId.slice(0, 8)}…)`;
      toast.success(msg);
      setOpen(false);
      resetForm();
      onCreated?.();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to create internal cluster"));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step dots ──────────────────────────────────────────────────────────────
  const renderStepDots = () => (
    <div className="flex items-center gap-2 mb-6">
      {([1, 2] as Step[]).map((s) => (
        <div key={s} className={`flex items-center gap-2 ${s < 2 ? "flex-1" : ""}`}>
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border transition-colors
              ${step === s ? "bg-white text-black border-white" : step > s ? "bg-neutral-700 text-neutral-300 border-neutral-700" : "bg-neutral-900 text-neutral-500 border-neutral-700"}`}
          >
            {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
          </div>
          <span className={`text-xs hidden sm:inline ${step === s ? "text-white font-medium" : "text-neutral-500"}`}>
            {STEP_LABELS[s]}
          </span>
          {s < 2 && <div className="flex-1 h-px bg-neutral-800 ml-1" />}
        </div>
      ))}
    </div>
  );

  // ── Node IP row (manual mode) ──────────────────────────────────────────────
  const renderNodeIpRow = (
    node: NodeEntry,
    onChange: (f: keyof NodeEntry, v: string) => void,
  ) => (
    <div key={node.id} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 space-y-2">
      <Badge variant="outline" className="text-xs border-neutral-700 text-neutral-400 capitalize">
        {node.role}
      </Badge>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-neutral-400">Public IP</Label>
          <Input
            value={node.host}
            onChange={(e) => onChange("host", e.target.value)}
            placeholder="203.0.113.10"
            className="bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-600 h-8 text-sm"
          />
          {node.host && !isValidIp(node.host) && <p className="text-xs text-red-400">Invalid IP</p>}
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-neutral-400">Private IP</Label>
          <Input
            value={node.private_ip}
            onChange={(e) => onChange("private_ip", e.target.value)}
            placeholder="10.0.0.10"
            className="bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-600 h-8 text-sm"
          />
          {node.private_ip && !isValidIp(node.private_ip) && (
            <p className="text-xs text-red-400">Invalid IP</p>
          )}
        </div>
      </div>
    </div>
  );

  const selectedLoc = vmLocations.find((l) => l.short === location);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="bg-white text-black hover:bg-neutral-200 gap-2 h-9 text-sm">
          <Plus className="h-4 w-4" />
          Create Internal Cluster
        </Button>
      </DialogTrigger>

      <DialogContent className="bg-neutral-950 border-neutral-800 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Server className="h-5 w-5 text-neutral-400" />
            New Internal Cluster
          </DialogTitle>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Badge variant="outline" className="text-[10px] border-violet-800/60 text-violet-400 bg-violet-950/30">
              Admin console
            </Badge>
            <Badge variant="outline" className="text-[10px] border-neutral-700 text-neutral-400">
              No billing
            </Badge>
            <Badge variant="outline" className="text-[10px] border-neutral-700 text-neutral-400">
              {isManualMode ? "Existing servers" : "Auto-provisioned"}
            </Badge>
          </div>
        </DialogHeader>

        {renderStepDots()}

        {/* ─── Step 1: Configure ─── */}
        {step === 1 && (
          <div className="space-y-5">

            {/* Cluster Name */}
            <div className="space-y-1.5">
              <Label className="text-sm text-neutral-300">Cluster Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="prod-internal-1"
                className="bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-600"
              />
              <p className="text-xs text-neutral-500">Lowercase letters, numbers, hyphens</p>
            </div>

            {/* Location — flag cards */}
            <div className="space-y-1.5">
              <Label className="text-sm text-neutral-300">Location</Label>
              <RadioGroup value={location} onValueChange={setLocation} className="grid grid-cols-2 gap-2">
                {vmLocations.map((loc) => (
                  <div key={loc.id}>
                    <RadioGroupItem
                      value={loc.short}
                      id={`loc-${loc.short}`}
                      className="peer sr-only"
                      disabled={!loc.available}
                    />
                    <Label
                      htmlFor={`loc-${loc.short}`}
                      className={`flex items-center gap-2.5 rounded-md border cursor-pointer p-2.5 transition-all text-sm ${
                        !loc.available
                          ? "opacity-40 cursor-not-allowed border-neutral-800 bg-neutral-900"
                          : "border-neutral-700 bg-neutral-900 hover:border-neutral-500 hover:bg-neutral-800 peer-data-[state=checked]:border-violet-500 peer-data-[state=checked]:bg-violet-950/30"
                      }`}
                    >
                      <Image
                        src={`https://flagsapi.com/${loc.country_code}/flat/64.png`}
                        alt={loc.city}
                        width={24}
                        height={18}
                        className="rounded-sm object-contain shrink-0"
                        unoptimized
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-white truncate">{loc.city}</div>
                        <div className="text-xs text-neutral-500 font-mono">{loc.short}</div>
                      </div>
                      {!loc.available && (
                        <Badge variant="outline" className="text-[10px] ml-auto shrink-0 border-neutral-700 text-neutral-500">
                          Soon
                        </Badge>
                      )}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Node Count */}
            <div className="space-y-1.5">
              <Label className="text-sm text-neutral-300">Number of Nodes</Label>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setNodeCount((c) => Math.max(1, c - 1))}
                  disabled={nodeCount <= 1}
                  className="h-9 w-9 border-neutral-700 bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-40"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-8 text-center text-white font-semibold text-lg">{nodeCount}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setNodeCount((c) => Math.min(10, c + 1))}
                  disabled={nodeCount >= 10}
                  className="h-9 w-9 border-neutral-700 bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <span className="text-xs text-neutral-500">
                  1 control plane + {Math.max(nodeCount - 1, 0)} worker{nodeCount - 1 !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {/* Node Size */}
            <div className="space-y-1.5">
              <Label className="text-sm text-neutral-300">Node Size</Label>
              <Select value={nodeSize} onValueChange={setNodeSize}>
                <SelectTrigger className="bg-neutral-900 border-neutral-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-neutral-900 border-neutral-700">
                  {NODE_SIZES.map((s) => (
                    <SelectItem key={s.slug} value={s.slug} className="text-white hover:bg-neutral-800">
                      {s.label}
                      <span className="ml-2 text-neutral-500 text-xs">{s.tier}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* K8s Version */}
            <div className="space-y-1.5">
              <Label className="text-sm text-neutral-300">Kubernetes Version</Label>
              <Select value={k8sMinor} onValueChange={setK8sMinor}>
                <SelectTrigger className="bg-neutral-900 border-neutral-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-neutral-900 border-neutral-700">
                  {K8S_VERSIONS.map((v) => (
                    <SelectItem key={v} value={v} className="text-white hover:bg-neutral-800">
                      v{v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Advanced toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors flex items-center gap-1.5"
            >
              <Settings2 className="h-3 w-3" />
              Advanced options
              <ChevronRight className={`h-3 w-3 transition-transform ${showAdvanced ? "rotate-90" : ""}`} />
            </button>

            {showAdvanced && (
              <div className="space-y-4 pl-3 border-l border-neutral-800">

                {/* SSH Username + Password */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm text-neutral-300">SSH Username</Label>
                    <Input
                      value={sshUser}
                      onChange={(e) => setSshUser(e.target.value)}
                      placeholder="ubuntu"
                      className="bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-600"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm text-neutral-300">
                      SSH Password{" "}
                      {!isManualMode && (
                        <span className="text-neutral-500 font-normal text-xs">(optional)</span>
                      )}
                    </Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={sshPassword}
                        onChange={(e) => setSshPassword(e.target.value)}
                        placeholder={isManualMode ? "required" : "auto-generated"}
                        className="bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-600 pr-14"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((p) => !p)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-neutral-500 hover:text-neutral-300"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Pod CIDR */}
                <div className="space-y-1.5">
                  <Label className="text-sm text-neutral-300">Pod CIDR</Label>
                  <Input
                    value={podCidr}
                    onChange={(e) => setPodCidr(e.target.value)}
                    placeholder="10.244.0.0/16"
                    className="bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-600"
                  />
                  {podCidr && !isValidCidr(podCidr) && (
                    <p className="text-xs text-red-400">Invalid CIDR — expected: 10.244.0.0/16</p>
                  )}
                </div>

                {/* Use existing servers toggle */}
                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-sm text-neutral-300">Use existing servers</p>
                    <p className="text-xs text-neutral-500">
                      Manually enter node IPs instead of auto-provisioning via DigitalOcean
                    </p>
                  </div>
                  <Switch checked={useExistingServers} onCheckedChange={setUseExistingServers} />
                </div>

                {/* Manual IP entry */}
                {useExistingServers && (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-2.5 flex gap-2 text-xs text-amber-400/80">
                      <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>SSH password is required and will be encrypted server-side.</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                      <Network className="h-3.5 w-3.5" />
                      <span>Control Plane</span>
                    </div>
                    {renderNodeIpRow(controlPlane, patchControlPlane)}
                    {workers.length > 0 && (
                      <>
                        <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                          <Server className="h-3.5 w-3.5" />
                          <span>Workers ({workers.length})</span>
                        </div>
                        {workers.map((w) =>
                          renderNodeIpRow(w, (f, v) => patchWorker(w.id, f, v))
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── Step 2: Review ─── */}
        {step === 2 && (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 divide-y divide-neutral-800">
              <div className="px-4 py-3 flex justify-between">
                <span className="text-neutral-400">Name</span>
                <span className="text-white font-mono">{name}</span>
              </div>
              <div className="px-4 py-3 flex justify-between items-center">
                <span className="text-neutral-400">Location</span>
                <div className="flex items-center gap-2">
                  {selectedLoc ? (
                    <>
                      <Image
                        src={`https://flagsapi.com/${selectedLoc.country_code}/flat/64.png`}
                        alt={selectedLoc.city}
                        width={16}
                        height={12}
                        className="rounded-sm"
                        unoptimized
                      />
                      <span className="text-white">{selectedLoc.city}</span>
                      <span className="text-neutral-500 font-mono text-xs">{location}</span>
                    </>
                  ) : (
                    <span className="text-white">{location}</span>
                  )}
                </div>
              </div>
              <div className="px-4 py-3 flex justify-between">
                <span className="text-neutral-400">Nodes</span>
                <span className="text-white">
                  {nodeCount} × <span className="font-mono">{nodeSize}</span>
                </span>
              </div>
              <div className="px-4 py-3 flex justify-between">
                <span className="text-neutral-400">K8s Version</span>
                <span className="text-white">v{k8sMinor}</span>
              </div>
              <div className="px-4 py-3 flex justify-between">
                <span className="text-neutral-400">Pod CIDR</span>
                <span className="text-white font-mono">{podCidr}</span>
              </div>
              <div className="px-4 py-3 flex justify-between items-center">
                <span className="text-neutral-400">Mode</span>
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    isManualMode
                      ? "border-amber-700/60 text-amber-400"
                      : "border-violet-700/60 text-violet-400"
                  }`}
                >
                  {isManualMode ? "Existing servers (manual IPs)" : "Auto-provision via DigitalOcean"}
                </Badge>
              </div>
            </div>

            {isManualMode && (
              <div className="space-y-2">
                <p className="text-neutral-400 text-xs uppercase tracking-wide">
                  Nodes ({1 + workers.length})
                </p>
                {[controlPlane, ...workers].map((n, i) => (
                  <div
                    key={n.id}
                    className="rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-xs shrink-0 border-neutral-700 ${n.role === "control-plane" ? "text-blue-400" : "text-green-400"}`}
                      >
                        {n.role === "control-plane" ? "CP" : `W${i}`}
                      </Badge>
                      <span className="font-mono text-xs text-white">{n.host}</span>
                    </div>
                    <span className="font-mono text-xs text-neutral-500">{n.private_ip}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Navigation ─── */}
        <div className="flex justify-between mt-6 pt-4 border-t border-neutral-800">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
            disabled={step === 1 || submitting}
            className="text-neutral-400 hover:text-white hover:bg-neutral-800"
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>

          {step < 2 ? (
            <Button
              onClick={() => setStep((s) => ((s + 1) as Step))}
              disabled={!canProceed[step]}
              className="bg-white text-black hover:bg-neutral-200 disabled:opacity-40"
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-white text-black hover:bg-neutral-200 disabled:opacity-40 min-w-[120px]"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…
                </>
              ) : (
                "Create Cluster"
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}


"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Layers,
  Loader2,
  Plus,
  RotateCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  ACCENT,
  ColHead,
  DataTable,
  EmptyState,
  GhostButton,
  Hero,
  MONO,
  PageCanvas,
  PrimaryButton,
  RowActionButton,
  SectionHead,
  SERIF_STYLE,
  StatCell,
  StatsStrip,
} from "@/components/dashboard/inference/chrome";

export interface FineTuneJob {
  id: string;
  name: string;
  base_model_id: string;
  method: "lora" | "qlora" | "full";
  status: "queued" | "preparing" | "running" | "completed" | "failed" | "cancelled";
  gpu_sku: string;
  training_seconds: number | null;
  cost_cents: number | null;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  output_model_id: string | null;
  error_message: string | null;
  created_at: string;
  // Phase 8.B+D+F additions — present once heartbeats start landing /
  // completion webhook fires.
  current_step?: number | null;
  max_steps?: number | null;
  current_epoch?: number | null;
  latest_loss?: number | null;
  last_heartbeat_at?: string | null;
  hourly_cost_cents?: number | null;
  training_log_url?: string | null;
  // Used by the inline expansion panel (page.tsx + jobs list endpoint
  // include these so we don't need a per-row detail fetch).
  hyperparams?: Record<string, unknown> | null;
  dataset_url?: string | null;
  output_artifact_url?: string | null;
  pod_id?: string | null;
}

export interface FineTuneBaseModel {
  model_id: string;
  display_name: string;
  context_window: number | null;
  input_cents_per_mtok: number | null;
}

/**
 * Bases that require a manual approval form on the upstream model registry
 * before download will succeed. Keep in sync with BASE_MODEL_INFO.gated in
 * workers/ft-runner/src/ft-base-models.ts.
 *
 * Surfaced as a "approval required" badge in the dropdown so users don't
 * queue a job that's guaranteed to fail at model-download time with a 403.
 */
const GATED_BASES = new Set([
  "meta-llama/llama-4-scout",
  "meta-llama/llama-4-maverick",
  "meta-llama/llama-3.3-70b-instruct",
  "meta-llama/llama-3.3-8b-instruct",
  "google/gemma-4-27b-it",
]);

/** Maps internal base id → "where to request access" URL on the upstream
 *  catalog. We don't display the upstream brand name; just a link. */
function approvalUrlFor(internalId: string): string | null {
  if (internalId.startsWith("meta-llama/")) {
    return `https://huggingface.co/meta-llama`;
  }
  if (internalId === "google/gemma-4-27b-it") {
    return `https://huggingface.co/google/gemma-3-27b-it`;
  }
  return null;
}

/**
 * Map our internal SKU (used in inference.finetunes.gpu_sku + the RunPod
 * pod-create call) to RunPod's `displayName` in inventory.runpod_inventory.
 * Keep in sync with lib/inference/finetune-runpod.ts GPU_SKU_TO_RUNPOD_TYPE.
 */
const SKU_TO_RUNPOD_DISPLAY_NAME: Record<string, string> = {
  "A40": "NVIDIA A40",
  "L40S": "NVIDIA L40S",
  "RTX-6000-Ada": "NVIDIA RTX 6000 Ada Generation",
  "A100-40GB": "NVIDIA A100-PCIE-40GB",
  "A100-80GB": "NVIDIA A100 80GB PCIe",
  "H100-80GB": "NVIDIA H100 80GB HBM3",
};

const SKU_BLURB: Record<string, string> = {
  "A40": "budget tier",
  "L40S": "small qLoRA",
  "RTX-6000-Ada": "small jobs",
  "A100-40GB": "small LoRA, qLoRA",
  "A100-80GB": "large LoRA workhorse",
  "H100-80GB": "fastest, premium",
};

interface InventoryRow {
  displayName: string;
  cloudType: "SECURE" | "COMMUNITY";
  stockStatus: "high" | "medium" | "low" | "none";
  onDemandPerHr: number | null;
  spotPerHr: number | null;
}


function statusMeta(status: FineTuneJob["status"]): {
  color: string;
  label: string;
  pulse?: boolean;
} {
  if (status === "completed") return { color: "#4ade80", label: "Completed" };
  if (status === "running") return { color: ACCENT, label: "Running", pulse: true };
  if (status === "preparing") return { color: ACCENT, label: "Preparing", pulse: true };
  if (status === "queued") return { color: "#fbbf24", label: "Queued" };
  if (status === "failed") return { color: "#f87171", label: "Failed" };
  if (status === "cancelled") return { color: "rgba(255,255,255,0.45)", label: "Cancelled" };
  return { color: "rgba(255,255,255,0.45)", label: status };
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatCents(c: number | null): string {
  if (c === null) return "—";
  if (c === 0) return "$0";
  if (c < 100) return `$${(c / 100).toFixed(2)}`;
  return `$${(c / 100).toFixed(0)}`;
}

/**
 * Inline detail panel that renders below a job row when the user expands it.
 * Replaces the old popup dialog. All fields are present in the list-row
 * data so no per-row fetch is needed.
 */
function ExpandedRow({ job: j }: { job: FineTuneJob }) {
  const hp = (j.hyperparams ?? {}) as Record<string, unknown>;
  const podId = j.pod_id ?? null;

  const InfoRow = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
      <div className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/45`}>{k}</div>
      <div className={`${MONO} text-[11.5px] text-white/85 break-all`}>{v}</div>
    </div>
  );

  const adapterR2 = j.output_artifact_url ?? "";
  const baseShort = j.base_model_id.split("/")[1] ?? j.base_model_id;

  // Build docker command. URL is injected at copy-time (1-hour signed
  // URL minted on demand) so the dialog doesn't ship live secrets in
  // the rendered HTML.
  const dockerCmdTemplate = `docker run --gpus all -p 8000:8000 \\
  -e BASE_MODEL="${baseShort}" \\
  -e ADAPTER_DOWNLOAD_URL="<paste-presigned-url-from-button-above>" \\
  ghcr.io/cs2hvh/ahura-ft-serving-vllm:vllm-0.7.3`;

  async function copyServeCommand() {
    try {
      const r = await fetch(`/api/inference/fine-tuning/jobs/${j.id}/adapter-url`, {
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok || !data.success) {
        throw new Error(data.error ?? "Failed to mint adapter URL");
      }
      const fullCmd = `docker run --gpus all -p 8000:8000 \\
  -e BASE_MODEL="${baseShort}" \\
  -e ADAPTER_DOWNLOAD_URL="${data.url}" \\
  ghcr.io/cs2hvh/ahura-ft-serving-vllm:vllm-0.7.3`;
      await navigator.clipboard.writeText(fullCmd);
      toast.success("Serve command copied (6-hour validity)");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't generate URL");
    }
  }

  return (
    <div className="bg-white/[0.015] border-t border-white/[0.04] px-5 py-5 space-y-5">
      {/* Core */}
      <div>
        <InfoRow k="Base model" v={<code>{j.base_model_id}</code>} />
        <InfoRow k="Method" v={j.method.toUpperCase()} />
        <InfoRow
          k="GPU"
          v={`${j.gpu_sku}${j.hourly_cost_cents ? ` · $${(j.hourly_cost_cents / 100).toFixed(2)}/hr at provision` : ""}`}
        />
        <InfoRow k="Duration" v={formatDuration(j.training_seconds)} />
        <InfoRow k="Cost" v={formatCents(j.cost_cents)} />
        {j.queued_at && <InfoRow k="Queued" v={new Date(j.queued_at).toLocaleString()} />}
        {j.started_at && <InfoRow k="Started" v={new Date(j.started_at).toLocaleString()} />}
        {j.completed_at && <InfoRow k="Completed" v={new Date(j.completed_at).toLocaleString()} />}
        {j.dataset_url && (
          <InfoRow k="Dataset" v={<code className="text-[10.5px]">{j.dataset_url}</code>} />
        )}
      </div>

      {/* Hyperparams */}
      {Object.keys(hp).length > 0 && (
        <div>
          <h4 className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-white/55 mb-2`}>Hyperparameters</h4>
          <div className="bg-black/40 border border-white/[0.05] rounded-[4px] p-3">
            <pre className={`${MONO} text-[10.5px] text-white/75 whitespace-pre-wrap`}>{JSON.stringify(hp, null, 2)}</pre>
          </div>
        </div>
      )}

      {/* Your trained model + serve guide (completed jobs only) */}
      {j.status === "completed" && adapterR2 && (
        <div>
          <h4 className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-emerald-300/85 mb-2`}>Your trained model</h4>
          <InfoRow
            k="Status"
            v={
              <span className="inline-flex items-center gap-1 text-emerald-300/85">
                <CheckCircle2 className="h-3 w-3" /> ready to serve
              </span>
            }
          />
          <InfoRow
            k="Adapter"
            v={
              <span className="inline-flex items-center gap-2">
                <code className="text-[11px] text-white/85 select-all break-all">{adapterR2}</code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(adapterR2);
                    toast.success("Copied");
                  }}
                  className={`${MONO} text-[10px] text-white/45 hover:text-white/85`}
                >
                  copy
                </button>
              </span>
            }
          />

          <div className="mt-5 mb-3">
            <h4 className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-white/55 mb-3`}>How to serve</h4>

            <div className="mb-4 pl-5 relative">
              <span className={`${MONO} absolute left-0 top-0 text-[10px] text-[#0095FF] font-bold`}>1.</span>
              <div className={`${MONO} text-[11.5px] text-white/85 mb-1`}>Rent a GPU pod</div>
              <p className={`${MONO} text-[10.5px] text-white/55 leading-relaxed mb-2`}>
                Pick A40 (~$0.40/hr) for 8-14B bases, A100 80GB for 27-32B, H100 for larger MoE.
              </p>
              <a
                href="/dashboard/services/gpu/deploy"
                className={`${MONO} inline-flex items-center gap-1.5 text-[11px] font-medium text-white bg-[#0095FF] hover:bg-[#33adff] px-3 py-1.5 rounded transition-colors`}
              >
                Open GPU compute → rent a pod
              </a>
            </div>

            <div className="mb-4 pl-5 relative">
              <span className={`${MONO} absolute left-0 top-0 text-[10px] text-[#0095FF] font-bold`}>2.</span>
              <div className={`${MONO} text-[11.5px] text-white/85 mb-1`}>SSH into the pod and run the serving container</div>
              <p className={`${MONO} text-[10.5px] text-white/55 leading-relaxed mb-2`}>
                Click the button below to copy a ready-to-paste docker command.
                The adapter download URL is signed and valid for 6 hours — generate
                a fresh one if it expires before you run.
              </p>
              <button
                type="button"
                onClick={copyServeCommand}
                className={`${MONO} inline-flex items-center gap-1.5 text-[11px] font-medium text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded transition-colors mb-2`}
              >
                Copy serve command (6h validity)
              </button>
              <div className="bg-black/60 border border-white/[0.06] rounded-[4px] p-3">
                <pre className={`${MONO} text-[10.5px] text-white/55 whitespace-pre-wrap overflow-x-auto`}>{dockerCmdTemplate}</pre>
              </div>
              <p className={`${MONO} mt-2 text-[10px] text-white/45`}>
                vLLM exposes an OpenAI-compatible API on port 8000 with your adapter loaded.
                First boot ~60s (downloads base + adapter). Subsequent requests 1-2s.
              </p>
            </div>

            <div className="pl-5 relative">
              <span className={`${MONO} absolute left-0 top-0 text-[10px] text-[#0095FF] font-bold`}>3.</span>
              <div className={`${MONO} text-[11.5px] text-white/85 mb-1`}>Call your model</div>
              <p className={`${MONO} text-[10.5px] text-white/55 leading-relaxed mb-2`}>
                Once the container is healthy, hit your pod&apos;s exposed port:
              </p>
              <div className="bg-black/60 border border-white/[0.06] rounded-[4px] p-3">
                <pre className={`${MONO} text-[10.5px] text-white/85 whitespace-pre-wrap overflow-x-auto`}>{`curl http://<your-pod-ip>:8000/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "adapter",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`}</pre>
              </div>
            </div>
          </div>

          {j.training_log_url && (
            <InfoRow
              k="Training log"
              v={
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const r = await fetch(`/api/inference/fine-tuning/jobs/${j.id}/log-url`, {
                        credentials: "include",
                      });
                      const data = await r.json();
                      if (!r.ok) throw new Error(data.error ?? "log fetch failed");
                      window.open(data.url, "_blank", "noopener,noreferrer");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Couldn't fetch log URL");
                    }
                  }}
                  className="text-[#0095FF] hover:underline cursor-pointer"
                >
                  download log ↗
                </button>
              }
            />
          )}
        </div>
      )}

      {/* Infra */}
      {podId && (
        <div>
          <h4 className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-white/55 mb-2`}>Compute</h4>
          <InfoRow k="Pod id" v={<code>{podId}</code>} />
          {j.last_heartbeat_at && <InfoRow k="Last heartbeat" v={new Date(j.last_heartbeat_at).toLocaleString()} />}
        </div>
      )}

      {/* Error */}
      {j.error_message && (
        <div>
          <h4 className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-red-300/85 mb-2`}>
            {j.status === "failed" ? "Failure reason" : "Warning"}
          </h4>
          <div className="bg-red-950/40 border border-red-900/40 rounded-[4px] p-3">
            <pre className={`${MONO} text-[10.5px] text-red-200/85 whitespace-pre-wrap break-all`}>{j.error_message}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

export function FineTuning({
  bases,
  initial,
  orgName,
}: {
  bases: FineTuneBaseModel[];
  initial: FineTuneJob[];
  orgName: string;
}) {
  const [jobs, setJobs] = useState<FineTuneJob[]>(initial);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<FineTuneJob | null>(null);
  const [cancelling, setCancelling] = useState(false);
  // Live RunPod inventory — fetched when the create dialog opens. Powers
  // real-time price + availability badges on the GPU dropdown.
  const [gpuInventory, setGpuInventory] = useState<InventoryRow[] | null>(null);
  const [gpuInventoryError, setGpuInventoryError] = useState<string | null>(null);
  // Inline expandable rows — clicking a row toggles its expanded state.
  // Detail panel renders below the summary; we no longer use a popup.
  // All needed fields are in the list response so no per-row fetch.
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    base_model_id: bases[0]?.model_id ?? "",
    method: "lora" as "lora" | "qlora" | "full",
    dataset_url: "",
    gpu_sku: "A40",
    rank: 16,
    alpha: 32,
    lr: 0.0002,
    epochs: 3,
    batch_size: 4,
  });

  const reload = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/inference/fine-tuning/jobs", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load jobs");
      const data = await r.json();
      setJobs(data.data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh while any job is in-flight
  // Fetch live GPU inventory when the create dialog opens (or on mount if
  // already open). Cached for the dialog's lifetime; closing+reopening
  // refetches.
  useEffect(() => {
    if (!createOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/services/gpu/inventory", { credentials: "include" });
        const data = await r.json();
        if (cancelled) return;
        if (!r.ok || !data.ok) {
          setGpuInventoryError(data.error ?? "inventory fetch failed");
          return;
        }
        setGpuInventory(data.inventory ?? []);
        setGpuInventoryError(null);
      } catch (err) {
        if (!cancelled) setGpuInventoryError(err instanceof Error ? err.message : "fetch failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [createOpen]);

  useEffect(() => {
    const inFlight = jobs.some((j) =>
      ["queued", "preparing", "running"].includes(j.status)
    );
    if (!inFlight) return;
    const t = setInterval(reload, 8000);
    return () => clearInterval(t);
  }, [jobs]);

  const create = async () => {
    if (!form.name.trim() || !form.dataset_url.trim()) {
      toast.error("Name and dataset URL are required");
      return;
    }
    setCreating(true);
    try {
      const r = await fetch("/api/inference/fine-tuning/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: form.name.trim(),
          base_model_id: form.base_model_id,
          method: form.method,
          dataset_url: form.dataset_url.trim(),
          gpu_sku: form.gpu_sku,
          hyperparams: {
            rank: form.rank,
            alpha: form.alpha,
            lr: form.lr,
            epochs: form.epochs,
            batch_size: form.batch_size,
          },
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to create job");
      toast.success(`Queued "${form.name}"`);
      setForm({ ...form, name: "", dataset_url: "" });
      setCreateOpen(false);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  const cancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const r = await fetch(`/api/inference/fine-tuning/jobs/${cancelTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to cancel");
      toast.success(`Cancelled "${cancelTarget.name}"`);
      setCancelTarget(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel");
    } finally {
      setCancelling(false);
    }
  };

  // Aggregates
  const running = jobs.filter((j) => j.status === "running" || j.status === "preparing").length;
  const completed = jobs.filter((j) => j.status === "completed").length;
  const failed = jobs.filter((j) => j.status === "failed").length;
  const totalSpent = jobs
    .filter((j) => j.cost_cents !== null)
    .reduce((s, j) => s + (j.cost_cents ?? 0), 0);

  return (
    <PageCanvas>
      <Hero
        breadcrumb={{ label: "Inference", href: "/dashboard/services/inference" }}
        title="Fine-tuning"
        accent="& adapters"
        caption="Train custom LoRA / qLoRA / full-FT adapters on open-weight bases. On completion, the output auto-registers in your catalog as a private model and is callable from the gateway like any other."
        size="md"
        actions={
          <>
            <GhostButton onClick={reload} disabled={loading}>
              <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </GhostButton>
            <PrimaryButton onClick={() => setCreateOpen(true)} disabled={bases.length === 0}>
              <Plus className="h-3.5 w-3.5" />
              New job
            </PrimaryButton>
          </>
        }
      />

      <StatsStrip>
        <StatCell
          label="Jobs"
          value={String(jobs.length)}
          hint="All time, this org"
        />
        <StatCell
          label="In flight"
          value={String(running)}
          hint="Preparing or running"
          accent={running > 0 ? ACCENT : undefined}
        />
        <StatCell
          label="Completed"
          value={String(completed)}
          suffix={jobs.length > 0 ? `/ ${jobs.length}` : undefined}
          hint="Output ready"
          accent={completed > 0 ? "#4ade80" : undefined}
        />
        <StatCell
          label="Compute spent"
          value={formatCents(totalSpent)}
          hint={`${failed} failed`}
        />
      </StatsStrip>


      <SectionHead
        eyebrow="Inventory"
        title="Your"
        accent="training jobs"
        rightMeta={jobs.length > 0 ? `${jobs.length} total · org: ${orgName}` : `org: ${orgName}`}
      />

      {jobs.length > 0 ? (
        <DataTable>
          <div className="hidden md:grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.6fr)] gap-3 px-5 py-2.5 border-b border-white/[0.06]">
            <ColHead>Name</ColHead>
            <ColHead>Base · GPU · Method</ColHead>
            <ColHead>Status</ColHead>
            <ColHead align="right">Duration · Cost</ColHead>
            <ColHead>Output</ColHead>
            <ColHead align="right">Actions</ColHead>
          </div>
          {jobs.map((j) => {
            const s = statusMeta(j.status);
            return (
              <div key={j.id} className="border-b border-white/[0.04] last:border-b-0">
              <div
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button,a")) return;
                  setExpandedJobId(expandedJobId === j.id ? null : j.id);
                }}
                className="grid grid-cols-1 gap-2 px-5 py-3 hover:bg-white/[0.02] cursor-pointer transition-colors md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.6fr)] md:items-center"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <ChevronRight
                      className={`h-3 w-3 shrink-0 text-white/35 transition-transform ${expandedJobId === j.id ? "rotate-90 text-white/70" : ""}`}
                    />
                    <Layers className="h-3.5 w-3.5 shrink-0 text-[#0095FF]/70" />
                    <span className={`${MONO} text-[12.5px] font-semibold text-white truncate`}>
                      {j.name}
                    </span>
                  </div>
                  <span className={`${MONO} block text-[10.5px] text-white/35 mt-0.5`}>
                    {new Date(j.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="min-w-0">
                  <code className={`${MONO} block text-[11.5px] text-white/85 truncate`}>
                    {j.base_model_id}
                  </code>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className={`${MONO} inline-flex items-center gap-1 text-[10px] text-white/55`}
                    >
                      <Cpu className="h-2.5 w-2.5" />
                      {j.gpu_sku}
                    </span>
                    <span className="text-white/20">·</span>
                    <span
                      className={`${MONO} text-[10px] uppercase tracking-[0.1em] text-white/55`}
                    >
                      {j.method}
                    </span>
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full shrink-0 ${s.pulse ? "animate-pulse" : ""}`}
                      style={{
                        background: s.color,
                        boxShadow:
                          s.color === "rgba(255,255,255,0.45)" ? "none" : `0 0 5px ${s.color}`,
                      }}
                    />
                    <span
                      className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] font-semibold`}
                      style={{ color: s.color }}
                    >
                      {s.label}
                    </span>
                    {s.pulse && <Loader2 className="h-3 w-3 animate-spin text-white/40" />}
                  </div>
                  {/* Live progress for running jobs — populated by heartbeat receiver */}
                  {j.status === "running" && j.current_step != null && (
                    <div className="mt-1">
                      <div className={`${MONO} text-[10px] text-white/55 tabular-nums`}>
                        step {j.current_step}
                        {j.max_steps != null && `/${j.max_steps}`}
                        {j.current_epoch != null && ` · ep ${j.current_epoch.toFixed(2)}`}
                        {j.latest_loss != null && ` · loss ${j.latest_loss.toFixed(4)}`}
                      </div>
                      {j.max_steps != null && j.max_steps > 0 && (
                        <div className="mt-1 h-0.5 w-24 bg-white/[0.08] overflow-hidden rounded-full">
                          <div
                            className="h-full bg-[#0095FF] transition-all"
                            style={{
                              width: `${Math.min(100, ((j.current_step ?? 0) / j.max_steps) * 100)}%`,
                              boxShadow: "0 0 4px #0095FF",
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <span style={SERIF_STYLE} className="text-[14px] font-bold text-white tabular-nums">
                    {formatDuration(j.training_seconds)}
                  </span>
                  <span className={`${MONO} block text-[10px] text-white/45`}>
                    {formatCents(j.cost_cents)}
                  </span>
                </div>
                <div className="min-w-0">
                  {j.output_model_id ? (
                    <div>
                      <span className={`${MONO} inline-flex items-center gap-1 text-[10.5px] text-emerald-300/85`}>
                        <CheckCircle2 className="h-2.5 w-2.5" /> Registered
                      </span>
                      {j.training_log_url && (
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const r = await fetch(
                                `/api/inference/fine-tuning/jobs/${j.id}/log-url`,
                                { credentials: "include" }
                              );
                              const data = await r.json();
                              if (!r.ok) throw new Error(data.error ?? "log fetch failed");
                              window.open(data.url, "_blank", "noopener,noreferrer");
                            } catch (err) {
                              toast.error(
                                err instanceof Error ? err.message : "Couldn't fetch log URL"
                              );
                            }
                          }}
                          className={`${MONO} block mt-0.5 text-[10px] text-white/45 hover:text-[#0095FF]`}
                          title="Open training log (1-hour signed URL)"
                        >
                          download log ↗
                        </button>
                      )}
                    </div>
                  ) : j.error_message ? (
                    <span className={`${MONO} block text-[10.5px] text-red-300/75 truncate max-w-[180px]`} title={j.error_message}>
                      {j.error_message}
                    </span>
                  ) : (
                    <span className={`${MONO} text-[10.5px] text-white/30`}>—</span>
                  )}
                </div>
                <div className="flex justify-end gap-1.5">
                  {["queued", "preparing", "running"].includes(j.status) && (
                    <RowActionButton onClick={() => setCancelTarget(j)} variant="danger">
                      <Trash2 className="h-3 w-3" />
                      Cancel
                    </RowActionButton>
                  )}
                </div>
              </div>
              {expandedJobId === j.id && <ExpandedRow job={j} />}
              </div>
            );
          })}
        </DataTable>
      ) : (
        <EmptyState
          title="No fine-tuning jobs yet"
          description="Upload a JSONL dataset to R2 or S3, pick a base model, dial in hyperparams. The output adapter auto-registers in your model catalog when training finishes."
          action={
            <PrimaryButton onClick={() => setCreateOpen(true)} disabled={bases.length === 0}>
              <Plus className="h-3.5 w-3.5" />
              Submit your first job
            </PrimaryButton>
          }
        />
      )}

      {/* Reference cards */}
      <section className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-3">
        <ReferenceCard
          icon={Layers}
          eyebrow="Dataset format"
          title="JSONL chat format"
          body='Each line: {"messages":[{"role":"user","content":"…"},{"role":"assistant","content":"…"}]}. Upload to S3, R2, or a public HTTPS URL.'
        />
        <ReferenceCard
          icon={Cpu}
          eyebrow="GPU choice"
          title="Match GPU to base size"
          body="Llama-4-Scout / 8B / qLoRA: L40S or A40. 70B LoRA: A100 80GB. Llama-4-Maverick or 235B: H100 80GB. Smaller jobs = lower cost."
        />
        <ReferenceCard
          icon={Activity}
          eyebrow="Auto-deploy"
          title="Output becomes a model"
          body="On completion the LoRA is registered as ahura/<base>:ft-<job-id> in your private catalog. Call it from /v1/chat/completions like any model."
        />
      </section>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg border-white/[0.08] bg-[#111216]">
          <DialogHeader>
            <DialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-white/80`}>
              New fine-tuning job
            </DialogTitle>
            <DialogDescription className={`${MONO} text-[11px] text-white/45 leading-relaxed`}>
              Job lands in <span className="text-white/80">queued</span> state and starts running
              automatically as soon as a GPU is allocated. You can leave the page; progress and
              cost will keep updating in the background.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Job name">
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="support-bot-v1"
                  className="bg-white/[0.02] border-white/[0.08]"
                />
              </Field>
              <Field label="Method">
                <Select
                  value={form.method}
                  onValueChange={(v) => setForm({ ...form, method: v as typeof form.method })}
                >
                  <SelectTrigger className="bg-white/[0.02] border-white/[0.08]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lora">LoRA</SelectItem>
                    <SelectItem value="qlora">qLoRA (4-bit)</SelectItem>
                    <SelectItem value="full">Full fine-tune</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Base model">
              <Select
                value={form.base_model_id}
                onValueChange={(v) => setForm({ ...form, base_model_id: v })}
              >
                <SelectTrigger className="bg-white/[0.02] border-white/[0.08]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {bases.map((b) => {
                    const gated = GATED_BASES.has(b.model_id);
                    return (
                      <SelectItem key={b.model_id} value={b.model_id}>
                        <span className="inline-flex items-center gap-2">
                          <span>{b.display_name}</span>
                          {gated && (
                            <span className="text-amber-300/80 text-[10px] uppercase tracking-[0.1em]">
                              approval required
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {GATED_BASES.has(form.base_model_id) && (
                <p className={`${MONO} mt-1 text-[10.5px] text-amber-300/70 leading-snug`}>
                  This model requires you to have been granted access on the
                  upstream catalog. Without it, the training pod will fail to
                  download the weights.{" "}
                  {approvalUrlFor(form.base_model_id) && (
                    <a
                      href={approvalUrlFor(form.base_model_id)!}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-[#0095FF] hover:underline"
                    >
                      Request access ↗
                    </a>
                  )}
                </p>
              )}
            </Field>

            <Field label="Dataset URL (JSONL)">
              <Input
                value={form.dataset_url}
                onChange={(e) => setForm({ ...form, dataset_url: e.target.value })}
                placeholder="s3://my-bucket/train.jsonl  or  https://…/train.jsonl"
                className={`${MONO} bg-white/[0.02] border-white/[0.08] text-[11.5px]`}
              />
            </Field>

            <Field label="GPU SKU">
              <Select
                value={form.gpu_sku}
                onValueChange={(v) => setForm({ ...form, gpu_sku: v })}
              >
                <SelectTrigger className="bg-white/[0.02] border-white/[0.08]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(SKU_TO_RUNPOD_DISPLAY_NAME).map((sku) => {
                    const row = gpuInventory?.find(
                      (r) =>
                        r.cloudType === "SECURE" &&
                        r.displayName === SKU_TO_RUNPOD_DISPLAY_NAME[sku]
                    );
                    const outOfStock = row?.stockStatus === "none";
                    return (
                      <SelectItem
                        key={sku}
                        value={sku}
                        disabled={outOfStock || undefined}
                      >
                        <span className="inline-flex items-center gap-2">
                          <span className="font-medium">{sku}</span>
                          <span className="text-white/45 text-[11px]">
                            — {SKU_BLURB[sku]}
                          </span>
                          {outOfStock && (
                            <span className="text-red-300/70 text-[10px] uppercase tracking-[0.1em]">
                              unavailable
                            </span>
                          )}
                          {row?.stockStatus === "low" && (
                            <span className="text-amber-300/80 text-[10px] uppercase tracking-[0.1em]">
                              limited
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {gpuInventoryError && (
                <p className={`${MONO} mt-1 text-[10px] text-amber-300/60`}>
                  live capacity status unavailable
                </p>
              )}
            </Field>

            <div className="border-t border-white/[0.05] pt-3">
              <p className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/55 mb-2`}>
                Hyperparameters
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="LoRA rank">
                  <Input
                    type="number"
                    value={form.rank}
                    onChange={(e) => setForm({ ...form, rank: Number(e.target.value) || 16 })}
                    className="bg-white/[0.02] border-white/[0.08]"
                  />
                </Field>
                <Field label="LoRA alpha">
                  <Input
                    type="number"
                    value={form.alpha}
                    onChange={(e) => setForm({ ...form, alpha: Number(e.target.value) || 32 })}
                    className="bg-white/[0.02] border-white/[0.08]"
                  />
                </Field>
                <Field label="Learning rate">
                  <Input
                    type="number"
                    step="0.00001"
                    value={form.lr}
                    onChange={(e) => setForm({ ...form, lr: Number(e.target.value) || 0.0002 })}
                    className="bg-white/[0.02] border-white/[0.08]"
                  />
                </Field>
                <Field label="Epochs">
                  <Input
                    type="number"
                    value={form.epochs}
                    onChange={(e) => setForm({ ...form, epochs: Number(e.target.value) || 3 })}
                    className="bg-white/[0.02] border-white/[0.08]"
                  />
                </Field>
                <Field label="Batch size">
                  <Input
                    type="number"
                    value={form.batch_size}
                    onChange={(e) =>
                      setForm({ ...form, batch_size: Number(e.target.value) || 4 })
                    }
                    className="bg-white/[0.02] border-white/[0.08]"
                  />
                </Field>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <GhostButton onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </GhostButton>
            <PrimaryButton
              onClick={create}
              disabled={creating || !form.name.trim() || !form.dataset_url.trim()}
            >
              {creating ? "Queuing…" : "Submit job"}
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!cancelTarget} onOpenChange={() => setCancelTarget(null)}>
        <AlertDialogContent className="border-white/[0.08] bg-[#111216]">
          <AlertDialogHeader>
            <AlertDialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-red-300`}>
              Cancel job
            </AlertDialogTitle>
            <AlertDialogDescription className={`${MONO} text-[11px] text-white/55 leading-relaxed`}>
              Cancelling &quot;{cancelTarget?.name}&quot; sets status to cancelled. Any compute
              already provisioned will be released on the next health check. GPU-seconds
              consumed up to that point are still billed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel
              disabled={cancelling}
              className={`${MONO} h-10 text-[11px] uppercase tracking-[0.12em] border-white/[0.08] bg-white/[0.02] text-white/75 hover:bg-white/[0.06]`}
            >
              Keep running
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={cancel}
              disabled={cancelling}
              className={`${MONO} h-10 text-[11px] uppercase tracking-[0.12em] font-semibold bg-red-600 hover:bg-red-700`}
            >
              {cancelling ? "Cancelling…" : "Cancel job"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </PageCanvas>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className={`${MONO} block mb-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/55`}>
        {label}
      </Label>
      {children}
    </div>
  );
}

function ReferenceCard({
  icon: Icon,
  eyebrow,
  title,
  body,
}: {
  icon: React.ElementType;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-3.5 w-3.5 text-[#0095FF]/70" />
        <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45`}>
          {eyebrow}
        </p>
      </div>
      <h4 className="text-[14.5px] font-semibold tracking-[-0.01em] text-white mb-1.5">{title}</h4>
      <p className={`${MONO} text-[11px] text-white/55 leading-relaxed`}>{body}</p>
    </div>
  );
}

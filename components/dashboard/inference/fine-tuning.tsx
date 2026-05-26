"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
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
  ACCENT_BRIGHT,
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
  is_managed?: boolean | null;
  serving_url?: string | null;
  // Phase 11.B serving-pod lifecycle (Tier 1 per-customer dedicated)
  serving_pod_state?: "provisioning" | "running" | "stopped" | "failed" | null;
  serving_pod_gpu_sku?: string | null;
  serving_pod_started_at?: string | null;
  serving_pod_stopped_at?: string | null;
  serving_pod_hourly_cents?: number | null;
  serving_pod_auto_stop_at?: string | null;
  serving_pod_error_message?: string | null;
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
function ExpandedRow({ job: j, onChanged }: { job: FineTuneJob; onChanged?: () => void }) {
  const hp = (j.hyperparams ?? {}) as Record<string, unknown>;
  const podId = j.pod_id ?? null;

  // ── Hosted-serving lifecycle state (Phase 11.B Tier 1) ─────────
  const [hostedDialogOpen, setHostedDialogOpen] = useState(false);
  const [pickedGpu, setPickedGpu] = useState<string>("A40");
  const [submittingHosted, setSubmittingHosted] = useState(false);

  const podState = j.serving_pod_state ?? "none";
  const podBusy = podState === "provisioning";
  const podLive = podState === "running";

  const provisionHosted = async () => {
    if (!pickedGpu) {
      toast.error("Pick a GPU size");
      return;
    }
    setSubmittingHosted(true);
    try {
      const r = await fetch(`/api/inference/fine-tuning/jobs/${j.id}/serving-pod`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gpu_sku: pickedGpu, auto_stop_hours: 6 }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Could not start serving instance");
      toast.success("Serving instance starting — ready in ~60s");
      setHostedDialogOpen(false);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start serving instance");
    } finally {
      setSubmittingHosted(false);
    }
  };

  const stopHosted = async () => {
    if (!confirm("Stop the serving instance? You'll stop being billed for it immediately. The model will return to self-serve mode.")) return;
    setSubmittingHosted(true);
    try {
      const r = await fetch(`/api/inference/fine-tuning/jobs/${j.id}/serving-pod`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Could not stop instance");
      toast.success("Serving instance stopped");
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not stop instance");
    } finally {
      setSubmittingHosted(false);
    }
  };

  const InfoRow = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
      <div className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/45`}>{k}</div>
      <div className={`${MONO} text-[11.5px] text-white/85 break-all`}>{v}</div>
    </div>
  );

  const adapterR2 = j.output_artifact_url ?? "";
  const baseShort = j.base_model_id.split("/")[1] ?? j.base_model_id;
  // Customer-facing model id used in the SDK snippets. Matches the
  // pattern the FT registration uses when inserting into inference.models.
  const modelCallId = `ahura/${baseShort}:ft-${j.id.slice(0, 8)}`;

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
            k="Model id"
            v={
              <span className="inline-flex items-center gap-2">
                <code className="text-[11px] text-white/85 select-all break-all">
                  {modelCallId}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(modelCallId);
                    toast.success("Copied");
                  }}
                  className={`${MONO} text-[10px] text-white/45 hover:text-white/85`}
                >
                  copy
                </button>
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

          {/* ─── Call from your code ─────────────────────────────
              Pre-filled snippets in the three formats most customers
              start with: cURL for testing, Python for ML workloads,
              TypeScript for product code. Model id is wired in; API
              key stays a placeholder so we never leak a real one. */}
          <div className="mt-5 mb-3 border-t border-white/[0.06] pt-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-white/55`}>
                Call from your code
              </h4>
              <Link
                href={`/dashboard/services/inference/playground?model=${encodeURIComponent(modelCallId)}`}
                className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-[#33adff] hover:text-white inline-flex items-center gap-1`}
              >
                Try in playground →
              </Link>
            </div>
            <CallSnippets modelId={modelCallId} />
            <p className={`${MONO} mt-2 text-[10px] text-white/40 leading-relaxed`}>
              Replace <code className="text-white/60">YOUR_API_KEY</code> with a key from{" "}
              <Link
                href="/dashboard/services/inference/api-keys"
                className="text-[#0095FF] hover:underline"
              >
                API Keys
              </Link>
              . The OpenAI SDK works as-is — just change <code className="text-white/60">base_url</code> + <code className="text-white/60">model</code>.
            </p>
          </div>

          <div className="mt-5 mb-3">
            <h4 className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-white/55 mb-3`}>How to serve</h4>

            <div className="mb-4 pl-5 relative">
              <span className={`${MONO} absolute left-0 top-0 text-[10px] text-[#0095FF] font-bold`}>1.</span>
              <div className={`${MONO} text-[11.5px] text-white/85 mb-1`}>Rent a GPU pod</div>
              <p className={`${MONO} text-[10.5px] text-white/55 leading-relaxed mb-2`}>
                Pick A40 (~$0.40/hr) for 8-14B bases, A100 80GB for 27-32B, H100 for larger MoE.
              </p>
              <Link
                href="/dashboard/services/gpu/deploy"
                className={`${MONO} inline-flex items-center gap-1.5 text-[11px] font-medium text-white bg-[#0095FF] hover:bg-[#33adff] px-3 py-1.5 rounded transition-colors`}
              >
                Open GPU compute → rent a pod
              </Link>
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

          {/* ─── Hosted serving (Phase 11.B Tier 1) ──────────────
              Replaces the Phase 10 docker self-serve for customers who'd
              rather not run their own GPU. Per-customer dedicated
              instance, per-hour billing, customer controls lifecycle. */}
          <div className="mt-6 mb-3 border-t border-white/[0.06] pt-5">
            <div className="flex items-center justify-between mb-2">
              <h4 className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-white/55`}>
                Hosted serving
              </h4>
              <PodStatePill state={podState} />
            </div>

            {podState === "running" || podState === "provisioning" ? (
              <>
                {podState === "provisioning" ? (
                  <ProvisioningBanner startedAt={j.serving_pod_started_at} />
                ) : (
                  <p className={`${MONO} text-[10.5px] text-white/55 leading-relaxed mb-3`}>
                    Calls to the model below now route through your dedicated instance.
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                  <PodStat label="Model id" mono>
                    {j.output_model_id ? `ahura/${baseShort}:ft-${j.id.slice(0, 8)}` : "—"}
                  </PodStat>
                  <PodStat label="GPU">{j.serving_pod_gpu_sku ?? "—"}</PodStat>
                  <PodStat label="Rate">
                    {j.serving_pod_hourly_cents != null
                      ? `$${(j.serving_pod_hourly_cents / 100).toFixed(2)}/hr`
                      : "—"}
                  </PodStat>
                </div>

                <RunningCostMeter
                  startedAt={j.serving_pod_started_at}
                  hourlyCents={j.serving_pod_hourly_cents}
                  live={podLive}
                />

                {j.serving_pod_auto_stop_at && (
                  <p className={`${MONO} text-[10px] text-white/40 mb-3`}>
                    Auto-stops {new Date(j.serving_pod_auto_stop_at).toLocaleString()} if idle (saves you money on forgotten instances)
                  </p>
                )}

                <button
                  type="button"
                  onClick={stopHosted}
                  disabled={submittingHosted || podBusy}
                  className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] font-semibold h-8 px-3 rounded border border-white/[0.08] bg-white/[0.02] text-white/75 hover:bg-white/[0.06] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {submittingHosted ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Stop instance
                </button>
              </>
            ) : podState === "failed" ? (
              <>
                <div className="bg-red-950/40 border border-red-900/40 rounded-[4px] p-3 mb-3">
                  <p className={`${MONO} text-[10.5px] text-red-200/85 leading-relaxed`}>
                    {j.serving_pod_error_message ?? "The serving instance failed to start. Try again with a different GPU size."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setHostedDialogOpen(true)}
                  className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] font-semibold h-8 px-3 rounded text-white transition-colors`}
                  style={{ background: "#0095FF" }}
                >
                  Try again
                </button>
              </>
            ) : (
              <>
                <p className={`${MONO} text-[10.5px] text-white/55 leading-relaxed mb-3`}>
                  Skip the self-serve <code className="text-white/75">docker run</code> above. Start a dedicated serving instance with one click — we handle the GPU, you call the model from your app.
                </p>
                <button
                  type="button"
                  onClick={() => setHostedDialogOpen(true)}
                  className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] font-semibold h-8 px-3 rounded text-white transition-colors`}
                  style={{ background: "#0095FF" }}
                >
                  Start hosted serving
                </button>
              </>
            )}
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
          {/* Pattern-based hint: heartbeat-related failures often mean training was
              still alive but the monitor lost touch. Surface that + link to
              diagnostics so the operator can verify the heartbeat path. */}
          {/heartbeat/i.test(j.error_message) && (
            <div className="mt-2 rounded-[4px] border border-amber-700/40 bg-amber-950/30 p-3 space-y-1.5">
              <p className={`${MONO} text-[10.5px] text-amber-200/85 leading-relaxed`}>
                <strong>This may be a false failure.</strong> The training pod can keep running
                even when the monitor can&apos;t see heartbeats — usually a misconfigured
                Upstash Redis on one side. Common cause: the LKE ft-runner and the Next.js
                receiver point at different Upstash databases.
              </p>
              <p className={`${MONO} text-[10.5px] text-amber-200/70 leading-relaxed`}>
                Open{" "}
                <Link
                  href="/dashboard/services/inference/diagnostics"
                  className="text-[#33adff] hover:underline"
                >
                  Diagnostics
                </Link>{" "}
                and check &quot;Upstash same on both sides&quot; — that has the exact kubectl
                command to align the two.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Start-hosted-serving dialog (Phase 11.B Tier 1) */}
      <Dialog open={hostedDialogOpen} onOpenChange={setHostedDialogOpen}>
        <DialogContent className="max-w-lg border-white/[0.08] bg-[#111216]">
          <DialogHeader>
            <DialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-white/80`}>
              Start hosted serving
            </DialogTitle>
            <DialogDescription className={`${MONO} text-[11px] text-white/45 leading-relaxed`}>
              We&apos;ll provision a dedicated GPU instance to serve your fine-tune.
              You&apos;ll be billed per hour while it&apos;s running. Stop it any time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className={`${MONO} block mb-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/55`}>
                GPU size
              </Label>
              <GpuPicker value={pickedGpu} onChange={setPickedGpu} />
              <p className={`${MONO} mt-1.5 text-[10px] text-white/40 leading-relaxed`}>
                A40 fits 8-14B bases · A100 80GB for 27-32B · H100 for larger.
                Auto-stops after 6 hours of zero requests.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setHostedDialogOpen(false)}
              disabled={submittingHosted}
              className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] font-semibold h-9 px-3 rounded border border-white/[0.08] bg-white/[0.02] text-white/75 hover:bg-white/[0.06] transition-colors`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={provisionHosted}
              disabled={submittingHosted || !pickedGpu}
              className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] font-semibold h-9 px-3 rounded text-white transition-colors disabled:opacity-40`}
              style={{ background: "#0095FF" }}
            >
              {submittingHosted ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {submittingHosted ? "Starting…" : "Start instance"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Hosted-serving sub-components ───────────────────────────────────

function CallSnippets({ modelId }: { modelId: string }) {
  type Lang = "curl" | "python" | "typescript";
  const [lang, setLang] = useState<Lang>("curl");
  const [copied, setCopied] = useState(false);

  const apiBase = "https://api.cs2hvh.com/v1";

  const snippets: Record<Lang, string> = {
    curl: `curl ${apiBase}/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelId}",
    "messages": [
      {"role": "user", "content": "Hello from my fine-tune"}
    ]
  }'`,
    python: `from openai import OpenAI

client = OpenAI(
    base_url="${apiBase}",
    api_key="YOUR_API_KEY",
)

response = client.chat.completions.create(
    model="${modelId}",
    messages=[
        {"role": "user", "content": "Hello from my fine-tune"}
    ],
)

print(response.choices[0].message.content)`,
    typescript: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${apiBase}",
  apiKey: process.env.AHURA_API_KEY,
});

const response = await client.chat.completions.create({
  model: "${modelId}",
  messages: [
    { role: "user", content: "Hello from my fine-tune" },
  ],
});

console.log(response.choices[0].message.content);`,
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippets[lang]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="border border-white/[0.06] bg-black/40 rounded-[5px] overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-1.5">
        <div className="flex">
          {(["curl", "python", "typescript"] as Lang[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`${MONO} h-8 px-3 text-[10px] uppercase tracking-[0.14em] font-semibold transition-colors relative ${
                lang === l ? "text-white" : "text-white/40 hover:text-white/70"
              }`}
            >
              {l}
              {lang === l && (
                <span
                  className="absolute left-2 right-2 bottom-0 h-0.5"
                  style={{ background: ACCENT_BRIGHT, boxShadow: `0 0 6px ${ACCENT_BRIGHT}` }}
                />
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={copy}
          className={`${MONO} h-7 px-2 text-[10px] uppercase tracking-[0.12em] font-semibold inline-flex items-center gap-1 rounded text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors`}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className={`${MONO} px-4 py-3 text-[10.5px] text-white/85 leading-relaxed overflow-x-auto whitespace-pre`}>
        {snippets[lang]}
      </pre>
    </div>
  );
}

function ProvisioningBanner({ startedAt }: { startedAt: string | null | undefined }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const elapsedSec = startedAt
    ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
    : 0;
  // Typical cold-start is 45-90s depending on base model size. Show
  // friendlier copy as it drags on.
  const stage =
    elapsedSec < 30
      ? "Booting GPU and pulling the serving image…"
      : elapsedSec < 75
        ? "Downloading your adapter from storage and warming vLLM…"
        : elapsedSec < 150
          ? "Larger base — still loading model weights into GPU memory…"
          : "Taking longer than expected. If this exceeds 5 minutes, stop the instance and try a different GPU.";
  return (
    <div className="mb-3 rounded-[5px] border border-[#33adff]/25 bg-[#0095FF]/[0.06] p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <Loader2 className="h-3 w-3 animate-spin" style={{ color: ACCENT_BRIGHT }} />
        <span
          className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] font-semibold`}
          style={{ color: ACCENT_BRIGHT }}
        >
          Starting — {String(Math.floor(elapsedSec / 60)).padStart(2, "0")}:{String(elapsedSec % 60).padStart(2, "0")} elapsed
        </span>
      </div>
      <p className={`${MONO} text-[10.5px] text-white/55 leading-relaxed`}>
        {stage} Requests during warm-up return a 503 with{" "}
        <code className="text-white/75">Retry-After: 10</code> — your SDK should retry automatically.
      </p>
    </div>
  );
}

function PodStatePill({ state }: { state: string }) {
  const map: Record<string, { color: string; label: string; pulse?: boolean }> = {
    none:         { color: "rgba(255,255,255,0.35)", label: "Inactive" },
    provisioning: { color: "#33adff", label: "Starting", pulse: true },
    running:      { color: "#22c55e", label: "Running" },
    stopped:      { color: "rgba(255,255,255,0.35)", label: "Stopped" },
    failed:       { color: "#ef4444", label: "Failed" },
  };
  const m = map[state] ?? map.none!;
  return (
    <span className="inline-flex items-center gap-1.5 text-[10.5px]">
      <span
        className={`h-1.5 w-1.5 rounded-full ${m.pulse ? "animate-pulse" : ""}`}
        style={{ background: m.color, boxShadow: `0 0 6px ${m.color}` }}
      />
      <span
        className={`${MONO} uppercase tracking-[0.12em] font-semibold`}
        style={{ color: m.color }}
      >
        {m.label}
      </span>
    </span>
  );
}

function PodStat({ label, mono, children }: { label: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-[4px] border border-white/[0.06] bg-[#0c0d11] px-3 py-2">
      <p className={`${MONO} text-[9.5px] uppercase tracking-[0.14em] text-white/40 mb-1`}>
        {label}
      </p>
      <p className={`${mono ? MONO : ""} text-[11.5px] text-white/85 break-all`}>{children}</p>
    </div>
  );
}

function RunningCostMeter({
  startedAt,
  hourlyCents,
  live,
}: {
  startedAt: string | null | undefined;
  hourlyCents: number | null | undefined;
  live: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [live]);

  if (!startedAt || hourlyCents == null) return null;
  const elapsedSec = Math.max(0, (now - new Date(startedAt).getTime()) / 1000);
  const costCents = (elapsedSec / 3600) * hourlyCents;
  const hh = Math.floor(elapsedSec / 3600);
  const mm = Math.floor((elapsedSec % 3600) / 60);
  const ss = Math.floor(elapsedSec % 60);
  const runtime = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return (
    <div className="grid grid-cols-2 gap-2 mb-3">
      <PodStat label="Runtime">{runtime}</PodStat>
      <PodStat label="Cost so far">${(costCents / 100).toFixed(4)}</PodStat>
    </div>
  );
}

function GpuPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // GPU options — same SKU keys the FT creation page uses. Real-time stock
  // pulled from the inventory API the GPU pages already expose.
  interface InventoryRow {
    sku: string;
    label: string;
    available: number;
    cents_per_hour: number;
  }
  const [inv, setInv] = useState<InventoryRow[] | null>(null);
  const [loadingInv, setLoadingInv] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/services/gpu/inventory", { credentials: "include" });
        const data = await r.json();
        // The inventory endpoint returns a list with provider-specific
        // fields; normalize to what the picker needs.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = (data?.data ?? data ?? []) as any[];
        if (cancelled) return;
        const normalized: InventoryRow[] = raw
          .map((r) => {
            const sku =
              r.sku ?? r.gpu_sku ?? r.id ?? r.name ?? "";
            const available = Number(r.available ?? r.stock ?? 0);
            const cents =
              Number(r.cents_per_hour ?? r.hourly_cents ?? (r.cost_per_hour ? r.cost_per_hour * 100 : 0));
            return {
              sku,
              label: r.label ?? r.display_name ?? sku,
              available,
              cents_per_hour: cents,
            };
          })
          .filter((r) => r.sku);
        setInv(normalized);
      } catch (err) {
        console.warn("[GpuPicker] inventory fetch failed:", err);
        setInv([]);
      } finally {
        if (!cancelled) setLoadingInv(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fallback static list when inventory is unavailable — every SKU the
  // backend knows about (must match GPU_SKU_TO_RUNPOD_TYPE in
  // lib/inference/finetune-runpod.ts).
  const FALLBACK: InventoryRow[] = [
    { sku: "A40",          label: "A40 (48GB)",        available: -1, cents_per_hour: 40 },
    { sku: "L40S",         label: "L40S (48GB)",       available: -1, cents_per_hour: 80 },
    { sku: "RTX-6000-Ada", label: "RTX 6000 Ada (48GB)", available: -1, cents_per_hour: 80 },
    { sku: "A100-40GB",    label: "A100 (40GB)",       available: -1, cents_per_hour: 120 },
    { sku: "A100-80GB",    label: "A100 (80GB)",       available: -1, cents_per_hour: 170 },
    { sku: "H100-80GB",    label: "H100 (80GB)",       available: -1, cents_per_hour: 290 },
  ];
  const rows = (inv && inv.length > 0 ? inv : FALLBACK).filter((r) =>
    FALLBACK.some((f) => f.sku === r.sku)
  );

  if (loadingInv) {
    return (
      <div className={`${MONO} text-[11px] text-white/45 inline-flex items-center gap-2`}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking GPU availability…
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {rows.map((row) => {
        const selected = row.sku === value;
        const oos = row.available === 0;
        return (
          <button
            key={row.sku}
            type="button"
            disabled={oos}
            onClick={() => onChange(row.sku)}
            className={`text-left rounded-[5px] border px-3 py-2.5 transition-colors ${
              selected
                ? "border-[#0095FF]/60 bg-[#0095FF]/[0.08]"
                : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]"
            } ${oos ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className={`${MONO} text-[11.5px] text-white font-semibold`}>{row.label}</span>
              <span
                className={`${MONO} text-[10.5px] tabular-nums`}
                style={{ color: selected ? "#33adff" : "rgba(255,255,255,0.55)" }}
              >
                ${(row.cents_per_hour / 100).toFixed(2)}/hr
              </span>
            </div>
            <div className={`${MONO} text-[9.5px] uppercase tracking-[0.14em] text-white/40`}>
              {row.available === -1
                ? "availability live-checked on start"
                : oos
                  ? "Out of stock"
                  : `${row.available} available now`}
            </div>
          </button>
        );
      })}
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
    const inFlightTraining = jobs.some((j) =>
      ["queued", "preparing", "running"].includes(j.status)
    );
    const inFlightServing = jobs.some(
      (j) => j.serving_pod_state === "provisioning"
    );
    if (!inFlightTraining && !inFlightServing) return;
    // Poll faster while a serving pod is starting (the customer is
    // staring at the dashboard waiting). 3s during serving start-up,
    // 8s otherwise.
    const interval = inFlightServing ? 3000 : 8000;
    const t = setInterval(reload, interval);
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
                    {j.is_managed && (
                      <span
                        className={`${MONO} text-[9px] uppercase tracking-[0.14em] font-semibold px-1.5 py-0.5 rounded shrink-0`}
                        style={{
                          color: "#33adff",
                          background: "rgba(0,149,255,0.10)",
                          border: "1px solid rgba(0,149,255,0.25)",
                        }}
                        title={j.serving_url ?? "Routed via AhuraCloud-operated vLLM"}
                      >
                        Managed
                      </span>
                    )}
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
              {expandedJobId === j.id && <ExpandedRow job={j} onChanged={reload} />}
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

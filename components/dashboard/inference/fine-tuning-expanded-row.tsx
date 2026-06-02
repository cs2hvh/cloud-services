"use client";

/**
 * Inline detail panel that renders below a job row when the user expands
 * it. Replaces the old popup-dialog flow. All data is read from the
 * list-row prop — no per-row fetch.
 *
 * Co-located here: the call-snippet tab (CallSnippets) shown to ready-
 * to-serve adapters, and the GPU picker (GpuPicker) used inside this
 * panel's "start hosted serving" dialog. Both are only used by
 * ExpandedRow, so keeping them in the same file avoids cross-file
 * imports for what's effectively one feature surface.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  ACCENT_BRIGHT,
  MONO,
} from "@/components/dashboard/inference/chrome";
import { customerSafeErrorMessage } from "@/lib/inference/error-messages";
import { copyToClipboard } from "@/lib/utils/safe-clipboard";
import { INFERENCE_API_BASE, SERVING_IMAGE_URI } from "@/lib/inference/branding";
import {
  formatCents,
  formatDuration,
  gpuLabel,
} from "@/components/dashboard/inference/fine-tuning-utils";
import {
  PodStat,
  PodStatePill,
  ProvisioningBanner,
  RunningCostMeter,
} from "@/components/dashboard/inference/fine-tuning-cells";
// Type-only import — TypeScript erases this at runtime so the cycle
// (this file ← fine-tuning.tsx ← FineTuneJob ← this file) is purely
// type-level and never executes.
import type { FineTuneJob } from "@/components/dashboard/inference/fine-tuning";

export function ExpandedRow({
  job: j,
  onChanged,
}: {
  job: FineTuneJob;
  onChanged?: () => void;
}) {
  const confirm = useConfirm();
  const hp = (j.hyperparams ?? {}) as Record<string, unknown>;

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
    if (!(await confirm({ title: "Stop the serving instance?", description: "You'll stop being billed for it immediately. The model will return to self-serve mode.", confirmText: "Stop instance", danger: true }))) return;
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
  ${SERVING_IMAGE_URI}`;

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
  ${SERVING_IMAGE_URI}`;
      await copyToClipboard(fullCmd);
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
          v={`${gpuLabel(j.gpu_sku)}${j.hourly_cost_cents ? ` · $${(j.hourly_cost_cents / 100).toFixed(2)}/hr at provision` : ""}`}
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
                    void copyToClipboard(modelCallId);
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
                    void copyToClipboard(adapterR2);
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
              <div className={`${MONO} text-[11.5px] text-white/85 mb-1`}>Rent a GPU instance</div>
              <p className={`${MONO} text-[10.5px] text-white/55 leading-relaxed mb-2`}>
                Pick A40 (~$0.40/hr) for 8-14B bases, A100 80GB for 27-32B, H100 for larger MoE.
              </p>
              <Link
                href="/dashboard/services/gpu/deploy"
                className={`${MONO} inline-flex items-center gap-1.5 text-[11px] font-medium text-white bg-[#0095FF] hover:bg-[#33adff] px-3 py-1.5 rounded transition-colors`}
              >
                Open GPU compute
              </Link>
            </div>

            <div className="mb-4 pl-5 relative">
              <span className={`${MONO} absolute left-0 top-0 text-[10px] text-[#0095FF] font-bold`}>2.</span>
              <div className={`${MONO} text-[11.5px] text-white/85 mb-1`}>SSH in and run the serving container</div>
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
                Exposes an OpenAI-compatible API on port 8000 with your adapter loaded.
                First boot ~60s (downloads base + adapter). Subsequent requests 1-2s.
              </p>
            </div>

            <div className="pl-5 relative">
              <span className={`${MONO} absolute left-0 top-0 text-[10px] text-[#0095FF] font-bold`}>3.</span>
              <div className={`${MONO} text-[11.5px] text-white/85 mb-1`}>Call your model</div>
              <p className={`${MONO} text-[10.5px] text-white/55 leading-relaxed mb-2`}>
                Once the container is healthy, hit your instance&apos;s exposed port:
              </p>
              <div className="bg-black/60 border border-white/[0.06] rounded-[4px] p-3">
                <pre className={`${MONO} text-[10.5px] text-white/85 whitespace-pre-wrap overflow-x-auto`}>{`curl http://<your-instance-ip>:8000/v1/chat/completions \\
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
                    {customerSafeErrorMessage(j.serving_pod_error_message) || "The serving instance failed to start. Try again with a different GPU size."}
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

      {/* Error — error_message goes through customerSafeErrorMessage() so
          stored strings from older versions of the runner ("No heartbeat
          for >5400s (pod RUNNING)" etc.) get re-rendered with vendor-
          neutral copy. New jobs write clean strings from the runner. */}
      {j.error_message && (
        <div>
          <h4 className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-red-300/85 mb-2`}>
            {j.status === "failed" ? "What happened" : "Notice"}
          </h4>
          <div className="bg-red-950/40 border border-red-900/40 rounded-[4px] p-3">
            <p className={`${MONO} text-[11px] text-red-200/85 leading-relaxed`}>
              {customerSafeErrorMessage(j.error_message)}
            </p>
          </div>
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

// ─── Hosted-serving sub-components (only used by ExpandedRow) ──────

function CallSnippets({ modelId }: { modelId: string }) {
  type Lang = "curl" | "python" | "typescript";
  const [lang, setLang] = useState<Lang>("curl");
  const [copied, setCopied] = useState(false);

  const apiBase = INFERENCE_API_BASE;

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
      await copyToClipboard(snippets[lang]);
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

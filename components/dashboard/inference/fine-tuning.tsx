"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
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
}

export interface FineTuneBaseModel {
  model_id: string;
  display_name: string;
  context_window: number | null;
  input_cents_per_mtok: number | null;
}

const GPU_OPTIONS = [
  { value: "A100-80GB", label: "A100 80GB — large LoRA workhorse" },
  { value: "A100-40GB", label: "A100 40GB — small LoRA, qLoRA" },
  { value: "H100-80GB", label: "H100 80GB — fastest, premium" },
  { value: "L40S", label: "L40S — small qLoRA, very cheap" },
  { value: "A40", label: "A40 — budget tier" },
  { value: "RTX-6000-Ada", label: "RTX 6000 Ada — small jobs, low cost" },
];

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

      {/* Runner status banner (Phase 5.B operator note) */}
      <section className="mb-10">
        <div className="border border-amber-400/15 bg-amber-400/[0.03] rounded-[6px] p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-300/80 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p
              className={`${MONO} text-[11px] uppercase tracking-[0.12em] font-semibold text-amber-200/90`}
            >
              Phase 5.A — jobs API live, runner pending
            </p>
            <p className={`${MONO} mt-1 text-[11px] text-white/55 leading-relaxed`}>
              Jobs created here land in <span className="text-white/80">status=queued</span> and wait for the BullMQ FT runner
              to pick them up. Phase 5.B ships the runner (RunPod pod provisioning with axolotl, dataset
              mount from R2, completion webhook). Until then, jobs accept submissions and the dashboard
              tracks them — useful for testing the API contract.
            </p>
          </div>
        </div>
      </section>

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
              <div
                key={j.id}
                className="grid grid-cols-1 gap-2 px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.6fr)] md:items-center"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
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
                    <span className={`${MONO} inline-flex items-center gap-1 text-[10.5px] text-emerald-300/85`}>
                      <CheckCircle2 className="h-2.5 w-2.5" /> Registered
                    </span>
                  ) : j.error_message ? (
                    <span className={`${MONO} block text-[10.5px] text-red-300/75 truncate max-w-[160px]`}>
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
              Job lands in <span className="text-white/80">queued</span> state. Runner picks it up
              from the BullMQ ft-runner queue and provisions a RunPod pod.
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
                  {bases.map((b) => (
                    <SelectItem key={b.model_id} value={b.model_id}>
                      {b.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  {GPU_OPTIONS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              Cancelling &quot;{cancelTarget?.name}&quot; sets status to cancelled. Any RunPod pod
              already provisioned will be torn down by the runner on its next check. GPU-seconds
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

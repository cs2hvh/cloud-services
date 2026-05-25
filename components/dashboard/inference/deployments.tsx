"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Box,
  CheckCircle2,
  Cpu,
  Globe,
  Loader2,
  Plus,
  RotateCw,
  Sliders,
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

export interface Deployment {
  id: string;
  name: string;
  source: "docker" | "huggingface" | "truss";
  source_ref: string;
  source_revision: string | null;
  gpu_sku: string;
  autoscale: { min_workers: number; max_workers: number; idle_timeout_s: number };
  status: "building" | "deploying" | "active" | "paused" | "failed" | "deleted";
  runpod_endpoint_id: string | null;
  image_uri: string | null;
  model_id: string | null;
  error_message: string | null;
  deployed_at: string | null;
  created_at: string;
  updated_at: string;
}

const GPU_OPTIONS = [
  { value: "A100-80GB", label: "A100 80GB — workhorse" },
  { value: "A100-40GB", label: "A100 40GB — small models" },
  { value: "H100-80GB", label: "H100 80GB — fastest" },
  { value: "L40S", label: "L40S — budget mid-tier" },
  { value: "A40", label: "A40 — budget" },
  { value: "RTX-6000-Ada", label: "RTX 6000 Ada — tiny / dev" },
];

const SOURCE_OPTIONS = [
  { value: "docker" as const, label: "Docker image" },
  { value: "huggingface" as const, label: "HuggingFace repo" },
  { value: "truss" as const, label: "Truss git repo" },
];

function statusMeta(status: Deployment["status"]): { color: string; label: string; pulse?: boolean } {
  if (status === "active") return { color: "#4ade80", label: "Active" };
  if (status === "building") return { color: "#fbbf24", label: "Building", pulse: true };
  if (status === "deploying") return { color: ACCENT, label: "Deploying", pulse: true };
  if (status === "paused") return { color: "rgba(255,255,255,0.5)", label: "Paused" };
  if (status === "failed") return { color: "#f87171", label: "Failed" };
  if (status === "deleted") return { color: "rgba(255,255,255,0.35)", label: "Deleted" };
  return { color: "rgba(255,255,255,0.4)", label: status };
}

function sourceMeta(s: Deployment["source"]): string {
  if (s === "docker") return "Docker";
  if (s === "huggingface") return "HF";
  return "Truss";
}

export function Deployments({
  initial,
  orgName,
}: {
  initial: Deployment[];
  orgName: string;
}) {
  const [items, setItems] = useState<Deployment[]>(initial);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Deployment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [scaleTarget, setScaleTarget] = useState<Deployment | null>(null);
  const [scaleSaving, setScaleSaving] = useState(false);
  const [scaleForm, setScaleForm] = useState({
    min_workers: 0,
    max_workers: 4,
    idle_timeout_s: 60,
  });

  const [form, setForm] = useState({
    name: "",
    source: "docker" as Deployment["source"],
    source_ref: "",
    source_revision: "",
    gpu_sku: "A100-80GB",
    min_workers: 0,
    max_workers: 4,
    idle_timeout_s: 60,
  });

  const reload = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/inference/deployments", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load deployments");
      const data = await r.json();
      setItems(data.data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh while any deployment is mid-flight
  useEffect(() => {
    const inFlight = items.some((d) => ["building", "deploying"].includes(d.status));
    if (!inFlight) return;
    const t = setInterval(reload, 8000);
    return () => clearInterval(t);
  }, [items]);

  const create = async () => {
    if (!form.name.trim() || !form.source_ref.trim()) {
      toast.error("Name and source reference are required");
      return;
    }
    if (form.min_workers > form.max_workers) {
      toast.error("min_workers must be ≤ max_workers");
      return;
    }
    setCreating(true);
    try {
      const r = await fetch("/api/inference/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: form.name.trim(),
          source: form.source,
          source_ref: form.source_ref.trim(),
          source_revision: form.source_revision.trim() || null,
          gpu_sku: form.gpu_sku,
          autoscale: {
            min_workers: form.min_workers,
            max_workers: form.max_workers,
            idle_timeout_s: form.idle_timeout_s,
          },
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        const errMsg = data?.preflight?.errors?.[0] ?? data?.error ?? "Failed to create deployment";
        throw new Error(errMsg);
      }
      const warnings: string[] = data?.preflight?.warnings ?? [];
      toast.success(`Created "${form.name}"`);
      warnings.forEach((w) => toast.warning(w, { duration: 8000 }));
      setForm({ ...form, name: "", source_ref: "", source_revision: "" });
      setCreateOpen(false);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  const openScale = (d: Deployment) => {
    setScaleForm({
      min_workers: d.autoscale.min_workers,
      max_workers: d.autoscale.max_workers,
      idle_timeout_s: d.autoscale.idle_timeout_s,
    });
    setScaleTarget(d);
  };

  const saveScale = async () => {
    if (!scaleTarget) return;
    if (scaleForm.min_workers > scaleForm.max_workers) {
      toast.error("min_workers must be ≤ max_workers");
      return;
    }
    setScaleSaving(true);
    try {
      const r = await fetch(`/api/inference/deployments/${scaleTarget.id}/scale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(scaleForm),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to update scale");
      toast.success(`Updated autoscale for "${scaleTarget.name}"`);
      setScaleTarget(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update scale");
    } finally {
      setScaleSaving(false);
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/inference/deployments/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to delete");
      toast.success(`Tearing down "${deleteTarget.name}"`);
      setDeleteTarget(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  // Aggregates
  const active = items.filter((d) => d.status === "active").length;
  const inFlight = items.filter((d) => ["building", "deploying"].includes(d.status)).length;
  const failed = items.filter((d) => d.status === "failed").length;
  const totalMaxWorkers = items
    .filter((d) => ["active", "deploying"].includes(d.status))
    .reduce((s, d) => s + (d.autoscale?.max_workers ?? 0), 0);

  return (
    <PageCanvas>
      <Hero
        breadcrumb={{ label: "Inference", href: "/dashboard/services/inference" }}
        title="BYO deploys"
        accent="& endpoints"
        caption="Bring any Docker image, HuggingFace model, or Truss bundle. We provision a managed serverless endpoint with autoscale, register it in your catalog, and route calls through the same gateway as the rest of your models."
        size="md"
        actions={
          <>
            <GhostButton onClick={reload} disabled={loading}>
              <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </GhostButton>
            <PrimaryButton onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              New deployment
            </PrimaryButton>
          </>
        }
      />

      <StatsStrip>
        <StatCell label="Deployments" value={String(items.length)} hint="All time, this org" />
        <StatCell
          label="Active"
          value={String(active)}
          suffix={items.length > 0 ? `/ ${items.length}` : undefined}
          hint="Serving traffic"
          accent={active > 0 ? "#4ade80" : undefined}
        />
        <StatCell
          label="In flight"
          value={String(inFlight)}
          hint="Building or deploying"
          accent={inFlight > 0 ? ACCENT : undefined}
        />
        <StatCell
          label="Max workers"
          value={String(totalMaxWorkers)}
          hint={`${failed} failed`}
        />
      </StatsStrip>

      {/* Operator note — until Phase 6.G ships, deployments will stall in 'building' */}
      <section className="mb-10">
        <div className="border border-amber-400/15 bg-amber-400/[0.03] rounded-[6px] p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-300/80 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className={`${MONO} text-[11px] uppercase tracking-[0.12em] font-semibold text-amber-200/90`}>
              Phase 6.A–F — API live, deploy-runner pending
            </p>
            <p className={`${MONO} mt-1 text-[11px] text-white/55 leading-relaxed`}>
              Deployments created here land in <span className="text-white/80">status=building</span>. The
              compute-provisioning worker that turns these queued rows into live endpoints and
              registers the resulting model in the catalog is the next milestone — until then rows
              sit pending. Pre-flight checks (image manifest, source-registry probes) are fully
              active, so bad inputs still get rejected at create time.
            </p>
          </div>
        </div>
      </section>

      <SectionHead
        eyebrow="Inventory"
        title="Your"
        accent="deployments"
        rightMeta={items.length > 0 ? `${items.length} total · org: ${orgName}` : `org: ${orgName}`}
      />

      {items.length > 0 ? (
        <DataTable>
          <div className="hidden md:grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.6fr)_minmax(0,0.7fr)] gap-3 px-5 py-2.5 border-b border-white/[0.06]">
            <ColHead>Name</ColHead>
            <ColHead>Source · GPU</ColHead>
            <ColHead>Status</ColHead>
            <ColHead align="right">Workers (min/max)</ColHead>
            <ColHead>Endpoint</ColHead>
            <ColHead align="right">Actions</ColHead>
          </div>
          {items.map((d) => {
            const s = statusMeta(d.status);
            return (
              <div
                key={d.id}
                className="grid grid-cols-1 gap-2 px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.6fr)_minmax(0,0.7fr)] md:items-center"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Box className="h-3.5 w-3.5 shrink-0 text-[#0095FF]/70" />
                    <span className={`${MONO} text-[12.5px] font-semibold text-white truncate`}>
                      {d.name}
                    </span>
                  </div>
                  <span className={`${MONO} block text-[10.5px] text-white/35 mt-0.5`}>
                    {new Date(d.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="min-w-0">
                  <code className={`${MONO} block text-[11.5px] text-white/85 truncate`}>
                    {d.source_ref}
                    {d.source_revision ? `:${d.source_revision}` : ""}
                  </code>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`${MONO} inline-flex items-center gap-1 text-[10px] text-white/55`}>
                      <Cpu className="h-2.5 w-2.5" />
                      {d.gpu_sku}
                    </span>
                    <span className="text-white/20">·</span>
                    <span className={`${MONO} text-[10px] uppercase tracking-[0.1em] text-white/55`}>
                      {sourceMeta(d.source)}
                    </span>
                  </div>
                </div>
                <div className="inline-flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full shrink-0 ${s.pulse ? "animate-pulse" : ""}`}
                    style={{
                      background: s.color,
                      boxShadow: s.color.startsWith("rgba(255,255,255") ? "none" : `0 0 5px ${s.color}`,
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
                    {d.autoscale.min_workers} / {d.autoscale.max_workers}
                  </span>
                  <span className={`${MONO} block text-[10px] text-white/45`}>
                    idle {d.autoscale.idle_timeout_s}s
                  </span>
                </div>
                <div className="min-w-0">
                  {d.runpod_endpoint_id ? (
                    <span
                      className={`${MONO} inline-flex items-center gap-1 text-[10.5px] text-emerald-300/85`}
                      title="Serverless endpoint id (internal)"
                    >
                      <Globe className="h-2.5 w-2.5" />
                      <span className="truncate max-w-[120px]">{d.runpod_endpoint_id.slice(0, 12)}</span>
                    </span>
                  ) : d.error_message ? (
                    <span className={`${MONO} block text-[10.5px] text-red-300/75 truncate max-w-[160px]`}>
                      {d.error_message}
                    </span>
                  ) : (
                    <span className={`${MONO} text-[10.5px] text-white/30`}>—</span>
                  )}
                  {d.model_id && (
                    <span className={`${MONO} inline-flex items-center gap-1 text-[10px] text-white/50 mt-0.5`}>
                      <CheckCircle2 className="h-2.5 w-2.5" /> in catalog
                    </span>
                  )}
                </div>
                <div className="flex justify-end gap-1.5">
                  {d.status !== "deleted" && d.status !== "failed" && (
                    <RowActionButton onClick={() => openScale(d)}>
                      <Sliders className="h-3 w-3" />
                      Scale
                    </RowActionButton>
                  )}
                  {d.status !== "deleted" && (
                    <RowActionButton onClick={() => setDeleteTarget(d)} variant="danger">
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </RowActionButton>
                  )}
                </div>
              </div>
            );
          })}
        </DataTable>
      ) : (
        <EmptyState
          title="No deployments yet"
          description="Deploy any open-weight model, custom container, or Truss bundle. Endpoints auto-register in your model catalog and route through the same gateway as the rest of inference."
          action={
            <PrimaryButton onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Create first deployment
            </PrimaryButton>
          }
        />
      )}

      {/* ── Create dialog ────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New deployment</DialogTitle>
            <DialogDescription>
              Provision a managed serverless endpoint from a Docker image, HuggingFace repo,
              or Truss bundle. Pre-flight validates the source before queueing.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="md:col-span-2">
              <Label htmlFor="dep-name">Name *</Label>
              <Input
                id="dep-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="prod-llama-3-8b"
                maxLength={64}
              />
              <p className={`${MONO} text-[10px] text-white/40 mt-1`}>
                Lowercase letters, digits, underscores, hyphens. Must be unique in your org.
              </p>
            </div>

            <div>
              <Label>Source type *</Label>
              <Select
                value={form.source}
                onValueChange={(v) => setForm({ ...form, source: v as Deployment["source"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>GPU</Label>
              <Select value={form.gpu_sku} onValueChange={(v) => setForm({ ...form, gpu_sku: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GPU_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="dep-ref">
                {form.source === "docker"
                  ? "Image reference *"
                  : form.source === "huggingface"
                    ? "HF model id *"
                    : "Git repo URL *"}
              </Label>
              <Input
                id="dep-ref"
                value={form.source_ref}
                onChange={(e) => setForm({ ...form, source_ref: e.target.value })}
                placeholder={
                  form.source === "docker"
                    ? "ghcr.io/your-org/your-image:latest"
                    : form.source === "huggingface"
                      ? "meta-llama/Llama-3.3-8B-Instruct"
                      : "https://github.com/your-org/truss-bundle"
                }
              />
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="dep-rev">Revision / tag (optional)</Label>
              <Input
                id="dep-rev"
                value={form.source_revision}
                onChange={(e) => setForm({ ...form, source_revision: e.target.value })}
                placeholder={form.source === "docker" ? "Defaults to tag in ref" : "git sha or branch"}
              />
            </div>

            <div>
              <Label>Min workers</Label>
              <Input
                type="number"
                min={0}
                max={50}
                value={form.min_workers}
                onChange={(e) => setForm({ ...form, min_workers: Number(e.target.value) })}
              />
              <p className={`${MONO} text-[10px] text-white/40 mt-1`}>
                ≥1 keeps a warm worker (eliminates cold starts; pay always-on).
              </p>
            </div>
            <div>
              <Label>Max workers</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={form.max_workers}
                onChange={(e) => setForm({ ...form, max_workers: Number(e.target.value) })}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Idle timeout (seconds)</Label>
              <Input
                type="number"
                min={5}
                max={3600}
                value={form.idle_timeout_s}
                onChange={(e) => setForm({ ...form, idle_timeout_s: Number(e.target.value) })}
              />
              <p className={`${MONO} text-[10px] text-white/40 mt-1`}>
                How long a worker stays warm after the last request before scaling down.
              </p>
            </div>
          </div>
          <DialogFooter>
            <GhostButton onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </GhostButton>
            <PrimaryButton onClick={create} disabled={creating}>
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Create deployment
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Scale dialog ──────────────────────────────────────────── */}
      <Dialog open={!!scaleTarget} onOpenChange={(o) => !o && setScaleTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Scale <span className="font-mono text-[#0095FF]">{scaleTarget?.name}</span>
            </DialogTitle>
            <DialogDescription>
              Updates the autoscale config and applies it to the live endpoint.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div>
              <Label>Min workers</Label>
              <Input
                type="number"
                min={0}
                max={50}
                value={scaleForm.min_workers}
                onChange={(e) => setScaleForm({ ...scaleForm, min_workers: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Max workers</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={scaleForm.max_workers}
                onChange={(e) => setScaleForm({ ...scaleForm, max_workers: Number(e.target.value) })}
              />
            </div>
            <div className="col-span-2">
              <Label>Idle timeout (seconds)</Label>
              <Input
                type="number"
                min={5}
                max={3600}
                value={scaleForm.idle_timeout_s}
                onChange={(e) => setScaleForm({ ...scaleForm, idle_timeout_s: Number(e.target.value) })}
              />
            </div>
          </div>
          <DialogFooter>
            <GhostButton onClick={() => setScaleTarget(null)} disabled={scaleSaving}>
              Cancel
            </GhostButton>
            <PrimaryButton onClick={saveScale} disabled={scaleSaving}>
              {scaleSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sliders className="h-3.5 w-3.5" />}
              Apply
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ───────────────────────────────────────── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Tear down <span className="font-mono text-[#0095FF]">{deleteTarget?.name}</span>?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This terminates the serving endpoint (workers stop billing within ~30s),
              unregisters the model from your catalog, and marks the deployment deleted.
              The action is asynchronous — the row will move to <span className="font-mono text-white/80">paused</span> first,
              then <span className="font-mono text-white/80">deleted</span> once teardown completes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageCanvas>
  );
}

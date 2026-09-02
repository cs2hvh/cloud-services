"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Database, Plus, RotateCw, Trash2 } from "lucide-react";
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
  CodeChip,
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

export interface VectorCollection {
  id: string;
  name: string;
  description: string | null;
  dimensions: number;
  distance_metric: string;
  embedding_model_id: string;
  row_count: number;
  size_bytes: number;
  created_at: string;
}

export interface EmbeddingModelOption {
  model_id: string;
  display_name: string;
  dimensions: number;
  context_window: number | null;
  input_cents_per_mtok: number | null;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function VectorCollections({
  models,
  initial,
  orgName,
}: {
  models: EmbeddingModelOption[];
  initial: VectorCollection[];
  orgName: string;
}) {
  const [collections, setCollections] = useState<VectorCollection[]>(initial);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VectorCollection | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    embedding_model_id: models[0]?.model_id ?? "",
    dimensions: models[0]?.dimensions ?? 1536,
    distance_metric: "cosine" as "cosine" | "l2" | "inner_product",
  });

  // Keep dimensions in sync with selected model
  useEffect(() => {
    const m = models.find((x) => x.model_id === form.embedding_model_id);
    if (m && m.dimensions !== form.dimensions) {
      setForm((f) => ({ ...f, dimensions: m.dimensions }));
    }
  }, [form.embedding_model_id, models, form.dimensions]);

  const reload = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/inference/vector/collections", {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to load collections");
      const data = await r.json();
      setCollections(data.data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const create = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!form.embedding_model_id) {
      toast.error("Pick an embedding model");
      return;
    }
    setCreating(true);
    try {
      const r = await fetch("/api/inference/vector/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          embedding_model_id: form.embedding_model_id,
          dimensions: form.dimensions,
          distance_metric: form.distance_metric,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to create");
      toast.success(`Created "${form.name}"`);
      setForm({
        name: "",
        description: "",
        embedding_model_id: models[0]?.model_id ?? "",
        dimensions: models[0]?.dimensions ?? 1536,
        distance_metric: "cosine",
      });
      setCreateOpen(false);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/inference/vector/collections/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to delete");
      toast.success(`Deleted "${deleteTarget.name}"`);
      setDeleteTarget(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  // Aggregates
  const totalRows = collections.reduce((s, c) => s + c.row_count, 0);
  const totalSize = collections.reduce((s, c) => s + c.size_bytes, 0);
  const distinctModels = new Set(collections.map((c) => c.embedding_model_id)).size;

  return (
    <PageCanvas>
      <Hero
        breadcrumb={{ label: "Inference", href: "/dashboard/services/inference" }}
        title="Vector"
        accent="collections"
        caption="Managed pgvector with per-tenant logical isolation. Create a collection, embed your content, query for nearest neighbors. RAG primitives without the infra."
        size="md"
        actions={
          <>
            <GhostButton onClick={reload} disabled={loading}>
              <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </GhostButton>
            <PrimaryButton onClick={() => setCreateOpen(true)} disabled={models.length === 0}>
              <Plus className="h-3.5 w-3.5" />
              New collection
            </PrimaryButton>
          </>
        }
      />

      <StatsStrip>
        <StatCell label="Collections" value={String(collections.length)} hint="Total managed" />
        <StatCell
          label="Vector rows"
          value={totalRows.toLocaleString()}
          hint="Indexed embeddings"
          accent={ACCENT}
        />
        <StatCell
          label="Storage"
          value={formatBytes(totalSize)}
          hint="Approximate"
        />
        <StatCell
          label="Embedding models"
          value={String(distinctModels)}
          hint={distinctModels > 0 ? "Distinct in use" : "None yet"}
        />
      </StatsStrip>

      <SectionHead
        title="Your"
        accent="collections"
        rightMeta={
          collections.length > 0 ? `${collections.length} collections · org: ${orgName}` : `org: ${orgName}`
        }
      />

      {models.length === 0 ? (
        <EmptyState
          title="No embedding models in catalog"
          description="Apply the Phase 4 migration to seed text-embedding-3-small/large/ada-002 before creating collections."
        />
      ) : collections.length > 0 ? (
        <DataTable>
          <div className="hidden md:grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.5fr)] gap-3 px-5 py-2.5 border-b border-white/[0.06]">
            <ColHead>Name</ColHead>
            <ColHead>Embedding model</ColHead>
            <ColHead align="right">Dims · Metric</ColHead>
            <ColHead align="right">Rows · Size</ColHead>
            <ColHead>Created</ColHead>
            <ColHead align="right">Actions</ColHead>
          </div>
          {collections.map((c) => (
            <div
              key={c.id}
              className="grid grid-cols-1 gap-2 px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.5fr)] md:items-center"
            >
              <div className="min-w-0">
                <Link
                  href={`/dashboard/services/inference/vectors/${c.id}`}
                  className="flex items-center gap-1.5 group"
                >
                  <Database className="h-3.5 w-3.5 shrink-0 text-[#0095FF]/70" />
                  <span className={`${MONO} text-[12.5px] font-semibold text-white truncate group-hover:text-[#33adff] transition-colors`}>
                    {c.name}
                  </span>
                </Link>
                {c.description && (
                  <span className={`${MONO} block text-[10.5px] text-white/40 mt-0.5 truncate`}>
                    {c.description}
                  </span>
                )}
              </div>
              <code className={`${MONO} text-[11.5px] text-white/65 truncate`}>
                {c.embedding_model_id}
              </code>
              <div className="text-right">
                <span style={SERIF_STYLE} className="text-[14px] font-bold text-white tabular-nums">
                  {c.dimensions}
                </span>
                <span className={`${MONO} block text-[10px] text-white/45 uppercase tracking-[0.1em]`}>
                  {c.distance_metric}
                </span>
              </div>
              <div className="text-right">
                <span style={SERIF_STYLE} className="text-[14px] font-bold text-white tabular-nums">
                  {c.row_count.toLocaleString()}
                </span>
                <span className={`${MONO} block text-[10px] text-white/45`}>
                  {formatBytes(c.size_bytes)}
                </span>
              </div>
              <span className={`${MONO} text-[11px] text-white/55`}>
                {new Date(c.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <div className="flex justify-end gap-1.5">
                <RowActionButton onClick={() => setDeleteTarget(c)} variant="danger">
                  <Trash2 className="h-3 w-3" />
                  Delete
                </RowActionButton>
              </div>
            </div>
          ))}
        </DataTable>
      ) : (
        <EmptyState
          title="No collections yet"
          description="Create one to start storing embeddings. Pick an embedding model, give it a name, and upsert your first vector via the API."
          action={
            <PrimaryButton onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Create your first collection
            </PrimaryButton>
          }
        />
      )}

      {/* How to use */}
      <section className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-3">
        <UsageCard
          title="Push vectors via the API"
          body="POST /api/inference/vector/collections/{id}/upsert with rows containing external_id + content (server auto-embeds) or external_id + embedding (pre-computed). Up to 100 rows per batch."
        />
        <UsageCard
          title="Search by similarity"
          body="POST /api/inference/vector/collections/{id}/query with text or embedding + top_k + min_similarity. Returns ranked matches with content + metadata."
        />
      </section>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md border-white/[0.08] bg-[#111216]">
          <DialogHeader>
            <DialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-white/80`}>
              New collection
            </DialogTitle>
            <DialogDescription className={`${MONO} text-[11px] text-white/45 leading-relaxed`}>
              Pick an embedding model first — dimensions are derived from its capabilities.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="product-docs"
                className="bg-white/[0.02] border-white/[0.08]"
              />
            </Field>
            <Field label="Description (optional)">
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Product documentation embeddings"
                className="bg-white/[0.02] border-white/[0.08]"
              />
            </Field>
            <Field label="Embedding model">
              <Select
                value={form.embedding_model_id}
                onValueChange={(v) => setForm({ ...form, embedding_model_id: v })}
              >
                <SelectTrigger className="bg-white/[0.02] border-white/[0.08]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.model_id} value={m.model_id}>
                      {m.display_name} ({m.dimensions} dim)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dimensions">
                <Input
                  type="number"
                  value={form.dimensions}
                  onChange={(e) =>
                    setForm({ ...form, dimensions: Number.parseInt(e.target.value, 10) || 0 })
                  }
                  className="bg-white/[0.02] border-white/[0.08]"
                />
                <p className={`${MONO} mt-1 text-[10px] text-white/40`}>
                  Auto-set from model
                </p>
              </Field>
              <Field label="Distance metric">
                <Select
                  value={form.distance_metric}
                  onValueChange={(v) =>
                    setForm({ ...form, distance_metric: v as typeof form.distance_metric })
                  }
                >
                  <SelectTrigger className="bg-white/[0.02] border-white/[0.08]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cosine">Cosine (recommended)</SelectItem>
                    <SelectItem value="l2">L2 (Euclidean)</SelectItem>
                    <SelectItem value="inner_product">Inner product</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <GhostButton onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </GhostButton>
            <PrimaryButton onClick={create} disabled={creating || !form.name.trim()}>
              {creating ? "Creating…" : "Create collection"}
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="border-white/[0.08] bg-[#111216]">
          <AlertDialogHeader>
            <AlertDialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-red-300`}>
              Delete collection
            </AlertDialogTitle>
            <AlertDialogDescription className={`${MONO} text-[11px] text-white/55 leading-relaxed`}>
              Deleting &quot;{deleteTarget?.name}&quot; removes the collection and ALL{" "}
              {deleteTarget?.row_count.toLocaleString()} vector rows. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel
              disabled={deleting}
              className={`${MONO} h-10 text-[11px] uppercase tracking-[0.12em] border-white/[0.08] bg-white/[0.02] text-white/75 hover:bg-white/[0.06]`}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              disabled={deleting}
              className={`${MONO} h-10 text-[11px] uppercase tracking-[0.12em] font-semibold bg-red-600 hover:bg-red-700`}
            >
              {deleting ? "Deleting…" : "Delete forever"}
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

function UsageCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5">
      <h4 className="text-[14.5px] font-semibold tracking-[-0.01em] text-white mb-1.5">{title}</h4>
      <p className={`${MONO} text-[11px] text-white/55 leading-relaxed`}>{body}</p>
    </div>
  );
}

// Keep CodeChip import lint-happy (used in expanded views later)
const _u = CodeChip;
void _u;

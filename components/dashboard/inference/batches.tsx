"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  FileText,
  Loader2,
  Play,
  Plus,
  RotateCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

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
import {
  formatBytes,
  formatRelative,
} from "@/components/dashboard/inference/batches-utils";
import {
  ExpandedRow,
  Field,
} from "@/components/dashboard/inference/batches-cells";

// ─── Types (mirror server loader) ──────────────────────────────────

export type BatchStatus =
  | "validating"
  | "failed"
  | "in_progress"
  | "finalizing"
  | "completed"
  | "expired"
  | "cancelling"
  | "cancelled";

export interface BatchListItem {
  id: string;
  endpoint: string;
  status: BatchStatus;
  input_file_id: string;
  output_file_id: string | null;
  error_file_id: string | null;
  counts: { total: number; completed: number; failed: number };
  metadata: Record<string, string>;
  created_at: string;
  completed_at: string | null;
  failed_at: string | null;
  cancelled_at: string | null;
  expires_at: string;
}

export interface BatchFileOption {
  id: string;
  filename: string;
  bytes: number;
  created_at: string;
}

const ENDPOINTS: Array<{ value: string; label: string; description: string }> = [
  {
    value: "/v1/chat/completions",
    label: "Chat completions",
    description: "Each line: { custom_id, method, url, body } where body is a chat request.",
  },
  {
    value: "/v1/embeddings",
    label: "Embeddings",
    description: "Each line: { custom_id, method, url, body } where body is an embeddings request.",
  },
];

const STATUS_COLOR: Record<BatchStatus, string> = {
  validating: "#94a3b8",
  in_progress: ACCENT_BRIGHT,
  finalizing: "#22d3ee",
  completed: "#22c55e",
  failed: "#ef4444",
  expired: "#f59e0b",
  cancelling: "#f59e0b",
  cancelled: "rgba(255,255,255,0.35)",
};

const TERMINAL: BatchStatus[] = ["completed", "failed", "expired", "cancelled"];
const CANCELLABLE: BatchStatus[] = ["validating", "in_progress", "finalizing"];

// ─── Component ─────────────────────────────────────────────────────

export function Batches({
  initialBatches,
  initialFiles,
  orgName,
}: {
  initialBatches: BatchListItem[];
  initialFiles: BatchFileOption[];
  orgName: string;
}) {
  const [batches, setBatches] = useState(initialBatches);
  const [files, setFiles] = useState(initialFiles);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [existingFileId, setExistingFileId] = useState<string>("");
  const [endpoint, setEndpoint] = useState(ENDPOINTS[0]!.value);

  const [cancelTarget, setCancelTarget] = useState<BatchListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BatchListItem | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Periodic refresh while ANY batch is in a non-terminal state — the
  // processor mutates request_counts as it goes, so the dashboard reflects
  // progress without a manual reload.
  const hasInFlight = useMemo(
    () => batches.some((b) => !TERMINAL.includes(b.status)),
    [batches]
  );

  const reload = async () => {
    setRefreshing(true);
    try {
      const [b, f] = await Promise.all([
        fetch("/api/inference/batches", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/inference/files?purpose=batch", { credentials: "include" }).then((r) => r.json()),
      ]);
      setBatches(
        (b.data ?? []).map((row: Record<string, unknown>) => ({
          id: row.id as string,
          endpoint: row.endpoint as string,
          status: row.status as BatchStatus,
          input_file_id: row.input_file_id as string,
          output_file_id: (row.output_file_id as string | undefined) ?? null,
          error_file_id: (row.error_file_id as string | undefined) ?? null,
          counts: (row.request_counts ?? { total: 0, completed: 0, failed: 0 }) as BatchListItem["counts"],
          metadata: (row.metadata ?? {}) as Record<string, string>,
          created_at: row.created_at
            ? new Date(((row.created_at as number) * 1000)).toISOString()
            : new Date().toISOString(),
          completed_at: row.completed_at
            ? new Date(((row.completed_at as number) * 1000)).toISOString()
            : null,
          failed_at: row.failed_at
            ? new Date(((row.failed_at as number) * 1000)).toISOString()
            : null,
          cancelled_at: row.cancelled_at
            ? new Date(((row.cancelled_at as number) * 1000)).toISOString()
            : null,
          expires_at: new Date(((row.expires_at as number) * 1000)).toISOString(),
        }))
      );
      setFiles(
        (f.data ?? []).map((row: Record<string, unknown>) => ({
          id: row.id as string,
          filename: row.filename as string,
          bytes: Number(row.bytes ?? 0),
          created_at: row.created_at
            ? new Date(((row.created_at as number) * 1000)).toISOString()
            : new Date().toISOString(),
        }))
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!hasInFlight) return;
    const t = window.setInterval(() => void reload(), 5_000);
    return () => window.clearInterval(t);
  }, [hasInFlight]);

  // ── Create flow ────────────────────────────────────────────────
  const createBatch = async () => {
    setCreating(true);
    try {
      let fileId = existingFileId;
      if (pickedFile) {
        setUploading(true);
        const form = new FormData();
        form.set("file", pickedFile);
        form.set("purpose", "batch");
        const r = await fetch("/api/inference/files", {
          method: "POST",
          credentials: "include",
          body: form,
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Upload failed");
        fileId = data.id as string;
        setUploading(false);
      }
      if (!fileId) {
        toast.error("Pick an existing file or upload a new one");
        return;
      }
      const r = await fetch("/api/inference/batches", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input_file_id: fileId,
          endpoint,
          completion_window: "24h",
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Create failed");
      toast.success(`Batch ${data.id.slice(0, 16)}… created`);
      setCreateOpen(false);
      setPickedFile(null);
      setExistingFileId("");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
      setUploading(false);
    }
  };

  // ── Per-row actions ────────────────────────────────────────────
  const processBatch = async (id: string) => {
    setProcessingId(id);
    try {
      const r = await fetch(`/api/inference/batches/${id}/process`, {
        method: "POST",
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Process failed");
      toast.success(
        `Processed: ${data.request_counts?.completed ?? "?"} ok, ${data.request_counts?.failed ?? "?"} failed`
      );
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Process failed");
    } finally {
      setProcessingId(null);
    }
  };

  const cancelBatch = async () => {
    if (!cancelTarget) return;
    try {
      const r = await fetch(`/api/inference/batches/${cancelTarget.id}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Cancel failed");
      toast.success("Cancel requested");
      setCancelTarget(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed");
    }
  };

  const deleteBatch = async () => {
    if (!deleteTarget) return;
    try {
      const r = await fetch(`/api/inference/batches/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Delete failed");
      toast.success("Batch deleted");
      setDeleteTarget(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const downloadFile = async (fileId: string, suggestedName: string) => {
    try {
      const r = await fetch(`/api/inference/files/${fileId}/content`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const data = await r.json();
      if (!r.ok || !data.url) throw new Error(data.error ?? "Could not get download URL");
      // Trigger browser download
      const a = document.createElement("a");
      a.href = data.url;
      a.download = suggestedName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    }
  };

  // ─── Stats ────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const total = batches.length;
    const inFlight = batches.filter((b) => !TERMINAL.includes(b.status)).length;
    const completed = batches.filter((b) => b.status === "completed").length;
    const failed = batches.filter((b) => b.status === "failed").length;
    return { total, inFlight, completed, failed };
  }, [batches]);

  return (
    <PageCanvas>
      <Hero
        breadcrumb={{ label: "Inference", href: "/dashboard/services/inference" }}
        title="Batches"
        accent="async jobs"
        caption="OpenAI-compatible batch endpoint. Upload a JSONL of requests, run them in the background at a 50% discount, download the results when ready."
        size="md"
        actions={
          <>
            <GhostButton onClick={reload} disabled={refreshing}>
              <RotateCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </GhostButton>
            <PrimaryButton onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              New batch
            </PrimaryButton>
          </>
        }
      />

      <StatsStrip>
        <StatCell label="Total" value={String(totals.total)} hint="All batches" />
        <StatCell label="In flight" value={String(totals.inFlight)} hint="Not yet terminal" accent={ACCENT} />
        <StatCell label="Completed" value={String(totals.completed)} hint="Successfully finished" />
        <StatCell label="Failed" value={String(totals.failed)} hint="Validation or runtime error" />
      </StatsStrip>

      <SectionHead
        eyebrow="Inventory"
        title="Your"
        accent="batches"
        rightMeta={
          batches.length > 0
            ? `${batches.length} recent · org: ${orgName}`
            : `org: ${orgName}`
        }
      />

      {batches.length > 0 ? (
        <DataTable>
          <div className="hidden md:grid grid-cols-[24px_minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,0.6fr)_minmax(0,0.6fr)_minmax(0,0.6fr)] gap-3 px-5 py-2.5 border-b border-white/[0.06]">
            <span />
            <ColHead>Batch</ColHead>
            <ColHead>Endpoint</ColHead>
            <ColHead align="right">Progress</ColHead>
            <ColHead>Status</ColHead>
            <ColHead>Created</ColHead>
            <ColHead align="right">Actions</ColHead>
          </div>
          {batches.map((b) => {
            const expanded = expandedId === b.id;
            const pct =
              b.counts.total > 0
                ? Math.round(((b.counts.completed + b.counts.failed) / b.counts.total) * 100)
                : 0;
            return (
              <div key={b.id}>
                <div
                  className="grid grid-cols-1 gap-2 px-5 py-3 border-b border-white/[0.04] hover:bg-white/[0.015] transition-colors cursor-pointer md:grid-cols-[24px_minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,0.6fr)_minmax(0,0.6fr)_minmax(0,0.6fr)] md:items-center"
                  onClick={() => setExpandedId(expanded ? null : b.id)}
                >
                  <ChevronRight
                    className={`h-3.5 w-3.5 text-white/45 transition-transform ${
                      expanded ? "rotate-90" : ""
                    }`}
                  />
                  <code className={`${MONO} text-[11.5px] text-white/85 truncate`}>{b.id}</code>
                  <code className={`${MONO} text-[10.5px] text-white/55 truncate`}>{b.endpoint}</code>
                  <div className="text-right">
                    <span style={SERIF_STYLE} className="text-[14px] font-bold text-white tabular-nums">
                      {b.counts.completed + b.counts.failed}/{b.counts.total}
                    </span>
                    <span className={`${MONO} block text-[10px] text-white/45`}>{pct}%</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: STATUS_COLOR[b.status], boxShadow: `0 0 6px ${STATUS_COLOR[b.status]}` }}
                    />
                    <span
                      className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] font-semibold`}
                      style={{ color: STATUS_COLOR[b.status] }}
                    >
                      {b.status.replace("_", " ")}
                    </span>
                  </div>
                  <span className={`${MONO} text-[10.5px] text-white/55`}>
                    {formatRelative(b.created_at)}
                  </span>
                  <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {b.status === "validating" && (
                      <button
                        type="button"
                        onClick={() => processBatch(b.id)}
                        disabled={processingId === b.id}
                        className={`${MONO} inline-flex items-center gap-1.5 h-7 px-2.5 text-[10px] uppercase tracking-[0.12em] font-semibold rounded-[4px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
                        style={{ background: ACCENT, color: "#fff" }}
                      >
                        {processingId === b.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                        Process
                      </button>
                    )}
                    {CANCELLABLE.includes(b.status) && b.status !== "cancelling" && (
                      <RowActionButton onClick={() => setCancelTarget(b)}>
                        <X className="h-3 w-3" />
                        Cancel
                      </RowActionButton>
                    )}
                    {TERMINAL.includes(b.status) && (
                      <RowActionButton onClick={() => setDeleteTarget(b)} variant="danger">
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </RowActionButton>
                    )}
                  </div>
                </div>

                {expanded && (
                  <ExpandedRow
                    batch={b}
                    onDownloadOutput={
                      b.output_file_id
                        ? () => downloadFile(b.output_file_id!, `${b.id}_output.jsonl`)
                        : undefined
                    }
                    onDownloadErrors={
                      b.error_file_id
                        ? () => downloadFile(b.error_file_id!, `${b.id}_errors.jsonl`)
                        : undefined
                    }
                    onDownloadInput={() => downloadFile(b.input_file_id, `${b.id}_input.jsonl`)}
                  />
                )}
              </div>
            );
          })}
        </DataTable>
      ) : (
        <EmptyState
          title="No batches yet"
          description="Upload a JSONL of requests and create your first batch. Results land in an output file you can download when the run completes."
          action={
            <PrimaryButton onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Create your first batch
            </PrimaryButton>
          }
        />
      )}

      {/* ─── Create dialog ───────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg border-white/[0.08] bg-[#111216]">
          <DialogHeader>
            <DialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-white/80`}>
              New batch
            </DialogTitle>
            <DialogDescription className={`${MONO} text-[11px] text-white/45 leading-relaxed`}>
              Each line in the input JSONL is one request — same shape as OpenAI&apos;s batch API.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Endpoint */}
            <Field label="Endpoint">
              <Select value={endpoint} onValueChange={setEndpoint}>
                <SelectTrigger className="bg-white/[0.02] border-white/[0.08]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENDPOINTS.map((e) => (
                    <SelectItem key={e.value} value={e.value}>
                      {e.label}{" "}
                      <span className={`${MONO} text-[10px] text-white/40 ml-1`}>{e.value}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className={`${MONO} mt-1 text-[10px] text-white/40 leading-relaxed`}>
                {ENDPOINTS.find((e) => e.value === endpoint)?.description}
              </p>
            </Field>

            {/* File source */}
            <Field label="Input file">
              <div className="space-y-2">
                {/* Upload new */}
                <div
                  className="rounded-[5px] border border-dashed border-white/[0.12] bg-white/[0.02] p-3 cursor-pointer hover:bg-white/[0.04] transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="flex items-center gap-2">
                    <Upload className="h-3.5 w-3.5 text-white/55 shrink-0" />
                    <span className={`${MONO} text-[11.5px] text-white/75 min-w-0 truncate`}>
                      {pickedFile
                        ? `${pickedFile.name} · ${formatBytes(pickedFile.size)}`
                        : "Click to upload a .jsonl file"}
                    </span>
                    {pickedFile && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPickedFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        className="ml-auto text-white/45 hover:text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".jsonl,application/x-ndjson,text/plain"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setPickedFile(f);
                        setExistingFileId(""); // mutex
                      }
                    }}
                  />
                </div>

                {/* Or pick existing */}
                {files.length > 0 && (
                  <>
                    <p className={`${MONO} text-center text-[9.5px] uppercase tracking-[0.14em] text-white/35`}>
                      — or pick an existing file —
                    </p>
                    <Select
                      value={existingFileId}
                      onValueChange={(v) => {
                        setExistingFileId(v);
                        setPickedFile(null);
                      }}
                    >
                      <SelectTrigger className="bg-white/[0.02] border-white/[0.08]">
                        <SelectValue placeholder="Select a previous upload…" />
                      </SelectTrigger>
                      <SelectContent>
                        {files.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            <span className="flex items-center gap-2">
                              <FileText className="h-3 w-3" />
                              <span className="truncate">{f.filename}</span>
                              <span className={`${MONO} text-[10px] text-white/45 ml-1`}>
                                {formatBytes(f.bytes)}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>
            </Field>
          </div>
          <DialogFooter className="gap-2">
            <GhostButton onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </GhostButton>
            <PrimaryButton
              onClick={createBatch}
              disabled={creating || (!pickedFile && !existingFileId)}
            >
              {uploading ? "Uploading…" : creating ? "Creating…" : "Create batch"}
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Cancel confirm ──────────────────────────────────────── */}
      <AlertDialog open={!!cancelTarget} onOpenChange={() => setCancelTarget(null)}>
        <AlertDialogContent className="border-white/[0.08] bg-[#111216]">
          <AlertDialogHeader>
            <AlertDialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-amber-300`}>
              Cancel batch
            </AlertDialogTitle>
            <AlertDialogDescription className={`${MONO} text-[11px] text-white/55 leading-relaxed`}>
              The processor will stop between requests and write whatever output it has so far.
              Already-completed lines are billable. Cancel is irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className={`${MONO} h-10 text-[11px] uppercase tracking-[0.12em] border-white/[0.08] bg-white/[0.02] text-white/75 hover:bg-white/[0.06]`}>
              Keep running
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={cancelBatch}
              className={`${MONO} h-10 text-[11px] uppercase tracking-[0.12em] font-semibold bg-amber-600 hover:bg-amber-700`}
            >
              Cancel batch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete confirm ──────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="border-white/[0.08] bg-[#111216]">
          <AlertDialogHeader>
            <AlertDialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-red-300`}>
              Delete batch
            </AlertDialogTitle>
            <AlertDialogDescription className={`${MONO} text-[11px] text-white/55 leading-relaxed`}>
              Removes the batch row. Output and error files are NOT deleted — download them
              first if you still need them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className={`${MONO} h-10 text-[11px] uppercase tracking-[0.12em] border-white/[0.08] bg-white/[0.02] text-white/75 hover:bg-white/[0.06]`}>
              Keep
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteBatch}
              className={`${MONO} h-10 text-[11px] uppercase tracking-[0.12em] font-semibold bg-red-600 hover:bg-red-700`}
            >
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageCanvas>
  );
}

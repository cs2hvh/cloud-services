"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
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
  ColHead,
  DataTable,
  EmptyState,
  FilterChip,
  GhostButton,
  MONO,
  PrimaryButton,
  RowActionButton,
  SectionHead,
  StatusDot,
} from "@/components/dashboard/inference/chrome";

type ConnectorKind = "s3" | "web_crawl";
type SyncSchedule = "manual" | "hourly" | "daily";
type ConnectorStatus = "idle" | "queued" | "syncing" | "error" | "disabled";

interface Connector {
  id: string;
  collection_id: string;
  kind: ConnectorKind;
  display_name: string;
  config: Record<string, unknown>;
  has_credential: boolean;
  webhook_url: string | null;
  has_webhook_secret: boolean;
  sync_schedule: SyncSchedule;
  status: ConnectorStatus;
  last_error: string | null;
  last_synced_at: string | null;
  last_sync: { docs_total: number; docs_added: number; docs_updated: number; docs_removed: number; docs_failed: number };
}

/** One row of the per-document sync ledger (the drill-in). */
interface ConnectorDoc {
  id: string;
  source_uri: string;
  status: "indexed" | "failed" | "removed" | string;
  chunk_count: number | null;
  error: string | null;
  updated_at: string;
}

const STATUS_MAP: Record<ConnectorStatus, { dot: "ok" | "warn" | "error" | "neutral" | "info"; label: string }> = {
  idle: { dot: "neutral", label: "Idle" },
  queued: { dot: "info", label: "Queued" },
  syncing: { dot: "info", label: "Syncing" },
  error: { dot: "error", label: "Error" },
  disabled: { dot: "neutral", label: "Disabled" },
};

const SCHEDULES: SyncSchedule[] = ["manual", "hourly", "daily"];

const DOC_STATUS_DOT: Record<string, "ok" | "warn" | "error" | "neutral" | "info"> = {
  indexed: "ok",
  failed: "error",
  removed: "neutral",
};

function emptyForm() {
  return {
    kind: "s3" as ConnectorKind,
    display_name: "",
    sync_schedule: "manual" as SyncSchedule,
    // s3
    bucket: "",
    region: "",
    endpoint: "",
    prefix: "",
    access_key_id: "",
    secret_access_key: "",
    // web_crawl
    seed_url: "",
    max_pages: "50",
    max_depth: "2",
    // webhook (both kinds)
    webhook_url: "",
    webhook_secret: "",
  };
}

/** Prefill the shared form from an existing connector. Secrets are never
 *  returned by the API, so credential/secret fields start blank and are only
 *  sent when the user actually types a replacement. */
function formFromConnector(c: Connector): ReturnType<typeof emptyForm> {
  const cfg = c.config ?? {};
  return {
    ...emptyForm(),
    kind: c.kind,
    display_name: c.display_name,
    sync_schedule: c.sync_schedule,
    bucket: String(cfg.bucket ?? ""),
    region: String(cfg.region ?? ""),
    endpoint: String(cfg.endpoint ?? ""),
    prefix: String(cfg.prefix ?? ""),
    seed_url: String(cfg.seed_url ?? ""),
    max_pages: String(cfg.max_pages ?? "50"),
    max_depth: String(cfg.max_depth ?? "2"),
    webhook_url: c.webhook_url ?? "",
  };
}

export function VectorConnectors({ collectionId, canMutate }: { collectionId: string; canMutate: boolean }) {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  // One dialog serves both create and edit — same fields, different verb.
  const [dialog, setDialog] = useState<{ mode: "add" } | { mode: "edit"; connector: Connector } | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [docsTarget, setDocsTarget] = useState<Connector | null>(null);
  const [docs, setDocs] = useState<ConnectorDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Connector | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [syncing, setSyncing] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = await fetch(`/api/inference/connectors?collection_id=${collectionId}`, { credentials: "include" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `Failed (${r.status})`);
      setConnectors(data.data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load connectors");
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

  useEffect(() => {
    void reload();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [reload]);

  // Poll while any connector is in flight, so status/counters update live.
  const anyInFlight = useMemo(
    () => connectors.some((c) => c.status === "queued" || c.status === "syncing"),
    [connectors]
  );
  useEffect(() => {
    if (!anyInFlight) return;
    pollRef.current = setTimeout(() => void reload(), 4000);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [anyInFlight, connectors, reload]);

  /** Create (POST) or edit (PATCH) — the body differs only in what's omitted. */
  const submit = async () => {
    if (!dialog) return;
    if (!form.display_name.trim()) {
      toast.error("Enter a name");
      return;
    }
    const isEdit = dialog.mode === "edit";

    // PATCH replaces `config` wholesale, so start from the stored object and
    // override only what this form renders — otherwise editing a name would
    // silently drop a field set via the API (e.g. max_documents), resetting
    // the customer's cap to the server default.
    const kept = isEdit ? { ...dialog.connector.config } : {};
    const config =
      form.kind === "s3"
        ? {
            ...kept,
            bucket: form.bucket.trim(),
            ...(form.region.trim() ? { region: form.region.trim() } : {}),
            ...(form.endpoint.trim() ? { endpoint: form.endpoint.trim() } : {}),
            ...(form.prefix.trim() ? { prefix: form.prefix.trim() } : {}),
          }
        : {
            ...kept,
            seed_url: form.seed_url.trim(),
            max_pages: Number(form.max_pages) || 50,
            max_depth: Number(form.max_depth) || 2,
          };

    const body: Record<string, unknown> = {
      display_name: form.display_name.trim(),
      sync_schedule: form.sync_schedule,
      config,
      // Empty = no webhook. On edit, null explicitly clears the stored value.
      webhook_url: form.webhook_url.trim() || (isEdit ? null : undefined),
    };
    if (!isEdit) {
      body.kind = form.kind;
      body.collection_id = collectionId;
    }
    // Secrets are write-only: send them only when the user typed something, so
    // an edit that leaves them blank keeps whatever is already stored.
    if (form.kind === "s3" && (form.access_key_id.trim() || form.secret_access_key.trim())) {
      body.credential = { access_key_id: form.access_key_id.trim(), secret_access_key: form.secret_access_key.trim() };
    }
    if (form.webhook_secret.trim()) body.webhook_secret = form.webhook_secret.trim();

    setSaving(true);
    try {
      const url = isEdit ? `/api/inference/connectors/${dialog.connector.id}` : "/api/inference/connectors";
      const r = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `Failed (${r.status})`);
      toast.success(`Connector "${form.display_name}" ${isEdit ? "updated" : "created"}`);
      setDialog(null);
      setForm(emptyForm());
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${isEdit ? "update" : "create"} connector`);
    } finally {
      setSaving(false);
    }
  };

  const openDocs = async (c: Connector) => {
    setDocsTarget(c);
    setDocs([]);
    setDocsLoading(true);
    try {
      const r = await fetch(`/api/inference/connectors/${c.id}/documents?limit=200`, { credentials: "include" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `Failed (${r.status})`);
      setDocs(data.data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setDocsLoading(false);
    }
  };

  const syncNow = async (c: Connector) => {
    setSyncing((s) => new Set(s).add(c.id));
    try {
      const r = await fetch(`/api/inference/connectors/${c.id}/sync`, { method: "POST", credentials: "include" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `Failed (${r.status})`);
      toast.success(`Sync queued for "${c.display_name}"`);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to trigger sync");
    } finally {
      setSyncing((s) => {
        const next = new Set(s);
        next.delete(c.id);
        return next;
      });
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/inference/connectors/${deleteTarget.id}`, { method: "DELETE", credentials: "include" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to delete");
      toast.success(`Deleted connector "${deleteTarget.display_name}"`);
      setDeleteTarget(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const sourceSummary = (c: Connector): string => {
    if (c.kind === "s3") {
      const b = String(c.config.bucket ?? "");
      const p = c.config.prefix ? `/${String(c.config.prefix)}` : "";
      return `s3://${b}${p}`;
    }
    return String(c.config.seed_url ?? "");
  };

  const isEdit = dialog?.mode === "edit";

  return (
    <>
      <SectionHead
        eyebrow="Sources"
        title="Connectors"
        accent="auto-sync from S3 or the web"
        rightMeta={connectors.length > 0 ? `${connectors.length} configured` : undefined}
      />

      <div className="mb-3 flex justify-end">
        {canMutate && (
          <PrimaryButton onClick={() => { setForm(emptyForm()); setDialog({ mode: "add" }); }} disabled={loading}>
            <Plus className="h-3.5 w-3.5" />
            Add connector
          </PrimaryButton>
        )}
      </div>

      {connectors.length > 0 ? (
        <DataTable>
          <div className="hidden md:grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,1.4fr)] gap-3 px-5 py-2.5 border-b border-white/[0.06]">
            <ColHead>Name</ColHead>
            <ColHead>Source</ColHead>
            <ColHead>Status</ColHead>
            <ColHead>Last sync</ColHead>
            <ColHead align="right">Actions</ColHead>
          </div>
          {connectors.map((c) => {
            const st = STATUS_MAP[c.status];
            const busy = c.status === "queued" || c.status === "syncing" || syncing.has(c.id);
            return (
              <div
                key={c.id}
                className="grid grid-cols-1 gap-2 px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,1.4fr)] md:items-center"
              >
                <div className="min-w-0">
                  <code className={`${MONO} text-[11.5px] text-white/80 truncate block`}>{c.display_name}</code>
                  <span className={`${MONO} text-[9.5px] uppercase tracking-[0.12em] text-white/35`}>
                    {c.kind === "s3" ? "S3" : "Web crawl"} · {c.sync_schedule}
                  </span>
                </div>
                <code className={`${MONO} text-[11px] text-white/55 truncate`}>{sourceSummary(c)}</code>
                <div className="flex items-center gap-2">
                  <StatusDot status={st.dot} />
                  <span className={`${MONO} text-[10.5px] uppercase tracking-[0.1em] text-white/60`}>{st.label}</span>
                </div>
                <div className={`${MONO} text-[11px] text-white/55`}>
                  {c.last_synced_at ? (
                    <span title={c.last_synced_at}>
                      {new Date(c.last_synced_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      {c.last_sync.docs_total > 0 && (
                        <span className="text-white/35">
                          {" "}· +{c.last_sync.docs_added}/~{c.last_sync.docs_updated}/-{c.last_sync.docs_removed}
                        </span>
                      )}
                      {c.last_sync.docs_failed > 0 && (
                        <button
                          onClick={() => void openDocs(c)}
                          className="ml-1.5 text-amber-400/90 hover:text-amber-300 underline underline-offset-2"
                          title="See which documents failed"
                        >
                          {c.last_sync.docs_failed} failed
                        </button>
                      )}
                    </span>
                  ) : (
                    <span className="text-white/30 italic">never</span>
                  )}
                </div>
                <div className="flex justify-end gap-1.5">
                  {/* Docs drill-in is read-only — viewers get it too. */}
                  <RowActionButton onClick={() => void openDocs(c)} variant="ghost">
                    <FileText className="h-3 w-3" />
                    Docs
                  </RowActionButton>
                  {canMutate && (
                    <>
                      <RowActionButton onClick={() => syncNow(c)} variant="ghost">
                        <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
                        {busy ? "Syncing" : "Sync"}
                      </RowActionButton>
                      <RowActionButton onClick={() => { setForm(formFromConnector(c)); setDialog({ mode: "edit", connector: c }); }} variant="ghost">
                        <Pencil className="h-3 w-3" />
                        Edit
                      </RowActionButton>
                      <RowActionButton onClick={() => setDeleteTarget(c)} variant="danger">
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </RowActionButton>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </DataTable>
      ) : (
        <EmptyState
          title={loading ? "Loading connectors…" : "No connectors yet"}
          description="Connect an S3 bucket or a website to keep this knowledge base synced automatically — no more manual uploads. Documents are fetched, chunked, embedded, and kept current on a schedule."
        />
      )}

      {/* last_error banner for any errored connector */}
      {connectors.filter((c) => c.status === "error" && c.last_error).map((c) => (
        <p key={c.id} className={`${MONO} mt-2 text-[10.5px] text-red-400`}>
          {c.display_name}: {c.last_error}
        </p>
      ))}

      {/* ── Add / edit connector dialog (same fields, different verb) ── */}
      <Dialog open={!!dialog} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="border-white/[0.08] bg-[#111216] max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className={`${MONO} text-[13px] uppercase tracking-[0.14em] text-white/85`}>
              {isEdit ? "Edit connector" : "Add connector"}
            </DialogTitle>
            <DialogDescription className={`${MONO} text-[11px] text-white/50`}>
              {isEdit
                ? "Source type can't change — delete and recreate to switch. Blank secrets keep what's stored."
                : "Point at a source; it syncs into this knowledge base automatically."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* kind is immutable once created (the sync ledger is keyed to it) */}
            {!isEdit && (
              <div className="flex items-center gap-1.5">
                <FilterChip active={form.kind === "s3"} label="S3" onClick={() => setForm((f) => ({ ...f, kind: "s3" }))} />
                <FilterChip active={form.kind === "web_crawl"} label="Web crawl" onClick={() => setForm((f) => ({ ...f, kind: "web_crawl" }))} />
              </div>
            )}

            <Field label="Name">
              <Input value={form.display_name} onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))} placeholder="e.g. prod-docs" className="bg-white/[0.02] border-white/[0.08]" />
            </Field>

            {form.kind === "s3" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Bucket"><Input value={form.bucket} onChange={(e) => setForm((f) => ({ ...f, bucket: e.target.value }))} placeholder="my-bucket" className="bg-white/[0.02] border-white/[0.08]" /></Field>
                  <Field label="Region"><Input value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} placeholder="us-east-1" className="bg-white/[0.02] border-white/[0.08]" /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Endpoint (R2/MinIO — optional)"><Input value={form.endpoint} onChange={(e) => setForm((f) => ({ ...f, endpoint: e.target.value }))} placeholder="https://…" className="bg-white/[0.02] border-white/[0.08]" /></Field>
                  <Field label="Prefix (optional)"><Input value={form.prefix} onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value }))} placeholder="docs/" className="bg-white/[0.02] border-white/[0.08]" /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={isEdit ? "Access key ID (blank = keep)" : "Access key ID"}><Input value={form.access_key_id} onChange={(e) => setForm((f) => ({ ...f, access_key_id: e.target.value }))} placeholder={isEdit ? "unchanged" : "AKIA…"} className="bg-white/[0.02] border-white/[0.08]" /></Field>
                  <Field label={isEdit ? "Secret access key (blank = keep)" : "Secret access key"}><Input type="password" value={form.secret_access_key} onChange={(e) => setForm((f) => ({ ...f, secret_access_key: e.target.value }))} placeholder="••••••••" className="bg-white/[0.02] border-white/[0.08]" /></Field>
                </div>
              </>
            ) : (
              <>
                <Field label="Seed URL"><Input value={form.seed_url} onChange={(e) => setForm((f) => ({ ...f, seed_url: e.target.value }))} placeholder="https://docs.example.com" className="bg-white/[0.02] border-white/[0.08]" /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Max pages"><Input type="number" min={1} max={1000} value={form.max_pages} onChange={(e) => setForm((f) => ({ ...f, max_pages: e.target.value }))} className="bg-white/[0.02] border-white/[0.08]" /></Field>
                  <Field label="Max depth"><Input type="number" min={0} max={5} value={form.max_depth} onChange={(e) => setForm((f) => ({ ...f, max_depth: e.target.value }))} className="bg-white/[0.02] border-white/[0.08]" /></Field>
                </div>
              </>
            )}

            <Field label="Sync schedule">
              <div className="flex items-center gap-1.5">
                {SCHEDULES.map((s) => (
                  <FilterChip key={s} active={form.sync_schedule === s} label={s} onClick={() => setForm((f) => ({ ...f, sync_schedule: s }))} />
                ))}
              </div>
            </Field>

            <Field label="Webhook URL (optional)">
              <Input value={form.webhook_url} onChange={(e) => setForm((f) => ({ ...f, webhook_url: e.target.value }))} placeholder="https://your-app.example.com/hooks/sync" className="bg-white/[0.02] border-white/[0.08]" />
            </Field>
            <Field
              label={
                isEdit && dialog?.mode === "edit" && dialog.connector.has_webhook_secret
                  ? "Signing secret (set — blank = keep)"
                  : "Signing secret (optional)"
              }
            >
              <Input
                type="password"
                value={form.webhook_secret}
                onChange={(e) => setForm((f) => ({ ...f, webhook_secret: e.target.value }))}
                placeholder="16+ chars — signs the POST as X-Ahura-Signature"
                className="bg-white/[0.02] border-white/[0.08]"
              />
            </Field>
          </div>

          <DialogFooter className="gap-2">
            <GhostButton onClick={() => setDialog(null)} disabled={saving}>Cancel</GhostButton>
            <PrimaryButton onClick={submit} disabled={saving || !form.display_name.trim()}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create connector"}
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Per-document drill-in: which docs synced, which failed, why ── */}
      <Dialog open={!!docsTarget} onOpenChange={(open) => { if (!open) setDocsTarget(null); }}>
        <DialogContent className="border-white/[0.08] bg-[#111216] max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className={`${MONO} text-[13px] uppercase tracking-[0.14em] text-white/85`}>
              Documents · {docsTarget?.display_name}
            </DialogTitle>
            <DialogDescription className={`${MONO} text-[11px] text-white/50`}>
              Every document this connector has seen, newest first. Failures show the reason.
            </DialogDescription>
          </DialogHeader>

          {docsLoading ? (
            <p className={`${MONO} py-6 text-center text-[11px] text-white/40`}>Loading…</p>
          ) : docs.length === 0 ? (
            <p className={`${MONO} py-6 text-center text-[11px] text-white/40`}>
              Nothing synced yet — run a sync to populate this.
            </p>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {docs.map((d) => (
                <div key={d.id} className="flex items-start gap-3 py-2.5">
                  <StatusDot status={DOC_STATUS_DOT[d.status] ?? "neutral"} />
                  <div className="min-w-0 flex-1">
                    <code className={`${MONO} block truncate text-[11px] text-white/75`} title={d.source_uri}>
                      {d.source_uri}
                    </code>
                    {d.error && <p className={`${MONO} mt-1 text-[10.5px] leading-relaxed text-red-400`}>{d.error}</p>}
                  </div>
                  <span className={`${MONO} shrink-0 text-[10px] uppercase tracking-[0.1em] text-white/35`}>
                    {d.status}
                    {d.chunk_count ? ` · ${d.chunk_count} chunks` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ───────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="border-white/[0.08] bg-[#111216]">
          <AlertDialogHeader>
            <AlertDialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-red-300`}>Delete connector</AlertDialogTitle>
            <AlertDialogDescription className={`${MONO} text-[11px] text-white/55 leading-relaxed`}>
              Remove connector <span className="text-white/80">&quot;{deleteTarget?.display_name}&quot;</span>. Rows it already ingested stay in the collection (delete them separately if you want them gone).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={deleting} className={`${MONO} h-10 text-[11px] uppercase tracking-[0.12em] border-white/[0.08] bg-white/[0.02] text-white/75 hover:bg-white/[0.06]`}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} disabled={deleting} className={`${MONO} h-10 text-[11px] uppercase tracking-[0.12em] font-semibold bg-red-600 hover:bg-red-700 text-white`}>
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className={`${MONO} block mb-1.5 text-[10px] uppercase tracking-[0.14em] text-white/55`}>{label}</Label>
      {children}
    </div>
  );
}

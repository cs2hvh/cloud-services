"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, RotateCw, Search, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  SERIF_STYLE,
  SectionHead,
  StatCell,
  StatsStrip,
} from "@/components/dashboard/inference/chrome";
import { customerSafeErrorMessage } from "@/lib/inference/error-messages";

export interface VectorCollectionRecord {
  id: string;
  name: string;
  description: string | null;
  dimensions: number;
  distance_metric: string;
  embedding_model_id: string;
  index_type: string;
  row_count: number;
  size_bytes: number;
  created_at: string;
  updated_at: string;
}

interface RowRecord {
  id: string;
  external_id: string;
  content: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface QueryResult {
  id: string;
  external_id: string;
  content: string | null;
  metadata: Record<string, unknown>;
  similarity: number;
}

const PAGE_SIZE = 25;

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function VectorCollectionDetail({
  collection,
  orgName,
  canMutate,
}: {
  collection: VectorCollectionRecord;
  orgName: string;
  canMutate: boolean;
}) {
  const [rows, setRows] = useState<RowRecord[]>([]);
  const [total, setTotal] = useState(collection.row_count);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loadingRows, setLoadingRows] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RowRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Query test box
  const [queryText, setQueryText] = useState("");
  const [topK, setTopK] = useState(5);
  const [querying, setQuerying] = useState(false);
  const [queryResults, setQueryResults] = useState<QueryResult[] | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryMs, setQueryMs] = useState<number | null>(null);

  const reloadRows = useCallback(
    async (opts?: { offset?: number; search?: string }) => {
      const o = opts?.offset ?? offset;
      const q = opts?.search ?? appliedSearch;
      setLoadingRows(true);
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(o),
        });
        if (q) params.set("q", q);
        const r = await fetch(`/api/inference/vector/collections/${collection.id}/rows?${params}`, {
          credentials: "include",
        });
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.error ?? `Failed (${r.status})`);
        }
        const data = await r.json();
        setRows(data.rows ?? []);
        setTotal(data.total ?? 0);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load rows");
      } finally {
        setLoadingRows(false);
      }
    },
    [collection.id, offset, appliedSearch]
  );

  useEffect(() => {
    void reloadRows({ offset: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection.id]);

  const submitSearch = () => {
    setOffset(0);
    setAppliedSearch(search.trim());
    void reloadRows({ offset: 0, search: search.trim() });
  };

  const clearSearch = () => {
    setSearch("");
    setAppliedSearch("");
    setOffset(0);
    void reloadRows({ offset: 0, search: "" });
  };

  const goPage = (newOffset: number) => {
    setOffset(newOffset);
    void reloadRows({ offset: newOffset });
  };

  const runQuery = async () => {
    if (!queryText.trim()) {
      toast.error("Enter a query");
      return;
    }
    setQuerying(true);
    setQueryError(null);
    setQueryResults(null);
    const startedAt = performance.now();
    try {
      const r = await fetch(`/api/inference/vector/collections/${collection.id}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text: queryText.trim(), top_k: topK }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `Failed (${r.status})`);
      setQueryResults(data.results ?? []);
      setQueryMs(Math.round(performance.now() - startedAt));
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Query failed";
      const msg = customerSafeErrorMessage(raw) || "Query failed";
      setQueryError(msg);
      toast.error(msg);
    } finally {
      setQuerying(false);
    }
  };

  const deleteRow = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const r = await fetch(
        `/api/inference/vector/collections/${collection.id}/rows/${deleteTarget.id}`,
        { method: "DELETE", credentials: "include" }
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to delete");
      toast.success(`Deleted row "${deleteTarget.external_id}"`);
      setDeleteTarget(null);
      await reloadRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const pageInfo = useMemo(() => {
    if (total === 0) return "0 of 0";
    const start = offset + 1;
    const end = Math.min(offset + PAGE_SIZE, total);
    return `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}`;
  }, [offset, total]);

  return (
    <PageCanvas>
      <Hero
        breadcrumb={{ label: "Vectors", href: "/dashboard/services/inference/vectors" }}
        title={collection.name}
        accent="collection"
        caption={collection.description ?? `${collection.dimensions}-dim · ${collection.distance_metric} · indexed via ${collection.index_type}`}
        size="md"
        actions={
          <GhostButton onClick={() => reloadRows()} disabled={loadingRows}>
            <RotateCw className={`h-3.5 w-3.5 ${loadingRows ? "animate-spin" : ""}`} />
            Refresh
          </GhostButton>
        }
      />

      <StatsStrip>
        <StatCell label="Vector rows" value={total.toLocaleString()} hint="Indexed embeddings" accent={ACCENT} />
        <StatCell label="Dimensions" value={String(collection.dimensions)} hint={collection.distance_metric} />
        <StatCell label="Storage" value={formatBytes(collection.size_bytes)} hint="Approximate" />
        <StatCell
          label="Embedding model"
          value={collection.embedding_model_id.split("/").pop() ?? collection.embedding_model_id}
          hint={collection.embedding_model_id}
        />
      </StatsStrip>

      {/* ─── Query test box ─────────────────────────────────────── */}
      <SectionHead
        eyebrow="Search"
        title="Query"
        accent="by similarity"
        rightMeta={queryMs !== null ? `last query ${queryMs}ms` : undefined}
      />

      <div className="rounded-[6px] border border-white/[0.06] bg-[#0f1014] p-5">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_auto] gap-3">
          <div>
            <Label className={`${MONO} block mb-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/55`}>
              Text query (server auto-embeds)
            </Label>
            <Input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void runQuery();
                }
              }}
              placeholder="e.g. how do I rotate API keys?"
              className="bg-white/[0.02] border-white/[0.08]"
            />
          </div>
          <div>
            <Label className={`${MONO} block mb-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/55`}>
              top_k
            </Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={topK}
              onChange={(e) => setTopK(Math.min(100, Math.max(1, Number.parseInt(e.target.value, 10) || 5)))}
              className="bg-white/[0.02] border-white/[0.08]"
            />
          </div>
          <div className="flex items-end">
            <PrimaryButton onClick={runQuery} disabled={querying || !queryText.trim() || total === 0}>
              <Sparkles className="h-3.5 w-3.5" />
              {querying ? "Searching…" : "Search"}
            </PrimaryButton>
          </div>
        </div>

        {queryError && (
          <p className={`${MONO} mt-3 text-[11px] text-red-400`}>{queryError}</p>
        )}

        {queryResults && queryResults.length > 0 && (
          <div className="mt-5 space-y-2">
            {queryResults.map((r, i) => (
              <div
                key={r.id}
                className="rounded-[5px] border border-white/[0.06] bg-white/[0.015] p-3"
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      style={SERIF_STYLE}
                      className="text-[12px] tabular-nums text-white/45 w-5"
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <code className={`${MONO} text-[11.5px] text-white/75 truncate`}>
                      {r.external_id}
                    </code>
                  </div>
                  <span
                    style={SERIF_STYLE}
                    className="text-[13px] font-bold tabular-nums shrink-0"
                    title={`Similarity: ${r.similarity}`}
                  >
                    <span style={{ color: ACCENT }}>{(r.similarity * 100).toFixed(1)}%</span>
                  </span>
                </div>
                {r.content && (
                  <p className={`${MONO} text-[11px] text-white/60 leading-relaxed line-clamp-3`}>
                    {r.content}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        {queryResults && queryResults.length === 0 && !queryError && (
          <p className={`${MONO} mt-3 text-[11px] text-white/45`}>
            No matches above the similarity threshold.
          </p>
        )}
      </div>

      {/* ─── Rows table ────────────────────────────────────────── */}
      <SectionHead
        eyebrow="Inventory"
        title="Rows"
        accent="in this collection"
        rightMeta={`${pageInfo} · org: ${orgName}`}
      />

      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitSearch();
            }}
            placeholder="Search by external_id"
            className="pl-9 bg-white/[0.02] border-white/[0.08]"
          />
        </div>
        <GhostButton onClick={submitSearch} disabled={loadingRows}>
          Filter
        </GhostButton>
        {appliedSearch && (
          <GhostButton onClick={clearSearch} disabled={loadingRows}>
            Clear
          </GhostButton>
        )}
      </div>

      {rows.length > 0 ? (
        <>
          <DataTable>
            <div className="hidden md:grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,0.7fr)_minmax(0,0.5fr)] gap-3 px-5 py-2.5 border-b border-white/[0.06]">
              <ColHead>external_id</ColHead>
              <ColHead>Content preview</ColHead>
              <ColHead>Created</ColHead>
              <ColHead align="right">Actions</ColHead>
            </div>
            {rows.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-1 gap-2 px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,0.7fr)_minmax(0,0.5fr)] md:items-center"
              >
                <code className={`${MONO} text-[11.5px] text-white/75 truncate`}>
                  {r.external_id}
                </code>
                <p className={`${MONO} text-[11px] text-white/55 leading-relaxed line-clamp-2`}>
                  {r.content ?? <span className="italic text-white/30">— no content —</span>}
                </p>
                <span className={`${MONO} text-[11px] text-white/55`}>
                  {new Date(r.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <div className="flex justify-end gap-1.5">
                  {canMutate && (
                    <RowActionButton onClick={() => setDeleteTarget(r)} variant="danger">
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </RowActionButton>
                  )}
                </div>
              </div>
            ))}
          </DataTable>

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="mt-3 flex items-center justify-between">
              <span className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] text-white/45`}>
                {pageInfo}
              </span>
              <div className="flex gap-1.5">
                <GhostButton onClick={() => goPage(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0 || loadingRows}>
                  Previous
                </GhostButton>
                <GhostButton
                  onClick={() => goPage(offset + PAGE_SIZE)}
                  disabled={offset + PAGE_SIZE >= total || loadingRows}
                >
                  Next
                </GhostButton>
              </div>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          title={appliedSearch ? "No rows match that filter" : "No rows yet"}
          description={
            appliedSearch
              ? `Nothing matches external_id like "${appliedSearch}".`
              : "Upsert rows via POST /api/inference/vector/collections/{id}/upsert — pass content for auto-embed, or pre-computed embedding arrays."
          }
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="border-white/[0.08] bg-[#111216]">
          <AlertDialogHeader>
            <AlertDialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-red-300`}>
              Delete row
            </AlertDialogTitle>
            <AlertDialogDescription className={`${MONO} text-[11px] text-white/55 leading-relaxed`}>
              Permanently remove row{" "}
              <span className="text-white/80">&quot;{deleteTarget?.external_id}&quot;</span> from this
              collection. The embedding cannot be recovered.
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
              onClick={deleteRow}
              disabled={deleting}
              className={`${MONO} h-10 text-[11px] uppercase tracking-[0.12em] font-semibold bg-red-600 hover:bg-red-700`}
            >
              {deleting ? "Deleting…" : "Delete row"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ChevronLeft className="hidden" />
    </PageCanvas>
  );
}

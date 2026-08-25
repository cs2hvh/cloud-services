"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, MessageCircleQuestion, RotateCw, Search, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  ACCENT_DIM,
  ColHead,
  DataTable,
  EmptyState,
  FilterChip,
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
import { VectorConnectors } from "@/components/dashboard/inference/vector-connectors";

type SearchMode = "vector" | "hybrid";

interface Citation {
  marker: number;
  document_id: string;
  source: string | null;
  snippet: string;
  score: number;
}

/** Renders answer text with [n] citation markers as small badges the eye
 *  catches, instead of raw bracket text. */
function AnswerText({ text }: { text: string }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <p className={`${MONO} text-[12.5px] text-white/85 leading-relaxed whitespace-pre-wrap`}>
      {parts.map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/);
        if (!m) return <span key={i}>{part}</span>;
        return (
          <span
            key={i}
            className="inline-flex items-center justify-center h-[15px] min-w-[15px] px-1 mx-0.5 rounded-[3px] text-[9.5px] font-bold align-super"
            style={{ background: ACCENT_DIM, color: ACCENT }}
          >
            {m[1]}
          </span>
        );
      })}
    </p>
  );
}

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
  // Present only when mode:"hybrid" (RRF fusion score) / rerank:true
  // (cross-encoder relevance) respectively — see the query route for why.
  rrf_score?: number;
  rerank_score?: number;
}

/** The score that actually decided a row's position, plus how to display it —
 *  found live, 2026-07-21: this panel always showed raw vector `similarity`
 *  even when hybrid fusion or reranking had reordered the rows, so toggling
 *  either control visibly changed nothing on screen even though the
 *  underlying ranking had. Reranking (a cross-encoder pass, a real 0-1
 *  relevance probability) is the most specific signal when present, then RRF
 *  fusion, then plain vector similarity. RRF's fused score is NOT a
 *  proportion (it's a sum of 1/(k+rank) terms, typically << 1) — rendering
 *  it as a percentage would misleadingly read as "low confidence", so only
 *  the two real 0-1 scores are percentage-formatted. */
function effectiveScore(r: QueryResult): { value: number; label: string; asPercent: boolean } {
  if (r.rerank_score !== undefined) return { value: r.rerank_score, label: "Relevance", asPercent: true };
  if (r.rrf_score !== undefined) return { value: r.rrf_score, label: "Fused", asPercent: false };
  return { value: r.similarity, label: "Similarity", asPercent: true };
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
  const [queryMode, setQueryMode] = useState<SearchMode>("vector");
  const [queryRerank, setQueryRerank] = useState(false);
  const [querying, setQuerying] = useState(false);
  const [queryResults, setQueryResults] = useState<QueryResult[] | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryMs, setQueryMs] = useState<number | null>(null);

  // Ask-a-question box (grounded generation with citations)
  const [askQuery, setAskQuery] = useState("");
  const [askModel, setAskModel] = useState("anthropic/claude-haiku-4.5");
  const [askTopK, setAskTopK] = useState(6);
  const [askMode, setAskMode] = useState<SearchMode>("hybrid");
  const [askRerank, setAskRerank] = useState(true);
  const [asking, setAsking] = useState(false);
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askCitations, setAskCitations] = useState<Citation[]>([]);
  const [askError, setAskError] = useState<string | null>(null);
  const [askMs, setAskMs] = useState<number | null>(null);

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
        body: JSON.stringify({ text: queryText.trim(), top_k: topK, mode: queryMode, rerank: queryRerank }),
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

  const runAsk = async () => {
    if (!askQuery.trim()) {
      toast.error("Enter a question");
      return;
    }
    if (!askModel.trim()) {
      toast.error("Enter a model id");
      return;
    }
    setAsking(true);
    setAskError(null);
    setAskAnswer(null);
    setAskCitations([]);
    const startedAt = performance.now();
    try {
      const r = await fetch(`/api/inference/vector/collections/${collection.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          query: askQuery.trim(),
          model: askModel.trim(),
          top_k: askTopK,
          mode: askMode,
          rerank: askRerank,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `Failed (${r.status})`);
      setAskAnswer(data.answer ?? "");
      setAskCitations(data.citations ?? []);
      setAskMs(Math.round(performance.now() - startedAt));
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Generation failed";
      const msg = customerSafeErrorMessage(raw) || "Generation failed";
      setAskError(msg);
      toast.error(msg);
    } finally {
      setAsking(false);
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
        // Same "found live, 2026-07-21" issue as effectiveScore below, one
        // level up: this used to hardcode "by similarity" regardless of mode,
        // so the section caption was ALSO wrong once hybrid/rerank reordered
        // results by a different score.
        accent={queryRerank ? "by relevance (reranked)" : queryMode === "hybrid" ? "by fused rank" : "by similarity"}
        rightMeta={queryMs !== null ? `last query ${queryMs}ms` : undefined}
      />

      <div className="mb-14 rounded-[6px] border border-white/[0.06] bg-[#111216] p-5">
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

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <FilterChip active={queryMode === "vector"} label="Vector" onClick={() => setQueryMode("vector")} />
            <FilterChip active={queryMode === "hybrid"} label="Hybrid" onClick={() => setQueryMode("hybrid")} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <Switch checked={queryRerank} onCheckedChange={setQueryRerank} />
            <span className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] text-white/55`}>Rerank</span>
          </label>
          <span className={`${MONO} text-[10px] text-white/35`}>
            {queryMode === "hybrid" ? "Meaning + exact-keyword match, fused" : "Meaning-based similarity only"}
            {queryRerank ? " · re-scored by a cross-encoder" : ""}
          </span>
        </div>

        {queryError && (
          <p className={`${MONO} mt-3 text-[11px] text-red-400`}>{queryError}</p>
        )}

        {queryResults && queryResults.length > 0 && (
          <div className="mt-5 space-y-2">
            {queryResults.map((r, i) => {
              const score = effectiveScore(r);
              return (
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
                      className="text-[13px] font-bold tabular-nums shrink-0 flex items-center gap-1.5"
                      title={`${score.label}: ${score.value} · Similarity: ${r.similarity}`}
                    >
                      <span className={`${MONO} text-[9px] font-normal uppercase tracking-[0.1em] text-white/35`}>
                        {score.label}
                      </span>
                      <span style={{ color: ACCENT }}>
                        {score.asPercent ? `${(score.value * 100).toFixed(1)}%` : score.value.toFixed(4)}
                      </span>
                    </span>
                  </div>
                  {r.content && (
                    <p className={`${MONO} text-[11px] text-white/60 leading-relaxed line-clamp-3`}>
                      {r.content}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {queryResults && queryResults.length === 0 && !queryError && (
          <p className={`${MONO} mt-3 text-[11px] text-white/45`}>
            No matches above the similarity threshold.
          </p>
        )}
      </div>

      {/* ─── Ask a question (grounded generation with citations) ──── */}
      <SectionHead
        eyebrow="Generate"
        title="Ask"
        accent="grounded answer with citations"
        rightMeta={askMs !== null ? `last answer ${askMs}ms` : undefined}
      />

      <div className="mb-14 rounded-[6px] border border-white/[0.06] bg-[#111216] p-5">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-3">
          <div>
            <Label className={`${MONO} block mb-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/55`}>
              Question
            </Label>
            <Input
              value={askQuery}
              onChange={(e) => setAskQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void runAsk();
                }
              }}
              placeholder="e.g. what's the refund policy?"
              className="bg-white/[0.02] border-white/[0.08]"
            />
          </div>
          <div>
            <Label className={`${MONO} block mb-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/55`}>
              Model
            </Label>
            <Input
              value={askModel}
              onChange={(e) => setAskModel(e.target.value)}
              placeholder="e.g. anthropic/claude-haiku-4.5"
              className={`${MONO} text-[11.5px] bg-white/[0.02] border-white/[0.08]`}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <FilterChip active={askMode === "vector"} label="Vector" onClick={() => setAskMode("vector")} />
            <FilterChip active={askMode === "hybrid"} label="Hybrid" onClick={() => setAskMode("hybrid")} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <Switch checked={askRerank} onCheckedChange={setAskRerank} />
            <span className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] text-white/55`}>Rerank</span>
          </label>
          <div className="flex items-center gap-1.5">
            <span className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] text-white/55`}>top_k</span>
            <Input
              type="number"
              min={1}
              max={20}
              value={askTopK}
              onChange={(e) => setAskTopK(Math.min(20, Math.max(1, Number.parseInt(e.target.value, 10) || 6)))}
              className="w-16 h-7 px-2 bg-white/[0.02] border-white/[0.08] text-[11px]"
            />
          </div>
          <div className="ml-auto">
            <PrimaryButton onClick={runAsk} disabled={asking || !askQuery.trim() || !askModel.trim() || total === 0}>
              <MessageCircleQuestion className="h-3.5 w-3.5" />
              {asking ? "Thinking…" : "Ask"}
            </PrimaryButton>
          </div>
        </div>

        {askError && <p className={`${MONO} mt-3 text-[11px] text-red-400`}>{askError}</p>}

        {askAnswer !== null && (
          <div className="mt-5 rounded-[5px] border border-white/[0.06] bg-white/[0.015] p-4">
            <AnswerText text={askAnswer} />

            {askCitations.length > 0 ? (
              <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-2">
                <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40 mb-2`}>
                  Sources cited
                </p>
                {askCitations.map((c) => (
                  <div key={c.marker} className="flex items-start gap-2.5">
                    <span
                      className="inline-flex items-center justify-center h-[15px] min-w-[15px] px-1 mt-0.5 rounded-[3px] text-[9.5px] font-bold shrink-0"
                      style={{ background: ACCENT_DIM, color: ACCENT }}
                    >
                      {c.marker}
                    </span>
                    <div className="min-w-0">
                      <code className={`${MONO} text-[11px] text-white/70`}>{c.source ?? c.document_id}</code>
                      <p className={`${MONO} text-[10.5px] text-white/45 leading-relaxed line-clamp-2`}>
                        {c.snippet}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className={`${MONO} mt-3 text-[10.5px] text-white/35 italic`}>
                No sources cited — the answer wasn&apos;t grounded in a specific retrieved document.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ─── Connectors (auto-sync sources) ──────────────────────── */}
      <div className="mb-14">
        <VectorConnectors collectionId={collection.id} canMutate={canMutate} />
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

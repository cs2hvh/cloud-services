"use client";

/**
 * Rerank service — POST /v1/rerank
 *
 * Request:  { model, query, documents: string[], top_n?: number }
 * Response: { model, results: [{index, relevance_score}], usage: {rerank_units} }
 *
 * Billing:  per document scored (usage.rerank_units from response)
 * Pricing:  cents_per_1k_rerank (in inference.models.pricing)
 */

import { useState, useMemo, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ACCENT, MONO, SERIF_STYLE } from "@/components/dashboard/inference/chrome";
import { CARD, FieldLabel, INPUT_CLS, TEXTAREA_CLS, ServiceShell } from "./_shell";
import type { ServiceModel } from "@/components/dashboard/inference/playground";

const FALLBACK_modelId = "ahura/rerank-m3";
const MODEL_LABEL       = "Rerank M3";
const ENDPOINT          = "/rerank";

interface RankResult { origIdx: number; text: string; score: number }
interface RerankData {
  results: Array<{ index: number; relevance_score: number }>;
  usage?: { rerank_units?: number };
}

export function RerankService({
  apiBase,
  models = [],
  tabBar,
}: {
  apiBase: string;
  models?: ServiceModel[];
  tabBar?: React.ReactNode;
}) {
  const modelId = models[0]?.model_id ?? FALLBACK_modelId;

  // ── Form state ──────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [docs, setDocs] = useState(["", "", ""]);
  const [topN, setTopN] = useState("");

  // ── Results state ───────────────────────────────────────────────
  const [ranked, setRanked] = useState<RankResult[] | null>(null);
  const [usageUnits, setUsageUnits] = useState<number | null>(null);

  const validDocs = useMemo(() => docs.filter((d) => d.trim()), [docs]);
  const canRun = query.trim().length > 0 && validDocs.length >= 1;

  const addDoc = () => setDocs((d) => [...d, ""]);
  const removeDoc = (i: number) => setDocs((d) => d.filter((_, j) => j !== i));
  const setDoc = (i: number, v: string) =>
    setDocs((d) => d.map((x, j) => (j === i ? v : x)));

  // ── Body ─────────────────────────────────────────────────────────
  const body = useMemo(() => {
    const b: Record<string, unknown> = {
      model: modelId,
      query: query.trim(),
      documents: validDocs,
    };
    const n = parseInt(topN, 10);
    if (!isNaN(n) && n > 0) b.top_n = n;
    return b;
  }, [query, validDocs, topN]);

  // ── Response handler ─────────────────────────────────────────────
  const onSuccess = useCallback((data: unknown) => {
    const d = data as RerankData;
    setUsageUnits(d.usage?.rerank_units ?? validDocs.length);
    setRanked(
      (d.results ?? []).map((r) => ({
        origIdx: r.index,
        text: validDocs[r.index] ?? "",
        score: r.relevance_score,
      }))
    );
  }, [validDocs]);

  // ── Code snippet ─────────────────────────────────────────────────
  const codeSnippet = useMemo(
    () =>
      `curl ${apiBase}/rerank \\\n` +
      `  -H "Authorization: Bearer <YOUR_KEY>" \\\n` +
      `  -H "Content-Type: application/json" \\\n` +
      `  -d '${JSON.stringify(body, null, 2)}'`,
    [apiBase, body]
  );

  return (
    <ServiceShell
      tabBar={tabBar}
      apiBase={apiBase}
      modelId={modelId}
      modelLabel={MODEL_LABEL}
      endpoint={ENDPOINT}
      description="Pass a query + documents and get them ranked by relevance score."
      body={body}
      canRun={canRun}
      onSuccess={onSuccess}
      renderForm={
        <RerankForm
          query={query}
          setQuery={setQuery}
          topN={topN}
          setTopN={setTopN}
          docs={docs}
          addDoc={addDoc}
          removeDoc={removeDoc}
          setDoc={setDoc}
        />
      }
      renderResults={ranked ? <RerankResults ranked={ranked} /> : null}
      usageLabel={usageUnits !== null ? `${usageUnits} rerank unit${usageUnits !== 1 ? "s" : ""}` : null}
      codeSnippet={codeSnippet}
    />
  );
}

// ── Form ─────────────────────────────────────────────────────────────────────

function RerankForm({
  query, setQuery,
  topN, setTopN,
  docs, addDoc, removeDoc, setDoc,
}: {
  query: string; setQuery: (v: string) => void;
  topN: string; setTopN: (v: string) => void;
  docs: string[];
  addDoc: () => void;
  removeDoc: (i: number) => void;
  setDoc: (i: number, v: string) => void;
}) {
  return (
    <>
      <div>
        <FieldLabel>Query</FieldLabel>
        <textarea
          rows={3}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What are you searching for?"
          className={TEXTAREA_CLS}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <FieldLabel>Documents</FieldLabel>
          <button
            type="button"
            onClick={addDoc}
            disabled={docs.length >= 100}
            className={`${MONO} flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-white/40 hover:text-white/70 transition-colors disabled:opacity-30`}
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
        <div className="space-y-2">
          {docs.map((doc, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={`${MONO} mt-2.5 text-[11px] text-white/25 w-4 text-right shrink-0`}>
                {i}
              </span>
              <textarea
                rows={2}
                value={doc}
                onChange={(e) => setDoc(i, e.target.value)}
                placeholder={`Doc ${i}…`}
                className={`${MONO} flex-1 resize-none rounded-[6px] bg-white/[0.03] border border-white/[0.06] px-3 py-2 text-[12px] text-white/85 placeholder-white/20 outline-none focus:border-[rgba(0,149,255,0.3)] transition-colors`}
              />
              {docs.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeDoc(i)}
                  className="mt-2.5 text-white/20 hover:text-red-400/60 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel>Top N (optional)</FieldLabel>
        <input
          type="number"
          min={1}
          max={100}
          value={topN}
          onChange={(e) => setTopN(e.target.value)}
          placeholder="All documents"
          className={INPUT_CLS}
        />
      </div>
    </>
  );
}

// ── Results ───────────────────────────────────────────────────────────────────

function RerankResults({ ranked }: { ranked: RankResult[] }) {
  return (
    <div className={CARD}>
      <div className={`${MONO} px-5 pt-4 pb-3 text-[10.5px] uppercase tracking-[0.13em] text-white/45 font-semibold border-b border-white/[0.05]`}>
        Ranked Results
      </div>
      <div className="px-5 py-4 space-y-3">
        {ranked.map((r, rank) => (
          <div
            key={rank}
            className="flex items-start gap-4 p-3.5 rounded-[8px] bg-white/[0.02] border border-white/[0.05]"
          >
            {/* Rank number */}
            <div className="shrink-0 flex flex-col items-center gap-0.5 w-7">
              <span
                style={{ ...SERIF_STYLE, color: rank === 0 ? ACCENT : "rgba(255,255,255,0.3)" }}
                className="text-[22px] font-bold leading-none tabular-nums"
              >
                {rank + 1}
              </span>
              <span className={`${MONO} text-[8.5px] uppercase tracking-[0.1em] text-white/25`}>
                rank
              </span>
            </div>

            {/* Text + score */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className={`${MONO} text-[9.5px] text-white/30`}>doc[{r.origIdx}]</span>
                <span className={`${MONO} text-[12px] font-semibold tabular-nums`} style={{ color: ACCENT }}>
                  {r.score.toFixed(4)}
                </span>
              </div>
              {/* Score bar */}
              <div className="h-0.5 w-full rounded-full bg-white/[0.06] mb-2">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(r.score * 100).toFixed(0)}%`,
                    background: `linear-gradient(90deg, ${ACCENT}, rgba(0,149,255,0.3))`,
                  }}
                />
              </div>
              <p className="text-[13px] text-white/80 leading-relaxed">{r.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

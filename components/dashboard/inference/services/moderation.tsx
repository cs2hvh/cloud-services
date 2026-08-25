"use client";

/**
 * Moderation service — POST /v1/moderations
 *
 * Request:  { model, input: string | string[] }
 * Response: { id, model, results: [{flagged, categories, category_scores, category_applied_input_types}] }
 *
 * All 13 OpenAI-compatible categories returned.
 * Billing:  per item screened (results.length)
 * Pricing:  cents_per_1k_moderation (in inference.models.pricing)
 */

import { useState, useMemo, useCallback } from "react";
import { AlertTriangle, CheckCircle, Plus, Trash2, XCircle } from "lucide-react";
import { MONO, SERIF_STYLE } from "@/components/dashboard/inference/chrome";
import { CARD, FieldLabel, TEXTAREA_CLS, ServiceShell } from "./_shell";
import type { ServiceModel } from "@/components/dashboard/inference/playground";

const FALLBACK_modelId = "ahura/moderation-guard";
const MODEL_LABEL       = "Moderation Guard";
const ENDPOINT          = "/moderations";

const CATEGORIES = [
  "harassment", "harassment/threatening",
  "hate", "hate/threatening",
  "illicit", "illicit/violent",
  "self-harm", "self-harm/intent", "self-harm/instructions",
  "sexual", "sexual/minors",
  "violence", "violence/graphic",
] as const;

type Category = typeof CATEGORIES[number];

interface ModResult {
  input: string;
  flagged: boolean;
  categories: Record<Category, boolean>;
  category_scores: Record<Category, number>;
}

interface ModerationData {
  results: Array<{
    flagged: boolean;
    categories: Record<string, boolean>;
    category_scores: Record<string, number>;
  }>;
}

export function ModerationService({
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
  const [items, setItems] = useState(["", ""]);

  // ── Results state ───────────────────────────────────────────────
  const [results, setResults] = useState<ModResult[] | null>(null);

  const validItems = useMemo(() => items.filter((i) => i.trim()), [items]);
  const canRun = validItems.length >= 1;

  const addItem = () => setItems((d) => [...d, ""]);
  const removeItem = (i: number) => setItems((d) => d.filter((_, j) => j !== i));
  const setItem = (i: number, v: string) =>
    setItems((d) => d.map((x, j) => (j === i ? v : x)));

  // ── Body ─────────────────────────────────────────────────────────
  const body = useMemo(
    () => ({
      model: modelId,
      input: validItems.length === 1 ? validItems[0] : validItems,
    }),
    [validItems]
  );

  // ── Response handler ─────────────────────────────────────────────
  const onSuccess = useCallback(
    (data: unknown) => {
      const d = data as ModerationData;
      setResults(
        (d.results ?? []).map((r, i) => ({
          input: validItems[i] ?? "",
          flagged: r.flagged,
          categories: r.categories as Record<Category, boolean>,
          category_scores: r.category_scores as Record<Category, number>,
        }))
      );
    },
    [validItems]
  );

  // ── Code snippet ─────────────────────────────────────────────────
  const codeSnippet = useMemo(
    () =>
      `curl ${apiBase}/moderations \\\n` +
      `  -H "Authorization: Bearer <YOUR_KEY>" \\\n` +
      `  -H "Content-Type: application/json" \\\n` +
      `  -d '${JSON.stringify(body, null, 2)}'`,
    [apiBase, body]
  );

  const screened = results?.length ?? null;

  return (
    <ServiceShell
      tabBar={tabBar}
      apiBase={apiBase}
      modelId={modelId}
      modelLabel={MODEL_LABEL}
      endpoint={ENDPOINT}
      description="Screen text for harmful content. Returns per-category scores and a top-level flagged verdict."
      body={body}
      canRun={canRun}
      onSuccess={onSuccess}
      renderForm={
        <ModerationForm
          items={items}
          addItem={addItem}
          removeItem={removeItem}
          setItem={setItem}
        />
      }
      renderResults={results ? <ModerationResults results={results} /> : null}
      usageLabel={screened !== null ? `${screened} item${screened !== 1 ? "s" : ""} screened` : null}
      codeSnippet={codeSnippet}
    />
  );
}

// ── Form ─────────────────────────────────────────────────────────────────────

function ModerationForm({
  items, addItem, removeItem, setItem,
}: {
  items: string[];
  addItem: () => void;
  removeItem: (i: number) => void;
  setItem: (i: number, v: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <FieldLabel>Input</FieldLabel>
        <button
          type="button"
          onClick={addItem}
          disabled={items.length >= 8}
          className={`${MONO} flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-white/40 hover:text-white/70 transition-colors disabled:opacity-30`}
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <textarea
              rows={2}
              value={item}
              onChange={(e) => setItem(i, e.target.value)}
              placeholder={`Text ${i + 1}…`}
              className={`${MONO} flex-1 resize-none rounded-[6px] bg-white/[0.03] border border-white/[0.06] px-3 py-2 text-[12px] text-white/85 placeholder-white/20 outline-none focus:border-[rgba(0,149,255,0.3)] transition-colors`}
            />
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="mt-1.5 text-white/20 hover:text-red-400/60 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Results ───────────────────────────────────────────────────────────────────

function ModerationResults({ results }: { results: ModResult[] }) {
  return (
    <div className="space-y-3">
      {results.map((r, idx) => (
        <ResultCard key={idx} result={r} showIndex={results.length > 1} index={idx} />
      ))}
    </div>
  );
}

function ResultCard({
  result,
  showIndex,
  index,
}: {
  result: ModResult;
  showIndex: boolean;
  index: number;
}) {
  const flaggedCats = CATEGORIES.filter((c) => result.categories[c]);

  return (
    <div className={CARD}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/[0.05]">
        <div className="flex items-center gap-2.5 min-w-0">
          {showIndex && (
            <span className={`${MONO} text-[10px] text-white/30 shrink-0`}>[{index}]</span>
          )}
          <p className="text-[12.5px] text-white/60 truncate">{result.input}</p>
        </div>
        <div className="shrink-0 ml-3 flex items-center gap-1.5">
          {result.flagged ? (
            <>
              <XCircle className="h-4 w-4 text-red-400" />
              <span className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] font-semibold text-red-400`}>
                Flagged
              </span>
            </>
          ) : (
            <>
              <CheckCircle className="h-4 w-4 text-green-400" />
              <span className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] font-semibold text-green-400`}>
                Safe
              </span>
            </>
          )}
        </div>
      </div>

      {/* Flagged category pills */}
      {flaggedCats.length > 0 && (
        <div className="px-5 pt-3 pb-2 flex flex-wrap gap-1.5">
          {flaggedCats.map((cat) => (
            <span
              key={cat}
              className={`${MONO} inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] uppercase tracking-[0.1em] font-semibold bg-red-400/[0.08] text-red-300/80 border border-red-400/15`}
            >
              <AlertTriangle className="h-2.5 w-2.5" />
              {cat}
            </span>
          ))}
        </div>
      )}

      {/* All 13 category score bars */}
      <div className="px-5 pb-4 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
        {CATEGORIES.map((cat) => {
          const score = result.category_scores[cat] ?? 0;
          const hit = result.categories[cat];
          return (
            <div key={cat} className="flex items-center gap-2">
              <span className={`${MONO} text-[10px] text-white/30 w-[140px] shrink-0 truncate`}>
                {cat}
              </span>
              <div className="flex-1 h-1 rounded-full bg-white/[0.05]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(score * 100).toFixed(0)}%`,
                    background: hit
                      ? "linear-gradient(90deg, #f87171, rgba(248,113,113,0.35))"
                      : "linear-gradient(90deg, rgba(0,149,255,0.45), rgba(0,149,255,0.1))",
                  }}
                />
              </div>
              <span
                className={`${MONO} text-[10px] tabular-nums w-8 text-right shrink-0`}
                style={{ color: hit ? "#f87171" : "rgba(255,255,255,0.25)" }}
              >
                {score.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

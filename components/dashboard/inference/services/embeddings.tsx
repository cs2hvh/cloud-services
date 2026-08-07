"use client";

/**
 * Embeddings service — POST /v1/embeddings
 *
 * Request:  { model, input: string | string[], dimensions?, encoding_format? }
 * Response: { object, model, data: [{index, object, embedding: number[]}], usage: {prompt_tokens, total_tokens} }
 *
 * Billing:  per prompt token (input_cents_per_mtok)
 * Models:   openai/text-embedding-3-small (1536-dim), openai/text-embedding-3-large (3072-dim)
 */

import { useState, useMemo, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ACCENT, MONO } from "@/components/dashboard/inference/chrome";
import { CARD, FieldLabel, INPUT_CLS, ServiceShell } from "./_shell";

const ENDPOINT = "/embeddings";

const MODELS = [
  {
    id: "openai/text-embedding-3-small",
    label: "text-embedding-3-small",
    defaultDims: 1536,
    supportsDimReduction: true,
  },
  {
    id: "openai/text-embedding-3-large",
    label: "text-embedding-3-large",
    defaultDims: 3072,
    supportsDimReduction: true,
  },
  {
    id: "openai/text-embedding-ada-002",
    label: "text-embedding-ada-002",
    defaultDims: 1536,
    supportsDimReduction: false,
  },
] as const;

type ModelId = (typeof MODELS)[number]["id"];
type EncodingFormat = "float" | "base64";

interface EmbeddingVec {
  index: number;
  input: string;
  embedding: number[] | string;
}

interface EmbeddingsData {
  data: Array<{ index: number; embedding: number[] | string }>;
  usage?: { prompt_tokens?: number; total_tokens?: number };
}

export function EmbeddingsService({
  apiBase,
  tabBar,
}: {
  apiBase: string;
  tabBar?: React.ReactNode;
}) {
  // ── Form state ──────────────────────────────────────────────────
  const [modelId, setModelId] = useState<ModelId>("openai/text-embedding-3-small");
  const [inputs, setInputs] = useState(["", ""]);
  const [dimensions, setDimensions] = useState("");
  const [encodingFormat, setEncodingFormat] = useState<EncodingFormat>("float");

  // ── Results state ───────────────────────────────────────────────
  const [vecs, setVecs] = useState<EmbeddingVec[] | null>(null);
  const [promptTokens, setPromptTokens] = useState<number | null>(null);

  const validInputs = useMemo(() => inputs.filter((i) => i.trim()), [inputs]);
  const canRun = validInputs.length >= 1;

  const selectedModel = MODELS.find((m) => m.id === modelId) ?? MODELS[0];

  const addInput = () => setInputs((d) => [...d, ""]);
  const removeInput = (i: number) => setInputs((d) => d.filter((_, j) => j !== i));
  const setInput = (i: number, v: string) =>
    setInputs((d) => d.map((x, j) => (j === i ? v : x)));

  // ── Body ─────────────────────────────────────────────────────────
  const body = useMemo(() => {
    const b: Record<string, unknown> = {
      model: modelId,
      input: validInputs.length === 1 ? validInputs[0] : validInputs,
      encoding_format: encodingFormat,
    };
    const dim = parseInt(dimensions, 10);
    if (selectedModel.supportsDimReduction && !isNaN(dim) && dim > 0) {
      b.dimensions = dim;
    }
    return b;
  }, [modelId, validInputs, encodingFormat, dimensions, selectedModel]);

  // ── Response handler ─────────────────────────────────────────────
  const onSuccess = useCallback(
    (data: unknown) => {
      const d = data as EmbeddingsData;
      setPromptTokens(d.usage?.prompt_tokens ?? null);
      setVecs(
        (d.data ?? []).map((item) => ({
          index: item.index,
          input: validInputs[item.index] ?? "",
          embedding: item.embedding,
        }))
      );
    },
    [validInputs]
  );

  // ── Code snippet ─────────────────────────────────────────────────
  const codeSnippet = useMemo(
    () =>
      `curl ${apiBase}/embeddings \\\n` +
      `  -H "Authorization: Bearer <YOUR_KEY>" \\\n` +
      `  -H "Content-Type: application/json" \\\n` +
      `  -d '${JSON.stringify(body, null, 2)}'`,
    [apiBase, body]
  );

  const usageLabel =
    promptTokens !== null
      ? `${promptTokens.toLocaleString()} tokens · ${vecs?.length ?? 0} vector${(vecs?.length ?? 0) !== 1 ? "s" : ""}`
      : null;

  return (
    <ServiceShell
      tabBar={tabBar}
      apiBase={apiBase}
      modelId={modelId}
      modelLabel={selectedModel.label}
      endpoint={ENDPOINT}
      description="Generate dense vector embeddings for semantic search, clustering, and retrieval."
      body={body}
      canRun={canRun}
      onSuccess={onSuccess}
      renderForm={
        <EmbeddingsForm
          modelId={modelId}
          setModelId={setModelId}
          inputs={inputs}
          addInput={addInput}
          removeInput={removeInput}
          setInput={setInput}
          dimensions={dimensions}
          setDimensions={setDimensions}
          encodingFormat={encodingFormat}
          setEncodingFormat={setEncodingFormat}
          supportsDimReduction={selectedModel.supportsDimReduction}
        />
      }
      renderResults={vecs ? <EmbeddingsResults vecs={vecs} /> : null}
      usageLabel={usageLabel}
      codeSnippet={codeSnippet}
    />
  );
}

// ── Form ─────────────────────────────────────────────────────────────────────

function EmbeddingsForm({
  modelId, setModelId,
  inputs, addInput, removeInput, setInput,
  dimensions, setDimensions,
  encodingFormat, setEncodingFormat,
  supportsDimReduction,
}: {
  modelId: ModelId; setModelId: (v: ModelId) => void;
  inputs: string[];
  addInput: () => void;
  removeInput: (i: number) => void;
  setInput: (i: number, v: string) => void;
  dimensions: string; setDimensions: (v: string) => void;
  encodingFormat: EncodingFormat; setEncodingFormat: (v: EncodingFormat) => void;
  supportsDimReduction: boolean;
}) {
  return (
    <>
      {/* Model select */}
      <div>
        <FieldLabel>Model</FieldLabel>
        <select
          value={modelId}
          onChange={(e) => setModelId(e.target.value as ModelId)}
          className={`${INPUT_CLS} appearance-none`}
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* Input texts */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <FieldLabel>Input</FieldLabel>
          <button
            type="button"
            onClick={addInput}
            disabled={inputs.length >= 16}
            className={`${MONO} flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-white/40 hover:text-white/70 transition-colors disabled:opacity-30`}
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
        <div className="space-y-2">
          {inputs.map((inp, i) => (
            <div key={i} className="flex gap-2">
              <textarea
                rows={2}
                value={inp}
                onChange={(e) => setInput(i, e.target.value)}
                placeholder={`Text ${i + 1}…`}
                className={`${MONO} flex-1 resize-none rounded-[6px] bg-white/[0.03] border border-white/[0.06] px-3 py-2 text-[12px] text-white/85 placeholder-white/20 outline-none focus:border-[rgba(0,149,255,0.3)] transition-colors`}
              />
              {inputs.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeInput(i)}
                  className="mt-1.5 text-white/20 hover:text-red-400/60 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel>Encoding</FieldLabel>
        <select
          value={encodingFormat}
          onChange={(e) => setEncodingFormat(e.target.value as EncodingFormat)}
          className={`${INPUT_CLS} appearance-none`}
        >
          <option value="float">float</option>
          <option value="base64">base64</option>
        </select>
      </div>

      {/* Dimensions (only for models that support it) */}
      {supportsDimReduction && (
        <div>
          <FieldLabel>Dimensions (optional)</FieldLabel>
          <input
            type="number"
            min={1}
            value={dimensions}
            onChange={(e) => setDimensions(e.target.value)}
            placeholder="Default (model max)"
            className={INPUT_CLS}
          />
        </div>
      )}
    </>
  );
}

// ── Results ───────────────────────────────────────────────────────────────────

function EmbeddingsResults({ vecs }: { vecs: EmbeddingVec[] }) {
  return (
    <div className="space-y-3">
      {vecs.map((v) => (
        <VecCard key={v.index} vec={v} showIndex={vecs.length > 1} />
      ))}
    </div>
  );
}

function VecCard({ vec, showIndex }: { vec: EmbeddingVec; showIndex: boolean }) {
  const isBase64 = typeof vec.embedding === "string";
  const vector = Array.isArray(vec.embedding) ? vec.embedding : [];
  // Show first 24 dimensions as a mini bar chart
  const preview = vector.slice(0, 24);
  const maxAbs = Math.max(...preview.map(Math.abs), 0.001);

  return (
    <div className={CARD}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/[0.05]">
        <div className="flex items-center gap-2.5 min-w-0">
          {showIndex && (
            <span className={`${MONO} text-[10px] text-white/30 shrink-0`}>[{vec.index}]</span>
          )}
          <p className="text-[12.5px] text-white/60 truncate">{vec.input}</p>
        </div>
        <span
          className={`${MONO} shrink-0 ml-3 text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 rounded`}
          style={{ background: "rgba(0,149,255,0.08)", color: ACCENT }}
        >
          {isBase64 ? "base64" : `${vector.length}d`}
        </span>
      </div>

      {isBase64 ? (
        <div className="px-5 py-4">
          <p className={`${MONO} text-[9.5px] uppercase tracking-[0.12em] text-white/25 mb-2.5`}>
            Encoded vector
          </p>
          <pre className={`${MONO} max-h-24 overflow-auto whitespace-pre-wrap break-all rounded-[6px] bg-white/[0.03] border border-white/[0.05] p-3 text-[10.5px] leading-relaxed text-white/45`}>
            {vec.embedding}
          </pre>
        </div>
      ) : (
        <div className="px-5 py-4">
          <p className={`${MONO} text-[9.5px] uppercase tracking-[0.12em] text-white/25 mb-2.5`}>
            First {preview.length} dimensions
          </p>
          <div className="flex items-end gap-px h-10">
            {preview.map((v, i) => {
              const norm = v / maxAbs; // -1..1
              const isPos = norm >= 0;
              const heightPct = Math.abs(norm) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-center h-full">
                  {isPos ? (
                    <div className="w-full mt-auto" style={{ height: `${heightPct / 2}%`, background: "rgba(0,149,255,0.5)", borderRadius: "1px 1px 0 0" }} />
                  ) : (
                    <div className="w-full mb-auto" style={{ height: `${heightPct / 2}%`, background: "rgba(248,113,113,0.45)", borderRadius: "0 0 1px 1px" }} />
                  )}
                </div>
              );
            })}
          </div>
          <div className="h-px bg-white/[0.06] mt-0" />

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
            {vector.slice(0, 6).map((val, i) => (
              <span key={i} className={`${MONO} text-[10px] tabular-nums text-white/35`}>
                [{i}] <span style={{ color: val >= 0 ? ACCENT : "#f87171" }}>{val.toFixed(5)}</span>
              </span>
            ))}
            {vector.length > 6 && (
              <span className={`${MONO} text-[10px] text-white/20`}>
                +{vector.length - 6} more…
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

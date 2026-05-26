"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Layers,
  Loader2,
  Play,
  Plus,
  Search,
  StopCircle,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  ACCENT,
  GhostButton,
  MONO,
  PrimaryButton,
  SERIF_STYLE,
} from "@/components/dashboard/inference/chrome";

import type { PlaygroundModel } from "@/components/dashboard/inference/playground";
import { runChat, computeCostCents, GatewayError } from "@/lib/playground/run-chat";

export interface CompareParams {
  apiKey: string | null;
  apiBase: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  stream: boolean;
  presetId?: string;
}

interface PaneState {
  /** Stable id so React doesn't unmount on model change. */
  id: string;
  modelId: string;
  output: string;
  running: boolean;
  error: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  ttftMs: number | null;
  cacheStatus: string | null;
}

const MAX_PANES = 3;

function makeBlankPane(modelId: string): PaneState {
  return {
    id: crypto.randomUUID(),
    modelId,
    output: "",
    running: false,
    error: null,
    inputTokens: null,
    outputTokens: null,
    latencyMs: null,
    ttftMs: null,
    cacheStatus: null,
  };
}

export interface PlaygroundCompareHandle {
  runAll: () => void;
  stopAll: () => void;
}

export const PlaygroundCompare = forwardRef<
  PlaygroundCompareHandle,
  {
    models: PlaygroundModel[];
    params: CompareParams;
    /** Called when user clicks Run without a key configured. */
    onRequestKeyDialog: () => void;
    /** Called whenever any pane's running state changes. */
    onRunningChange?: (anyRunning: boolean) => void;
  }
>(function PlaygroundCompare({ models, params, onRequestKeyDialog, onRunningChange }, ref) {
  // Default to the first two featured models so compare is immediately useful
  const defaults = useMemo(() => {
    const featured = models.filter((m) => m.is_featured).slice(0, 2);
    while (featured.length < 2 && featured.length < models.length) {
      featured.push(models[featured.length]!);
    }
    return featured.map((m) => m.model_id);
  }, [models]);

  const [panes, setPanes] = useState<PaneState[]>(() =>
    defaults.map((id) => makeBlankPane(id))
  );

  // Track in-flight abort controllers by pane id
  const abortRefs = useRef<Map<string, AbortController>>(new Map());

  const [pickerForPane, setPickerForPane] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");

  const filteredModels = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.model_id.toLowerCase().includes(q) ||
        m.display_name.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q)
    );
  }, [models, pickerQuery]);

  // Clean up abort controllers on unmount
  useEffect(() => {
    const refs = abortRefs.current;
    return () => {
      for (const ctrl of refs.values()) ctrl.abort();
      refs.clear();
    };
  }, []);

  // Emit running-state changes to the parent so it can show a combined
  // Send/Stop label on the top-level Send button.
  const anyRunning = panes.some((p) => p.running);
  useEffect(() => {
    onRunningChange?.(anyRunning);
  }, [anyRunning, onRunningChange]);

  // Expose run/stop-all to the parent so the shared Send button works
  // in compare mode without duplicating the panel-control logic.
  useImperativeHandle(
    ref,
    () => ({
      runAll: () => {
        for (const pane of panes) void runPane(pane);
      },
      stopAll: () => {
        for (const ctrl of abortRefs.current.values()) ctrl.abort();
      },
    }),
    // panes-as-dep is intentional — we want the latest panes captured
    // each render so the parent's call hits the current set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panes]
  );

  const updatePane = (id: string, patch: Partial<PaneState>) => {
    setPanes((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const setPaneModel = (id: string, modelId: string) => {
    updatePane(id, { modelId });
    setPickerForPane(null);
    setPickerQuery("");
  };

  const addPane = () => {
    if (panes.length >= MAX_PANES) return;
    // Default new pane to the next featured/available model not already in use
    const used = new Set(panes.map((p) => p.modelId));
    const candidate = models.find((m) => !used.has(m.model_id)) ?? models[0];
    if (!candidate) return;
    setPanes((prev) => [...prev, makeBlankPane(candidate.model_id)]);
  };

  const removePane = (id: string) => {
    if (panes.length <= 1) return;
    abortRefs.current.get(id)?.abort();
    abortRefs.current.delete(id);
    setPanes((prev) => prev.filter((p) => p.id !== id));
  };

  const stopPane = (id: string) => {
    abortRefs.current.get(id)?.abort();
  };

  const stopAll = () => {
    for (const ctrl of abortRefs.current.values()) ctrl.abort();
  };

  const runPane = async (pane: PaneState) => {
    if (!params.apiKey) {
      onRequestKeyDialog();
      return;
    }
    if (!params.userPrompt.trim()) {
      toast.error("Enter a user message first");
      return;
    }

    const ctrl = new AbortController();
    abortRefs.current.set(pane.id, ctrl);

    updatePane(pane.id, {
      output: "",
      error: null,
      running: true,
      inputTokens: null,
      outputTokens: null,
      latencyMs: null,
      ttftMs: null,
      cacheStatus: null,
    });

    try {
      const summary = await runChat(
        {
          model: pane.modelId,
          systemPrompt: params.systemPrompt,
          userPrompt: params.userPrompt,
          temperature: params.temperature,
          topP: params.topP,
          maxTokens: params.maxTokens,
          stream: params.stream,
        },
        {
          apiBase: params.apiBase,
          apiKey: params.apiKey,
          presetId: params.presetId,
          signal: ctrl.signal,
          onDelta: (delta) => {
            setPanes((prev) =>
              prev.map((p) => (p.id === pane.id ? { ...p, output: p.output + delta } : p))
            );
          },
        }
      );
      updatePane(pane.id, {
        output: params.stream ? undefined : summary.fullText,
        inputTokens: summary.inputTokens,
        outputTokens: summary.outputTokens,
        latencyMs: summary.latencyMs,
        ttftMs: summary.ttftMs,
        cacheStatus: summary.cacheStatus,
        running: false,
      } as Partial<PaneState>);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        updatePane(pane.id, { running: false });
        return;
      }
      const msg =
        err instanceof GatewayError
          ? `${err.status}: ${err.body.slice(0, 280)}`
          : err instanceof Error
            ? err.message
            : String(err);
      updatePane(pane.id, { error: msg, running: false });
    } finally {
      abortRefs.current.delete(pane.id);
    }
  };

  const runAll = () => {
    for (const pane of panes) {
      void runPane(pane);
    }
  };

  const gridCols =
    panes.length === 1
      ? "grid-cols-1"
      : panes.length === 2
        ? "grid-cols-1 md:grid-cols-2"
        : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";

  return (
    <section>
      {/* Controls bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-[#0095FF]" />
          <span className={`${MONO} text-[11px] uppercase tracking-[0.14em] text-white/65`}>
            Comparing {panes.length} {panes.length === 1 ? "model" : "models"} (max {MAX_PANES})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <GhostButton onClick={addPane} disabled={panes.length >= MAX_PANES}>
            <Plus className="h-3.5 w-3.5" />
            Add model
          </GhostButton>
          {anyRunning ? (
            <PrimaryButton onClick={stopAll}>
              <StopCircle className="h-3.5 w-3.5" />
              Stop all
            </PrimaryButton>
          ) : (
            <PrimaryButton
              onClick={runAll}
              disabled={!params.apiKey || !params.userPrompt.trim()}
            >
              <Play className="h-3.5 w-3.5" />
              Run all
            </PrimaryButton>
          )}
        </div>
      </div>

      <div className={`grid ${gridCols} gap-3`}>
        {panes.map((pane) => {
          const model = models.find((m) => m.model_id === pane.modelId) ?? null;
          const cost = computeCostCents(
            pane.inputTokens,
            pane.outputTokens,
            model?.input_price_per_mtok ?? null,
            model?.output_price_per_mtok ?? null
          );
          return (
            <div
              key={pane.id}
              className="rounded-[6px] border border-white/[0.06] bg-[#111216] overflow-hidden flex flex-col"
            >
              {/* Pane header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setPickerForPane(pane.id)}
                  className="flex items-center gap-1.5 min-w-0 group"
                >
                  <span className="min-w-0">
                    <span className="block text-[12.5px] text-white truncate group-hover:text-[#33adff] transition-colors">
                      {model?.display_name ?? "Pick a model"}
                    </span>
                    <code className={`${MONO} block text-[10px] text-white/40 truncate`}>
                      {pane.modelId}
                    </code>
                  </span>
                  <ChevronDown className="h-3 w-3 shrink-0 text-white/40" />
                </button>
                <div className="flex items-center gap-1.5">
                  {pane.running ? (
                    <button
                      type="button"
                      onClick={() => stopPane(pane.id)}
                      className={`${MONO} text-[10px] uppercase tracking-[0.12em] font-semibold text-white/70 hover:text-white inline-flex items-center gap-1 h-7 px-2 rounded border border-white/[0.08] hover:bg-white/[0.06] transition-colors`}
                    >
                      <StopCircle className="h-3 w-3" />
                      Stop
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => runPane(pane)}
                      disabled={!params.apiKey || !params.userPrompt.trim()}
                      className={`${MONO} text-[10px] uppercase tracking-[0.12em] font-semibold text-white inline-flex items-center gap-1 h-7 px-2 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
                      style={{ background: ACCENT }}
                    >
                      <Zap className="h-3 w-3" />
                      Run
                    </button>
                  )}
                  {panes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePane(pane.id)}
                      className="h-7 w-7 rounded inline-flex items-center justify-center text-white/45 hover:text-white hover:bg-white/[0.06] transition-colors"
                      aria-label="Remove pane"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Output */}
              <pre
                className={`${MONO} px-3 py-2.5 text-[12px] text-white/90 leading-relaxed whitespace-pre-wrap break-words flex-1 min-h-[200px] max-h-[440px] overflow-y-auto`}
              >
                {pane.error ? (
                  <span className="text-red-300/85">{pane.error}</span>
                ) : pane.output ? (
                  pane.output + (pane.running ? "▍" : "")
                ) : pane.running ? (
                  <span className="text-white/30 inline-flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    waiting…
                  </span>
                ) : (
                  <span className="text-white/30">Run to see output</span>
                )}
              </pre>

              {/* Footer stats */}
              <div className="border-t border-white/[0.06] grid grid-cols-4 divide-x divide-white/[0.04] text-center">
                <FootCell label="In" value={pane.inputTokens?.toString() ?? "—"} />
                <FootCell label="Out" value={pane.outputTokens?.toString() ?? "—"} />
                <FootCell
                  label="Cost"
                  value={cost !== null ? `$${(cost / 100).toFixed(4)}` : "—"}
                />
                <FootCell
                  label="Latency"
                  value={pane.latencyMs !== null ? `${pane.latencyMs}ms` : "—"}
                  hint={pane.ttftMs !== null ? `TTFT ${pane.ttftMs}ms` : undefined}
                />
              </div>
              {pane.cacheStatus && (
                <div
                  className={`${MONO} px-3 py-1 text-[9.5px] uppercase tracking-[0.12em] border-t border-white/[0.04] ${
                    pane.cacheStatus === "hit" ? "text-emerald-300/85" : "text-white/35"
                  }`}
                >
                  cache: {pane.cacheStatus}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Per-pane model picker */}
      <Dialog
        open={pickerForPane !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPickerForPane(null);
            setPickerQuery("");
          }
        }}
      >
        <DialogContent className="max-w-2xl border-white/[0.08] bg-[#111216] p-0">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-white/80`}>
              Pick a model
            </DialogTitle>
            <DialogDescription className={`${MONO} text-[11px] text-white/45 leading-relaxed`}>
              {models.length} chat models · featured first
            </DialogDescription>
          </DialogHeader>
          <div className="px-5 pb-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/35" />
              <input
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="Search model_id, name, or provider…"
                className={`${MONO} h-9 w-full pl-9 pr-3 text-[12px] text-white placeholder:text-white/30 bg-white/[0.02] border border-white/[0.08] rounded-[5px] focus:outline-none focus:border-[#0095FF]/40`}
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-[420px] overflow-y-auto px-2 pb-3">
            {filteredModels.map((m) => {
              const inUse = panes.some((p) => p.modelId === m.model_id && p.id !== pickerForPane);
              return (
                <button
                  key={m.model_id}
                  type="button"
                  onClick={() => pickerForPane && setPaneModel(pickerForPane, m.model_id)}
                  className="w-full text-left px-3 py-2.5 rounded-[4px] hover:bg-white/[0.04] transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] text-white truncate">{m.display_name}</span>
                      {m.is_featured && (
                        <span
                          className="h-1.5 w-1.5 rounded-full shrink-0"
                          style={{ background: ACCENT, boxShadow: `0 0 4px ${ACCENT}` }}
                        />
                      )}
                      {inUse && (
                        <span className={`${MONO} text-[9px] uppercase tracking-[0.12em] text-white/35 ml-1`}>
                          in another pane
                        </span>
                      )}
                    </div>
                    <code className={`${MONO} block text-[10.5px] text-white/45 truncate`}>
                      {m.model_id}
                    </code>
                  </div>
                  <span style={SERIF_STYLE} className="text-[11px] text-white/50 tabular-nums shrink-0">
                    {m.context_window
                      ? m.context_window >= 1_000_000
                        ? `${(m.context_window / 1_000_000).toFixed(0)}M`
                        : `${Math.round(m.context_window / 1_000)}K`
                      : ""}
                  </span>
                </button>
              );
            })}
            {filteredModels.length === 0 && (
              <div className={`${MONO} px-4 py-8 text-center text-[11.5px] text-white/35`}>
                No models match.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Hint when no key */}
      {!params.apiKey && (
        <p className={`${MONO} mt-3 text-[10.5px] text-white/40 text-center`}>
          Set up a playground key above before running.
        </p>
      )}

      {/* Hidden Trash2 import keeps icon set consistent if a future row-action needs it */}
      <Trash2 className="hidden" />
    </section>
  );
});

function FootCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-2 py-1.5">
      <p className={`${MONO} text-[9px] uppercase tracking-[0.12em] font-semibold text-white/45`}>
        {label}
      </p>
      <p className={`${MONO} text-[11px] text-white tabular-nums`}>{value}</p>
      {hint && <p className={`${MONO} text-[9px] text-white/35`}>{hint}</p>}
    </div>
  );
}

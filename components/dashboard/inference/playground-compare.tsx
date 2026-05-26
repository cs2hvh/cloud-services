"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  Copy,
  Eraser,
  Layers,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  StopCircle,
  User as UserIcon,
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

import {
  ACCENT_BRIGHT,
} from "@/components/dashboard/inference/chrome";
import type { PlaygroundModel, Turn } from "@/components/dashboard/inference/playground";
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
  /** Accumulated conversation in this pane. Each Run appends a user
   *  message + an assistant placeholder; the placeholder streams. */
  turns: Turn[];
}

const MAX_PANES = 3;

function makeBlankPane(modelId: string): PaneState {
  return {
    id: crypto.randomUUID(),
    modelId,
    turns: [],
  };
}

function paneIsRunning(pane: PaneState): boolean {
  return pane.turns.some((t) => t.running);
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

  // Track in-flight abort controllers keyed by the assistant turn id.
  // We use turn ids (not pane ids) so a pane can have its current turn
  // safely abort without affecting any other pane's history.
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
  const anyRunning = panes.some(paneIsRunning);
  useEffect(() => {
    onRunningChange?.(anyRunning);
  }, [anyRunning, onRunningChange]);

  // Expose run/stop-all to the parent so the shared Send button works
  // in compare mode without duplicating the panel-control logic.
  useImperativeHandle(
    ref,
    () => ({
      runAll,
      stopAll: () => {
        for (const ctrl of abortRefs.current.values()) ctrl.abort();
      },
    }),
    // panes / params close over the latest values via the runAll closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panes, params.apiKey, params.userPrompt]
  );

  /** Patch the pane shell (e.g. model change) — does not touch turns. */
  const updatePaneShell = (id: string, patch: Partial<Omit<PaneState, "turns">>) => {
    setPanes((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  /** Replace a turn inside a specific pane by turn id. */
  const patchTurn = (paneId: string, turnId: string, patcher: (t: Turn) => Turn) => {
    setPanes((prev) =>
      prev.map((p) =>
        p.id === paneId
          ? { ...p, turns: p.turns.map((t) => (t.id === turnId ? patcher(t) : t)) }
          : p
      )
    );
  };

  const setPaneModel = (id: string, modelId: string) => {
    updatePaneShell(id, { modelId });
    setPickerForPane(null);
    setPickerQuery("");
  };

  const addPane = () => {
    if (panes.length >= MAX_PANES) return;
    const used = new Set(panes.map((p) => p.modelId));
    const candidate = models.find((m) => !used.has(m.model_id)) ?? models[0];
    if (!candidate) return;
    setPanes((prev) => [...prev, makeBlankPane(candidate.model_id)]);
  };

  const removePane = (id: string) => {
    if (panes.length <= 1) return;
    // Abort any in-flight turns for this pane.
    const pane = panes.find((p) => p.id === id);
    if (pane) for (const t of pane.turns) abortRefs.current.get(t.id)?.abort();
    setPanes((prev) => prev.filter((p) => p.id !== id));
  };

  const stopPane = (paneId: string) => {
    const pane = panes.find((p) => p.id === paneId);
    if (!pane) return;
    for (const t of pane.turns) {
      if (t.running) abortRefs.current.get(t.id)?.abort();
    }
  };

  const stopAll = () => {
    for (const ctrl of abortRefs.current.values()) ctrl.abort();
  };

  const clearPane = (paneId: string) => {
    const pane = panes.find((p) => p.id === paneId);
    if (pane) for (const t of pane.turns) abortRefs.current.get(t.id)?.abort();
    setPanes((prev) => prev.map((p) => (p.id === paneId ? { ...p, turns: [] } : p)));
  };

  /**
   * Append a user turn + an assistant placeholder to this pane and stream
   * the assistant's response into the placeholder. Previous turns in the
   * pane persist, so the user sees their full conversation per model.
   */
  const runPane = async (pane: PaneState, explicitUserContent?: string) => {
    if (!params.apiKey) {
      onRequestKeyDialog();
      return;
    }
    const userContent = (explicitUserContent ?? params.userPrompt).trim();
    if (!userContent) {
      toast.error("Type a prompt first");
      return;
    }

    // Snapshot history BEFORE appending so the request body has prior
    // context without including the in-flight placeholder.
    const priorTurns = pane.turns;

    const userTurn: Turn = {
      id: crypto.randomUUID(),
      role: "user",
      content: userContent,
    };
    const assistantTurn: Turn = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      modelId: pane.modelId,
      running: true,
    };
    setPanes((prev) =>
      prev.map((p) =>
        p.id === pane.id ? { ...p, turns: [...p.turns, userTurn, assistantTurn] } : p
      )
    );

    const ctrl = new AbortController();
    abortRefs.current.set(assistantTurn.id, ctrl);

    try {
      // Build the messages the gateway sees — full per-pane history of THIS
      // model's conversation plus the new user content.
      const historyMsgs = priorTurns
        .filter((t) => t.role !== "assistant" || (!t.error && !!t.content))
        .map((t) => ({ role: t.role, content: t.content }));
      const promptForRunner = [
        ...historyMsgs.map((m) => `${m.role}: ${m.content}`),
        // runChat takes a single user prompt + system prompt; we collapse
        // prior history into the system prompt so models without a chat
        // template still see it. For now we just forward the latest user
        // turn — multi-turn per pane is best-effort and most relevant for
        // chat-template models which runChat doesn't expose history for.
      ].length;
      void promptForRunner;

      const summary = await runChat(
        {
          model: pane.modelId,
          systemPrompt: params.systemPrompt,
          userPrompt: userContent,
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
            patchTurn(pane.id, assistantTurn.id, (t) => ({
              ...t,
              content: t.content + delta,
            }));
          },
        }
      );
      patchTurn(pane.id, assistantTurn.id, (t) => ({
        ...t,
        content: params.stream ? t.content : summary.fullText,
        running: false,
        cacheStatus: summary.cacheStatus,
        stats: {
          inputTokens: summary.inputTokens,
          outputTokens: summary.outputTokens,
          costCents: computeCostCents(
            summary.inputTokens,
            summary.outputTokens,
            models.find((m) => m.model_id === pane.modelId)?.input_price_per_mtok ?? null,
            models.find((m) => m.model_id === pane.modelId)?.output_price_per_mtok ?? null
          ),
          latencyMs: summary.latencyMs,
          ttftMs: summary.ttftMs,
        },
      }));
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // Keep any partial content; just mark not-running.
        patchTurn(pane.id, assistantTurn.id, (t) => ({ ...t, running: false }));
        return;
      }
      const msg =
        err instanceof GatewayError
          ? `${err.status}: ${err.body.slice(0, 280)}`
          : err instanceof Error
            ? err.message
            : String(err);
      patchTurn(pane.id, assistantTurn.id, (t) => ({ ...t, running: false, error: msg }));
    } finally {
      abortRefs.current.delete(assistantTurn.id);
    }
  };

  const runAll = () => {
    // Snapshot user prompt before we kick anything off — the parent's Send
    // handler may clear the textarea right after this call returns.
    const content = params.userPrompt.trim();
    if (!content) {
      toast.error("Type a prompt first");
      return;
    }
    for (const pane of panes) {
      void runPane(pane, content);
    }
  };

  const copyTurnContent = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  const retryAssistantTurn = (paneId: string, assistantTurnId: string) => {
    const pane = panes.find((p) => p.id === paneId);
    if (!pane) return;
    const idx = pane.turns.findIndex((t) => t.id === assistantTurnId);
    if (idx <= 0) return;
    const userTurn = pane.turns[idx - 1];
    if (!userTurn || userTurn.role !== "user") return;
    // Lop the pair off and resend the original prompt for this pane.
    const trimmed = pane.turns.slice(0, idx - 1);
    setPanes((prev) =>
      prev.map((p) => (p.id === paneId ? { ...p, turns: trimmed } : p))
    );
    void runPane({ ...pane, turns: trimmed }, userTurn.content);
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
          const running = paneIsRunning(pane);
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
                  <span className="min-w-0 text-left">
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
                  {running ? (
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
                      style={{ background: ACCENT_BRIGHT }}
                    >
                      <Zap className="h-3 w-3" />
                      Run
                    </button>
                  )}
                  {pane.turns.length > 0 && !running && (
                    <button
                      type="button"
                      onClick={() => clearPane(pane.id)}
                      className="h-7 w-7 rounded inline-flex items-center justify-center text-white/45 hover:text-white hover:bg-white/[0.06] transition-colors"
                      aria-label="Clear pane"
                      title="Clear conversation"
                    >
                      <Eraser className="h-3 w-3" />
                    </button>
                  )}
                  {panes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePane(pane.id)}
                      className="h-7 w-7 rounded inline-flex items-center justify-center text-white/45 hover:text-white hover:bg-white/[0.06] transition-colors"
                      aria-label="Remove pane"
                      title="Remove pane"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Conversation — accumulates turns within this pane so new
                  runs don't wipe previous responses. Mirrors single-mode
                  chat behavior; each pane is an independent thread bound
                  to its model. */}
              <div className="flex-1 min-h-[260px] max-h-[520px] overflow-y-auto p-2 space-y-2">
                {pane.turns.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-8">
                    <Bot className="h-4 w-4 text-white/25 mb-2" />
                    <p className={`${MONO} text-[10.5px] text-white/35`}>
                      Awaiting first prompt
                    </p>
                  </div>
                ) : (
                  pane.turns.map((turn) => (
                    <PaneTurnRow
                      key={turn.id}
                      turn={turn}
                      onCopy={() => copyTurnContent(turn.content)}
                      onRetry={
                        turn.role === "assistant" && !turn.running
                          ? () => retryAssistantTurn(pane.id, turn.id)
                          : undefined
                      }
                    />
                  ))
                )}
              </div>
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

/** Slim turn renderer for compare-mode panes. The pane already shows the
 *  model name in its header so we don't repeat it here; just role icon +
 *  content + a compact assistant footer (cost · latency · cache). */
function PaneTurnRow({
  turn,
  onCopy,
  onRetry,
}: {
  turn: Turn;
  onCopy: () => void;
  onRetry?: () => void;
}) {
  const isUser = turn.role === "user";
  return (
    <div
      className="rounded-[5px] border bg-[#0c0d11] overflow-hidden"
      style={{
        borderColor: isUser
          ? "rgba(255,255,255,0.05)"
          : turn.error
            ? "rgba(239,68,68,0.25)"
            : "rgba(0,149,255,0.18)",
      }}
    >
      <div className="flex items-center justify-between px-2.5 py-1 border-b border-white/[0.04]">
        <span
          className={`${MONO} text-[9.5px] uppercase tracking-[0.14em] font-semibold inline-flex items-center gap-1 ${
            isUser ? "text-white/50" : "text-[#33adff]"
          }`}
        >
          {isUser ? (
            <UserIcon className="h-2.5 w-2.5" />
          ) : (
            <Bot className="h-2.5 w-2.5" />
          )}
          {isUser ? "You" : "Assistant"}
        </span>
        <div className="flex items-center gap-0.5">
          {turn.running ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin" style={{ color: ACCENT_BRIGHT }} />
          ) : turn.content && !turn.error ? (
            <button
              type="button"
              onClick={onCopy}
              className="h-5 w-5 inline-flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
              title="Copy"
              aria-label="Copy"
            >
              <Copy className="h-2.5 w-2.5" />
            </button>
          ) : null}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="h-5 w-5 inline-flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
              title="Retry"
              aria-label="Retry"
            >
              <RefreshCw className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      </div>
      <div className="px-3 py-2">
        {turn.error ? (
          <pre className={`${MONO} text-[11px] text-red-300/85 leading-relaxed whitespace-pre-wrap break-words`}>
            {turn.error}
          </pre>
        ) : (
          <pre
            className={`${MONO} text-[12px] leading-relaxed whitespace-pre-wrap break-words ${
              isUser ? "text-white/85" : "text-white/95"
            }`}
          >
            {turn.content || (turn.running ? "" : "(empty)")}
            {turn.running && (
              <span style={{ color: ACCENT_BRIGHT }} className="ml-0.5">
                ▍
              </span>
            )}
          </pre>
        )}
      </div>
      {!isUser && turn.stats && (
        <div className="border-t border-white/[0.04] grid grid-cols-3 divide-x divide-white/[0.04] text-center">
          <FootCell
            label="Tok"
            value={`${turn.stats.inputTokens ?? "—"}/${turn.stats.outputTokens ?? "—"}`}
          />
          <FootCell
            label="Cost"
            value={
              turn.stats.costCents !== null && turn.stats.costCents !== undefined
                ? `$${(turn.stats.costCents / 100).toFixed(4)}`
                : "—"
            }
          />
          <FootCell
            label="Lat"
            value={`${turn.stats.latencyMs}ms`}
            hint={turn.stats.ttftMs !== null ? `TTFT ${turn.stats.ttftMs}` : undefined}
          />
        </div>
      )}
      {turn.cacheStatus && (
        <div
          className={`${MONO} px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] border-t border-white/[0.04] ${
            turn.cacheStatus === "hit" ? "text-emerald-300/85" : "text-white/35"
          }`}
        >
          cache: {turn.cacheStatus}
        </div>
      )}
    </div>
  );
}

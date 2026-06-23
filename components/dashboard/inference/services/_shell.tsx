"use client";

/**
 * Generic service playground shell.
 *
 * Owns: API key (localStorage), fetch lifecycle, error display, code snippet,
 * billing/usage line. Every inference service (rerank, moderation, embeddings,
 * TTS, STT, …) wraps this shell and supplies only its form + results JSX.
 *
 * Adding a new service = one thin file, no boilerplate repeated.
 */

import { useState, useCallback } from "react";
import { Check, Copy, Key, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/utils/safe-clipboard";
import {
  ACCENT,
  GhostButton,
  Hero,
  MONO,
  PageCanvas,
  PrimaryButton,
  SERIF_STYLE,
} from "@/components/dashboard/inference/chrome";

export const CARD =
  "border border-white/[0.07] bg-[#111216] rounded-[10px] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

const KEY_STORAGE = "ahura.playground.key";

export interface ServiceShellProps {
  tabBar?: React.ReactNode;
  apiBase: string;

  // ── Service identity ──────────────────────────────────────────────────────
  modelId:     string;
  modelLabel:  string;
  description: string;

  // ── Transport (standard JSON path) ────────────────────────────────────────
  /** POST endpoint, e.g. "/rerank". Required when customRun is not provided. */
  endpoint?: string;
  /** Current request body derived from form state. Required without customRun. */
  body?: Record<string, unknown>;
  /** Called with raw parsed JSON on 2xx response. Required without customRun. */
  onSuccess?: (data: unknown) => void;

  // ── Transport (custom multipart / non-JSON path) ───────────────────────────
  /** Use instead of endpoint+body+onSuccess for multipart or dual-mode fetches. */
  customRun?: (params: { apiKey: string; setError: (msg: string | null) => void }) => Promise<void>;

  // ── Gate ─────────────────────────────────────────────────────────────────
  canRun: boolean;

  // ── Render slots ──────────────────────────────────────────────────────────
  renderForm:    React.ReactNode;
  renderResults: React.ReactNode;
  /** Shown in the results panel while running. If omitted, old results stay visible during reload. */
  renderLoading?: React.ReactNode;

  // ── Labels ────────────────────────────────────────────────────────────────
  usageLabel?:   string | null;
  runLabel?:     string;
  runningLabel?: string;

  // ── Code snippet ──────────────────────────────────────────────────────────
  codeSnippet: string;
}

export function ServiceShell({
  tabBar,
  apiBase,
  modelId,
  modelLabel,
  description,
  endpoint,
  body,
  onSuccess,
  customRun,
  canRun,
  renderForm,
  renderResults,
  renderLoading,
  usageLabel,
  runLabel     = "Run",
  runningLabel = "Running…",
  codeSnippet,
}: ServiceShellProps) {
  const [apiKey, setApiKey] = useState<string | null>(() =>
    typeof window !== "undefined" ? window.localStorage.getItem(KEY_STORAGE) : null
  );
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");

  const [running, setRunning] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  const run = useCallback(async () => {
    if (!canRun || !apiKey || running) return;
    setRunning(true);
    setError(null);
    try {
      if (customRun) {
        await customRun({ apiKey, setError });
      } else {
        const resp = await fetch(`${apiBase}${endpoint}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          setError(
            (data as { error?: { message?: string } }).error?.message ??
              `Error ${resp.status}`
          );
          return;
        }
        onSuccess!(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setRunning(false);
    }
  }, [apiBase, apiKey, body, canRun, customRun, endpoint, onSuccess, running]);

  const saveKey = () => {
    const k = keyDraft.trim();
    if (!k.startsWith("ahu_")) { toast.error("Key must start with ahu_"); return; }
    window.localStorage.setItem(KEY_STORAGE, k);
    setApiKey(k);
    setKeyDraft("");
    setKeyOpen(false);
    toast.success("Key saved");
  };

  const copyCode = async () => {
    await copyToClipboard(codeSnippet);
    setCodeCopied(true);
    toast.success("Copied");
    setTimeout(() => setCodeCopied(false), 1800);
  };

  const runDisabled = !canRun || !apiKey || running;

  return (
    <PageCanvas>
      <Hero
        breadcrumb={{ label: "Inference", href: "/dashboard/services/inference" }}
        title="Playground"
        accent="for every model"
        caption={description}
        size="md"
        actions={
          <>
            {tabBar}
            {apiKey ? (
              <GhostButton onClick={() => setKeyOpen(true)}>
                <Key className="h-3.5 w-3.5" />
                Key
              </GhostButton>
            ) : (
              <PrimaryButton onClick={() => setKeyOpen(true)}>
                <Key className="h-3.5 w-3.5" />
                Set up key
              </PrimaryButton>
            )}
          </>
        }
      />

      <section className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4 mb-8">
        {/* ── Left sidebar ── */}
        <div className="space-y-4">
          {/* Model badge */}
          <div className={`${CARD} px-4 py-3 flex items-center gap-2`}>
            <span className={`${MONO} text-[11px] text-white/75`}>{modelId}</span>
            <span
              className={`${MONO} ml-auto shrink-0 text-[9.5px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded`}
              style={{ background: "rgba(0,149,255,0.1)", color: ACCENT }}
            >
              {modelLabel}
            </span>
          </div>

          {/* Service form inputs */}
          <div className={`${CARD} p-5 space-y-5`}>
            {renderForm}

            <PrimaryButton onClick={run} disabled={runDisabled}>
              {running ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {running ? runningLabel : runLabel}
            </PrimaryButton>

            {usageLabel && (
              <p className={`${MONO} text-[10.5px] text-white/35`}>{usageLabel}</p>
            )}
          </div>

          {/* Code snippet */}
          <div className={`${CARD} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <span className={`${MONO} text-[10px] uppercase tracking-[0.13em] text-white/40`}>
                curl
              </span>
              <button
                type="button"
                onClick={copyCode}
                className="flex items-center gap-1.5 text-white/40 hover:text-white/70 transition-colors"
              >
                {codeCopied ? (
                  <Check className="h-3.5 w-3.5 text-green-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span className={`${MONO} text-[10px] uppercase tracking-[0.1em]`}>Copy</span>
              </button>
            </div>
            <pre className={`${MONO} text-[11px] text-white/50 leading-relaxed overflow-x-auto whitespace-pre-wrap break-words`}>
              {codeSnippet}
            </pre>
          </div>
        </div>

        {/* ── Right: results ── */}
        <div className="space-y-4">
          {/* Loading skeleton — replaces results while running if provided */}
          {running && renderLoading}

          {/* Error — only when idle */}
          {!running && error && (
            <div className={`${CARD} p-4 border-red-500/20`}>
              <p className={`${MONO} text-[11.5px] text-red-300/80`}>{error}</p>
            </div>
          )}

          {/* Results — hidden during load when a loading UI is provided */}
          {(!running || !renderLoading) && renderResults}

          {/* Empty state */}
          {!running && !renderResults && !error && (
            <div className="flex items-center justify-center h-40 rounded-[10px] border border-dashed border-white/[0.06]">
              <p className={`${MONO} text-[11px] uppercase tracking-[0.12em] text-white/25`}>
                Results appear here
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Key setup dialog */}
      {keyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setKeyOpen(false)}
        >
          <div
            className={`${CARD} w-full max-w-md mx-4 p-6 space-y-4`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={SERIF_STYLE} className="text-[20px] font-semibold tracking-[-0.02em] text-white">
              API Key
            </h3>
            <p className={`${MONO} text-[11px] text-white/45 leading-relaxed`}>
              Your Ahura API key (starts with <code className="text-white/65">ahu_</code>). Stored in
              localStorage only — never sent anywhere except your gateway.
            </p>
            <input
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveKey()}
              placeholder="ahu_…"
              className={`${MONO} w-full rounded-[6px] bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-[12.5px] text-white/90 placeholder-white/25 outline-none focus:border-[rgba(0,149,255,0.35)] transition-colors`}
            />
            <div className="flex gap-2 justify-end">
              <GhostButton onClick={() => setKeyOpen(false)}>Cancel</GhostButton>
              <PrimaryButton onClick={saveKey}>Save key</PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </PageCanvas>
  );
}

// ── Shared form primitives ────────────────────────────────────────────────────

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className={`${MONO} mb-1.5 text-[10px] uppercase tracking-[0.13em] text-white/40 font-semibold`}>
      {children}
    </p>
  );
}

export const INPUT_CLS =
  `${MONO} w-full rounded-[6px] bg-white/[0.03] border border-white/[0.06] px-3 py-2.5 ` +
  `text-[12.5px] text-white/90 placeholder-white/25 outline-none ` +
  `focus:border-[rgba(0,149,255,0.35)] focus:bg-white/[0.04] transition-colors`;

export const TEXTAREA_CLS =
  `${MONO} w-full resize-none rounded-[6px] bg-white/[0.03] border border-white/[0.06] px-3 py-2.5 ` +
  `text-[12.5px] text-white/90 placeholder-white/25 outline-none ` +
  `focus:border-[rgba(0,149,255,0.35)] transition-colors`;

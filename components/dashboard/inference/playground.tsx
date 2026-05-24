"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Play,
  RotateCw,
  Search,
  Send,
  StopCircle,
  Trash2,
  Zap,
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
  ACCENT,
  ColHead,
  EmptyState,
  GhostButton,
  Hero,
  MONO,
  PageCanvas,
  PrimaryButton,
  SectionHead,
  SERIF_STYLE,
  StatCell,
  StatsStrip,
} from "@/components/dashboard/inference/chrome";

export interface PlaygroundModel {
  model_id: string;
  display_name: string;
  provider: string;
  is_featured: boolean;
  supports_streaming: boolean;
  supports_tools: boolean;
  supports_vision: boolean;
  context_window: number | null;
  max_output: number | null;
  input_price_per_mtok: number | null;
  output_price_per_mtok: number | null;
}

interface RunStats {
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  costCents: number | null;
  latencyMs: number;
  ttftMs: number | null;
  cacheStatus: string | null;
}

const KEY_STORAGE = "ahura.playground.key";

export function Playground({
  models,
  apiBase,
  orgName,
}: {
  models: PlaygroundModel[];
  apiBase: string;
  orgName: string;
}) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keySetupOpen, setKeySetupOpen] = useState(false);
  const [keyVisible, setKeyVisible] = useState(false);

  const [modelId, setModelId] = useState<string>(models[0]?.model_id ?? "");
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelQuery, setModelQuery] = useState("");

  const [systemPrompt, setSystemPrompt] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(1);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [streamOn, setStreamOn] = useState(true);

  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef<HTMLPreElement | null>(null);

  const [codeLang, setCodeLang] = useState<"curl" | "python" | "typescript">("curl");
  const [codeCopied, setCodeCopied] = useState(false);

  // Load key from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(KEY_STORAGE);
      if (stored) setApiKey(stored);
    }
  }, []);

  // Auto-scroll output as tokens stream
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const selectedModel = useMemo(
    () => models.find((m) => m.model_id === modelId) ?? null,
    [models, modelId]
  );

  const filteredModels = useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.model_id.toLowerCase().includes(q) ||
        m.display_name.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q)
    );
  }, [models, modelQuery]);

  // ── Provision a key from the API (calls /api/inference/api-keys) ─────
  const provisionKey = async () => {
    try {
      const r = await fetch("/api/inference/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: `playground-${Date.now().toString(36)}`,
          // No budget/cap by default — playground is for testing
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to provision key");
      const newKey: string = data.data.api_key;
      window.localStorage.setItem(KEY_STORAGE, newKey);
      setApiKey(newKey);
      toast.success("Playground key provisioned");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to provision key");
    }
  };

  const clearKey = () => {
    window.localStorage.removeItem(KEY_STORAGE);
    setApiKey(null);
    toast.info("Playground key cleared from this browser");
  };

  // ── Build request body ───────────────────────────────────────────────
  const buildBody = () => {
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt.trim()) {
      messages.push({ role: "system", content: systemPrompt.trim() });
    }
    messages.push({ role: "user", content: userPrompt.trim() });
    return {
      model: modelId,
      messages,
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
      stream: streamOn,
    };
  };

  // ── Run the request ──────────────────────────────────────────────────
  const run = async () => {
    if (!apiKey) {
      setKeySetupOpen(true);
      return;
    }
    if (!userPrompt.trim()) {
      toast.error("Enter a user message first");
      return;
    }

    setOutput("");
    setStats(null);
    setError(null);
    setRunning(true);

    const startedAt = Date.now();
    let firstTokenAt: number | null = null;
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const r = await fetch(`${apiBase}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(buildBody()),
        signal: ctrl.signal,
      });

      const cacheStatus = r.headers.get("X-Ahura-Cache");

      if (!r.ok) {
        const text = await r.text();
        setError(text);
        toast.error(`Request failed: ${r.status}`);
        return;
      }

      // Non-streaming
      if (!streamOn) {
        const data = (await r.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const content = data.choices?.[0]?.message?.content ?? "";
        setOutput(content);
        const elapsed = Date.now() - startedAt;
        setStats({
          model: modelId,
          inputTokens: data.usage?.prompt_tokens ?? null,
          outputTokens: data.usage?.completion_tokens ?? null,
          costCents: computeCostCents(data.usage, selectedModel),
          latencyMs: elapsed,
          ttftMs: null,
          cacheStatus,
        });
        return;
      }

      // Streaming — SSE
      const reader = r.body?.getReader();
      if (!reader) {
        setError("No response body");
        return;
      }
      const decoder = new TextDecoder();
      let buffer = "";
      let inputTokens: number | null = null;
      let outputTokens: number | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || !line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;
          try {
            const chunk = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string } }>;
              usage?: { prompt_tokens?: number; completion_tokens?: number };
            };
            const delta = chunk.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              if (firstTokenAt === null) firstTokenAt = Date.now();
              setOutput((prev) => prev + delta);
            }
            if (chunk.usage) {
              if (chunk.usage.prompt_tokens !== undefined)
                inputTokens = chunk.usage.prompt_tokens;
              if (chunk.usage.completion_tokens !== undefined)
                outputTokens = chunk.usage.completion_tokens;
            }
          } catch {
            // Skip non-JSON SSE comments / pings
          }
        }
      }

      const elapsed = Date.now() - startedAt;
      const ttft = firstTokenAt !== null ? firstTokenAt - startedAt : null;
      setStats({
        model: modelId,
        inputTokens,
        outputTokens,
        costCents: computeCostCents({ prompt_tokens: inputTokens ?? undefined, completion_tokens: outputTokens ?? undefined }, selectedModel),
        latencyMs: elapsed,
        ttftMs: ttft,
        cacheStatus,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        toast.info("Stopped");
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        toast.error(`Error: ${msg}`);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  // ── Copy-as-code ─────────────────────────────────────────────────────
  const codeSnippet = useMemo(() => {
    const body = buildBody();
    const bodyJson = JSON.stringify(body, null, 2);
    if (codeLang === "curl") {
      return `curl ${apiBase}/chat/completions \\
  -H "Authorization: Bearer ${apiKey ?? "<YOUR_API_KEY>"}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(body)}'`;
    }
    if (codeLang === "python") {
      return `from openai import OpenAI

client = OpenAI(
    base_url="${apiBase}",
    api_key="${apiKey ?? "<YOUR_API_KEY>"}",
)

response = client.chat.completions.create(**${pythonDict(body)})

${streamOn
        ? `for chunk in response:
    delta = chunk.choices[0].delta.content
    if delta:
        print(delta, end="", flush=True)`
        : 'print(response.choices[0].message.content)'}`;
    }
    // typescript
    return `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${apiBase}",
  apiKey: "${apiKey ?? "<YOUR_API_KEY>"}",
});

const response = await client.chat.completions.create(${bodyJson});

${streamOn
        ? `for await (const chunk of response) {
  const delta = chunk.choices[0]?.delta?.content;
  if (delta) process.stdout.write(delta);
}`
        : 'console.log(response.choices[0].message.content);'}`;
  }, [apiBase, apiKey, codeLang, modelId, streamOn, systemPrompt, userPrompt, temperature, topP, maxTokens]);

  const copyCode = async () => {
    await navigator.clipboard.writeText(codeSnippet);
    setCodeCopied(true);
    toast.success("Code copied");
    setTimeout(() => setCodeCopied(false), 1800);
  };

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <PageCanvas>
      <Hero
        breadcrumb={{ label: "Inference", href: "/dashboard/services/inference" }}
        title="Playground"
        accent="for every model"
        caption="Pick a model, dial in parameters, send a prompt. The same code you copy below runs against any model in the catalog — no SDK changes."
        size="md"
        actions={
          <>
            {apiKey ? (
              <GhostButton onClick={() => setKeySetupOpen(true)}>
                <Key className="h-3.5 w-3.5" />
                Key
              </GhostButton>
            ) : (
              <PrimaryButton onClick={() => setKeySetupOpen(true)}>
                <Key className="h-3.5 w-3.5" />
                Set up key
              </PrimaryButton>
            )}
            {running ? (
              <PrimaryButton onClick={stop}>
                <StopCircle className="h-3.5 w-3.5" />
                Stop
              </PrimaryButton>
            ) : (
              <PrimaryButton onClick={run} disabled={!apiKey || !userPrompt.trim() || !modelId}>
                <Play className="h-3.5 w-3.5" />
                Run
              </PrimaryButton>
            )}
          </>
        }
      />

      <StatsStrip>
        <StatCell
          label="Model"
          value={selectedModel?.display_name ?? "—"}
          hint={selectedModel ? selectedModel.provider : "Pick one below"}
          accent={ACCENT}
        />
        <StatCell
          label="Context"
          value={
            selectedModel?.context_window
              ? selectedModel.context_window >= 1_000_000
                ? `${(selectedModel.context_window / 1_000_000).toFixed(0)}M`
                : `${Math.round(selectedModel.context_window / 1_000)}K`
              : "—"
          }
          hint="Max input tokens"
        />
        <StatCell
          label="Price /Mtok"
          value={
            selectedModel
              ? `${formatPrice(selectedModel.input_price_per_mtok)} / ${formatPrice(selectedModel.output_price_per_mtok)}`
              : "—"
          }
          hint="Input / Output"
        />
        <StatCell
          label="Last latency"
          value={stats?.latencyMs ? `${stats.latencyMs} ms` : "—"}
          hint={stats?.ttftMs ? `TTFT ${stats.ttftMs} ms` : "—"}
          accent={stats ? "#4ade80" : undefined}
        />
      </StatsStrip>

      {/* Main 2-col workspace */}
      <section className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4 mb-8">
        {/* Left: settings */}
        <div className="space-y-4">
          {/* Model picker */}
          <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-4">
            <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45 mb-2`}>
              Model
            </p>
            <button
              type="button"
              onClick={() => setModelPickerOpen(true)}
              className="w-full flex items-center justify-between gap-2 h-10 px-3 border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] rounded-[5px] transition-colors text-left"
            >
              <span className="min-w-0">
                {selectedModel ? (
                  <>
                    <span className="block text-[12.5px] text-white truncate">
                      {selectedModel.display_name}
                    </span>
                    <span className={`${MONO} block text-[10px] text-white/45 truncate`}>
                      {selectedModel.model_id}
                    </span>
                  </>
                ) : (
                  <span className="text-[12.5px] text-white/45">Pick a model…</span>
                )}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/40" />
            </button>
          </div>

          {/* Parameters */}
          <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-4 space-y-4">
            <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45`}>
              Parameters
            </p>
            <Slider
              label="Temperature"
              value={temperature}
              min={0}
              max={2}
              step={0.05}
              onChange={setTemperature}
              hint={
                temperature < 0.001
                  ? "Deterministic (cache-eligible)"
                  : temperature < 0.7
                    ? "Focused"
                    : temperature < 1.2
                      ? "Balanced"
                      : "Creative"
              }
            />
            <Slider label="Top P" value={topP} min={0} max={1} step={0.05} onChange={setTopP} />
            <Slider
              label="Max tokens"
              value={maxTokens}
              min={64}
              max={selectedModel?.max_output ?? 8192}
              step={64}
              onChange={(v) => setMaxTokens(Math.round(v))}
              integer
            />
            <div className="flex items-center justify-between rounded-[5px] border border-white/[0.08] bg-white/[0.02] px-3 py-2">
              <span className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] text-white/80`}>
                Streaming
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={streamOn}
                onClick={() => setStreamOn((s) => !s)}
                className="relative h-5 w-9 rounded-full transition-colors"
                style={{ background: streamOn ? ACCENT : "rgba(255,255,255,0.1)" }}
              >
                <span
                  className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
                  style={{ left: streamOn ? "calc(100% - 18px)" : "2px" }}
                />
              </button>
            </div>
          </div>

          {/* System prompt */}
          <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-4">
            <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45 mb-2`}>
              System prompt
            </p>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are a helpful assistant…"
              rows={4}
              className={`${MONO} w-full text-[12px] text-white placeholder:text-white/30 bg-white/[0.02] border border-white/[0.08] rounded-[5px] px-3 py-2 focus:outline-none focus:border-[#0095FF]/40 focus:ring-1 focus:ring-[#0095FF]/25 resize-none`}
            />
          </div>
        </div>

        {/* Right: prompt + output */}
        <div className="space-y-4 min-w-0">
          <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-4">
            <div className="flex items-center justify-between mb-2">
              <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45`}>
                User message
              </p>
              <span className={`${MONO} text-[9.5px] uppercase tracking-[0.12em] text-white/30`}>
                Cmd/Ctrl + Enter to run
              </span>
            </div>
            <textarea
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  if (!running) run();
                }
              }}
              placeholder="Ask anything…"
              rows={5}
              className={`${MONO} w-full text-[13px] text-white placeholder:text-white/30 bg-white/[0.02] border border-white/[0.08] rounded-[5px] px-3 py-2.5 focus:outline-none focus:border-[#0095FF]/40 focus:ring-1 focus:ring-[#0095FF]/25 resize-y`}
            />
          </div>

          {/* Output */}
          <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
              <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45`}>
                Response
              </p>
              <div className="flex items-center gap-2">
                {running && <Loader2 className="h-3 w-3 animate-spin text-[#0095FF]" />}
                {output && !running && (
                  <button
                    type="button"
                    onClick={() => setOutput("")}
                    className="text-[11px] text-white/45 hover:text-white/80 inline-flex items-center gap-1"
                  >
                    <Trash2 className="h-3 w-3" />
                    clear
                  </button>
                )}
              </div>
            </div>
            <pre
              ref={outputRef}
              className={`${MONO} px-4 py-3 text-[12.5px] text-white/90 leading-relaxed whitespace-pre-wrap break-words max-h-[480px] min-h-[120px] overflow-y-auto`}
            >
              {error ? (
                <span className="text-red-300/85">{error}</span>
              ) : output ? (
                output + (running ? "▍" : "")
              ) : (
                <span className="text-white/30">{running ? "Waiting for response…" : "Output appears here."}</span>
              )}
            </pre>
            {stats && (
              <div className="border-t border-white/[0.06] grid grid-cols-2 sm:grid-cols-4 divide-x divide-white/[0.04]">
                <StatFoot label="Input" value={stats.inputTokens?.toString() ?? "—"} />
                <StatFoot label="Output" value={stats.outputTokens?.toString() ?? "—"} />
                <StatFoot
                  label="Cost"
                  value={
                    stats.costCents !== null
                      ? `$${(stats.costCents / 100).toFixed(4)}`
                      : "—"
                  }
                />
                <StatFoot
                  label="TTFT / Total"
                  value={`${stats.ttftMs ?? "—"} / ${stats.latencyMs}ms`}
                  hint={stats.cacheStatus ? `cache: ${stats.cacheStatus}` : undefined}
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Copy as code */}
      <section className="mb-8">
        <SectionHead
          eyebrow="Integration"
          title="Copy as"
          accent="code"
          rightMeta={`org: ${orgName}`}
        />
        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-2">
            <div className="flex">
              {(["curl", "python", "typescript"] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setCodeLang(lang)}
                  className={`${MONO} h-9 px-4 text-[10.5px] uppercase tracking-[0.12em] font-semibold transition-colors relative ${
                    codeLang === lang ? "text-white" : "text-white/40 hover:text-white/70"
                  }`}
                >
                  {lang}
                  {codeLang === lang && (
                    <span
                      className="absolute left-2 right-2 bottom-0 h-0.5"
                      style={{ background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }}
                    />
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={copyCode}
              className={`${MONO} h-7 px-2.5 inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] font-semibold rounded-[4px] border border-white/[0.08] bg-white/[0.02] text-white/75 hover:bg-white/[0.06] transition-colors`}
            >
              {codeCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {codeCopied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre
            className={`${MONO} px-4 py-4 text-[11.5px] text-white/85 leading-relaxed overflow-x-auto`}
            style={{ background: "rgba(0,0,0,0.25)" }}
          >
            {codeSnippet}
          </pre>
        </div>
      </section>

      {/* Model picker dialog */}
      <Dialog open={modelPickerOpen} onOpenChange={setModelPickerOpen}>
        <DialogContent className="max-w-2xl border-white/[0.08] bg-[#111216] p-0">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-white/80`}>
              Pick a model
            </DialogTitle>
            <DialogDescription className={`${MONO} text-[11px] text-white/45 leading-relaxed`}>
              {models.length} chat models. Featured first.
            </DialogDescription>
          </DialogHeader>
          <div className="px-5 pb-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/35" />
              <input
                value={modelQuery}
                onChange={(e) => setModelQuery(e.target.value)}
                placeholder="Search model_id, name, or provider…"
                className={`${MONO} h-9 w-full pl-9 pr-3 text-[12px] text-white placeholder:text-white/30 bg-white/[0.02] border border-white/[0.08] rounded-[5px] focus:outline-none focus:border-[#0095FF]/40`}
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-[420px] overflow-y-auto px-2 pb-3">
            {filteredModels.map((m) => (
              <button
                key={m.model_id}
                type="button"
                onClick={() => {
                  setModelId(m.model_id);
                  setModelPickerOpen(false);
                  setModelQuery("");
                }}
                className={`w-full text-left px-3 py-2.5 rounded-[4px] hover:bg-white/[0.04] transition-colors flex items-center justify-between gap-3 ${
                  m.model_id === modelId ? "bg-white/[0.05]" : ""
                }`}
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
                  </div>
                  <code className={`${MONO} block text-[10.5px] text-white/45 truncate`}>
                    {m.model_id}
                  </code>
                </div>
                <div className="flex items-center gap-3 text-[10.5px] shrink-0">
                  {m.context_window && (
                    <span className={`${MONO} text-white/55 tabular-nums`}>
                      {m.context_window >= 1_000_000
                        ? `${(m.context_window / 1_000_000).toFixed(0)}M`
                        : `${Math.round(m.context_window / 1_000)}K`}
                    </span>
                  )}
                  <span className={`${MONO} text-white/45 tabular-nums`}>
                    {formatPrice(m.input_price_per_mtok)}/{formatPrice(m.output_price_per_mtok)}
                  </span>
                </div>
              </button>
            ))}
            {filteredModels.length === 0 && (
              <div className={`${MONO} px-4 py-8 text-center text-[11.5px] text-white/35`}>
                No models match.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Key setup dialog */}
      <Dialog open={keySetupOpen} onOpenChange={setKeySetupOpen}>
        <DialogContent className="max-w-md border-white/[0.08] bg-[#111216]">
          <DialogHeader>
            <DialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-white/80`}>
              Playground API key
            </DialogTitle>
            <DialogDescription className={`${MONO} text-[11px] text-white/45 leading-relaxed`}>
              The playground needs an inference API key to call the gateway. Provision a dedicated
              one or paste an existing key. Stored only in this browser&apos;s localStorage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {apiKey ? (
              <div className="space-y-2">
                <p className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] text-white/55`}>
                  Active key
                </p>
                <div className="relative rounded-[5px] border border-white/[0.08] bg-white/[0.02] p-3 pr-12">
                  <code className={`${MONO} block break-all text-[11.5px] text-white/85`}>
                    {keyVisible ? apiKey : "•".repeat(Math.min(apiKey.length, 40))}
                  </code>
                  <button
                    type="button"
                    onClick={() => setKeyVisible((v) => !v)}
                    className="absolute right-2 top-2.5 h-7 w-7 rounded text-white/55 hover:bg-white/[0.06] hover:text-white flex items-center justify-center transition-colors"
                  >
                    {keyVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            ) : (
              <p className={`${MONO} text-[11.5px] text-white/55 leading-relaxed`}>
                No key configured. Provision a dedicated playground key (gets named{" "}
                <span className="text-white/80">playground-xxx</span> in your API Keys list) or paste
                an existing one.
              </p>
            )}
            <div>
              <p className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] text-white/55 mb-1`}>
                Paste an existing key
              </p>
              <input
                type="password"
                value=""
                onChange={(e) => {
                  const v = e.target.value.trim();
                  if (v.startsWith("ahu_")) {
                    window.localStorage.setItem(KEY_STORAGE, v);
                    setApiKey(v);
                    setKeySetupOpen(false);
                    toast.success("Key saved to browser");
                  }
                }}
                placeholder="ahu_live_…"
                className={`${MONO} h-9 w-full px-3 text-[12px] text-white placeholder:text-white/30 bg-white/[0.02] border border-white/[0.08] rounded-[5px] focus:outline-none focus:border-[#0095FF]/40`}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            {apiKey && (
              <GhostButton onClick={clearKey}>
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </GhostButton>
            )}
            <PrimaryButton onClick={provisionKey}>
              <Zap className="h-3.5 w-3.5" />
              {apiKey ? "Rotate key" : "Provision new key"}
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageCanvas>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────

function Slider({
  label,
  value,
  min,
  max,
  step,
  hint,
  integer,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  hint?: string;
  integer?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] text-white/80`}>
          {label}
        </span>
        <span style={SERIF_STYLE} className="text-[14px] text-white font-bold tabular-nums">
          {integer ? value : value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#0095FF] h-1"
      />
      {hint && <p className={`${MONO} text-[10px] text-white/40 mt-1`}>{hint}</p>}
    </div>
  );
}

function StatFoot({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-4 py-3">
      <p className={`${MONO} text-[9.5px] uppercase tracking-[0.12em] font-semibold text-white/45 mb-1`}>
        {label}
      </p>
      <p className={`${MONO} text-[12px] text-white tabular-nums`}>{value}</p>
      {hint && <p className={`${MONO} text-[9.5px] text-white/35 mt-0.5`}>{hint}</p>}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatPrice(cents: number | null): string {
  if (cents === null) return "—";
  if (cents === 0) return "Free";
  if (cents < 100) return `$${(cents / 100).toFixed(2)}`;
  return `$${(cents / 100).toFixed(0)}`;
}

function computeCostCents(
  usage: { prompt_tokens?: number; completion_tokens?: number } | undefined,
  model: PlaygroundModel | null
): number | null {
  if (!usage || !model) return null;
  const inputRate = model.input_price_per_mtok ?? 0;
  const outputRate = model.output_price_per_mtok ?? 0;
  const input = usage.prompt_tokens ?? 0;
  const output = usage.completion_tokens ?? 0;
  return Math.ceil((input * inputRate + output * outputRate) / 1_000_000);
}

function pythonDict(obj: Record<string, unknown>): string {
  // Tiny JSON→Python-dict-literal converter for the copy-as-code snippet.
  // Sufficient for primitives + arrays + nested objects we emit here.
  return JSON.stringify(obj, null, 2)
    .replace(/"([^"]+)":/g, "$1=")
    .replace(/true/g, "True")
    .replace(/false/g, "False")
    .replace(/null/g, "None")
    .replace(/^{/, "")
    .replace(/}$/, "");
}

// Keep ColHead import lint-happy until a future view uses it
const _u = ColHead;
void _u;

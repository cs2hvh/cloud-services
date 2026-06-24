"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { safeRandomUUID } from "@/lib/utils/safe-uuid";
import { copyToClipboard } from "@/lib/utils/safe-clipboard";
import {
  Check,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Key,
  Layers,
  Loader2,
  MessageSquare,
  Play,
  Rocket,
  Search,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Premium surface shared by the workspace cards — softer radius + a faint top
// inset highlight so panels read as raised glass rather than flat boxes.
const CARD = "border border-white/[0.07] bg-[#111216] rounded-[10px] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

import {
  ACCENT,
  ACCENT_BRIGHT,
  ColHead,
  GhostButton,
  Hero,
  MONO,
  PageCanvas,
  PrimaryButton,
  SectionHead,
  SERIF_STYLE,
} from "@/components/dashboard/inference/chrome";
import {
  PlaygroundCompare,
  type PlaygroundCompareHandle,
} from "@/components/dashboard/inference/playground-compare";

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

/** Lightweight model descriptor used by per-modality service components (images, TTS, STT, …). */
export interface ServiceModel {
  model_id: string;
  display_name: string;
  is_featured: boolean;
  tier: string | null;
  capabilities: Record<string, unknown> | null;
}

export interface PlaygroundPreset {
  id: string;
  name: string;
  description: string | null;
  fallback_models: string[];
}

type PlaygroundMode = "single" | "compare";

export interface TurnStats {
  inputTokens: number | null;
  outputTokens: number | null;
  costCents: number | null;
  latencyMs: number;
  ttftMs: number | null;
}

export interface Turn {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Set on assistant turns — the model that produced this response. */
  modelId?: string;
  stats?: TurnStats;
  cacheStatus?: string | null;
  error?: string;
  running?: boolean;
}

const KEY_STORAGE = "ahura.playground.key";

export function Playground({
  models,
  presets,
  apiBase,
  orgName,
  tabBar,
}: {
  models: PlaygroundModel[];
  presets: PlaygroundPreset[];
  apiBase: string;
  orgName: string;
  tabBar?: React.ReactNode;
}) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keySetupOpen, setKeySetupOpen] = useState(false);
  const [keyVisible, setKeyVisible] = useState(false);
  const [pasteKeyDraft, setPasteKeyDraft] = useState("");

  const [mode, setMode] = useState<PlaygroundMode>("single");
  const [presetId, setPresetId] = useState<string>("");
  const [compareRunning, setCompareRunning] = useState(false);
  const compareRef = useRef<PlaygroundCompareHandle | null>(null);

  // Initial model — honor ?model=<id> query param so deep-links from other
  // dashboard pages (e.g. FT detail "Try in playground" link) land on the
  // right model. Falls back to the first catalog entry otherwise.
  const [modelId, setModelId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const fromUrl = new URLSearchParams(window.location.search).get("model");
      if (fromUrl && models.some((m) => m.model_id === fromUrl)) return fromUrl;
    }
    return models[0]?.model_id ?? "";
  });
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelQuery, setModelQuery] = useState("");

  const [systemPrompt, setSystemPrompt] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(1);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [streamOn, setStreamOn] = useState(true);

  // Chat-style conversation history. Each Send appends a user + assistant
  // turn; previous turns persist so the user can see the full thread and
  // build a multi-turn conversation. The model gets the full history each
  // turn so responses are context-aware.
  const [turns, setTurns] = useState<Turn[]>([]);
  const running = useMemo(() => turns.some((t) => t.running), [turns]);
  const abortRefs = useRef<Map<string, AbortController>>(new Map());
  const conversationRef = useRef<HTMLDivElement | null>(null);

  const [codeLang, setCodeLang] = useState<"curl" | "python" | "typescript">("curl");
  const [codeCopied, setCodeCopied] = useState(false);

  const [autoBootstrapping, setAutoBootstrapping] = useState(false);

  // On mount: load the existing playground key from localStorage if any,
  // OR silently provision a new one. Logged-in users with credits should
  // never have to know what an "API key" is to use the playground — the
  // dialog still exists for power users who want to paste/rotate.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(KEY_STORAGE);
    if (stored) {
      setApiKey(stored);
      return;
    }
    setAutoBootstrapping(true);
    void (async () => {
      try {
        const r = await fetch("/api/inference/api-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: `playground-${Date.now().toString(36)}` }),
        });
        if (!r.ok) {
          // 401 → not logged in, 403 → no org, 500 → infra. Stay silent;
          // the Send button label will still surface "Set up key" so the
          // user can manually open the dialog and see the real error.
          return;
        }
        const data = await r.json();
        const newKey: string = data?.data?.api_key;
        if (newKey?.startsWith("ahu_")) {
          window.localStorage.setItem(KEY_STORAGE, newKey);
          setApiKey(newKey);
        }
      } finally {
        setAutoBootstrapping(false);
      }
    })();
  }, []);

  // Auto-scroll the conversation panel as new tokens stream in, but only
  // while a turn is actively running — once it finishes the user might
  // scroll up to re-read; don't yank them back to the bottom.
  useEffect(() => {
    if (!conversationRef.current) return;
    if (!running) return;
    conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  }, [turns, running]);

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

  const savePastedKey = () => {
    const v = pasteKeyDraft.trim();
    if (!v.startsWith("ahu_")) {
      toast.error("Key must start with ahu_");
      return;
    }
    window.localStorage.setItem(KEY_STORAGE, v);
    setApiKey(v);
    setPasteKeyDraft("");
    setKeySetupOpen(false);
    toast.success("Key saved to browser");
  };

  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === presetId) ?? null,
    [presets, presetId]
  );


  // ── Build the messages array for the OpenAI-compatible request ─────
  //    Includes the full conversation history so the model has context
  //    for follow-up questions. System prompt is prepended each turn.
  const buildMessages = (priorTurns: Turn[], nextUserContent: string) => {
    const msgs: Array<{ role: string; content: string }> = [];
    if (systemPrompt.trim()) {
      msgs.push({ role: "system", content: systemPrompt.trim() });
    }
    for (const t of priorTurns) {
      // Skip errored assistant turns — sending an empty/error message
      // back to the model just confuses it.
      if (t.role === "assistant" && (t.error || !t.content)) continue;
      msgs.push({ role: t.role, content: t.content });
    }
    msgs.push({ role: "user", content: nextUserContent });
    return msgs;
  };

  /**
   * Append a user turn + an assistant placeholder, then stream the
   * assistant's response into the placeholder. Previous turns persist.
   *
   * @param explicitUserContent — when set, use this instead of reading
   *   userPrompt from state. The retry flow uses this to avoid racing
   *   against the textarea state update.
   * @param historyOverride — when set, use this instead of `turns` from
   *   state. The retry flow passes the trimmed-back history.
   */
  const run = async (explicitUserContent?: string, historyOverride?: Turn[]) => {
    if (!apiKey) {
      setKeySetupOpen(true);
      return;
    }
    const userContent = (explicitUserContent ?? userPrompt).trim();
    if (!userContent) {
      toast.error("Type a message first");
      return;
    }

    // Snapshot history BEFORE we append so the API gets prior context
    // without including the in-flight placeholder itself.
    const priorTurns = historyOverride ?? turns;

    const userTurn: Turn = {
      id: safeRandomUUID(),
      role: "user",
      content: userContent,
    };
    const assistantTurn: Turn = {
      id: safeRandomUUID(),
      role: "assistant",
      content: "",
      modelId,
      running: true,
    };
    // If the caller supplied a historyOverride (retry path), it's the
    // trimmed-back turn list and we replace state with it; otherwise
    // append to the current state.
    if (historyOverride) {
      setTurns([...historyOverride, userTurn, assistantTurn]);
    } else {
      setTurns((prev) => [...prev, userTurn, assistantTurn]);
      setUserPrompt(""); // clear input so user can type the next turn
    }

    const startedAt = Date.now();
    let firstTokenAt: number | null = null;
    const ctrl = new AbortController();
    abortRefs.current.set(assistantTurn.id, ctrl);

    const patch = (patcher: (t: Turn) => Turn) => {
      setTurns((prev) => prev.map((t) => (t.id === assistantTurn.id ? patcher(t) : t)));
    };

    try {
      const runHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      if (presetId) runHeaders["X-Ahura-Preset"] = presetId;

      const r = await fetch(`${apiBase}/chat/completions`, {
        method: "POST",
        headers: runHeaders,
        body: JSON.stringify({
          model: modelId,
          messages: buildMessages(priorTurns, userContent),
          temperature,
          top_p: topP,
          max_tokens: maxTokens,
          stream: streamOn,
        }),
        signal: ctrl.signal,
      });

      const cacheStatus = r.headers.get("X-Ahura-Cache");

      if (!r.ok) {
        const text = await r.text();
        patch((t) => ({ ...t, running: false, error: truncateError(text), cacheStatus }));
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
        const elapsed = Date.now() - startedAt;
        patch((t) => ({
          ...t,
          content,
          running: false,
          cacheStatus,
          stats: {
            inputTokens: data.usage?.prompt_tokens ?? null,
            outputTokens: data.usage?.completion_tokens ?? null,
            costCents: computeCostCents(data.usage, selectedModel),
            latencyMs: elapsed,
            ttftMs: null,
          },
        }));
        return;
      }

      // Streaming — SSE
      const reader = r.body?.getReader();
      if (!reader) {
        patch((t) => ({ ...t, running: false, error: "No response body" }));
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
              patch((t) => ({ ...t, content: t.content + delta }));
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
      patch((t) => ({
        ...t,
        running: false,
        cacheStatus,
        stats: {
          inputTokens,
          outputTokens,
          costCents: computeCostCents(
            { prompt_tokens: inputTokens ?? undefined, completion_tokens: outputTokens ?? undefined },
            selectedModel
          ),
          latencyMs: elapsed,
          ttftMs: ttft,
        },
      }));
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // Keep whatever partial content streamed in; just mark not-running.
        patch((t) => ({ ...t, running: false }));
        toast.info("Stopped");
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        patch((t) => ({ ...t, running: false, error: msg }));
        toast.error(`Error: ${msg}`);
      }
    } finally {
      abortRefs.current.delete(assistantTurn.id);
    }
  };

  const stop = () => {
    // Abort whatever turn is currently running (there should be at most one
    // in single mode).
    for (const ctrl of abortRefs.current.values()) ctrl.abort();
  };

  const clearConversation = () => {
    // Abort any in-flight requests first so they don't keep mutating state
    // after we wipe the turn array.
    for (const ctrl of abortRefs.current.values()) ctrl.abort();
    abortRefs.current.clear();
    setTurns([]);
  };

  const copyTurn = async (content: string) => {
    try {
      await copyToClipboard(content);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  const retryAssistantTurn = (assistantTurnId: string) => {
    const idx = turns.findIndex((t) => t.id === assistantTurnId);
    if (idx <= 0) return;
    const userTurn = turns[idx - 1];
    if (!userTurn || userTurn.role !== "user") return;
    // Hand the history-up-to-but-not-including the failed user turn directly
    // to run() so we don't race the setTurns state update.
    const trimmed = turns.slice(0, idx - 1);
    void run(userTurn.content, trimmed);
  };

  // Unified send/stop handler used by both the textarea Cmd+Enter shortcut
  // and the explicit Send button below the textarea. Routes to the right
  // action based on the active mode.
  const sendPrompt = () => {
    if (!apiKey) {
      setKeySetupOpen(true);
      return;
    }
    if (!userPrompt.trim()) {
      toast.error("Type a prompt first");
      return;
    }
    if (mode === "single") {
      if (running) stop();
      else run();
    } else {
      if (compareRunning) compareRef.current?.stopAll();
      else compareRef.current?.runAll();
    }
  };

  const isBusy = mode === "single" ? running : compareRunning;
  // Only truly disable when there's no prompt to send and nothing in flight.
  // Missing API key intentionally does NOT disable — sendPrompt() opens the
  // key-setup dialog so users can complete the missing step in one click
  // instead of hunting for a separate "set up key" button.
  const sendButton = (
    <PrimaryButton
      onClick={sendPrompt}
      disabled={(!isBusy && !userPrompt.trim()) || autoBootstrapping}
    >
      {isBusy ? (
        <>
          <StopCircle className="h-3.5 w-3.5" />
          Stop
        </>
      ) : autoBootstrapping ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Preparing…
        </>
      ) : (
        <>
          <Play className="h-3.5 w-3.5" />
          {!apiKey ? "Set up key" : mode === "compare" ? "Send to all" : "Send"}
        </>
      )}
    </PrimaryButton>
  );

  // ── Copy-as-code ─────────────────────────────────────────────────────
  //    Snapshot the current request shape for display. Uses the full
  //    conversation history + the textarea contents as the new user turn
  //    so the snippet matches exactly what Send would fire.
  const codeSnippet = useMemo(() => {
    const body = {
      model: modelId,
      messages: buildMessages(turns, userPrompt.trim() || "Hello"),
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
      stream: streamOn,
    };
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
    // buildMessages is closed over { systemPrompt, turns } — both already
    // appear in deps, so we don't need to add the function itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, apiKey, codeLang, modelId, streamOn, systemPrompt, userPrompt, temperature, topP, maxTokens, turns]);

  const copyCode = async () => {
    await copyToClipboard(codeSnippet);
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
            {tabBar}
            <ModeToggle mode={mode} onChange={setMode} />
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
          </>
        }
      />

      {/* Main 2-col workspace */}
      <section className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4 mb-8">
        {/* Left: settings (shared by single + compare) */}
        <div className="space-y-4">
          {/* Preset picker — applies to all routes via X-Ahura-Preset header */}
          {presets.length > 0 && (
            <div className={`${CARD} p-4`}>
              <div className="flex items-baseline justify-between mb-2.5">
                <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45`}>
                  Routing preset
                </p>
                {selectedPreset && (
                  <button
                    type="button"
                    onClick={() => setPresetId("")}
                    className={`${MONO} text-[9.5px] uppercase tracking-[0.12em] text-white/40 hover:text-white/70`}
                  >
                    Clear
                  </button>
                )}
              </div>
              <Select
                value={presetId || "__none__"}
                onValueChange={(v) => setPresetId(v === "__none__" ? "" : v)}
              >
                <SelectTrigger className="h-9 bg-white/[0.02] border-white/[0.08] text-[11.5px]">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Rocket className="h-3.5 w-3.5 shrink-0 text-white/40" />
                    <SelectValue placeholder="No preset" />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No preset</SelectItem>
                  {presets.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPreset && (
                <p className={`${MONO} mt-2 text-[10px] text-white/45 leading-relaxed`}>
                  {selectedPreset.description ??
                    `Fallback chain: ${selectedPreset.fallback_models.slice(0, 3).join(" → ")}${selectedPreset.fallback_models.length > 3 ? "…" : ""}`}
                </p>
              )}
            </div>
          )}

          {mode === "single" && (
            <>
          {/* Single-mode-only blocks below */}
          {/* Model picker */}
          <div className={`${CARD} p-4`}>
            <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45 mb-2.5`}>
              Model
            </p>
            <button
              type="button"
              onClick={() => setModelPickerOpen(true)}
              className="group w-full rounded-[8px] border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-left transition-all hover:border-[#0095FF]/40 hover:bg-white/[0.04]"
            >
              {selectedModel ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-white">
                      {selectedModel.display_name}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/40 transition-colors group-hover:text-white/80" />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`${MONO} rounded-[4px] bg-white/[0.05] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] text-white/55`}>
                      {selectedModel.provider}
                    </span>
                    {selectedModel.supports_vision && (
                      <span className={`${MONO} text-[9.5px] uppercase tracking-[0.1em] text-amber-300/70`}>Vision</span>
                    )}
                    {selectedModel.supports_tools && (
                      <span className={`${MONO} text-[9.5px] uppercase tracking-[0.1em] text-emerald-300/70`}>Tools</span>
                    )}
                    {selectedModel.context_window && (
                      <span className={`${MONO} text-[9.5px] text-white/40`}>
                        {Math.round(selectedModel.context_window / 1000)}K ctx
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <span className="flex items-center justify-between">
                  <span className="text-[13px] text-white/45">Pick a model…</span>
                  <ChevronDown className="h-3.5 w-3.5 text-white/40" />
                </span>
              )}
            </button>
          </div>

          {/* Parameters */}
          <div className="border border-white/[0.07] bg-[#111216] rounded-[10px] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] p-4 space-y-4">
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
          <div className="border border-white/[0.07] bg-[#111216] rounded-[10px] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] p-4">
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
            </>
          )}

          {mode === "compare" && (
            <div className="border border-white/[0.07] bg-[#111216] rounded-[10px] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] p-4 space-y-3">
              <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45`}>
                Compare params
              </p>
              <Slider
                label="Temperature"
                value={temperature}
                min={0}
                max={2}
                step={0.05}
                onChange={setTemperature}
              />
              <Slider label="Top P" value={topP} min={0} max={1} step={0.05} onChange={setTopP} />
              <Slider
                label="Max tokens"
                value={maxTokens}
                min={64}
                max={8192}
                step={64}
                onChange={(v) => setMaxTokens(Math.round(v))}
                integer
              />
              <div className="border border-white/[0.06] bg-[#0f1014] rounded-[5px] p-3">
                <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45 mb-1.5`}>
                  System prompt
                </p>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="You are a helpful assistant…"
                  rows={3}
                  className={`${MONO} w-full text-[11.5px] text-white placeholder:text-white/30 bg-white/[0.02] border border-white/[0.08] rounded-[4px] px-2.5 py-2 focus:outline-none focus:border-[#0095FF]/40 resize-none`}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right column — conversation ABOVE, input BELOW (chat-app convention).
            In single mode, the conversation panel is the dominant visual
            element so the response is impossible to miss after Send. */}
        <div className="space-y-3 min-w-0">
          {mode === "single" ? (
            <>
              {/* Conversation (above input). Minimal chrome — no busy header,
                  no per-turn footers, no decorative icons. Action labels
                  surface on row hover. */}
              <div className="border border-white/[0.07] bg-[#0b0c10] rounded-[10px] overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] min-h-[40px] bg-white/[0.015]">
                  <span className={`${MONO} inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/45`}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: ACCENT, boxShadow: `0 0 6px ${ACCENT}` }} />
                    {selectedModel?.display_name ?? "—"}
                  </span>
                  <div className="flex items-center gap-4">
                    {running && (
                      <span className={`${MONO} text-[10px] uppercase tracking-[0.14em]`} style={{ color: ACCENT_BRIGHT }}>
                        Streaming
                      </span>
                    )}
                    {turns.length > 0 && !running && (
                      <button
                        type="button"
                        onClick={clearConversation}
                        className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40 hover:text-white transition-colors`}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                <div
                  ref={conversationRef}
                  className="custom-scrollbar px-4 h-[520px] overflow-y-auto"
                >
                  {turns.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center h-full max-w-sm mx-auto">
                      <div
                        className="mb-4 flex h-12 w-12 items-center justify-center rounded-[12px] border border-[#0095FF]/25 bg-[#0095FF]/[0.08]"
                        style={{ boxShadow: "0 0 30px rgba(0,149,255,0.15)" }}
                      >
                        <MessageSquare className="h-5 w-5" style={{ color: ACCENT_BRIGHT }} />
                      </div>
                      <p style={SERIF_STYLE} className="text-[18px] text-white/85 mb-1.5 tracking-[-0.01em]">
                        How can I help you today?
                      </p>
                      <p className={`${MONO} text-[10.5px] text-white/35 leading-relaxed`}>
                        Conversation history is sent on every turn — follow-ups stay context-aware.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1 py-3">
                      {turns.map((turn) => (
                        <TurnRow
                          key={turn.id}
                          turn={turn}
                          modelLabel={
                            turn.role === "assistant"
                              ? models.find((m) => m.model_id === turn.modelId)?.display_name ?? turn.modelId
                              : undefined
                          }
                          onCopy={() => copyTurn(turn.content)}
                          onStop={
                            turn.running
                              ? () => abortRefs.current.get(turn.id)?.abort()
                              : undefined
                          }
                          onRetry={
                            turn.role === "assistant" && !turn.running
                              ? () => retryAssistantTurn(turn.id)
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Composer — borderless textarea in a glass card, send in footer. */}
              <div className={`${CARD} p-2.5 transition-all focus-within:border-[#0095FF]/40 focus-within:ring-1 focus-within:ring-[#0095FF]/25`}>
                <textarea
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      sendPrompt();
                    }
                  }}
                  placeholder="Message the model…"
                  rows={3}
                  className="w-full resize-none border-0 bg-transparent px-2 py-1.5 text-[13.5px] text-white placeholder:text-white/30 focus:outline-none focus:ring-0 min-h-[64px]"
                  style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}
                />
                <div className="flex items-center justify-between gap-2 px-1.5 pt-1.5">
                  <span className={`${MONO} text-[10px] text-white/35`}>
                    {userPrompt.trim().length > 0
                      ? `${userPrompt.trim().length.toLocaleString()} chars`
                      : "⌘ / Ctrl + Enter to send"}
                  </span>
                  <div className="flex items-center gap-2.5">
                    {selectedModel && (
                      <span className={`${MONO} hidden sm:inline text-[10px] text-white/35`}>
                        → {selectedModel.display_name}
                      </span>
                    )}
                    {sendButton}
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Compare mode — panes ABOVE, input BELOW (matches single-mode
               chat layout; each pane is its own per-model conversation). */
            <>
              <PlaygroundCompare
                ref={compareRef}
                models={models}
                params={{
                  apiKey,
                  apiBase,
                  systemPrompt,
                  userPrompt,
                  temperature,
                  topP,
                  maxTokens,
                  stream: streamOn,
                  presetId: presetId || undefined,
                }}
                onRequestKeyDialog={() => setKeySetupOpen(true)}
                onRunningChange={setCompareRunning}
              />

              <div className={`${CARD} p-2.5 transition-all focus-within:border-[#0095FF]/40 focus-within:ring-1 focus-within:ring-[#0095FF]/25`}>
                <textarea
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      sendPrompt();
                    }
                  }}
                  placeholder="Compare across models…"
                  rows={3}
                  className="w-full resize-none border-0 bg-transparent px-2 py-1.5 text-[13.5px] text-white placeholder:text-white/30 focus:outline-none focus:ring-0 min-h-[64px]"
                  style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}
                />
                <div className="flex items-center justify-between gap-2 px-1.5 pt-1.5">
                  <span className={`${MONO} text-[10px] text-white/35`}>
                    {userPrompt.trim().length > 0
                      ? `${userPrompt.trim().length.toLocaleString()} chars`
                      : "All selected models receive this prompt in parallel"}
                  </span>
                  {sendButton}
                </div>
              </div>
            </>
          )}
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
        <div className="border border-white/[0.07] bg-[#111216] rounded-[10px] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] overflow-hidden">
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
            className={`${MONO} custom-scrollbar px-4 py-4 text-[11.5px] text-white/85 leading-relaxed overflow-x-auto`}
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
          <div className="custom-scrollbar max-h-[420px] overflow-y-auto px-2 pb-3">
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
              <div className="flex gap-2">
                <input
                  type="password"
                  value={pasteKeyDraft}
                  onChange={(e) => setPasteKeyDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") savePastedKey();
                  }}
                  placeholder="ahu_live_…"
                  className={`${MONO} h-9 flex-1 px-3 text-[12px] text-white placeholder:text-white/30 bg-white/[0.02] border border-white/[0.08] rounded-[5px] focus:outline-none focus:border-[#0095FF]/40`}
                />
                <GhostButton onClick={savePastedKey} disabled={!pasteKeyDraft.trim()}>
                  Save
                </GhostButton>
              </div>
              <p className={`${MONO} text-[10px] text-white/35 mt-1.5`}>
                Stored only in this browser&apos;s localStorage. Must start with <code className="text-white/55">ahu_</code>.
              </p>
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
  const pct = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] text-white/65`}>
          {label}
        </span>
        <span
          style={SERIF_STYLE}
          className="rounded-[6px] border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[12.5px] text-white font-semibold tabular-nums"
        >
          {integer ? value : value.toFixed(2)}
        </span>
      </div>
      <div className="relative flex h-4 items-center">
        {/* track */}
        <div className="absolute inset-x-0 h-[5px] rounded-full bg-white/[0.07]" />
        {/* fill */}
        <div
          className="absolute h-[5px] rounded-full"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_BRIGHT})`,
            boxShadow: `0 0 10px ${ACCENT}66`,
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="relative z-10 h-4 w-full cursor-pointer appearance-none bg-transparent
            [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgba(0,149,255,0.22),0_1px_4px_rgba(0,0,0,0.5)] [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110
            [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-[0_0_0_4px_rgba(0,149,255,0.22)]"
        />
      </div>
      {hint && <p className={`${MONO} text-[10px] text-white/40 mt-1.5`}>{hint}</p>}
    </div>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: PlaygroundMode;
  onChange: (m: PlaygroundMode) => void;
}) {
  return (
    <div className="inline-flex h-9 rounded-[5px] border border-white/[0.08] bg-white/[0.02] p-0.5">
      <button
        type="button"
        onClick={() => onChange("single")}
        className={`${MONO} h-full inline-flex items-center gap-1.5 px-3 text-[10.5px] uppercase tracking-[0.12em] font-semibold rounded-[4px] transition-colors ${
          mode === "single"
            ? "bg-[#0095FF]/15 text-white shadow-[0_0_12px_rgba(0,149,255,0.18)_inset]"
            : "text-white/55 hover:text-white"
        }`}
      >
        <MessageSquare className="h-3 w-3" />
        Single
      </button>
      <button
        type="button"
        onClick={() => onChange("compare")}
        className={`${MONO} h-full inline-flex items-center gap-1.5 px-3 text-[10.5px] uppercase tracking-[0.12em] font-semibold rounded-[4px] transition-colors ${
          mode === "compare"
            ? "bg-[#0095FF]/15 text-white shadow-[0_0_12px_rgba(0,149,255,0.18)_inset]"
            : "text-white/55 hover:text-white"
        }`}
      >
        <Layers className="h-3 w-3" />
        Compare
      </button>
    </div>
  );
}

function TurnRow({
  turn,
  modelLabel,
  onCopy,
  onStop,
  onRetry,
}: {
  turn: Turn;
  modelLabel?: string;
  onCopy: () => void;
  onStop?: () => void;
  onRetry?: () => void;
}) {
  const isUser = turn.role === "user";
  return (
    <div className={`group flex gap-3 rounded-[8px] px-3 py-3.5 ${isUser ? "" : "bg-white/[0.022]"}`}>
      {/* Letter avatar — restrained, no cartoon icons */}
      <div
        className="h-7 w-7 shrink-0 rounded-[4px] flex items-center justify-center"
        style={{
          background: isUser ? "rgba(255,255,255,0.05)" : "rgba(0,149,255,0.12)",
          border: `1px solid ${isUser ? "rgba(255,255,255,0.08)" : "rgba(0,149,255,0.25)"}`,
        }}
      >
        <span
          className={`${MONO} text-[10.5px] font-bold tabular-nums leading-none`}
          style={{ color: isUser ? "rgba(255,255,255,0.65)" : ACCENT_BRIGHT }}
        >
          {isUser ? "U" : "A"}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        {/* Role line — small label + optional model name */}
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <div className="flex items-baseline gap-2 min-w-0">
            <span
              className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold ${
                isUser ? "text-white/55" : "text-[#33adff]"
              }`}
            >
              {isUser ? "You" : "Assistant"}
            </span>
            {modelLabel && (
              <span className="text-[11px] text-white/35 truncate">{modelLabel}</span>
            )}
          </div>
          <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
            {turn.running ? (
              <Loader2 className="h-3 w-3 animate-spin" style={{ color: ACCENT_BRIGHT }} />
            ) : null}
            {turn.content && !turn.running && (
              <button
                type="button"
                onClick={onCopy}
                className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/45 hover:text-white transition-colors`}
              >
                Copy
              </button>
            )}
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/45 hover:text-white transition-colors`}
              >
                Regenerate
              </button>
            )}
            {onStop && (
              <button
                type="button"
                onClick={onStop}
                className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/70 hover:text-white transition-colors`}
              >
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        {turn.error ? (
          <pre
            className={`${MONO} text-[12px] text-red-300/85 leading-relaxed whitespace-pre-wrap break-words`}
          >
            {turn.error}
          </pre>
        ) : (
          <pre
            className={`text-[13.5px] leading-[1.65] whitespace-pre-wrap break-words ${
              isUser ? "text-white/85" : "text-white/95"
            }`}
            style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}
          >
            {turn.content || (turn.running ? "" : "")}
            {turn.running && (
              <span style={{ color: ACCENT_BRIGHT }} className="ml-0.5 animate-pulse">
                ▍
              </span>
            )}
          </pre>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function truncateError(text: string): string {
  // Gateway errors can be huge JSON blobs; show enough to be useful, link
  // to the request id via X-Ahura-Request-Id if the user wants more.
  if (text.length <= 600) return text;
  return text.slice(0, 600) + "…";
}

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

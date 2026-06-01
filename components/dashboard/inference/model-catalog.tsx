"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Search, Sparkles, Star } from "lucide-react";
import { toast } from "sonner";

import {
  ACCENT,
  CodeChip,
  EmptyState,
  FilterChip,
  Hero,
  MONO,
  PageCanvas,
  SectionHead,
  SERIF_STYLE,
  StatCell,
  StatsStrip,
} from "@/components/dashboard/inference/chrome";

export interface CatalogModel {
  model_id: string;
  display_name: string;
  description: string | null;
  modality: string;
  provider: string;
  is_featured: boolean;
  is_private: boolean;
  capabilities: {
    streaming: boolean;
    tools: boolean;
    json_mode: boolean;
    vision: boolean;
    audio_in: boolean;
    thinking: boolean;
    web_search: boolean;
    context_window: number | null;
    max_output: number | null;
  };
  pricing: {
    input_cents_per_mtok: number | null;
    output_cents_per_mtok: number | null;
    cached_cents_per_mtok: number | null;
  };
  off_peak: { window_utc?: string; discount_pct?: number } | null;
}

type CapabilityFilter =
  | "all"
  | "vision"
  | "tools"
  | "json_mode"
  | "thinking"
  | "audio_in"
  | "web_search";

const CAPABILITY_LABELS: Record<CapabilityFilter, string> = {
  all: "All",
  vision: "Vision",
  tools: "Tools",
  json_mode: "JSON Mode",
  thinking: "Reasoning",
  audio_in: "Audio In",
  web_search: "Web Search",
};

// Provider display names — keep short for chip space
const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  "meta-llama": "Meta",
  deepseek: "DeepSeek",
  qwen: "Qwen",
  mistralai: "Mistral",
  microsoft: "Microsoft",
  moonshotai: "Moonshot",
  minimax: "MiniMax",
  thudm: "Zhipu",
  "x-ai": "xAI",
  nvidia: "NVIDIA",
  cohere: "Cohere",
  perplexity: "Perplexity",
  nousresearch: "Nous",
  ai21: "AI21",
  allenai: "Allen AI",
  liquid: "Liquid",
};

function providerLabel(p: string): string {
  return PROVIDER_LABELS[p] ?? p;
}

function formatCentsPerMtok(cents: number | null): string {
  if (cents === null) return "—";
  if (cents === 0) return "Free";
  if (cents < 100) return `$${(cents / 100).toFixed(2)}`;
  return `$${(cents / 100).toFixed(0)}`;
}

function formatContextWindow(n: number | null): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export function ModelCatalog({
  models,
  orgName,
}: {
  models: CatalogModel[];
  orgName: string;
}) {
  const [provider, setProvider] = useState<string>("All");
  const [capability, setCapability] = useState<CapabilityFilter>("all");
  const [query, setQuery] = useState("");
  const [featuredOnly, setFeaturedOnly] = useState(false);

  // Derive available providers from the catalog (in declared order, dedup)
  const providers = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = ["All"];
    for (const m of models) {
      if (!seen.has(m.provider)) {
        seen.add(m.provider);
        ordered.push(m.provider);
      }
    }
    return ordered;
  }, [models]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter((m) => {
      if (featuredOnly && !m.is_featured) return false;
      if (provider !== "All" && m.provider !== provider) return false;
      if (capability !== "all") {
        const flag = m.capabilities[capability as keyof CatalogModel["capabilities"]];
        if (!flag) return false;
      }
      if (q) {
        const hay = `${m.model_id} ${m.display_name} ${m.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [models, provider, capability, query, featuredOnly]);

  // Stats for the strip
  const featuredCount = models.filter((m) => m.is_featured).length;
  const visionCount = models.filter((m) => m.capabilities.vision).length;
  const toolsCount = models.filter((m) => m.capabilities.tools).length;

  return (
    <PageCanvas>
      <Hero
        breadcrumb={{ label: "Inference", href: "/dashboard/services/inference" }}
        title="Model"
        accent="catalog"
        caption={`${models.length} production models from ${providers.length - 1} leading labs, unified behind one OpenAI-compatible endpoint. Pass any model_id to /v1/chat/completions.`}
        size="md"
      />

      <StatsStrip>
        <StatCell label="Total models" value={String(models.length)} hint="Active in catalog" />
        <StatCell
          label="Featured"
          value={String(featuredCount)}
          hint="Marquee selections"
          accent={ACCENT}
        />
        <StatCell
          label="Vision"
          value={String(visionCount)}
          hint="Image input support"
          accent="#fbbf24"
        />
        <StatCell
          label="Tool calling"
          value={String(toolsCount)}
          hint="Function-calling capable"
          accent="#4ade80"
        />
      </StatsStrip>

      {/* Search + featured toggle */}
      <section className="mb-6">
        <SectionHead
          eyebrow="Browse"
          title="Filter the"
          accent="catalog"
          rightMeta={`${filtered.length} of ${models.length} shown · org: ${orgName}`}
        />

        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/35" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search model id, name, or description…"
                className={`${MONO} h-9 w-full pl-9 pr-3 text-[12px] text-white placeholder:text-white/30 bg-white/[0.02] border border-white/[0.08] rounded-[5px] focus:outline-none focus:border-[#0095FF]/40 focus:ring-1 focus:ring-[#0095FF]/25 focus:bg-white/[0.04] transition-colors`}
              />
            </div>
            <button
              type="button"
              onClick={() => setFeaturedOnly((v) => !v)}
              className={`${MONO} h-9 px-3 inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] font-semibold rounded-[5px] border transition-colors ${
                featuredOnly
                  ? "border-[#0095FF]/40 bg-[#0095FF]/10 text-[#0095FF]"
                  : "border-white/[0.08] bg-white/[0.02] text-white/55 hover:text-white/85 hover:bg-white/[0.04]"
              }`}
            >
              <Star className={`h-3 w-3 ${featuredOnly ? "fill-current" : ""}`} />
              Featured only
            </button>
          </div>

          {/* Provider chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/35 mr-1`}>
              Provider
            </span>
            {providers.map((p) => (
              <FilterChip
                key={p}
                active={provider === p}
                label={p === "All" ? "All" : providerLabel(p)}
                onClick={() => setProvider(p)}
              />
            ))}
          </div>

          {/* Capability chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/35 mr-1`}>
              Capability
            </span>
            {(Object.keys(CAPABILITY_LABELS) as CapabilityFilter[]).map((c) => (
              <FilterChip
                key={c}
                active={capability === c}
                label={CAPABILITY_LABELS[c]}
                onClick={() => setCapability(c)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Grid */}
      {filtered.length > 0 ? (
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pb-8">
          {filtered.map((m) => (
            <ModelCard key={m.model_id} model={m} />
          ))}
        </section>
      ) : (
        <EmptyState
          title="No models match"
          description="Loosen a filter or clear the search to see more."
        />
      )}
    </PageCanvas>
  );
}

// ─── ModelCard ─────────────────────────────────────────────────────────

function ModelCard({ model }: { model: CatalogModel }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(model.model_id);
    setCopied(true);
    toast.success(`Copied "${model.model_id}"`);
    setTimeout(() => setCopied(false), 1800);
  };

  const capChips = [
    model.capabilities.vision && { label: "Vision", color: "#fbbf24" },
    model.capabilities.tools && { label: "Tools", color: "#4ade80" },
    model.capabilities.json_mode && { label: "JSON", color: ACCENT },
    model.capabilities.thinking && { label: "Reasoning", color: "#a78bfa" },
    model.capabilities.audio_in && { label: "Audio", color: "#f472b6" },
    model.capabilities.web_search && { label: "Web", color: "#22d3ee" },
  ].filter(Boolean) as Array<{ label: string; color: string }>;

  return (
    <div className="group relative border border-white/[0.06] bg-[#111216] rounded-[6px] hover:border-white/[0.14] transition-colors overflow-hidden">
      {/* Featured shimmer band */}
      {model.is_featured && (
        <div
          className="absolute top-0 right-0 h-16 w-16 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at top right, rgba(0,149,255,0.12), transparent 70%)",
          }}
        />
      )}

      <div className="p-4 flex flex-col gap-3 h-full">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 min-w-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="text-[14px] font-semibold text-white truncate">
                {model.display_name}
              </h3>
              {model.is_featured && (
                <Star className="h-3 w-3 shrink-0 fill-[#0095FF] text-[#0095FF]" />
              )}
              {model.is_private && (
                <span
                  className={`${MONO} text-[9px] uppercase tracking-[0.12em] text-amber-300/80`}
                >
                  private
                </span>
              )}
            </div>
            <p className={`${MONO} mt-0.5 text-[10.5px] uppercase tracking-[0.08em] text-white/45`}>
              {providerLabel(model.provider)}
            </p>
          </div>
          <button
            type="button"
            onClick={copy}
            className="shrink-0 h-7 w-7 rounded-[4px] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Copy model id"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Model ID */}
        <code className={`${MONO} block text-[11px] text-white/60 truncate`}>{model.model_id}</code>

        {/* Description */}
        {model.description && (
          <p className="text-[12px] text-white/55 leading-relaxed line-clamp-3">
            {model.description}
          </p>
        )}

        {/* Capability chips */}
        {capChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {capChips.map((c) => (
              <span
                key={c.label}
                className={`${MONO} inline-flex items-center gap-1 px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.1em] font-semibold rounded-sm`}
                style={{
                  color: c.color,
                  background: `${c.color}14`,
                  border: `1px solid ${c.color}33`,
                }}
              >
                {c.label}
              </span>
            ))}
          </div>
        )}

        {/* Stats footer */}
        <div className="mt-auto pt-3 border-t border-white/[0.05] grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <p className={`${MONO} text-[9.5px] uppercase tracking-[0.12em] text-white/35 mb-0.5`}>
              Context
            </p>
            <p
              style={SERIF_STYLE}
              className="text-[14px] font-bold text-white tabular-nums leading-none"
            >
              {formatContextWindow(model.capabilities.context_window)}
            </p>
          </div>
          <div className="text-right">
            <p className={`${MONO} text-[9.5px] uppercase tracking-[0.12em] text-white/35 mb-0.5`}>
              Price /Mtok
            </p>
            <p
              style={SERIF_STYLE}
              className="text-[14px] font-bold text-white tabular-nums leading-none"
            >
              {formatCentsPerMtok(model.pricing.input_cents_per_mtok)}
              <span className="text-white/40 mx-1">/</span>
              {formatCentsPerMtok(model.pricing.output_cents_per_mtok)}
            </p>
          </div>
        </div>

        {/* Off-peak hint */}
        {model.off_peak?.window_utc && model.off_peak?.discount_pct && (
          <div
            className={`${MONO} -mx-4 -mb-4 mt-1 px-4 py-2 text-[10px] uppercase tracking-[0.1em] text-[#0095FF]/85 border-t border-[#0095FF]/15`}
            style={{ background: "rgba(0,149,255,0.04)" }}
          >
            <Sparkles className="inline h-3 w-3 mr-1 align-text-bottom" />
            {model.off_peak.discount_pct}% off · {model.off_peak.window_utc} UTC
          </div>
        )}
      </div>
    </div>
  );
}

// silence unused-import warning for CodeChip (kept here for future use in expanded card view)
const _unused = CodeChip;
void _unused;

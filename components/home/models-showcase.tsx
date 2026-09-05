import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { ProviderLogo } from "@/components/services/provider-logos";

/**
 * ModelsShowcase — the homepage's model catalogue, read live.
 *
 * WHY LIVE. The previous section carried a hand-written list of eighteen
 * ids guarded by a test. That is the right shape for a static page and the
 * wrong one for a home page that is meant to announce what is new: a model
 * switched on in the admin panel did not appear here until someone edited a
 * file, and a model switched off stayed advertised. This reads
 * inference.models on every render (the page revalidates every 300 s), so
 * every name on the page is callable at the moment it is shown, and a new
 * model shows up the moment it is live.
 *
 * WHAT COUNTS AS PUBLIC. is_active, no org (customers' own fine-tunes are
 * org-scoped and not for sale), and serving_type 'proxy' (the gateway's
 * upstream models, not managed pods).
 *
 * A read that fails renders NOTHING and logs. A model section with invented
 * names is the defect this file replaces; a missing section is visible.
 */

type Row = {
    model_id: string;
    display_name: string;
    is_featured: boolean;
    sort_order: number;
    pricing: { input_cents_per_mtok?: number | string; output_cents_per_mtok?: number | string } | null;
    capabilities: { context_window?: number } | null;
};

/** Provider label and accent, keyed by the namespace in model_id. */
const PROVIDERS: Record<string, { name: string; accent: string }> = {
    anthropic: { name: "Anthropic", accent: "#d97706" },
    openai: { name: "OpenAI", accent: "#10a37f" },
    "x-ai": { name: "xAI", accent: "#a3a3a3" },
    moonshotai: { name: "Moonshot", accent: "#6366f1" },
    zhipu: { name: "Zhipu", accent: "#14b8a6" },
    deepseek: { name: "DeepSeek", accent: "#7c3aed" },
    bytedance: { name: "ByteDance", accent: "#06b6d4" },
    minimax: { name: "MiniMax", accent: "#f43f5e" },
};

function providerOf(modelId: string): { key: string; name: string; accent: string } {
    const key = modelId.split("/")[0] ?? modelId;
    const known = PROVIDERS[key];
    return known ? { key, ...known } : { key, name: key, accent: "#9a9aa2" };
}

/** 1000000 → "1M", 262144 → "262K", 8192 → "8K"; null when unknown. */
function contextLabel(n: number | undefined): string | null {
    if (!n || n <= 0) return null;
    // Floor, not round: 1,050,000 reads as "1M", not a "1.1M" nothing offers.
    if (n >= 1_000_000) return `${Math.floor(n / 100_000) / 10}M`.replace(".0M", "M");
    return `${Math.round(n / 1000)}K`;
}

/** Cents per million tokens → dollars, two decimals; null when unknown. */
function usdPerMtok(cents: number | string | undefined): string | null {
    if (cents === undefined || cents === null || cents === "") return null;
    const n = Number(cents);
    if (!Number.isFinite(n)) return null;
    return `$${(n / 100).toFixed(2)}`;
}

function Arrow() {
    return (
        <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
            <path d="M3.5 10.5 10.5 3.5M5 3.5h5.5V9" />
        </svg>
    );
}

export async function ModelsShowcase() {
    let rows: Row[] = [];
    try {
        const supabase = await createServiceClient();
        const { data, error } = await supabase
            .schema("inference")
            .from("models")
            .select("model_id, display_name, is_featured, sort_order, pricing, capabilities")
            .eq("is_active", true)
            .is("org_id", null)
            .eq("serving_type", "proxy")
            .order("sort_order", { ascending: true });
        if (error) throw error;
        rows = (data ?? []) as Row[];
    } catch (error) {
        console.error("[models-showcase] inference.models read failed; section not rendered:", error);
        return null;
    }
    if (rows.length === 0) {
        console.error("[models-showcase] no live public models; section not rendered");
        return null;
    }

    const featured = rows.filter((r) => r.is_featured);
    const providerOrder: string[] = [];
    for (const r of rows) {
        const p = providerOf(r.model_id).key;
        if (!providerOrder.includes(p)) providerOrder.push(p);
    }
    const maxContext = rows.reduce((m, r) => Math.max(m, r.capabilities?.context_window ?? 0), 0);
    const maxContextLabel = contextLabel(maxContext);

    const stats: Array<{ value: string; label: string }> = [
        { value: String(rows.length), label: "Models" },
        { value: String(providerOrder.length), label: "Providers" },
        ...(maxContextLabel ? [{ value: maxContextLabel, label: "Max context" }] : []),
        { value: "1", label: "API key" },
    ];

    return (
        <section
            className="ah-type relative isolate overflow-hidden"
            style={{ background: "var(--ah-bg)" }}
            aria-labelledby="models-heading"
        >
            <div className="mx-auto w-full max-w-[1800px] px-6 pb-16 pt-16 sm:px-10 lg:px-12 lg:pb-20 lg:pt-24">
                {/* ── heading + lede + stats ── */}
                <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
                    <h2 id="models-heading" className="ah-h2">
                        The newest models,
                        <br />
                        <span className="ah-h2-hl">one API key.</span>
                    </h2>
                    <div className="lg:pt-2">
                        <p className="m-0 max-w-[34rem] text-[15.5px] leading-[1.65]" style={{ color: "var(--ah-body)" }}>
                            {rows.length} models from {providerOrder.length} providers on one OpenAI- and
                            Anthropic-compatible endpoint. Switch models with a string change. Every name on
                            this page is callable right now; a model that is switched off leaves the page
                            with it.
                        </p>
                        <div className="mt-8 grid max-w-[34rem] grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                            {stats.map((s) => (
                                <div key={s.label} className="pt-3" style={{ borderTop: "1px solid var(--ah-line)" }}>
                                    <div className="text-[1.4rem] font-medium tracking-tight" style={{ color: "var(--ah-blue-lt)" }}>
                                        {s.value}
                                    </div>
                                    <div className="ah-lbl mt-1" style={{ fontSize: "9.5px", letterSpacing: "0.16em", color: "var(--ah-muted)" }}>
                                        {s.label.toUpperCase()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── featured: the flagships, in the rail's own grid ── */}
                {featured.length > 0 && (
                    <div className="mt-12 lg:mt-14">
                        <div className="mb-3 flex items-center justify-between gap-4">
                            <span className="ah-lbl" style={{ fontSize: "9.5px", letterSpacing: "0.16em", color: "var(--ah-muted)" }}>
                                FEATURED · {featured.length} OF {rows.length}
                            </span>
                            <span className="ah-lbl" style={{ fontSize: "9.5px", letterSpacing: "0.16em", color: "var(--ah-muted)" }}>
                                PRICES PER MILLION TOKENS, IN / OUT
                            </span>
                        </div>
                        <div
                            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
                            style={{ border: "1px solid var(--ah-line-hi)", background: "rgba(7, 7, 10, 0.55)" }}
                        >
                            {featured.map((m) => {
                                const p = providerOf(m.model_id);
                                const ctx = contextLabel(m.capabilities?.context_window);
                                const inUsd = usdPerMtok(m.pricing?.input_cents_per_mtok);
                                const outUsd = usdPerMtok(m.pricing?.output_cents_per_mtok);
                                return (
                                    <Link
                                        key={m.model_id}
                                        href="/dashboard/services/inference/models"
                                        className="ah-gpu group relative flex min-w-0 flex-col gap-4 px-6 py-6"
                                        style={{ color: "var(--ah-ink)", borderRight: "1px solid var(--ah-line)", borderBottom: "1px solid var(--ah-line)" }}
                                    >
                                        <span aria-hidden="true" className="ah-gpu-line" />
                                        <div className="flex items-center gap-2.5">
                                            <span
                                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center font-mono text-[9px] font-semibold"
                                                style={{
                                                    background: `linear-gradient(135deg, ${p.accent}22, ${p.accent}08)`,
                                                    border: `1px solid ${p.accent}40`,
                                                    color: p.accent,
                                                }}
                                            >
                                                <ProviderLogo provider={p.name} size={14} />
                                            </span>
                                            <span className="ah-lbl truncate" style={{ fontSize: "9.5px", letterSpacing: "0.14em", color: "var(--ah-body)" }}>
                                                {p.name.toUpperCase()}
                                            </span>
                                            {ctx && (
                                                <span className="ah-lbl ml-auto shrink-0" style={{ fontSize: "9.5px", letterSpacing: "0.12em", color: "var(--ah-body)" }}>
                                                    {ctx} CTX
                                                </span>
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="truncate text-[22px] font-normal leading-tight tracking-[-0.02em]">{m.display_name}</div>
                                            <div className="ah-lbl mt-1 truncate" style={{ fontSize: "10.5px", letterSpacing: "0.02em", color: "var(--ah-body)", textTransform: "none" }}>
                                                {m.model_id}
                                            </div>
                                        </div>
                                        {(inUsd || outUsd) && (
                                            <div className="flex items-baseline gap-2">
                                                <span className="ah-gpu-price text-[1.25rem] font-normal leading-none tracking-[-0.02em] tabular-nums">
                                                    {inUsd ?? "N/A"}
                                                </span>
                                                <span className="ah-lbl" style={{ fontSize: "9.5px", color: "var(--ah-body)" }}>/</span>
                                                <span className="ah-gpu-price text-[1.25rem] font-normal leading-none tracking-[-0.02em] tabular-nums">
                                                    {outUsd ?? "N/A"}
                                                </span>
                                            </div>
                                        )}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ── the whole catalogue, one row per provider ── */}
                <div className="mt-10 grid lg:mt-12 lg:grid-cols-2 lg:gap-x-12" style={{ borderTop: "1px solid var(--ah-line-hi)" }}>
                    {providerOrder.map((key) => {
                        const models = rows.filter((r) => providerOf(r.model_id).key === key);
                        const p = providerOf(models[0].model_id);
                        return (
                            <div
                                key={key}
                                className="grid gap-2.5 py-3.5 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-5"
                                style={{ borderBottom: "1px solid var(--ah-line)" }}
                            >
                                <div className="flex items-center gap-2.5">
                                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center font-mono text-[8px] font-semibold" style={{ color: p.accent }}>
                                        <ProviderLogo provider={p.name} size={13} />
                                    </span>
                                    <span className="ah-lbl" style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--ah-ink)" }}>
                                        {p.name.toUpperCase()}
                                    </span>
                                    <span className="ah-lbl" style={{ fontSize: "9.5px", color: "var(--ah-muted)" }}>
                                        {models.length}
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {models.map((m) => (
                                        <span
                                            key={m.model_id}
                                            title={m.model_id}
                                            className="inline-flex items-center gap-2 px-2.5 py-1 text-[12.5px]"
                                            style={{ border: "1px solid var(--ah-line)", color: m.is_featured ? "var(--ah-ink)" : "var(--ah-body)" }}
                                        >
                                            {m.is_featured && (
                                                <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: p.accent }} />
                                            )}
                                            {m.display_name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
                    <Link href="/dashboard/services/inference/models" className="inline-flex items-center gap-2 text-[13.5px] font-medium transition-colors hover:text-[#7fc7ff]" style={{ color: "var(--ah-ink)" }}>
                        Browse the full catalogue
                        <Arrow />
                    </Link>
                    <Link href="/dashboard/services/inference/api-keys" className="inline-flex items-center gap-2 text-[13.5px] font-medium transition-colors hover:text-[#7fc7ff]" style={{ color: "var(--ah-body)" }}>
                        Get an API key
                        <Arrow />
                    </Link>
                </div>
            </div>
        </section>
    );
}

export default ModelsShowcase;

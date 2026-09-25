"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search, RefreshCw, Pencil, Plus, Server, Star } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/axios/axios";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@admin/components/page-header";
import { AiTabs } from "@admin/components/ai/ai-tabs";
import {
  EndpointsDialog,
  NewHostedModelDialog,
} from "@admin/components/ai/hosted-model-dialogs";
import { MediaPricingDialog } from "@admin/components/ai/media-pricing-dialog";
import { SyncOpenRouterDialog } from "@admin/components/ai/sync-openrouter-dialog";
import { costTabsFor, servedByEndpoints } from "@admin/lib/serving";
import { centsToUsd, type UnitPricing } from "@admin/lib/model-pricing";

type Pricing = {
  input_cents_per_mtok?: number;
  output_cents_per_mtok?: number;
  cached_cents_per_mtok?: number;
} | null;

type ModelRow = {
  id: string;
  model_id: string;
  display_name: string | null;
  modality: string;
  serving_type: string;
  upstream_provider: string | null;
  upstream_model_id: string | null;
  org_id: string | null;
  pricing: Pricing;
  upstream_pricing: Pricing;
  is_active: boolean;
  is_featured: boolean;
  upstream_available: boolean | null;
  margin: { input: number | null; output: number | null };
  pricedPerUnit: boolean;
  unitPricing: UnitPricing | null;
  provider_pricing: Record<string, Record<string, number | undefined>> | null;
  providerMargins: { provider: string; input: number | null; output: number | null }[];
  placeholderPrice: boolean;
  sharesUpstreamIdWith: string[];
  // The four layers. Real cost lives in upstream_pricing/provider_pricing;
  // these describe how the customer price was arrived at.
  ownPods: boolean;
  endpointProviders: string[];
  partnersWithoutCost: string[];
  endpointNoun: { one: string; many: string };
  serving: {
    pods: { live: number; up: number };
    keys: { live: number; up: number };
  } | null;
  listPriced: boolean;
  discountPct: number;
  impliedDiscountPct: number | null;
  priceDrift: { key: string; charged: number; expected: number }[];
  list_pricing: Record<string, number> | null;
  openrouter_id: string | null;
  endpoints: { total: number; enabled: number } | null;
  podHealth: { live: number; up: number } | null;
  servedLast24h: { provider: string; requests: number }[] | null;
};

type CatalogSummary = {
  total: number;
  active: number;
  orphaned: number;
  placeholderPriced: number;
  listPriced: number;
  drifted: number;
  upstreamChecked: boolean;
  upstreamCount: number | null;
};

const perMtok = (cents?: number) =>
  typeof cents === "number" ? `$${(cents / 100).toFixed(2)}` : "—";

function MarginBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const tone =
    value < 0
      ? "text-red-400"
      : value < 10
        ? "text-amber-300"
        : "text-emerald-400";
  return (
    <span className={`tabular-nums ${tone}`}>
      {value > 0 ? "+" : ""}
      {value}%
    </span>
  );
}

export function AiModelsTable() {
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [summary, setSummary] = useState<CatalogSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("active");
  const [providerFilter, setProviderFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ModelRow | null>(null);
  const [draft, setDraft] = useState({ input: "", output: "", cached: "" });
  // Upstream cost is entered in CENTS per Mtok, not dollars: partner rates
  // are routinely fractional (0.56c) and dollars would hide that.
  const [costDraft, setCostDraft] = useState({
    input: "",
    output: "",
    cached: "",
    cacheWrite: "",
  });
  // Cost is per partner: the Default tab writes upstream_pricing (which the
  // consumer falls back to), every other tab writes provider_pricing[name].
  // Held as a map rather than one state per partner, so a new partner costs
  // an entry in lib/serving rather than another pair of hooks here.
  type CostFields = { input: string; output: string; cached: string; cacheWrite: string };
  const blankCost = (): CostFields => ({
    input: "",
    output: "",
    cached: "",
    cacheWrite: "",
  });
  const [costTab, setCostTab] = useState<string>("default");
  const [partnerDrafts, setPartnerDrafts] = useState<Record<string, CostFields>>({});
  const [creating, setCreating] = useState(false);
  const [endpointsFor, setEndpointsFor] = useState<string | null>(null);
  const [mediaPricing, setMediaPricing] = useState<ModelRow | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  // Discount and routing are per-model decisions edited alongside price.
  const [discountDraft, setDiscountDraft] = useState("");
  const [providerDraft, setProviderDraft] = useState("");
  const [orIdDraft, setOrIdDraft] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/ai/models");
      setRows(res.data.data ?? []);
      setSummary(res.data.summary ?? null);
    } catch {
      /* toasted by interceptor */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((m) => {
      if (filter === "active" && !m.is_active) return false;
      if (filter === "inactive" && m.is_active) return false;
      if (filter === "orphaned" && !(m.is_active && m.upstream_available === false))
        return false;
      if (filter === "placeholder" && !(m.is_active && m.placeholderPrice))
        return false;
      if (providerFilter !== "all" && m.upstream_provider !== providerFilter)
        return false;
      if (!q) return true;
      return (
        m.model_id.toLowerCase().includes(q) ||
        (m.display_name ?? "").toLowerCase().includes(q) ||
        m.modality.toLowerCase().includes(q)
      );
    });
  }, [rows, search, filter, providerFilter]);

  const patch = async (
    model: ModelRow,
    payload: Record<string, unknown>,
    successMessage: string,
  ) => {
    setBusyId(model.id);
    try {
      const res = await api.patch(`/admin/ai/models/${model.id}`, payload);
      if (res.data?.data) {
        toast.success(successMessage);
        await load();
      }
    } catch {
      /* toasted by interceptor */
    } finally {
      setBusyId(null);
    }
  };

  const openPricing = (model: ModelRow) => {
    // A media model has no per-Mtok fields to fill in; send it to the
    // per-unit editor rather than asking about tokens it does not have.
    if (model.pricedPerUnit) {
      setMediaPricing(model);
      return;
    }
    setDraft({
      input:
        model.pricing?.input_cents_per_mtok != null
          ? String(model.pricing.input_cents_per_mtok / 100)
          : "",
      output:
        model.pricing?.output_cents_per_mtok != null
          ? String(model.pricing.output_cents_per_mtok / 100)
          : "",
      cached:
        model.pricing?.cached_cents_per_mtok != null
          ? String(model.pricing.cached_cents_per_mtok / 100)
          : "",
    });
    const up = (model.upstream_pricing ?? {}) as Record<string, number | undefined>;
    setCostDraft({
      input: up.input_cents_per_mtok != null ? String(up.input_cents_per_mtok) : "",
      output: up.output_cents_per_mtok != null ? String(up.output_cents_per_mtok) : "",
      cached: up.cached_cents_per_mtok != null ? String(up.cached_cents_per_mtok) : "",
      cacheWrite:
        up.cache_write_cents_per_mtok != null
          ? String(up.cache_write_cents_per_mtok)
          : "",
    });
    const perProvider = (model.provider_pricing ?? {}) as Record<
      string,
      Record<string, number | undefined> | undefined
    >;
    const drafts: Record<string, CostFields> = {};
    for (const tab of costTabsFor(model.upstream_provider, model.endpointProviders)) {
      if (tab.id === "default") continue;
      const blob = perProvider[tab.id] ?? {};
      drafts[tab.id] = {
        input: blob.input_cents_per_mtok != null ? String(blob.input_cents_per_mtok) : "",
        output:
          blob.output_cents_per_mtok != null ? String(blob.output_cents_per_mtok) : "",
        cached:
          blob.cached_cents_per_mtok != null ? String(blob.cached_cents_per_mtok) : "",
        cacheWrite:
          blob.cache_write_cents_per_mtok != null
            ? String(blob.cache_write_cents_per_mtok)
            : "",
      };
    }
    setPartnerDrafts(drafts);
    setCostTab("default");
    setDiscountDraft(String(model.discountPct ?? 0));
    setProviderDraft(model.upstream_provider ?? "");
    setOrIdDraft(model.openrouter_id ?? "");
    setEditing(model);
  };

  const savePricing = async () => {
    if (!editing) return;
    const model = editing;
    const pricing: Record<string, number> = {};
    const map: [string, string][] = [
      ["input_cents_per_mtok", draft.input],
      ["output_cents_per_mtok", draft.output],
      ["cached_cents_per_mtok", draft.cached],
    ];
    for (const [key, raw] of map) {
      if (raw.trim() === "") continue;
      const dollars = Number(raw);
      if (!Number.isFinite(dollars) || dollars < 0) {
        toast.error("Prices must be numbers ≥ 0 (USD per Mtok)");
        return;
      }
      pricing[key] = Math.round(dollars * 100 * 10000) / 10000;
    }
    const upstream_pricing: Record<string, number> = {};
    const costMap: [string, string][] = [
      ["input_cents_per_mtok", costDraft.input],
      ["output_cents_per_mtok", costDraft.output],
      ["cached_cents_per_mtok", costDraft.cached],
      ["cache_write_cents_per_mtok", costDraft.cacheWrite],
    ];
    for (const [key, raw] of costMap) {
      if (raw.trim() === "") continue;
      const cents = Number(raw);
      if (!Number.isFinite(cents) || cents < 0) {
        toast.error("Upstream costs must be numbers >= 0 (cents per Mtok)");
        return;
      }
      upstream_pricing[key] = cents;
    }

    // One blob per partner tab that has anything in it. A tab left entirely
    // blank is not sent, so it keeps falling back to Default rather than
    // being written as a row of zeroes.
    const providerPricing: Record<string, Record<string, number>> = {};
    for (const [provider, fields] of Object.entries(partnerDrafts)) {
      const blob: Record<string, number> = {};
      const map: [string, string][] = [
        ["input_cents_per_mtok", fields.input],
        ["output_cents_per_mtok", fields.output],
        ["cached_cents_per_mtok", fields.cached],
        ["cache_write_cents_per_mtok", fields.cacheWrite],
      ];
      for (const [key, raw] of map) {
        if (raw.trim() === "") continue;
        const cents = Number(raw);
        if (!Number.isFinite(cents) || cents < 0) {
          toast.error(`${provider} costs must be numbers >= 0 (cents per Mtok)`);
          return;
        }
        blob[key] = cents;
      }
      if (Object.keys(blob).length > 0) providerPricing[provider] = blob;
    }

    // A list-priced model's sell price is derived, so sending `pricing` for
    // one is refused by the API - the discount is the editable layer.
    let discountUpdate: Record<string, unknown> = {};
    if (model.listPriced) {
      const d = Number(discountDraft);
      if (!Number.isFinite(d) || d < 0 || d >= 100) {
        toast.error("Discount must be a number from 0 to 99.99");
        return;
      }
      if (d !== model.discountPct) discountUpdate = { discount_pct: d };
    }

    // Routing is strict: this decides who serves every request for the
    // model, so it is only sent when it actually changed.
    const routingUpdate: Record<string, unknown> = {};
    if (
      model.serving_type === "proxy" &&
      providerDraft !== "" &&
      providerDraft !== model.upstream_provider
    ) {
      routingUpdate.upstream_provider = providerDraft;
    }
    if (orIdDraft.trim() !== (model.openrouter_id ?? "")) {
      routingUpdate.openrouter_id = orIdDraft.trim();
    }

    setEditing(null);
    await patch(
      model,
      {
        ...(model.listPriced ? {} : { pricing }),
        ...discountUpdate,
        ...routingUpdate,
        upstream_pricing,
        ...(Object.keys(providerPricing).length > 0
          ? { provider_pricing: providerPricing }
          : {}),
      },
      `${model.model_id} pricing updated`,
    );
  };

  return (
    <div>
      <PageHeader
        title="Model catalog"
        description="Customer pricing, upstream cost basis and availability for every gateway model."
        actions={
          <>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New hosted model
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/ai">
                <ArrowLeft className="mr-2 h-3.5 w-3.5" /> AI Labs overview
              </Link>
            </Button>
          </>
        }
      />
      <AiTabs />

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search model id, name, modality"
              className="w-72 pl-8"
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active only</SelectItem>
              <SelectItem value="all">All models</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="orphaned">Active, not on Wokey</SelectItem>
              <SelectItem value="placeholder">Placeholder pricing</SelectItem>
            </SelectContent>
          </Select>
          {/* Carried-by filter. Driven off the rows, so a provider added to
              the enum shows up here without a code change. */}
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Any upstream" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any upstream</SelectItem>
              {[
                ...new Set(
                  rows
                    .map((m) => m.upstream_provider)
                    .filter((v): v is string => Boolean(v)),
                ),
              ]
                .sort()
                .map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {summary && summary.drifted > 0 && (
            <span
              className="rounded-full border border-purple-500/40 bg-purple-500/10 px-2.5 py-1 text-[11px] text-purple-300"
              title="The stored price does not equal list x (1 - discount). Either the list price moved or someone hand-edited the price. Re-syncing or saving a discount will bring it back in line."
            >
              {summary.drifted} price(s) out of line with list
            </span>
          )}
          {summary && summary.placeholderPriced > 0 && (
            <button
              type="button"
              onClick={() => setFilter("placeholder")}
              className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-300 transition-colors hover:bg-amber-500/15"
            >
              {summary.placeholderPriced} model(s) still at placeholder pricing
            </button>
          )}
          {summary?.upstreamChecked && summary.orphaned > 0 && (
            <button
              type="button"
              onClick={() => setFilter("orphaned")}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300"
            >
              {summary.orphaned} active without upstream
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {filtered.length} of {rows.length} models
              {summary?.upstreamCount != null &&
                ` · Wokey serves ${summary.upstreamCount}`}
            </span>
            <Button variant="outline" size="sm" asChild>
              <Link href="/ai/partner-models">Partner models</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSyncOpen(true)}>
              Sync with OpenRouter
            </Button>
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Modality</TableHead>
                <TableHead>Upstream</TableHead>
                <TableHead className="text-right">Sell in/out ($/Mtok)</TableHead>
                <TableHead className="text-right">
                  Cost in/out
                  <span
                    className="ml-1 rounded border border-white/[0.15] px-1 text-[9px] uppercase tracking-wide text-white/50"
                    title="What the partner charges us. Operator-only - this never appears on a customer-facing surface."
                  >
                    internal
                  </span>
                </TableHead>
                <TableHead className="text-right">Margin by partner</TableHead>
                <TableHead>Featured</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                    No models match.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((m) => (
                <TableRow key={m.id} className={busyId === m.id ? "opacity-50" : undefined}>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      {m.is_featured && (
                        <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />
                      )}
                      {m.display_name || m.model_id}
                      {m.org_id && (
                        <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          org-private
                        </span>
                      )}
                      {m.is_active && m.upstream_available === false && (
                        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                          not on Wokey
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">{m.model_id}</div>
                  </TableCell>
                  <TableCell className="text-sm capitalize">{m.modality}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <span>{m.upstream_provider ?? m.serving_type}</span>
                      {servedByEndpoints(m.serving_type) && m.podHealth && (
                        // Probed by us either way, so "is it serving" is a
                        // fact we hold rather than a partner's claim - but
                        // a partner's endpoint rows are API keys, not pods.
                        <span
                          className={`rounded border px-1 py-0.5 text-[10px] ${
                            m.podHealth.live === 0
                              ? "border-white/[0.15] text-white/50"
                              : m.podHealth.up === m.podHealth.live
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                                : m.podHealth.up === 0
                                  ? "border-red-500/50 bg-red-500/15 text-red-300"
                                  : "border-amber-500/50 bg-amber-500/10 text-amber-300"
                          }`}
                          title={`Enabled ${m.endpointNoun.many} serving / enabled ${m.endpointNoun.many}`}
                        >
                          {/* A model can be served by a partner's keys AND a
                              machine of our own at once, and one number over
                              the two hides which half is down. */}
                          {m.serving &&
                          m.serving.keys.live > 0 &&
                          m.serving.pods.live > 0
                            ? `${m.serving.keys.up}/${m.serving.keys.live} keys · ${m.serving.pods.up}/${m.serving.pods.live} pod${m.serving.pods.live === 1 ? "" : "s"}`
                            : `${m.podHealth.up}/${m.podHealth.live} ${m.endpointNoun.many}`}
                        </span>
                      )}
                      {servedByEndpoints(m.serving_type) &&
                        !m.podHealth &&
                        m.endpoints && (
                          <span className="rounded border border-white/[0.15] px-1 py-0.5 text-[10px] text-white/50">
                            {m.endpoints.total}{" "}
                            {m.endpoints.total === 1
                              ? m.endpointNoun.one
                              : m.endpointNoun.many}
                            , unprobed
                          </span>
                        )}
                    </div>
                    {m.upstream_model_id && (
                      <div
                        className="mt-0.5 max-w-[190px] truncate font-mono text-[10.5px] text-muted-foreground/70"
                        title={m.upstream_model_id}
                      >
                        {m.upstream_model_id}
                      </div>
                    )}
                    {m.sharesUpstreamIdWith.length > 0 && (
                      <div
                        className="mt-0.5 text-[10px] text-amber-300/90"
                        title={`Also sent as this name by: ${m.sharesUpstreamIdWith.join(", ")}. Different rows, different prices — check you are editing the right one.`}
                      >
                        same upstream name as{" "}
                        {m.sharesUpstreamIdWith.length === 1
                          ? m.sharesUpstreamIdWith[0]
                          : `${m.sharesUpstreamIdWith.length} other rows`}
                      </div>
                    )}
                    {/* Who OWNS the model and who SERVED it can differ once a
                        primary/fallback chain exists — show the split when it
                        does, and stay quiet when it does not. */}
                    {m.servedLast24h && m.servedLast24h.length > 0 && (
                      <div className="mt-0.5 text-[10.5px] text-muted-foreground/70">
                        24h:{" "}
                        {m.servedLast24h
                          .map((x) => `${x.provider} ${x.requests}`)
                          .join(" · ")}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {m.pricedPerUnit && m.unitPricing ? (
                      <span
                        className="text-[12px]"
                        title={m.unitPricing.tiers
                          .map((t) => `${t.tier}: ${t.priceCents}¢`)
                          .join(" · ")}
                      >
                        {m.unitPricing.flat
                          ? `${m.unitPricing.flat.priceCents}¢/${m.unitPricing.unit}`
                          : "—"}
                        {m.unitPricing.tiers.length > 0 && (
                          <span className="ml-1 text-muted-foreground">
                            ({m.unitPricing.tiers.length} tier
                            {m.unitPricing.tiers.length === 1 ? "" : "s"})
                          </span>
                        )}
                      </span>
                    ) : (
                      <>
                        {perMtok(m.pricing?.input_cents_per_mtok)} /{" "}
                        {perMtok(m.pricing?.output_cents_per_mtok)}
                        {/* A seeded price is not a decision; say so until
                            someone makes one. */}
                        {m.placeholderPrice && (
                          <div
                            className="mt-0.5 inline-flex rounded border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 text-[10px] font-normal text-amber-300"
                            title="Looks like the seeded placeholder: 5x the partner cost, cached at a tenth of input. Set a real price."
                          >
                            placeholder
                          </div>
                        )}
                        {/* Where the sell price came from. A derived price
                            without its list price and discount beside it is
                            just a number nobody can check. */}
                        {m.listPriced && (
                          <div
                            className="mt-0.5 text-[10.5px] font-normal text-muted-foreground/80"
                            title="List price from OpenRouter, less the discount. The sell price above is list x (1 - discount)."
                          >
                            list {perMtok(m.list_pricing?.input_cents_per_mtok)} ·{" "}
                            <span className="text-emerald-300/80">
                              -{m.discountPct}%
                            </span>
                          </div>
                        )}
                        {!m.listPriced && m.is_active && (
                          <div
                            className="mt-0.5 text-[10.5px] font-normal text-muted-foreground/60"
                            title="No list price on file, so this price is hand-set and the OpenRouter sync will not move it."
                          >
                            hand-priced
                          </div>
                        )}
                        {m.priceDrift.length > 0 && (
                          <div
                            className="mt-0.5 inline-flex rounded border border-purple-500/40 bg-purple-500/10 px-1 py-0.5 text-[10px] font-normal text-purple-300"
                            title={m.priceDrift
                              .map(
                                (d) =>
                                  `${d.key}: charging ${d.charged}c, list x (1 - ${m.discountPct}%) would be ${d.expected}c`,
                              )
                              .join(" · ")}
                          >
                            off list formula
                          </div>
                        )}
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                    {m.pricedPerUnit && m.unitPricing ? (
                      <span className="text-[12px]">
                        {m.unitPricing.flat?.costCents != null
                          ? `${m.unitPricing.flat.costCents}¢`
                          : "—"}
                      </span>
                    ) : (
                      <>
                        {perMtok(m.upstream_pricing?.input_cents_per_mtok)} /{" "}
                        {perMtok(m.upstream_pricing?.output_cents_per_mtok)}
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    {m.pricedPerUnit && m.unitPricing ? (
                      // Per-unit margin, not per-token — the token columns are
                      // structurally empty for these models.
                      <span
                        title={m.unitPricing.tiers
                          .map(
                            (t) =>
                              `${t.tier}: ${t.marginPct === null ? "—" : `${t.marginPct.toFixed(0)}%`}`,
                          )
                          .join(" · ")}
                      >
                        <MarginBadge value={m.unitPricing.flat?.marginPct ?? null} />
                      </span>
                    ) : (
                      <div>
                        <div>
                          <MarginBadge value={m.margin.input} /> /{" "}
                          <MarginBadge value={m.margin.output} />
                        </div>
                        {/* A model with a partner-specific rate has a second,
                            different margin — showing only one of them would
                            be a coin toss presented as a fact. */}
                        {m.providerMargins.map((pm) => (
                          <div
                            key={pm.provider}
                            className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-muted-foreground"
                          >
                            <span>{pm.provider}</span>
                            <MarginBadge value={pm.input} />
                            <span>/</span>
                            <MarginBadge value={pm.output} />
                          </div>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={m.is_featured}
                      disabled={busyId === m.id}
                      onCheckedChange={(checked) =>
                        patch(m, { is_featured: checked }, checked ? "Featured" : "Unfeatured")
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={m.is_active}
                      disabled={busyId === m.id}
                      onCheckedChange={(checked) =>
                        patch(
                          m,
                          { is_active: checked },
                          checked ? `${m.model_id} activated` : `${m.model_id} deactivated`,
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {/* Self-served models are the only ones with pods to
                          manage; proxy models route through a partner. */}
                      {m.serving_type === "runpod_byo" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          title="Serving endpoints"
                          onClick={() => setEndpointsFor(m.model_id)}
                          disabled={busyId === m.id}
                        >
                          <Server className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="Pricing"
                        onClick={() => openPricing(m)}
                        disabled={busyId === m.id}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <NewHostedModelDialog
        open={creating}
        onClose={(created) => {
          setCreating(false);
          if (created) void load();
        }}
      />
      <EndpointsDialog modelId={endpointsFor} onClose={() => setEndpointsFor(null)} />
      <MediaPricingDialog
        model={
          mediaPricing
            ? {
                id: mediaPricing.id,
                model_id: mediaPricing.model_id,
                modality: mediaPricing.modality,
                pricing: mediaPricing.pricing as Record<string, unknown> | null,
                upstream_pricing: mediaPricing.upstream_pricing as Record<
                  string,
                  unknown
                > | null,
              }
            : null
        }
        onClose={(changed) => {
          setMediaPricing(null);
          if (changed) void load();
        }}
      />

      <SyncOpenRouterDialog
        open={syncOpen}
        onClose={(changed) => {
          setSyncOpen(false);
          if (changed) void load();
        }}
      />

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing?.serving_type === "proxy" ? "Pricing & routing" : "Pricing"} —{" "}
              {editing?.model_id}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              What we charge
            </div>

            {/* A list-priced model has a derived sell price: the editable
                layer is the discount, and the API refuses a direct price so
                the two can never disagree. A model with no list price is
                hand-priced and keeps the raw fields. */}
            {editing?.listPriced ? (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <Label htmlFor="discount">Discount off list (%)</Label>
                  <Input
                    id="discount"
                    inputMode="decimal"
                    value={discountDraft}
                    onChange={(e) => setDiscountDraft(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="rounded-md border border-border bg-white/[0.02] px-3 py-2 text-[11.5px]">
                  {(() => {
                    const d = Number(discountDraft);
                    const ok = Number.isFinite(d) && d >= 0 && d < 100;
                    const f = ok ? 1 - d / 100 : null;
                    const li = editing.list_pricing?.input_cents_per_mtok;
                    const lo = editing.list_pricing?.output_cents_per_mtok;
                    return (
                      <>
                        <div className="flex justify-between text-muted-foreground">
                          <span>List (OpenRouter)</span>
                          <span className="tabular-nums">
                            {perMtok(li)} / {perMtok(lo)}
                          </span>
                        </div>
                        <div className="mt-1 flex justify-between font-medium">
                          <span>Customer pays</span>
                          <span className="tabular-nums">
                            {f !== null && typeof li === "number"
                              ? perMtok(Math.round(li * f * 10000) / 10000)
                              : "—"}{" "}
                            /{" "}
                            {f !== null && typeof lo === "number"
                              ? perMtok(Math.round(lo * f * 10000) / 10000)
                              : "—"}
                          </span>
                        </div>
                        {!ok && discountDraft.trim() !== "" && (
                          <div className="mt-1 text-red-300">
                            Discount must be between 0 and 99.99.
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Priced from its list price, so the price itself is not
                  edited here. To set a price by hand, clear the list price
                  first.
                </p>
              </div>
            ) : (
              (
                [
                  ["input", "Input ($ per Mtok)"],
                  ["output", "Output ($ per Mtok)"],
                  ["cached", "Cached input ($ per Mtok)"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`price-${key}`}>{label}</Label>
                  <Input
                    id={`price-${key}`}
                    inputMode="decimal"
                    value={draft[key]}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                    placeholder="unchanged"
                  />
                </div>
              ))
            )}

            {/* ROUTING. There is no fallback any more, so this field is not a
                preference - it names the only partner that will serve the
                model. Shown only where it means something. */}
            {editing?.serving_type === "proxy" && (
              <div className="border-t border-border pt-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Who serves it
                </div>
                <div className="space-y-1.5">
                  <Select value={providerDraft} onValueChange={setProviderDraft}>
                    <SelectTrigger id="provider">
                      <SelectValue placeholder="Choose a partner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="starimg">starimg</SelectItem>
                      <SelectItem value="wokey">wokey</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Routing is strict — every request for this model goes to
                    the partner named here, with no failover to the other. If
                    they cannot serve it, the model is down.
                    {editing.upstream_model_id && (
                      <>
                        {" "}
                        Sent upstream as{" "}
                        <span className="font-mono">
                          {editing.upstream_model_id}
                        </span>
                        .
                      </>
                    )}
                  </p>
                </div>
                <div className="mt-3 space-y-1.5">
                  <Label htmlFor="orid">OpenRouter id (for price sync)</Label>
                  <Input
                    id="orid"
                    value={orIdDraft}
                    onChange={(e) => setOrIdDraft(e.target.value)}
                    placeholder={editing.model_id}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Only needed when our id differs from theirs. Blank matches
                    on the model id above.
                  </p>
                </div>
              </div>
            )}

            <div className="border-t border-border pt-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                What it costs us
              </div>
              {/* One tab per partner. A request is costed with the tab that
                  served it, falling back to Default — so the same model can
                  be profitable on one partner and underwater on another. */}
              <div className="mb-2 flex gap-1">
                {costTabsFor(
                  editing?.upstream_provider,
                  editing?.endpointProviders,
                ).map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setCostTab(id)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                      costTab === id
                        ? "border-[#3987e5]/60 bg-[#3987e5]/15 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                    {editing?.partnersWithoutCost.includes(id) && (
                      <span
                        className="ml-1 text-amber-300"
                        title="This partner answers on one of this model's endpoints but has no rate of its own, so its cost is unknown. It does NOT fall back to Default — that blob belongs to whoever it was set for."
                      >
                        •
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                In <strong>cents</strong> per Mtok, fractions allowed.{" "}
                {costTab === "default"
                  ? "Used for any partner without its own rate below."
                  : editing?.partnersWithoutCost.includes(costTab)
                    ? `${costTab} answers on this model but has no cost basis yet. Blank does NOT inherit Default — that rate belongs to whoever it was set for, so margin stays unknown until you set one here.`
                    : `Used only for requests ${costTab} served.`}{" "}
                Applies to requests made after the change, not to ones already
                billed.
              </p>
            </div>
            {(
              [
                ["input", "Input (c per Mtok)"],
                ["output", "Output (c per Mtok)"],
                ["cached", "Cached (c per Mtok)"],
                ["cacheWrite", "Cache write (c per Mtok)"],
              ] as const
            ).map(([key, label]) => {
              const draftFor =
                costTab === "default"
                  ? costDraft
                  : (partnerDrafts[costTab] ?? blankCost());
              const setFor =
                costTab === "default"
                  ? setCostDraft
                  : (fn: (d: CostFields) => CostFields) =>
                      setPartnerDrafts((prev) => ({
                        ...prev,
                        [costTab]: fn(prev[costTab] ?? blankCost()),
                      }));
              const charge =
                key === "input"
                  ? editing?.pricing?.input_cents_per_mtok
                  : key === "output"
                    ? editing?.pricing?.output_cents_per_mtok
                    : key === "cached"
                      ? editing?.pricing?.cached_cents_per_mtok
                      : undefined;
              const costNum = Number(draftFor[key]);
              const showMargin =
                typeof charge === "number" &&
                charge > 0 &&
                draftFor[key].trim() !== "" &&
                Number.isFinite(costNum);
              return (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`cost-${key}`}>{label}</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id={`cost-${key}`}
                      inputMode="decimal"
                      value={draftFor[key]}
                      onChange={(e) =>
                        setFor((d) => ({ ...d, [key]: e.target.value }))
                      }
                      placeholder={costTab === "starimg" ? "falls back" : "unset"}
                    />
                    <span
                      className={`w-[110px] shrink-0 text-right text-[11.5px] ${
                        showMargin && (charge - costNum) / charge < 0
                          ? "text-red-300"
                          : "text-muted-foreground"
                      }`}
                    >
                      {showMargin
                        ? `margin ${(((charge - costNum) / charge) * 100).toFixed(0)}%`
                        : ""}
                    </span>
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">
              Upstream basis:{" "}
              {perMtok(editing?.upstream_pricing?.input_cents_per_mtok)} in /{" "}
              {perMtok(editing?.upstream_pricing?.output_cents_per_mtok)} out.
              Blank fields stay unchanged. Running servers are unaffected —
              usage is priced at request time from this catalog.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={savePricing}>Save pricing</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
